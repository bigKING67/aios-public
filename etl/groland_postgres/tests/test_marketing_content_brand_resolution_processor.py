from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from marketing_content_assets.brand_resolution_processor import (  # noqa: E402
  BrandResolutionCandidate,
  asset_context,
  deterministic_resolution,
  normalize_asset_id,
  normalize_limit,
  normalize_month,
  normalize_resolver_version,
  normalize_video_type,
  resolve_industry_material_brands,
)


class BrandResolutionProcessorTest(unittest.TestCase):
  def test_normalizes_scope_and_limits(self) -> None:
    self.assertEqual("2026-05", normalize_month("2026-05"))
    self.assertEqual("live_lead_short_video", normalize_video_type("live_lead_short_video"))
    self.assertEqual(20, normalize_limit(20))
    self.assertEqual(
      uuid.UUID("4ab75252-b87b-557b-be2d-59e8f4c5a37e"),
      normalize_asset_id("4ab75252-b87b-557b-be2d-59e8f4c5a37e"),
    )

  def test_rejects_unbounded_or_invalid_scope(self) -> None:
    with self.assertRaisesRegex(ValueError, "YYYY-MM"):
      normalize_month("2026-5")
    with self.assertRaisesRegex(ValueError, "video_type"):
      normalize_video_type("xhs_note")
    with self.assertRaisesRegex(ValueError, "1 到 100"):
      normalize_limit(101)
    with self.assertRaisesRegex(ValueError, "1 到 128"):
      normalize_resolver_version("x" * 129)

  def test_builds_deterministic_evidence_without_model_metadata(self) -> None:
    candidate = sample_candidate(deterministic_brand="OKCS", deterministic_source="metadata")
    resolution = deterministic_resolution(candidate)

    self.assertEqual("OKCS", resolution["brand"])
    self.assertEqual("recognized", resolution["status"])
    self.assertEqual("metadata", resolution["primarySource"])
    self.assertEqual("", resolution["modelName"])

  def test_asset_context_omits_storage_keys_and_includes_transcript(self) -> None:
    candidate = sample_candidate(
      deterministic_brand="",
      deterministic_source="",
      transcript_context={"scriptText": "这是 OKCS 染发霜", "unexpected": "discarded"},
    )
    context = asset_context(candidate)

    self.assertEqual("这是 OKCS 染发霜", context["transcript"]["scriptText"])
    self.assertNotIn("unexpected", context["transcript"])
    self.assertNotIn("previewObjectKey", context)
    self.assertNotIn("rawObjectKey", context)

  @patch("marketing_content_assets.brand_resolution_processor.ArkResponsesClient")
  @patch("marketing_content_assets.brand_resolution_processor.persist_brand_resolution")
  @patch("marketing_content_assets.brand_resolution_processor.list_brand_resolution_candidates")
  @patch("marketing_content_assets.brand_resolution_processor.ensure_brand_resolution_storage_ready")
  def test_dry_run_never_calls_model_or_writes_database(
    self,
    ensure_storage_ready,
    list_candidates,
    persist_resolution,
    ark_client,
  ) -> None:
    list_candidates.return_value = [
      sample_candidate(deterministic_brand="OKCS", deterministic_source="metadata"),
      sample_candidate(deterministic_brand="", deterministic_source=""),
    ]

    summary = resolve_industry_material_brands(
      month="2026-05",
      video_type="live_lead_short_video",
      limit=2,
      apply=False,
      allow_model_calls=False,
    )

    ensure_storage_ready.assert_called_once_with()
    list_candidates.assert_called_once()
    persist_resolution.assert_not_called()
    ark_client.assert_not_called()
    self.assertEqual(0, summary["written"])
    self.assertEqual(0, summary["modelCalls"])
    self.assertEqual(1, summary["deterministicCandidates"])
    self.assertEqual(1, summary["modelCandidates"])

  @patch("marketing_content_assets.brand_resolution_processor.list_brand_resolution_candidates")
  @patch("marketing_content_assets.brand_resolution_processor.ensure_brand_resolution_storage_ready")
  def test_model_gate_requires_apply_before_database_discovery(
    self,
    ensure_storage_ready,
    list_candidates,
  ) -> None:
    with self.assertRaisesRegex(ValueError, "--allow-model-calls"):
      resolve_industry_material_brands(
        month="2026-05",
        video_type="live_lead_short_video",
        limit=1,
        apply=False,
        allow_model_calls=True,
      )

    ensure_storage_ready.assert_not_called()
    list_candidates.assert_not_called()

  @patch("marketing_content_assets.brand_resolution_processor.list_brand_resolution_candidates")
  @patch("marketing_content_assets.brand_resolution_processor.ensure_brand_resolution_storage_ready")
  def test_exact_asset_scope_does_not_require_month_or_video_type(
    self,
    ensure_storage_ready,
    list_candidates,
  ) -> None:
    list_candidates.return_value = []

    summary = resolve_industry_material_brands(
      asset_id="4ab75252-b87b-557b-be2d-59e8f4c5a37e",
      limit=1,
    )

    ensure_storage_ready.assert_called_once_with()
    list_candidates.assert_called_once_with(
      month=None,
      video_type=None,
      limit=1,
      resolver_version="industry-material-brand-v1",
      asset_id=uuid.UUID("4ab75252-b87b-557b-be2d-59e8f4c5a37e"),
    )
    self.assertIsNone(summary["month"])
    self.assertIsNone(summary["videoType"])

  def test_month_and_video_type_are_required_without_exact_asset(self) -> None:
    with self.assertRaisesRegex(ValueError, "同时提供 month 和 video_type"):
      resolve_industry_material_brands(limit=1)


def sample_candidate(
  *,
  deterministic_brand: str,
  deterministic_source: str,
  transcript_context: dict[str, str] | None = None,
) -> BrandResolutionCandidate:
  return BrandResolutionCandidate(
    asset_id=uuid.UUID("4ab75252-b87b-557b-be2d-59e8f4c5a37e"),
    source_rank=6,
    material_count=1,
    video_title="黄黑皮闭眼冲",
    related_product="",
    marketing_selling_point="上色快",
    asset_title="黄黑皮闭眼冲",
    product_names=(),
    creator_name="",
    bucket="aios-content-assets",
    preview_object_key="preview/sample.mp4",
    raw_object_key="raw/sample.mp4",
    transcript_context=transcript_context,
    deterministic_brand=deterministic_brand,
    deterministic_source=deterministic_source,
    deterministic_text="OKCS 染发霜包装" if deterministic_brand else "",
  )


if __name__ == "__main__":
  unittest.main()
