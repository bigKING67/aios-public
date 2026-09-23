from __future__ import annotations

import json
import sys
import types
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

psycopg2_stub = types.ModuleType("psycopg2")
psycopg2_extras_stub = types.ModuleType("psycopg2.extras")
psycopg2_stub.extras = psycopg2_extras_stub
psycopg2_stub.extensions = types.SimpleNamespace(cursor=object, connection=object)
psycopg2_stub.connect = lambda *args, **kwargs: None
psycopg2_extras_stub.RealDictCursor = object
sys.modules.setdefault("psycopg2", psycopg2_stub)
sys.modules.setdefault("psycopg2.extras", psycopg2_extras_stub)

from marketing_content_assets.yuntu_archive import dry_run_payload  # noqa: E402
from marketing_content_assets.yuntu_archive_models import (  # noqa: E402
  archive_records_from_page_batch,
  douyin_video_url,
)


class YuntuArchiveModelsTest(unittest.TestCase):
  def test_page_batch_parses_source_ids_without_treating_vid_as_aweme(self) -> None:
    payload = {
      "sourceSystem": "yuntu",
      "sourceTaskName": "千川短视频图文带货-主要竞对品牌视频信息-2026-05",
      "outputBaseName": "yuntu_goods_video_202605",
      "dateLabel": "2026-05",
      "pageUrl": "https://yuntu.oceanengine.com/test",
      "pageNumber": 1,
      "records": [
        {
          "rank": "1",
          "itemIndex": 1,
          "title": "sample title",
          "videoId": "v0200fg10000ctv720fog65rql0ldg2g",
          "materialId": "7241000000000000000",
          "cdnUrl": "https://v3-yd.oceanengine.com/a/video/tos/cn/1?mime_type=video_mp4",
          "cdnEvidence": {"batchId": "b1", "mappingConfidence": "poster_exact"},
          "rowPayload": {"排名": "1", "视频内容": "sample title", "_素材ID": "7241000000000000000"},
        }
      ],
    }

    records = archive_records_from_page_batch(payload)

    self.assertEqual(len(records), 1)
    record = records[0]
    self.assertEqual(record.source_task_name, "yuntu_goods_video_202605")
    self.assertEqual(record.source_rank, 1)
    self.assertEqual(record.source_video_id, "v0200fg10000ctv720fog65rql0ldg2g")
    self.assertEqual(record.source_material_id, "7241000000000000000")
    self.assertEqual(record.aweme_id, "")
    self.assertEqual(record.external_url, "")
    self.assertEqual(record.mapping_confidence, "poster_exact")
    self.assertTrue(record.should_download)

  def test_explicit_aweme_id_is_the_only_douyin_url_source(self) -> None:
    payload = {
      "sourceTaskName": "task",
      "dateLabel": "2026-05",
      "records": [
        {
          "rank": "2",
          "videoId": "v0200fg10000ctv720fog65rql0ldg2g",
          "awemeId": "7380000000000000000",
          "rowPayload": {"排名": "2", "视频内容": "title"},
        }
      ],
    }

    record = archive_records_from_page_batch(payload)[0]

    self.assertEqual(record.external_url, "https://www.douyin.com/video/7380000000000000000")
    self.assertEqual(douyin_video_url("", ""), "")

  def test_dry_run_counts_missing_cdn_as_skipped(self) -> None:
    payload = {
      "sourceTaskName": "task",
      "dateLabel": "2026-05",
      "records": [
        {"rank": "1", "cdnUrl": "https://v.example/1.mp4", "rowPayload": {"排名": "1"}},
        {"rank": "2", "cdnMissingReason": "未授权", "rowPayload": {"排名": "2"}},
      ],
    }

    result = dry_run_payload(payload)

    self.assertEqual(result["accepted"], 2)
    self.assertEqual(result["queued"], 1)
    self.assertEqual(result["skipped"], 1)
    self.assertFalse(result["sampleRecords"][0]["hasExplicitDouyinId"])

  def test_request_payload_is_json_serializable(self) -> None:
    payload = {
      "sourceTaskName": "task",
      "dateLabel": "2026-05",
      "records": [{"rank": "1", "rowPayload": {"排名": "1", "视频内容": "title"}}],
    }
    record = archive_records_from_page_batch(payload)[0]

    encoded = json.dumps(record.request_payload, ensure_ascii=False)

    self.assertIn("task", encoded)


if __name__ == "__main__":
  unittest.main()
