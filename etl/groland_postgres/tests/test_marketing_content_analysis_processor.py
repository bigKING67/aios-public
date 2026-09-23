from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

requests_stub = types.SimpleNamespace(Session=lambda: None)
sys.modules.setdefault("requests", requests_stub)

psycopg2_stub = types.ModuleType("psycopg2")
psycopg2_extras_stub = types.ModuleType("psycopg2.extras")
psycopg2_stub.extras = psycopg2_extras_stub
psycopg2_stub.extensions = types.SimpleNamespace(cursor=object, connection=object)
psycopg2_stub.connect = lambda *args, **kwargs: None
psycopg2_extras_stub.RealDictCursor = object
sys.modules.setdefault("psycopg2", psycopg2_stub)
sys.modules.setdefault("psycopg2.extras", psycopg2_extras_stub)

from marketing_content_assets import analysis_processor  # noqa: E402


PRODUCT_OBJECTIVE = "product_all_domain_shortvideo"
LIVE_OBJECTIVE = "live_all_domain_shortvideo"


class FakeCursor:
  def __init__(self, *, tables_exist: bool = True) -> None:
    self.tables_exist = tables_exist
    self.statements: list[tuple[str, object | None]] = []

  def __enter__(self) -> "FakeCursor":
    return self

  def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
    return False

  def execute(self, sql: str, params: object | None = None) -> None:
    self.statements.append((sql, params))

  def fetchone(self) -> tuple[bool, bool, bool]:
    return (self.tables_exist, self.tables_exist, self.tables_exist)


class FakeConnection:
  def __init__(self, cursor: FakeCursor) -> None:
    self.cursor_obj = cursor
    self.commits = 0

  def cursor(self) -> FakeCursor:
    return self.cursor_obj

  def commit(self) -> None:
    self.commits += 1


class BenchmarkCursor:
  def __init__(self, row: dict[str, object] | None) -> None:
    self.row = row
    self.statements: list[tuple[str, object | None]] = []

  def execute(self, sql: str, params: object | None = None) -> None:
    self.statements.append((sql, params))

  def fetchone(self) -> dict[str, object] | None:
    return self.row


class ProductCardAcceptanceCursor:
  def __init__(self) -> None:
    self.statements: list[tuple[str, object | None]] = []
    self._next_row: dict[str, object] | None = None

  def execute(self, sql: str, params: object | None = None) -> None:
    self.statements.append((sql, params))
    if "to_regclass" in sql:
      self._next_row = {
        "bridge_exists": True,
        "card_ads_exists": True,
        "card_raw_exists": True,
      }
      return
    self._next_row = {
      "context": {
        "bridge": {
          "source": "ads.douyin_shortvideo_detail",
          "materialCount": 1,
          "oneProductMaterialCount": 1,
          "multiProductMaterialCount": 0,
          "productCount": 1,
          "bridgeDayCount": 3,
          "directMatchMaterialCount": 0,
          "nonDirectMatchMaterialCount": 1,
          "matchStatuses": ["matched_title_date"],
        },
        "metrics": {
          "sameDayAlignedDayCount": 2,
          "sameDayAlignedMaterialCount": 1,
          "sameDayAlignedProductCount": 1,
          "rangeAlignedDayCount": 2,
          "cardExposureUserCount": 1000,
          "cardClickUserCount": 120,
          "cardBuyerCount": 8,
          "cardUserPayAmount": 1600,
          "cardOrderCount": 9,
        },
        "sourceBreakdown": [
          {
            "sourceLevel1": "搜索|-|非投放时段|自营",
            "rowCount": 2,
            "materialCount": 1,
            "productCount": 1,
            "cardUserPayAmount": 1600,
          }
        ],
        "materialMappings": [
          {
            "materialId": "m-product",
            "productIds": ["p-1"],
            "productCount": 1,
            "bridgeDayCount": 3,
            "matchStatuses": ["matched_title_date"],
          }
        ],
      }
    }

  def fetchone(self) -> dict[str, object] | None:
    return self._next_row


class CacheHitCursor:
  def __init__(self, row: dict[str, object] | None) -> None:
    self.row = row
    self.statements: list[tuple[str, object | None]] = []

  def __enter__(self) -> "CacheHitCursor":
    return self

  def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
    return False

  def execute(self, sql: str, params: object | None = None) -> None:
    self.statements.append((sql, params))

  def fetchone(self) -> dict[str, object] | None:
    sql = self.statements[-1][0] if self.statements else ""
    if "to_regclass" in sql:
      return {"jobs_exists": True, "results_exists": True}
    return self.row


class CacheHitConnection:
  def __init__(self, cursor: CacheHitCursor) -> None:
    self.cursor_obj = cursor

  def cursor(self, *args: object, **kwargs: object) -> CacheHitCursor:
    return self.cursor_obj


class CacheHitConnectionContext:
  def __init__(self, conn: CacheHitConnection) -> None:
    self.conn = conn

  def __enter__(self) -> CacheHitConnection:
    return self.conn

  def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
    return False


class MarketingContentAnalysisProcessorContractTest(unittest.TestCase):
  def test_analysis_diagnosis_metadata_records_v21_writeback_contract(self) -> None:
    metadata = analysis_processor._analysis_diagnosis_metadata({
      "analysis_schema_version": "2.1",
      "diagnosis_mode": "data_content_fusion",
      "delivery_mode": "qianchuan_all_domain",
      "objective": LIVE_OBJECTIVE,
      "performance_diagnosis": {"verdict": "weak"},
      "content_diagnosis": {"hook_assessment": {"strength": "medium"}},
      "fusion_diagnosis": {
        "primary_problem_stage": "live_room_acceptance_weak",
        "final_root_cause_owner": "live_room",
        "confidence": 0.82,
        "live_acceptance_attribution": {
          "level": "account_date_environment",
          "confidence": "medium",
        },
      },
      "scores": {"fusion_overall_score": 74},
    })

    self.assertEqual(metadata["analysis_schema_version"], "2.1")
    self.assertEqual(metadata["diagnosis_mode"], "data_content_fusion")
    self.assertEqual(metadata["delivery_mode"], "qianchuan_all_domain")
    self.assertEqual(metadata["objective"], LIVE_OBJECTIVE)
    self.assertTrue(metadata["has_video_understanding"])
    self.assertTrue(metadata["has_performance_snapshot"])
    self.assertTrue(metadata["has_live_acceptance"])
    self.assertEqual(metadata["primary_problem_stage"], "live_room_acceptance_weak")
    self.assertEqual(metadata["final_root_cause_owner"], "live_room")
    self.assertEqual(metadata["fusion_confidence"], 0.82)

  def test_analysis_diagnosis_metadata_marks_missing_live_acceptance_low_confidence(self) -> None:
    metadata = analysis_processor._analysis_diagnosis_metadata({
      "analysis_schema_version": "2.1",
      "diagnosis_mode": "data_content_fusion",
      "performance_diagnosis": {
        "live_acceptance_status": "missing",
        "live_acceptance_attribution": {
          "level": "account_date_environment",
          "confidence": "low",
        },
      },
      "content_diagnosis": {"hook_assessment": {"strength": "strong"}},
    })

    self.assertTrue(metadata["has_video_understanding"])
    self.assertTrue(metadata["has_performance_snapshot"])
    self.assertFalse(metadata["has_live_acceptance"])

  def test_persist_video_understanding_cache_writes_identity_fields(self) -> None:
    cursor = FakeCursor()
    result = types.SimpleNamespace(
      analysis={
        "analysis_schema_version": "2.1",
        "diagnosis_mode": "data_content_fusion",
        "confidence": 0.83,
      },
      text='{"analysis_schema_version":"2.1"}',
      usage={"input_tokens": 10, "output_tokens": 20},
      response_id="resp_123",
    )

    persisted = analysis_processor._persist_video_understanding_cache(
      cursor,
      job={
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
        "raw_sha256": "raw_media_hash",
      },
      analysis_object_id="33333333-3333-3333-3333-333333333333",
      result=result,
      model_name="doubao-seed-2-0-lite-260428",
      request_settings={
        "analysis_schema_version": "2.1",
        "prompt_version": "v9",
        "analysis_profile": "raw_deep",
      },
      input_role="preview",
      input_object_key="objects/input.preview.mp4",
      model_input_role="raw",
      model_input_object_key="objects/input.raw.mp4",
      input_strategy="signed_url",
    )

    self.assertTrue(persisted)
    self.assertEqual(len(cursor.statements), 3)
    job_sql, job_params = cursor.statements[1]
    result_sql, result_params = cursor.statements[2]

    self.assertIn("marketing_content_asset_video_understanding_jobs", job_sql)
    self.assertIn("marketing_content_asset_video_understanding_results", result_sql)
    self.assertIsInstance(job_params, tuple)
    self.assertIsInstance(result_params, tuple)
    self.assertEqual(job_params[3], "raw_media_hash")
    self.assertEqual(job_params[5], "doubao-seed-2-0-lite-260428")
    self.assertEqual(job_params[6], "content_asset_analysis:v9:schema:2.1")
    self.assertEqual(job_params[7], "2.1")
    self.assertRegex(job_params[8], r"^[0-9a-f]{64}$")
    self.assertIn("content-asset-video-understanding", job_params[9])
    self.assertEqual(result_params[5], "content_asset_analysis:v9:schema:2.1")
    self.assertEqual(result_params[6], "2.1")
    self.assertRegex(result_params[7], r"^[0-9a-f]{64}$")
    self.assertEqual(result_params[7], job_params[8])
    self.assertEqual(result_params[8], job_params[9])
    self.assertEqual(result_params[10], 0.83)

    result_json = json.loads(result_params[9])
    self.assertEqual(result_json["analysis"]["diagnosis_mode"], "data_content_fusion")
    self.assertEqual(result_json["responseId"], "resp_123")
    self.assertEqual(result_json["inputSnapshot"]["inputRole"], "preview")
    self.assertEqual(result_json["inputSnapshot"]["modelInputRole"], "raw")
    self.assertEqual(result_json["inputSnapshot"]["requestSettings"]["analysis_profile"], "raw_deep")

  def test_persist_video_understanding_cache_skips_when_tables_are_absent(self) -> None:
    cursor = FakeCursor(tables_exist=False)
    result = types.SimpleNamespace(
      analysis={"confidence": 0.5},
      text="{}",
      usage={},
      response_id="",
    )

    persisted = analysis_processor._persist_video_understanding_cache(
      cursor,
      job={
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
        "raw_sha256": "",
      },
      analysis_object_id="33333333-3333-3333-3333-333333333333",
      result=result,
      model_name="doubao-seed-2-0-lite-260428",
      request_settings={},
      input_role="preview",
      input_object_key="objects/input.preview.mp4",
      model_input_role="preview",
      model_input_object_key="objects/input.preview.mp4",
      input_strategy="signed_url",
    )

    self.assertFalse(persisted)
    self.assertEqual(len(cursor.statements), 1)

  def test_process_analysis_job_hydrates_existing_artifact_without_model_call(self) -> None:
    completed: dict[str, object] = {}
    stages: list[tuple[str, str, int, dict[str, object] | None]] = []

    class FakeStorage:
      def download_file(self, object_key: str, target_path: Path) -> None:
        self.object_key = object_key
        target_path.write_text(json.dumps({
          "model": "doubao-seed-2-0-lite-260428",
          "responseId": "resp_existing",
          "requestSettings": {
            "analysis_schema_version": "2.1",
            "prompt_version": "content_asset_analysis:v9:schema:2.1",
            "analysis_profile": "preview_fast",
          },
          "input": {
            "objectRole": "preview",
            "objectKey": "objects/input.preview.mp4",
            "modelInputRole": "preview",
            "modelInputObjectKey": "objects/input.preview.mp4",
            "strategy": "signed_url",
          },
          "analysis": {
            "analysis_schema_version": "2.1",
            "summary": "已有结果回填",
            "video_understanding": {
              "hook": {"type": "benefit", "strength": "strong"},
            },
          },
          "usage": {"input_tokens": 12, "output_tokens": 34},
        }), encoding="utf-8")

    original_prepare = analysis_processor.prepare_video_model_input
    original_stage_updater = analysis_processor._stage_updater
    original_complete = analysis_processor._complete_analysis_cache_hydration_job
    try:
      analysis_processor.prepare_video_model_input = lambda **kwargs: (_ for _ in ()).throw(
        AssertionError("artifact hydration must not prepare video input")
      )
      analysis_processor._stage_updater = lambda job: (
        lambda stage, label, progress_percent, extra=None: stages.append((stage, label, progress_percent, extra))
      )
      analysis_processor._complete_analysis_cache_hydration_job = (
        lambda conn, **kwargs: completed.update(kwargs)
      )

      class FakeConnectionContext:
        def __enter__(self) -> object:
          return object()

        def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
          return False

      original_connect_pg = analysis_processor.connect_pg
      analysis_processor.connect_pg = lambda: FakeConnectionContext()
      try:
        with tempfile.TemporaryDirectory() as tmp_dir:
          analysis_processor._process_analysis_job(
            storage=FakeStorage(),  # type: ignore[arg-type]
            client=None,
            job={
              "asset_id": "11111111-1111-1111-1111-111111111111",
              "job_id": "22222222-2222-2222-2222-222222222222",
              "analysis_object_key": "analysis/existing.json",
              "analysis_object_id": "33333333-3333-3333-3333-333333333333",
              "metadata": {
                "operation": analysis_processor.VIDEO_UNDERSTANDING_CACHE_HYDRATION_OPERATION,
                "analysis_artifact_object_key": "analysis/existing.json",
              },
            },
            work_dir=Path(tmp_dir),
            signed_url_ttl=1800,
            url_max_bytes=50_000_000,
            proxy_target_bytes=45_000_000,
          )
      finally:
        analysis_processor.connect_pg = original_connect_pg
    finally:
      analysis_processor.prepare_video_model_input = original_prepare
      analysis_processor._stage_updater = original_stage_updater
      analysis_processor._complete_analysis_cache_hydration_job = original_complete

    self.assertEqual(completed["model_name"], "doubao-seed-2-0-lite-260428")
    self.assertEqual(completed["analysis_artifact_object_key"], "analysis/existing.json")
    self.assertEqual(completed["result"].response_id, "resp_existing")
    self.assertIn("downloading_analysis_artifact", [stage[0] for stage in stages])
    self.assertIn("writing_structured_cache", [stage[0] for stage in stages])

  def test_process_analysis_job_reuses_cached_video_understanding_without_model_call(self) -> None:
    cache_cursor = CacheHitCursor({
      "result_id": "cached-result-id",
      "cache_key": "content-asset-video-understanding:asset:media:model:prompt:schema:snapshot",
      "result_json": {
        "analysis": {
          "analysis_schema_version": "2.1",
          "diagnosis_mode": "data_content_fusion",
          "summary": "缓存命中摘要",
          "scores": {"fusion_overall_score": 82},
        },
        "outputText": '{"summary":"缓存命中摘要"}',
        "usage": {"input_tokens": 11, "output_tokens": 22},
        "responseId": "resp_cached",
      },
    })
    completed: dict[str, object] = {}
    stages: list[tuple[str, str, int, dict[str, object] | None]] = []

    class FakeStorage:
      def __init__(self) -> None:
        self.uploads: list[tuple[str, Path, str]] = []

      def upload_file(self, object_key: str, path: Path, content_type: str) -> None:
        self.uploads.append((object_key, path, content_type))

    class FakeProfile:
      name = "preview_fast"

      def request_settings(self) -> dict[str, object]:
        return {
          "analysis_profile": self.name,
          "max_output_tokens": 8192,
          "fps": 1.0,
          "thinking_type": "disabled",
          "temperature": 0.2,
          "json_schema_strict": True,
          "store_response": False,
        }

    class FakeConfig:
      model = "doubao-seed-2-0-lite-260428"
      analysis_schema_version = "2.1"
      video_understanding_prompt_version = "v1"
      fusion_analysis_prompt_version = "v9"

      def analysis_profile(self, profile_name: str) -> FakeProfile:
        return FakeProfile()

    class FakeClient:
      def __init__(self) -> None:
        self.config = FakeConfig()
        self.called = False

      def analyze_video(self, *args: object, **kwargs: object) -> object:
        self.called = True
        raise AssertionError("cache hit must not call Ark analyze_video")

    fake_client = FakeClient()
    fake_storage = FakeStorage()
    original_prepare = analysis_processor.prepare_video_model_input
    original_connect_pg = analysis_processor.connect_pg
    original_stage_updater = analysis_processor._stage_updater
    original_complete = analysis_processor._complete_analysis_job
    try:
      analysis_processor.prepare_video_model_input = lambda **kwargs: {
        "video_url": "https://example.invalid/input.mp4",
        "model_input_role": "preview",
        "model_input_object_key": "objects/input.preview.mp4",
        "strategy": "signed_url",
        "source_size_bytes": 1234,
      }
      analysis_processor.connect_pg = lambda: CacheHitConnectionContext(CacheHitConnection(cache_cursor))
      analysis_processor._stage_updater = lambda job: (
        lambda stage, label, progress_percent, extra=None: stages.append((stage, label, progress_percent, extra))
      )
      analysis_processor._complete_analysis_job = lambda conn, **kwargs: completed.update(kwargs)

      with tempfile.TemporaryDirectory() as tmp_dir:
        analysis_processor._process_analysis_job(
          storage=fake_storage,  # type: ignore[arg-type]
          client=fake_client,  # type: ignore[arg-type]
          job={
            "asset_id": "11111111-1111-1111-1111-111111111111",
            "job_id": "22222222-2222-2222-2222-222222222222",
            "preview_object_key": "objects/input.preview.mp4",
            "raw_sha256": "raw_media_hash",
            "metadata": {"analysis_source": "preview", "analysis_profile": "preview_fast"},
          },
          work_dir=Path(tmp_dir),
          signed_url_ttl=1800,
          url_max_bytes=50_000_000,
          proxy_target_bytes=45_000_000,
        )
    finally:
      analysis_processor.prepare_video_model_input = original_prepare
      analysis_processor.connect_pg = original_connect_pg
      analysis_processor._stage_updater = original_stage_updater
      analysis_processor._complete_analysis_job = original_complete

    self.assertFalse(fake_client.called)
    self.assertEqual(completed["summary"], "缓存命中摘要")
    self.assertEqual(completed["score"], 8.2)
    self.assertEqual(completed["model_name"], "doubao-seed-2-0-lite-260428")
    self.assertEqual(completed["result"].response_id, "resp_cached")
    self.assertEqual(completed["request_settings"]["prompt_version"], "content_asset_analysis:v9:schema:2.1")
    self.assertTrue(fake_storage.uploads)
    self.assertIn("model_cache_hit", [stage[0] for stage in stages])

  def test_persist_video_understanding_failure_writes_terminal_failed_row(self) -> None:
    cursor = FakeCursor()

    recorded = analysis_processor._persist_video_understanding_failure(
      cursor,
      job={
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
        "input_object_key": "objects/input.preview.mp4",
        "raw_sha256": "raw_media_hash",
      },
      model_name="doubao-seed-2-0-lite-260428",
      analysis_schema_version="2.1",
      prompt_version="v9",
      status="failed",
      error_message="AccountOverdueError: model service has been paused",
    )

    self.assertTrue(recorded)
    self.assertEqual(len(cursor.statements), 2)
    job_sql, job_params = cursor.statements[1]
    self.assertIn("marketing_content_asset_video_understanding_jobs", job_sql)
    self.assertIn("ON CONFLICT", job_sql)
    self.assertIsInstance(job_params, tuple)
    self.assertEqual(job_params[0], "22222222-2222-2222-2222-222222222222")
    self.assertEqual(job_params[1], "11111111-1111-1111-1111-111111111111")
    self.assertEqual(job_params[2], "raw_media_hash")
    self.assertEqual(job_params[4], "doubao-seed-2-0-lite-260428")
    self.assertEqual(job_params[5], "content_asset_analysis:v9:schema:2.1")
    self.assertEqual(job_params[6], "2.1")
    self.assertIn("content-asset-video-understanding", job_params[7])
    self.assertEqual(job_params[8], "failed")
    self.assertIn("AccountOverdueError", job_params[9])
    self.assertTrue(job_params[10])

  def test_persist_video_understanding_failure_skips_when_job_table_absent(self) -> None:
    cursor = FakeCursor(tables_exist=False)

    recorded = analysis_processor._persist_video_understanding_failure(
      cursor,
      job={
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
      },
      model_name="doubao-seed-2-0-lite-260428",
      analysis_schema_version="2.1",
      prompt_version="v9",
      status="failed",
      error_message="boom",
    )

    self.assertFalse(recorded)
    self.assertEqual(len(cursor.statements), 1)

  def test_persist_video_understanding_failure_defaults_empty_schema_version(self) -> None:
    cursor = FakeCursor()

    recorded = analysis_processor._persist_video_understanding_failure(
      cursor,
      job={
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
      },
      model_name="doubao-seed-2-0-lite-260428",
      analysis_schema_version="",
      prompt_version="v9",
      status="failed",
      error_message="boom",
    )

    self.assertTrue(recorded)
    _, job_params = cursor.statements[1]
    self.assertEqual(job_params[5], "content_asset_analysis:v9:schema:2.1")
    self.assertEqual(job_params[6], "2.1")

  def test_fail_analysis_job_records_video_failure_and_generic_processing_failure(self) -> None:
    cursor = FakeCursor()
    conn = FakeConnection(cursor)

    analysis_processor._fail_analysis_job(
      conn,
      {
        "asset_id": "11111111-1111-1111-1111-111111111111",
        "job_id": "22222222-2222-2222-2222-222222222222",
        "input_object_key": "objects/input.preview.mp4",
        "raw_sha256": "raw_media_hash",
        "attempts": 1,
        "max_attempts": 1,
      },
      "AccountOverdueError: model service has been paused",
      model_name="doubao-seed-2-0-lite-260428",
      analysis_schema_version="2.1",
      prompt_version="v9",
    )

    video_sql, video_params = next(
      (sql, params)
      for sql, params in cursor.statements
      if "INSERT INTO ads.marketing_content_asset_video_understanding_jobs" in sql
    )
    self.assertIn("marketing_content_asset_video_understanding_jobs", video_sql)
    self.assertIsInstance(video_params, tuple)
    self.assertEqual(video_params[8], "failed")

    processing_sql, processing_params = next(
      (sql, params)
      for sql, params in cursor.statements
      if "UPDATE ads.marketing_content_asset_processing_jobs" in sql
    )
    self.assertIn("metadata = COALESCE(metadata", processing_sql)
    self.assertIsInstance(processing_params, tuple)
    processing_metadata = json.loads(processing_params[3])
    self.assertEqual(processing_metadata["video_understanding_job_status"], "failed")
    self.assertTrue(processing_metadata["video_understanding_job_recorded"])

    event_sql, event_params = next(
      (sql, params)
      for sql, params in cursor.statements
      if "analysis_failed" in sql
    )
    self.assertIn("marketing_content_asset_events", event_sql)
    self.assertIsInstance(event_params, tuple)
    self.assertIn("AccountOverdueError", event_params[1])
    self.assertEqual(conn.commits, 1)

  def test_video_understanding_failure_status_marks_missing_media_skipped(self) -> None:
    status = analysis_processor._video_understanding_failure_status(
      "asset_id=asset-1 缺少可分析的视频对象",
      "unknown",
      True,
    )

    self.assertEqual(status, "skipped")

  def test_asset_context_injects_performance_diagnosis_and_constraints(self) -> None:
    snapshot = {
      "deliveryMode": "qianchuan_all_domain",
      "materials": [
        {
          "materialId": "m-product",
          "objective": PRODUCT_OBJECTIVE,
          "totalImpressions": 5000,
          "totalClicks": 20,
          "totalCost": 600,
          "totalOrders": 2,
          "ctr": 0.004,
          "cvr": 0.1,
          "payRoi": 1.8,
          "refundRate1h": 0.02,
          "benchmarkContext": {
            "status": "live_benchmark",
            "scope": "same_objective_account_30d",
            "metrics": {"ctr": {"p25": 0.012}},
          },
        },
        {
          "materialId": "m-live",
          "objective": LIVE_OBJECTIVE,
          "totalImpressions": 6000,
          "totalClicks": 260,
          "totalCost": 900,
          "ctr": 0.04,
          "videoCompletePlayRate": 0.25,
          "playRate5s": 0.5,
          "playRate10s": 0.45,
          "payRoi": 1.5,
          "refundRate1h": 0.03,
          "liveAcceptance": {
            "acceptanceQualityStatus": "missing",
          },
        },
      ],
    }
    original_loader = analysis_processor._load_performance_snapshot_context
    analysis_processor._load_performance_snapshot_context = lambda asset_id: snapshot
    try:
      context = analysis_processor._asset_context(
        {
          "asset_id": "asset-1",
          "title": "测试素材",
          "transcript_context": {"scriptText": "前三秒痛点开场，点击小黄车。"},
        },
        input_role="preview",
        input_object_key="objects/input.preview.mp4",
        model_input_role="raw",
        model_input_object_key="objects/input.raw.mp4",
        analysis_profile="raw_deep",
      )
    finally:
      analysis_processor._load_performance_snapshot_context = original_loader

    self.assertEqual(context["performanceSnapshot"]["deliveryMode"], "qianchuan_all_domain")
    diagnosis = context["performanceDiagnosis"]
    self.assertEqual(diagnosis["deliveryMode"], "qianchuan_all_domain")
    self.assertEqual(len(diagnosis["materialDiagnoses"]), 2)
    product_diagnosis = diagnosis["materialDiagnoses"][0]["diagnosis"]
    live_diagnosis = diagnosis["materialDiagnoses"][1]["diagnosis"]
    self.assertEqual(product_diagnosis["benchmark_context"]["status"], "live_benchmark")
    self.assertTrue(product_diagnosis["next_actions"][0]["evidence_refs"])
    self.assertEqual(live_diagnosis["problem_stage"], "missing_live_acceptance")
    self.assertEqual(
      live_diagnosis["live_acceptance_attribution"]["level"],
      "account_date_environment",
    )
    self.assertEqual(context["productCardAcceptance"]["level"], "missing_card_acceptance")
    self.assertEqual(context["productCardAcceptance"]["bridgeSource"], "ads.douyin_shortvideo_detail")
    constraints = context["constraints"]
    self.assertEqual(constraints["delivery_mode"], "qianchuan_all_domain")
    self.assertEqual(constraints["objective"], "mixed")
    self.assertIn(PRODUCT_OBJECTIVE, constraints["objectives"])
    self.assertIn(LIVE_OBJECTIVE, constraints["objectives"])
    self.assertIn("do not add", constraints["boost_metrics_policy"])
    self.assertIn("not material-level exact attribution", constraints["live_acceptance_policy"])

  def test_product_card_acceptance_context_prefers_embedded_bridge_context(self) -> None:
    context = analysis_processor._product_card_acceptance_context({
      "productCardAcceptance": {
        "level": "product_day_aligned",
        "confidence": "medium",
        "reason": "product_id_stat_date_source_level1_aligned",
        "metrics": {"cardOrderCount": 9},
      },
      "materials": [
        {
          "materialId": "m-product",
          "objective": PRODUCT_OBJECTIVE,
        }
      ],
    })

    self.assertEqual(context["level"], "product_day_aligned")
    self.assertEqual(context["confidence"], "medium")
    self.assertEqual(context["source"], "ods.douyin_trade_sale_card_detail_raw")
    self.assertEqual(context["adsSource"], "ads.douyin_trade_sale_card_detail")
    self.assertEqual(context["bridgeSource"], "ads.douyin_shortvideo_detail")
    self.assertEqual(context["metrics"]["cardOrderCount"], 9)

  def test_product_card_acceptance_lookup_builds_medium_context_for_title_date_bridge(self) -> None:
    cursor = ProductCardAcceptanceCursor()
    context = analysis_processor._load_product_card_acceptance_context(
      cursor,
      [
        {
          "materialId": "m-product",
          "objective": PRODUCT_OBJECTIVE,
          "firstStatDate": "2026-06-01",
          "lastStatDate": "2026-06-03",
        }
      ],
    )

    self.assertEqual(context["level"], "product_day_aligned")
    self.assertEqual(context["confidence"], "medium")
    self.assertEqual(context["reason"], "product_id_stat_date_source_level1_aligned")
    self.assertEqual(context["bridge"]["method"], "shortvideo_detail_title_date_product_context")
    self.assertEqual(context["metrics"]["cardOrderCount"], 9)
    self.assertEqual(context["sourceBreakdown"][0]["sourceLevel1"], "搜索|-|非投放时段|自营")
    self.assertIn("不能把商品卡点击、成交或 GMV 精确归因到单个 material_id", context["limitation"])

  def test_dynamic_benchmark_sql_uses_ordered_degradation_and_minimum_sample(self) -> None:
    cursor = BenchmarkCursor({
      "scope": "same_objective_account_30d",
      "window_days": 30,
      "sample_count": 8,
      "acceptance_sample_count": 6,
      "ctr_p25": 0.012,
      "ctr_p50": 0.018,
      "ctr_p75": 0.024,
      "watch_to_pay_rate_user_p25": 0.015,
      "watch_to_pay_rate_user_p50": 0.024,
      "watch_to_pay_rate_user_p75": 0.033,
    })

    contexts = analysis_processor._load_performance_benchmark_contexts(
      cursor,
      [{
        "material_id": "m-live",
        "objective": LIVE_OBJECTIVE,
        "douyin_account_display_id": "dy_live_001",
        "last_stat_date": "2026-06-18",
      }],
    )

    sql, params = cursor.statements[0]
    self.assertIn("same_objective_account_30d", sql)
    self.assertIn("same_objective_global_30d", sql)
    self.assertIn("same_objective_global_90d", sql)
    self.assertIn("WHERE perf_benchmark.sample_count >= 5", sql)
    self.assertIn("marketing_content_qianchuan_live_room_acceptance_di", sql)
    self.assertIsInstance(params, dict)
    self.assertEqual(params["objective"], LIVE_OBJECTIVE)

    context = contexts["m-live"]
    self.assertEqual(context["status"], "live_benchmark")
    self.assertEqual(context["scope"], "same_objective_account_30d")
    self.assertEqual(context["minimum_sample_count"], 5)
    self.assertEqual(context["metrics"]["ctr"]["p25"], 0.012)
    self.assertEqual(context["metrics"]["watch_to_pay_rate_user"]["p50"], 0.024)

  def test_dynamic_benchmark_degrades_to_insufficient_when_sample_is_missing(self) -> None:
    cursor = BenchmarkCursor(None)

    contexts = analysis_processor._load_performance_benchmark_contexts(
      cursor,
      [{
        "material_id": "m-product",
        "objective": PRODUCT_OBJECTIVE,
        "douyin_account_display_id": "dy_product_001",
        "last_stat_date": "2026-06-18",
      }],
    )

    self.assertEqual(contexts["m-product"]["status"], "insufficient_benchmark")
    self.assertEqual(contexts["m-product"]["minimum_sample_count"], 5)
    self.assertIn("sample_count < 5", contexts["m-product"]["note"])


if __name__ == "__main__":
  unittest.main()
