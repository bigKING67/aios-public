from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

import psycopg2.extras

from .ark_responses import ArkResponsesClient, ArkResponsesConfig
from .brand_resolution_contract import SUPPORTED_INDUSTRY_MATERIAL_BRANDS
from .repository import connect_pg
from .tos_storage import TosStorageClient, TosStorageConfig


DEFAULT_RESOLVER_VERSION = "industry-material-brand-v1"
SUPPORTED_VIDEO_TYPES = ("goods_short_video", "live_lead_short_video")
MAX_BATCH_LIMIT = 100
MAX_RESOLVER_VERSION_LENGTH = 128


@dataclass(frozen=True)
class BrandResolutionCandidate:
  asset_id: uuid.UUID
  source_rank: int | None
  material_count: int
  video_title: str
  related_product: str
  marketing_selling_point: str
  asset_title: str
  product_names: tuple[str, ...]
  creator_name: str
  bucket: str
  preview_object_key: str
  raw_object_key: str
  transcript_context: dict[str, Any] | None
  deterministic_brand: str
  deterministic_source: str
  deterministic_text: str

  @classmethod
  def from_row(cls, row: dict[str, Any]) -> "BrandResolutionCandidate":
    return cls(
      asset_id=uuid.UUID(str(row["asset_id"])),
      source_rank=row.get("source_rank"),
      material_count=int(row.get("material_count") or 0),
      video_title=str(row.get("video_title") or ""),
      related_product=str(row.get("related_product") or ""),
      marketing_selling_point=str(row.get("marketing_selling_point") or ""),
      asset_title=str(row.get("asset_title") or ""),
      product_names=tuple(str(value) for value in (row.get("product_names") or []) if value),
      creator_name=str(row.get("creator_name") or ""),
      bucket=str(row.get("bucket") or ""),
      preview_object_key=str(row.get("preview_object_key") or ""),
      raw_object_key=str(row.get("raw_object_key") or ""),
      transcript_context=row.get("transcript_context") if isinstance(row.get("transcript_context"), dict) else None,
      deterministic_brand=str(row.get("deterministic_brand") or ""),
      deterministic_source=str(row.get("deterministic_source") or ""),
      deterministic_text=str(row.get("deterministic_text") or ""),
    )


def resolve_industry_material_brands(
  *,
  month: str = "",
  video_type: str = "",
  limit: int,
  resolver_version: str = DEFAULT_RESOLVER_VERSION,
  asset_id: str = "",
  apply: bool = False,
  allow_model_calls: bool = False,
) -> dict[str, Any]:
  normalized_asset_id = normalize_asset_id(asset_id)
  normalized_month = normalize_month(month) if month.strip() else None
  normalized_video_type = normalize_video_type(video_type) if video_type.strip() else None
  if normalized_asset_id is None and (normalized_month is None or normalized_video_type is None):
    raise ValueError("未指定 asset_id 时必须同时提供 month 和 video_type")
  normalized_limit = normalize_limit(limit)
  normalized_version = normalize_resolver_version(resolver_version)
  if allow_model_calls and not apply:
    raise ValueError("--allow-model-calls 必须与 --apply 同时使用")

  ensure_brand_resolution_storage_ready()
  candidates = list_brand_resolution_candidates(
    month=normalized_month,
    video_type=normalized_video_type,
    limit=normalized_limit,
    resolver_version=normalized_version,
    asset_id=normalized_asset_id,
  )
  base_summary: dict[str, Any] = {
    "month": normalized_month,
    "videoType": normalized_video_type,
    "resolverVersion": normalized_version,
    "apply": apply,
    "allowModelCalls": allow_model_calls,
    "candidateCount": len(candidates),
  }
  if not apply:
    return {
      **base_summary,
      "deterministicCandidates": sum(bool(candidate.deterministic_brand) for candidate in candidates),
      "modelCandidates": sum(not candidate.deterministic_brand for candidate in candidates),
      "sampleCandidates": [candidate_summary(candidate) for candidate in candidates[:20]],
      "written": 0,
      "modelCalls": 0,
      "failed": 0,
    }

  storage_config: TosStorageConfig | None = None
  ark_client: ArkResponsesClient | None = None
  written = 0
  model_calls = 0
  skipped_model_gate = 0
  failed = 0
  results: list[dict[str, Any]] = []
  for candidate in candidates:
    try:
      if candidate.deterministic_brand:
        resolution = deterministic_resolution(candidate)
        persist_brand_resolution(candidate, normalized_version, resolution)
        written += 1
        results.append(result_summary(candidate, resolution, "written"))
        continue

      if not allow_model_calls:
        skipped_model_gate += 1
        results.append({**candidate_summary(candidate), "status": "skipped_model_gate"})
        continue

      if storage_config is None:
        storage_config = TosStorageConfig.from_env()
      if ark_client is None:
        ark_client = ArkResponsesClient(ArkResponsesConfig.from_env())
      storage = storage_for_candidate(storage_config, candidate)
      input_object_key = candidate.preview_object_key or candidate.raw_object_key
      if not input_object_key:
        raise RuntimeError("素材缺少 preview/raw 视频输入")
      video_url = storage.presign_get_url(input_object_key, ttl_seconds=1800, response_content_type="video/mp4")
      model_calls += 1
      model_result = ark_client.resolve_video_brand(video_url, asset_context=asset_context(candidate))
      resolution = {
        **model_result.analysis,
        "modelName": ark_client.config.model,
        "promptVersion": str(model_result.request_settings.get("prompt_version") or ""),
        "responseId": model_result.response_id,
        "usage": model_result.usage,
      }
      persist_brand_resolution(candidate, normalized_version, resolution)
      written += 1
      results.append(result_summary(candidate, resolution, "written"))
    except Exception as error:  # noqa: BLE001 - one asset must not abort the bounded batch
      failed += 1
      results.append({
        **candidate_summary(candidate),
        "status": "failed",
        "error": f"{type(error).__name__}: {error}"[:500],
      })

  return {
    **base_summary,
    "written": written,
    "modelCalls": model_calls,
    "skippedModelGate": skipped_model_gate,
    "failed": failed,
    "results": results[:50],
  }


def ensure_brand_resolution_storage_ready() -> None:
  with connect_pg() as conn, conn.cursor() as cur:
    cur.execute(
      """
      SELECT
        to_regclass('ads.marketing_content_asset_brand_resolutions') IS NOT NULL,
        to_regprocedure('ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(text[])') IS NOT NULL
      """
    )
    table_ready, function_ready = cur.fetchone()
  if not table_ready or not function_ready:
    raise RuntimeError(
      "品牌解析存储未就绪；请先应用 20260721_1328 migration，再执行 dry-run 或 apply"
    )


def list_brand_resolution_candidates(
  *,
  month: str | None,
  video_type: str | None,
  limit: int,
  resolver_version: str,
  asset_id: uuid.UUID | None,
) -> list[BrandResolutionCandidate]:
  with connect_pg() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
    cur.execute(
      """
      WITH scoped_materials AS (
        SELECT
          material.asset_id,
          MIN(material.source_rank) AS source_rank,
          COUNT(*)::INTEGER AS material_count,
          MIN(NULLIF(material.video_title, '')) AS video_title,
          MIN(NULLIF(material.related_product, '')) AS related_product,
          MIN(NULLIF(material.marketing_selling_point, '')) AS marketing_selling_point
        FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
        WHERE (%s::DATE IS NULL OR material.stat_month = %s::DATE)
          AND (%s::TEXT IS NULL OR material.video_type = %s::TEXT)
          AND material.asset_id IS NOT NULL
          AND NULLIF(BTRIM(material.brand_name), '') IS NULL
          AND (%s::UUID IS NULL OR material.asset_id = %s::UUID)
        GROUP BY material.asset_id
      ),
      base AS (
        SELECT
          scoped.*,
          asset.title AS asset_title,
          asset.product_names,
          asset.creator_name,
          asset.bucket,
          asset.preview_object_key,
          asset.raw_object_key,
          (
            SELECT JSONB_BUILD_OBJECT(
              'scriptText', LEFT(transcript.script_text, 4000),
              'transcriptText', LEFT(transcript.transcript_text, 4000)
            )
            FROM ads.marketing_content_asset_transcripts transcript
            WHERE transcript.asset_id = asset.asset_id
              AND transcript.status = 'active'
            ORDER BY transcript.created_at DESC
            LIMIT 1
          ) AS transcript_context,
          ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(
            ARRAY[scoped.video_title]
          ) AS title_brand,
          ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(
            ARRAY[
              scoped.related_product,
              scoped.marketing_selling_point,
              asset.title,
              ARRAY_TO_STRING(COALESCE(asset.product_names, '{}'::TEXT[]), ' '),
              asset.creator_name
            ]
          ) AS metadata_brand
        FROM scoped_materials scoped
        JOIN ads.marketing_content_assets asset
          ON asset.asset_id = scoped.asset_id
         AND asset.is_deleted = FALSE
         AND asset.external_only = FALSE
         AND asset.asset_type = 'video'
         AND (asset.duration_seconds IS NULL OR asset.duration_seconds < 1800)
        WHERE COALESCE(asset.preview_object_key, asset.raw_object_key) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_brand_resolutions manual
            WHERE manual.asset_id = asset.asset_id
              AND manual.is_manual_override = TRUE
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ads.marketing_content_asset_brand_resolutions existing
            WHERE existing.asset_id = asset.asset_id
              AND existing.resolver_version = %s
          )
      )
      SELECT
        base.*,
        COALESCE(base.title_brand, base.metadata_brand) AS deterministic_brand,
        CASE
          WHEN base.title_brand IS NOT NULL THEN 'title'
          WHEN base.metadata_brand IS NOT NULL THEN 'metadata'
          ELSE ''
        END AS deterministic_source,
        CASE
          WHEN base.title_brand IS NOT NULL THEN COALESCE(base.video_title, '')
          WHEN base.metadata_brand IS NOT NULL THEN CONCAT_WS(
            ' ',
            base.related_product,
            base.marketing_selling_point,
            base.asset_title,
            ARRAY_TO_STRING(COALESCE(base.product_names, '{}'::TEXT[]), ' '),
            base.creator_name
          )
          ELSE ''
        END AS deterministic_text
      FROM base
      ORDER BY base.source_rank ASC NULLS LAST, base.asset_id ASC
      LIMIT %s
      """,
      (
        f"{month}-01" if month else None,
        f"{month}-01" if month else None,
        video_type,
        video_type,
        str(asset_id) if asset_id else None,
        str(asset_id) if asset_id else None,
        resolver_version,
        limit,
      ),
    )
    rows = cur.fetchall()
  return [BrandResolutionCandidate.from_row(dict(row)) for row in rows]


def deterministic_resolution(candidate: BrandResolutionCandidate) -> dict[str, Any]:
  if candidate.deterministic_brand not in SUPPORTED_INDUSTRY_MATERIAL_BRANDS:
    raise ValueError(f"不支持的确定性品牌: {candidate.deterministic_brand}")
  return {
    "brand": candidate.deterministic_brand,
    "status": "recognized",
    "confidence": 0.98,
    "primarySource": candidate.deterministic_source,
    "evidence": [
      {
        "source": candidate.deterministic_source,
        "kind": "exact_brand_alias",
        "text": (candidate.deterministic_text.strip() or candidate.deterministic_brand)[:160],
        "timeRange": "",
      }
    ],
    "alternatives": [],
    "modelName": "",
    "promptVersion": "deterministic-v1",
    "responseId": "",
    "usage": {},
  }


def persist_brand_resolution(
  candidate: BrandResolutionCandidate,
  resolver_version: str,
  resolution: dict[str, Any],
) -> None:
  evidence = resolution.get("evidence")
  alternatives = resolution.get("alternatives")
  usage = resolution.get("usage") or {}
  if not isinstance(evidence, list) or not isinstance(alternatives, list):
    raise ValueError("品牌解析 evidence/alternatives 必须是数组")
  if not isinstance(usage, dict):
    raise ValueError("品牌解析 usage 必须是对象")
  evidence_json = {
    "evidence": evidence,
    "alternatives": alternatives,
  }
  with connect_pg() as conn, conn.cursor() as cur:
    cur.execute(
      """
      INSERT INTO ads.marketing_content_asset_brand_resolutions (
        asset_id,
        resolver_version,
        brand_name,
        status,
        confidence,
        primary_source,
        evidence_json,
        model_name,
        prompt_version,
        response_id,
        usage_json,
        is_manual_override,
        resolved_at,
        updated_at
      ) VALUES (
        %s, %s, %s, %s, %s, %s, %s::JSONB, %s, %s, %s, %s::JSONB, FALSE,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (asset_id, resolver_version) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        primary_source = EXCLUDED.primary_source,
        evidence_json = EXCLUDED.evidence_json,
        model_name = EXCLUDED.model_name,
        prompt_version = EXCLUDED.prompt_version,
        response_id = EXCLUDED.response_id,
        usage_json = EXCLUDED.usage_json,
        resolved_at = EXCLUDED.resolved_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE ads.marketing_content_asset_brand_resolutions.is_manual_override = FALSE
      """,
      (
        str(candidate.asset_id),
        resolver_version,
        resolution.get("brand"),
        resolution.get("status"),
        resolution.get("confidence"),
        resolution.get("primarySource"),
        json.dumps(evidence_json, ensure_ascii=False),
        resolution.get("modelName") or None,
        resolution.get("promptVersion") or None,
        resolution.get("responseId") or None,
        json.dumps(usage, ensure_ascii=False),
      ),
    )
    conn.commit()


def asset_context(candidate: BrandResolutionCandidate) -> dict[str, Any]:
  context: dict[str, Any] = {
    "assetId": str(candidate.asset_id),
    "videoTitle": candidate.video_title[:500],
    "relatedProduct": candidate.related_product[:500],
    "marketingSellingPoint": candidate.marketing_selling_point[:1000],
    "assetTitle": candidate.asset_title[:500],
    "productNames": [value[:200] for value in candidate.product_names[:20]],
    "creatorName": candidate.creator_name[:200],
    "allowedBrands": list(SUPPORTED_INDUSTRY_MATERIAL_BRANDS),
  }
  if candidate.transcript_context:
    transcript = {
      key: str(candidate.transcript_context.get(key) or "")[:4000]
      for key in ("scriptText", "transcriptText")
      if candidate.transcript_context.get(key)
    }
    if transcript:
      context["transcript"] = transcript
  return context


def storage_for_candidate(config: TosStorageConfig, candidate: BrandResolutionCandidate) -> TosStorageClient:
  if not candidate.bucket or candidate.bucket == config.bucket:
    return TosStorageClient(config)
  return TosStorageClient(replace(config, bucket=candidate.bucket))


def candidate_summary(candidate: BrandResolutionCandidate) -> dict[str, Any]:
  return {
    "assetId": str(candidate.asset_id),
    "sourceRank": candidate.source_rank,
    "materialCount": candidate.material_count,
    "deterministicBrand": candidate.deterministic_brand or None,
    "deterministicSource": candidate.deterministic_source or None,
    "hasPreview": bool(candidate.preview_object_key),
    "hasRaw": bool(candidate.raw_object_key),
    "hasTranscript": bool(candidate.transcript_context),
  }


def result_summary(
  candidate: BrandResolutionCandidate,
  resolution: dict[str, Any],
  status: str,
) -> dict[str, Any]:
  return {
    **candidate_summary(candidate),
    "status": status,
    "brand": resolution.get("brand"),
    "resolutionStatus": resolution.get("status"),
    "confidence": resolution.get("confidence"),
    "primarySource": resolution.get("primarySource"),
  }


def normalize_month(value: str) -> str:
  text = value.strip()
  try:
    parsed = date.fromisoformat(f"{text}-01")
  except ValueError as error:
    raise ValueError("month 必须为 YYYY-MM") from error
  if text != f"{parsed.year:04d}-{parsed.month:02d}":
    raise ValueError("month 必须为 YYYY-MM")
  return text


def normalize_video_type(value: str) -> str:
  text = value.strip()
  if text not in SUPPORTED_VIDEO_TYPES:
    raise ValueError(f"video_type 必须是: {', '.join(SUPPORTED_VIDEO_TYPES)}")
  return text


def normalize_limit(value: int) -> int:
  if not 1 <= int(value) <= MAX_BATCH_LIMIT:
    raise ValueError(f"limit 必须在 1 到 {MAX_BATCH_LIMIT} 之间")
  return int(value)


def normalize_resolver_version(value: str) -> str:
  text = value.strip()
  if not text or len(text) > MAX_RESOLVER_VERSION_LENGTH:
    raise ValueError(f"resolver_version 必须为 1 到 {MAX_RESOLVER_VERSION_LENGTH} 个字符")
  return text


def normalize_asset_id(value: str) -> uuid.UUID | None:
  text = value.strip()
  if not text:
    return None
  try:
    return uuid.UUID(text)
  except ValueError as error:
    raise ValueError("asset_id 必须是 UUID") from error
