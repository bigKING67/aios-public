from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import psycopg2.extras

from .performance_rollups import refresh_marketing_content_performance_rollups
from .repository import connect_pg


QIANCHUAN_AD_PLATFORM = "qianchuan"
QIANCHUAN_SOURCE_SYSTEM = "qianchuan"
QIANCHUAN_REPORT_TYPE = "material_daily"


FIELD_ALIASES: Dict[str, Sequence[str]] = {
  "stat_date": ("stat_date", "date", "日期", "数据日期", "报表日期", "时间"),
  "advertiser_id": ("advertiser_id", "advertiserId", "广告主ID", "广告主id", "广告主 Id"),
  "account_id": ("account_id", "accountId", "账户ID", "账号ID", "千川账户ID", "广告账户ID"),
  "account_name": ("account_name", "accountName", "账户名称", "账号名称", "广告账户名称"),
  "external_material_id": ("external_material_id", "material_id", "materialId", "素材ID", "素材id", "广告素材ID", "创意素材ID"),
  "external_video_id": ("external_video_id", "video_id", "videoId", "视频ID", "视频id"),
  "campaign_id": ("campaign_id", "campaignId", "计划ID", "广告计划ID"),
  "campaign_name": ("campaign_name", "campaignName", "计划名称", "广告计划名称"),
  "ad_group_id": ("ad_group_id", "adGroupId", "单元ID", "广告组ID", "广告单元ID"),
  "ad_group_name": ("ad_group_name", "adGroupName", "单元名称", "广告组名称", "广告单元名称"),
  "ad_id": ("ad_id", "adId", "广告ID", "创意ID"),
  "ad_name": ("ad_name", "adName", "广告名称", "创意名称"),
  "raw_impressions": ("raw_impressions", "impressions", "展示数", "曝光", "曝光量", "展现量"),
  "raw_clicks": ("raw_clicks", "clicks", "点击数", "点击"),
  "raw_ctr": ("raw_ctr", "ctr", "点击率", "CTR"),
  "raw_conversions": ("raw_conversions", "conversions", "转化数", "成交数", "支付订单数"),
  "raw_cvr": ("raw_cvr", "cvr", "转化率", "CVR"),
  "raw_cost": ("raw_cost", "cost", "spend", "消耗", "花费", "广告消耗"),
  "raw_gmv": ("raw_gmv", "gmv", "成交金额", "GMV", "支付金额"),
  "raw_roi": ("raw_roi", "roi", "ROI", "投入产出比"),
  "raw_live_room_entries": ("raw_live_room_entries", "live_room_entries", "直播间进人", "直播间进入人数", "进房数"),
}


ODS_COLUMNS = (
  "ingest_id",
  "source_system",
  "report_type",
  "stat_date",
  "advertiser_id",
  "account_id",
  "account_name",
  "external_material_id",
  "external_video_id",
  "campaign_id",
  "campaign_name",
  "ad_group_id",
  "ad_group_name",
  "ad_id",
  "ad_name",
  "raw_impressions",
  "raw_clicks",
  "raw_ctr",
  "raw_conversions",
  "raw_cvr",
  "raw_cost",
  "raw_gmv",
  "raw_roi",
  "raw_live_room_entries",
  "raw_payload",
  "raw_payload_hash",
)


@dataclass
class ImportResult:
  ingest_id: str
  source_path: str
  scanned_rows: int = 0
  inserted_rows: int = 0
  skipped_rows: int = 0
  failed_rows: int = 0
  sample_errors: List[str] | None = None

  def to_dict(self) -> Dict[str, Any]:
    return {
      "ingestId": self.ingest_id,
      "sourcePath": self.source_path,
      "scannedRows": self.scanned_rows,
      "insertedRows": self.inserted_rows,
      "skippedRows": self.skipped_rows,
      "failedRows": self.failed_rows,
      "sampleErrors": (self.sample_errors or [])[:10],
    }


@dataclass
class DwdBuildResult:
  ingest_id: Optional[str]
  start_date: Optional[str]
  end_date: Optional[str]
  scanned_rows: int = 0
  upserted_rows: int = 0
  matched_rows: int = 0
  unmatched_rows: int = 0

  def to_dict(self) -> Dict[str, Any]:
    return {
      "ingestId": self.ingest_id,
      "startDate": self.start_date,
      "endDate": self.end_date,
      "scannedRows": self.scanned_rows,
      "upsertedRows": self.upserted_rows,
      "matchedRows": self.matched_rows,
      "unmatchedRows": self.unmatched_rows,
    }


def import_qianchuan_material_daily_report(
  source_path: str | Path,
  *,
  ingest_id: str | None = None,
  default_stat_date: str | None = None,
  encoding: str = "utf-8-sig",
  dry_run: bool = False,
) -> ImportResult:
  source = Path(source_path)
  resolved_ingest_id = ingest_id or str(uuid.uuid4())
  result = ImportResult(
    ingest_id=resolved_ingest_id,
    source_path=str(source),
    sample_errors=[],
  )
  rows = list(_read_report_rows(source, encoding=encoding))
  result.scanned_rows = len(rows)

  normalized_rows: List[Tuple[Any, ...]] = []
  for index, row in enumerate(rows, start=1):
    try:
      normalized = _normalize_ods_row(row, resolved_ingest_id, default_stat_date)
    except ValueError as error:
      result.failed_rows += 1
      if result.sample_errors is not None and len(result.sample_errors) < 10:
        result.sample_errors.append(f"row {index}: {error}")
      continue
    normalized_rows.append(normalized)

  if dry_run:
    result.inserted_rows = len(normalized_rows)
    return result

  with connect_pg() as conn:
    with conn.cursor() as cur:
      for normalized in normalized_rows:
        cur.execute(
          f"""
          INSERT INTO ods.qianchuan_material_daily_report_raw ({", ".join(ODS_COLUMNS)})
          SELECT {", ".join(["%s"] * len(ODS_COLUMNS))}
          WHERE NOT EXISTS (
            SELECT 1
            FROM ods.qianchuan_material_daily_report_raw
            WHERE raw_payload_hash = %s
          )
          """,
          (*normalized, normalized[-1]),
        )
        if cur.rowcount == 1:
          result.inserted_rows += 1
        else:
          result.skipped_rows += 1
    conn.commit()
  return result


def build_qianchuan_material_dwd(
  *,
  ingest_id: str | None = None,
  start_date: str | None = None,
  end_date: str | None = None,
  dry_run: bool = False,
) -> DwdBuildResult:
  result = DwdBuildResult(
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
  )
  filters, params = _build_ods_filters(ingest_id=ingest_id, start_date=start_date, end_date=end_date)
  scanned_sql = f"""
    SELECT COUNT(*)::BIGINT AS scanned_rows
    FROM ods.qianchuan_material_daily_report_raw raw
    WHERE {filters}
      AND NULLIF(raw.external_material_id, '') IS NOT NULL
  """

  dwd_sql = f"""
    WITH normalized AS (
      SELECT
        raw.stat_date,
        raw.source_system,
        %s::TEXT AS ad_platform,
        NULLIF(BTRIM(raw.account_id), '') AS account_id,
        NULLIF(BTRIM(raw.account_name), '') AS account_name,
        NULLIF(BTRIM(raw.advertiser_id), '') AS advertiser_id,
        NULLIF(BTRIM(raw.external_material_id), '') AS external_material_id,
        NULLIF(BTRIM(raw.external_video_id), '') AS external_video_id,
        NULLIF(BTRIM(raw.campaign_id), '') AS campaign_id,
        NULLIF(BTRIM(raw.campaign_name), '') AS campaign_name,
        NULLIF(BTRIM(raw.ad_group_id), '') AS ad_group_id,
        NULLIF(BTRIM(raw.ad_group_name), '') AS ad_group_name,
        NULLIF(BTRIM(raw.ad_id), '') AS ad_id,
        NULLIF(BTRIM(raw.ad_name), '') AS ad_name,
        public.marketing_content_parse_bigint(raw.raw_impressions) AS impressions,
        public.marketing_content_parse_bigint(raw.raw_clicks) AS clicks,
        public.marketing_content_parse_rate(raw.raw_ctr) AS ctr,
        public.marketing_content_parse_bigint(raw.raw_conversions) AS conversions,
        public.marketing_content_parse_rate(raw.raw_cvr) AS cvr,
        public.marketing_content_parse_numeric(raw.raw_cost) AS cost,
        public.marketing_content_parse_numeric(raw.raw_gmv) AS gmv,
        public.marketing_content_parse_numeric(raw.raw_roi) AS roi,
        public.marketing_content_parse_bigint(raw.raw_live_room_entries) AS live_room_entries,
        raw.ingest_id AS source_ingest_id,
        raw.raw_payload_hash AS source_row_hash,
        raw.raw_payload
      FROM ods.qianchuan_material_daily_report_raw raw
      WHERE {filters}
        AND NULLIF(raw.external_material_id, '') IS NOT NULL
    ),
    resolved AS (
      SELECT
        normalized.*,
        material.asset_id,
        material.platform_video_id,
        material.ad_material_id,
        CASE
          WHEN material.ad_material_id IS NOT NULL THEN 'matched'
          ELSE 'unmatched'
        END AS match_status
      FROM normalized
      LEFT JOIN ads.marketing_content_ad_materials material
        ON material.ad_platform = normalized.ad_platform
       AND material.external_material_id = normalized.external_material_id
       AND COALESCE(material.account_id, '') = COALESCE(normalized.account_id, '')
       AND material.relation_status = 'active'
    ),
    upserted AS (
      INSERT INTO dwd.marketing_content_ad_material_stats_di (
        stat_date,
        source_system,
        ad_platform,
        account_id,
        account_name,
        advertiser_id,
        external_material_id,
        external_video_id,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        ad_id,
        ad_name,
        asset_id,
        platform_video_id,
        ad_material_id,
        match_status,
        impressions,
        clicks,
        ctr,
        conversions,
        cvr,
        cost,
        gmv,
        roi,
        live_room_entries,
        live_room_entry_rate,
        transaction_cost,
        source_ingest_id,
        source_row_hash,
        raw_payload
      )
      SELECT
        stat_date,
        source_system,
        ad_platform,
        account_id,
        account_name,
        advertiser_id,
        external_material_id,
        external_video_id,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        ad_id,
        ad_name,
        asset_id,
        platform_video_id,
        ad_material_id,
        match_status,
        impressions,
        clicks,
        ctr,
        conversions,
        cvr,
        cost,
        gmv,
        roi,
        live_room_entries,
        CASE WHEN impressions > 0 THEN live_room_entries::NUMERIC / NULLIF(impressions, 0) ELSE NULL END,
        CASE WHEN conversions > 0 THEN cost / NULLIF(conversions, 0) ELSE NULL END,
        source_ingest_id,
        source_row_hash,
        raw_payload
      FROM resolved
      ON CONFLICT (
        ad_platform,
        COALESCE(account_id, ''),
        external_material_id,
        stat_date,
        COALESCE(campaign_id, ''),
        COALESCE(ad_group_id, ''),
        COALESCE(ad_id, '')
      )
      DO UPDATE SET
        account_name = EXCLUDED.account_name,
        advertiser_id = EXCLUDED.advertiser_id,
        external_video_id = EXCLUDED.external_video_id,
        campaign_name = EXCLUDED.campaign_name,
        ad_group_name = EXCLUDED.ad_group_name,
        ad_name = EXCLUDED.ad_name,
        asset_id = EXCLUDED.asset_id,
        platform_video_id = EXCLUDED.platform_video_id,
        ad_material_id = EXCLUDED.ad_material_id,
        match_status = EXCLUDED.match_status,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        ctr = EXCLUDED.ctr,
        conversions = EXCLUDED.conversions,
        cvr = EXCLUDED.cvr,
        cost = EXCLUDED.cost,
        gmv = EXCLUDED.gmv,
        roi = EXCLUDED.roi,
        live_room_entries = EXCLUDED.live_room_entries,
        live_room_entry_rate = EXCLUDED.live_room_entry_rate,
        transaction_cost = EXCLUDED.transaction_cost,
        source_ingest_id = EXCLUDED.source_ingest_id,
        source_row_hash = EXCLUDED.source_row_hash,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = CURRENT_TIMESTAMP
      RETURNING match_status
    )
    SELECT
      COUNT(*)::BIGINT AS upserted_rows,
      COUNT(*) FILTER (WHERE match_status = 'matched')::BIGINT AS matched_rows,
      COUNT(*) FILTER (WHERE match_status <> 'matched')::BIGINT AS unmatched_rows
    FROM upserted
  """

  with connect_pg() as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(scanned_sql, params)
      scanned = cur.fetchone() or {}
      result.scanned_rows = int(scanned.get("scanned_rows") or 0)
      if dry_run:
        conn.rollback()
        return result
    _ensure_parse_functions(conn)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(dwd_sql, (QIANCHUAN_AD_PLATFORM, *params))
      dwd = cur.fetchone() or {}
      result.upserted_rows = int(dwd.get("upserted_rows") or 0)
      result.matched_rows = int(dwd.get("matched_rows") or 0)
      result.unmatched_rows = int(dwd.get("unmatched_rows") or 0)
    conn.commit()
  return result


def run_qianchuan_material_report_pipeline(
  source_path: str | Path,
  *,
  ingest_id: str | None = None,
  default_stat_date: str | None = None,
  encoding: str = "utf-8-sig",
  dry_run: bool = False,
  refresh_rollups: bool = False,
) -> Dict[str, Any]:
  import_result = import_qianchuan_material_daily_report(
    source_path,
    ingest_id=ingest_id,
    default_stat_date=default_stat_date,
    encoding=encoding,
    dry_run=dry_run,
  )
  dwd_result = build_qianchuan_material_dwd(
    ingest_id=import_result.ingest_id,
    dry_run=dry_run,
  )
  result: Dict[str, Any] = {
    "import": import_result.to_dict(),
    "dwd": dwd_result.to_dict(),
  }
  if refresh_rollups:
    start_date, end_date = _query_ingest_date_range(import_result.ingest_id) if not dry_run else (default_stat_date, default_stat_date)
    result["rollups"] = refresh_marketing_content_performance_rollups(
      start_date=start_date,
      end_date=end_date,
      dry_run=dry_run,
    ).to_dict()
  return result


def _read_report_rows(source: Path, *, encoding: str) -> Iterable[Dict[str, Any]]:
  suffix = source.suffix.lower()
  if suffix in {".jsonl", ".ndjson"}:
    with source.open("r", encoding=encoding) as file:
      for line in file:
        stripped = line.strip()
        if stripped:
          payload = json.loads(stripped)
          if isinstance(payload, dict):
            yield payload
    return
  if suffix == ".json":
    with source.open("r", encoding=encoding) as file:
      payload = json.load(file)
    if isinstance(payload, list):
      for item in payload:
        if isinstance(item, dict):
          yield item
      return
    if isinstance(payload, dict):
      rows = payload.get("data") or payload.get("rows") or payload.get("items") or []
      if isinstance(rows, list):
        for item in rows:
          if isinstance(item, dict):
            yield item
      return
  with source.open("r", encoding=encoding, newline="") as file:
    reader = csv.DictReader(file)
    for row in reader:
      yield dict(row)


def _normalize_ods_row(row: Dict[str, Any], ingest_id: str, default_stat_date: str | None) -> Tuple[Any, ...]:
  payload = _normalize_payload(row)
  stat_date = _parse_date(_pick(payload, "stat_date") or default_stat_date)
  if not stat_date:
    raise ValueError("缺少 stat_date，可通过 --stat-date 指定默认日期")
  external_material_id = _clean_text(_pick(payload, "external_material_id"))
  if not external_material_id:
    raise ValueError("缺少素材 ID / external_material_id")

  canonical_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
  payload_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
  values: Dict[str, Any] = {
    "ingest_id": ingest_id,
    "source_system": QIANCHUAN_SOURCE_SYSTEM,
    "report_type": QIANCHUAN_REPORT_TYPE,
    "stat_date": stat_date.isoformat(),
    "advertiser_id": _clean_text(_pick(payload, "advertiser_id")),
    "account_id": _clean_text(_pick(payload, "account_id")),
    "account_name": _clean_text(_pick(payload, "account_name")),
    "external_material_id": external_material_id,
    "external_video_id": _clean_text(_pick(payload, "external_video_id")),
    "campaign_id": _clean_text(_pick(payload, "campaign_id")),
    "campaign_name": _clean_text(_pick(payload, "campaign_name")),
    "ad_group_id": _clean_text(_pick(payload, "ad_group_id")),
    "ad_group_name": _clean_text(_pick(payload, "ad_group_name")),
    "ad_id": _clean_text(_pick(payload, "ad_id")),
    "ad_name": _clean_text(_pick(payload, "ad_name")),
    "raw_impressions": _clean_text(_pick(payload, "raw_impressions")),
    "raw_clicks": _clean_text(_pick(payload, "raw_clicks")),
    "raw_ctr": _clean_text(_pick(payload, "raw_ctr")),
    "raw_conversions": _clean_text(_pick(payload, "raw_conversions")),
    "raw_cvr": _clean_text(_pick(payload, "raw_cvr")),
    "raw_cost": _clean_text(_pick(payload, "raw_cost")),
    "raw_gmv": _clean_text(_pick(payload, "raw_gmv")),
    "raw_roi": _clean_text(_pick(payload, "raw_roi")),
    "raw_live_room_entries": _clean_text(_pick(payload, "raw_live_room_entries")),
    "raw_payload": psycopg2.extras.Json(payload, dumps=lambda item: json.dumps(item, ensure_ascii=False)),
    "raw_payload_hash": payload_hash,
  }
  return tuple(values[column] for column in ODS_COLUMNS)


def _normalize_payload(row: Dict[str, Any]) -> Dict[str, Any]:
  alias_lookup: Dict[str, str] = {}
  for canonical, aliases in FIELD_ALIASES.items():
    for alias in aliases:
      alias_lookup[_normalize_key(alias)] = canonical

  payload: Dict[str, Any] = {}
  for key, value in row.items():
    normalized_key = _normalize_key(str(key))
    canonical = alias_lookup.get(normalized_key, str(key).strip())
    payload[canonical] = value
  return payload


def _normalize_key(value: str) -> str:
  return re.sub(r"[\s_\-:/（）()]+", "", value.strip().lower())


def _pick(payload: Dict[str, Any], key: str) -> Any:
  return payload.get(key)


def _clean_text(value: Any) -> Optional[str]:
  if value is None:
    return None
  normalized = str(value).strip()
  if not normalized or normalized in {"-", "--", "null", "None", "nan"}:
    return None
  return normalized


def _parse_date(value: Any) -> Optional[date]:
  normalized = _clean_text(value)
  if not normalized:
    return None
  normalized = normalized.replace("/", "-").replace(".", "-")
  for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%d %H:%M:%S"):
    try:
      return datetime.strptime(normalized, fmt).date()
    except ValueError:
      continue
  try:
    return datetime.fromisoformat(normalized).date()
  except ValueError as error:
    raise ValueError(f"日期格式无法识别: {value}") from error


def _build_ods_filters(
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Tuple[str, Tuple[Any, ...]]:
  clauses = ["raw.source_system = 'qianchuan'", "raw.report_type = 'material_daily'"]
  params: List[Any] = []
  if ingest_id:
    clauses.append("raw.ingest_id = %s")
    params.append(ingest_id)
  if start_date:
    clauses.append("raw.stat_date >= %s")
    params.append(start_date)
  if end_date:
    clauses.append("raw.stat_date <= %s")
    params.append(end_date)
  return " AND ".join(clauses), tuple(params)


def _query_ingest_date_range(ingest_id: str) -> Tuple[Optional[str], Optional[str]]:
  with connect_pg() as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(
        """
        SELECT
          MIN(stat_date)::TEXT AS start_date,
          MAX(stat_date)::TEXT AS end_date
        FROM ods.qianchuan_material_daily_report_raw
        WHERE source_system = 'qianchuan'
          AND report_type = 'material_daily'
          AND ingest_id = %s
        """,
        (ingest_id,),
      )
      row = cur.fetchone() or {}
  return row.get("start_date"), row.get("end_date")


def _ensure_parse_functions(conn: Any) -> None:
  with conn.cursor() as cur:
    cur.execute(
      """
      CREATE OR REPLACE FUNCTION public.marketing_content_parse_numeric(value TEXT)
      RETURNS NUMERIC
      LANGUAGE plpgsql
      IMMUTABLE
      AS $$
      DECLARE
        normalized TEXT;
      BEGIN
        normalized := NULLIF(regexp_replace(COALESCE(value, ''), '[,%￥¥元\\s]', '', 'g'), '');
        IF normalized IS NULL OR normalized IN ('-', '--') THEN
          RETURN NULL;
        END IF;
        RETURN normalized::NUMERIC;
      EXCEPTION WHEN others THEN
        RETURN NULL;
      END;
      $$;

      CREATE OR REPLACE FUNCTION public.marketing_content_parse_bigint(value TEXT)
      RETURNS BIGINT
      LANGUAGE plpgsql
      IMMUTABLE
      AS $$
      DECLARE
        parsed NUMERIC;
      BEGIN
        parsed := public.marketing_content_parse_numeric(value);
        IF parsed IS NULL THEN
          RETURN NULL;
        END IF;
        RETURN parsed::BIGINT;
      END;
      $$;

      CREATE OR REPLACE FUNCTION public.marketing_content_parse_rate(value TEXT)
      RETURNS NUMERIC
      LANGUAGE plpgsql
      IMMUTABLE
      AS $$
      DECLARE
        normalized TEXT;
        parsed NUMERIC;
      BEGIN
        normalized := NULLIF(regexp_replace(COALESCE(value, ''), '[,%\\s]', '', 'g'), '');
        IF normalized IS NULL OR normalized IN ('-', '--') THEN
          RETURN NULL;
        END IF;
        parsed := normalized::NUMERIC;
        IF position('%' in COALESCE(value, '')) > 0 OR parsed > 1 THEN
          RETURN parsed / 100;
        END IF;
        RETURN parsed;
      EXCEPTION WHEN others THEN
        RETURN NULL;
      END;
      $$;
      """
    )
  conn.commit()


def _parse_decimal(value: Any) -> Optional[Decimal]:
  normalized = _clean_text(value)
  if not normalized:
    return None
  normalized = re.sub(r"[,%￥¥元\s]", "", normalized)
  try:
    return Decimal(normalized)
  except InvalidOperation:
    return None


def build_arg_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="导入并清洗千川素材日报到内容资产分层表")
  subparsers = parser.add_subparsers(dest="command", required=True)

  import_parser = subparsers.add_parser("import-ods", help="导入 CSV/JSON/JSONL 到 ODS")
  import_parser.add_argument("--file", required=True, help="千川素材日报文件路径")
  import_parser.add_argument("--ingest-id", default="", help="可选：指定本次 ingest_id")
  import_parser.add_argument("--stat-date", default="", help="当文件缺少日期列时使用的默认日期 YYYY-MM-DD")
  import_parser.add_argument("--encoding", default="utf-8-sig")
  import_parser.add_argument("--dry-run", action="store_true")

  dwd_parser = subparsers.add_parser("build-dwd", help="从 ODS 清洗到 DWD 并自动匹配 asset_id")
  dwd_parser.add_argument("--ingest-id", default="")
  dwd_parser.add_argument("--start-date", default="")
  dwd_parser.add_argument("--end-date", default="")
  dwd_parser.add_argument("--dry-run", action="store_true")
  dwd_parser.add_argument("--refresh-rollups", action="store_true", help="DWD 构建后刷新 DWS/ADS 素材表现快照")

  pipeline_parser = subparsers.add_parser("run", help="导入 ODS 后立即清洗到 DWD")
  pipeline_parser.add_argument("--file", required=True, help="千川素材日报文件路径")
  pipeline_parser.add_argument("--ingest-id", default="")
  pipeline_parser.add_argument("--stat-date", default="")
  pipeline_parser.add_argument("--encoding", default="utf-8-sig")
  pipeline_parser.add_argument("--dry-run", action="store_true")
  pipeline_parser.add_argument("--refresh-rollups", action="store_true", help="导入并清洗后刷新 DWS/ADS 素材表现快照")
  return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = build_arg_parser()
  args = parser.parse_args(argv)
  if args.command == "import-ods":
    result = import_qianchuan_material_daily_report(
      args.file,
      ingest_id=args.ingest_id or None,
      default_stat_date=args.stat_date or None,
      encoding=args.encoding,
      dry_run=args.dry_run,
    ).to_dict()
  elif args.command == "build-dwd":
    dwd_result = build_qianchuan_material_dwd(
      ingest_id=args.ingest_id or None,
      start_date=args.start_date or None,
      end_date=args.end_date or None,
      dry_run=args.dry_run,
    )
    if args.refresh_rollups:
      result = {
        "dwd": dwd_result.to_dict(),
        "rollups": refresh_marketing_content_performance_rollups(
          start_date=args.start_date or None,
          end_date=args.end_date or None,
          dry_run=args.dry_run,
        ).to_dict(),
      }
    else:
      result = dwd_result.to_dict()
  else:
    result = run_qianchuan_material_report_pipeline(
      args.file,
      ingest_id=args.ingest_id or None,
      default_stat_date=args.stat_date or None,
      encoding=args.encoding,
      dry_run=args.dry_run,
      refresh_rollups=args.refresh_rollups,
    )
  print(json.dumps(result, ensure_ascii=False, indent=2))
  return 0
