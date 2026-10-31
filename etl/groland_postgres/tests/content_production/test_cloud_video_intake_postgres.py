"""Disposable-database contract for 视频云管家 originals: intake, claiming only where readable, fetching."""
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import cloud_video_intake, segment_suggestion_queue, selling_point_auto  # noqa: E402
from content_production import segment_suggestion_worker as worker  # noqa: E402
from content_production.segment_suggestion_provider import SuggestionError  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
ENV = {'CLOUD_VIDEO_OWNER_USER_ID': 'cloud-owner', 'CONTENT_AI_STUDIO_ENTERPRISE': '百雀羚'}


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@unittest.skipUnless(DB, 'disposable database required')
class CloudVideoIntakeTest(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        cloud_video_intake._state['allowed'] = None
        # Columns production has (sql/bql/backend/001) that the older fixture migration lacks, as the Rust fixture does.
        self.execute('ALTER TABLE ads.marketing_content_assets ADD COLUMN IF NOT EXISTS owner_user_id TEXT')
        selling_point_auto._state['allowed'] = None
        self.execute("""INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels) VALUES
            ('framework', 1, 'framework', '框架', '[{"key":"mixed_voiceover"},{"key":"live_demo"}]'),
            ('selling_point', 1, 'selling_point', '卖点', '[{"key":"long_wear"}]') ON CONFLICT DO NOTHING""")
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET status = 'cancelled', finished_at = NOW() WHERE status IN ('queued', 'running')")
        self.execute('DELETE FROM cloud_video.videos')
        self.video_id = uuid.uuid4().int % 10**9
        self.body = f'cloud-video-bytes-{self.video_id}'.encode()
        self.sha = hashlib.sha256(self.body).hexdigest()

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def cloud(self, eligibility='ge_5k', sha=True):
        self.execute("""INSERT INTO cloud_video.videos (video_id, name, video_type, one_level_type_id, url_path, outer_host, inner_host,
            window_spend, eligibility, file_sha256, hashed_at, duration_seconds, file_size, uploaded_at)
            VALUES (%s, '10.20-蜜粉-实拍', 0, 73180, %s, 'youmou-sucaiwang.sucaicloud.com:9001', 'youmou-sucaiwang-inner.sucaicloud.com',
                    9000, %s, %s, NOW(), 168, %s, NOW())""",
                     (self.video_id, f'/sucaiwang/{self.video_id}/f.mp4', eligibility, self.sha if sha else None, len(self.body)))

    def sweep(self):
        with patch.dict(os.environ, ENV):
            return cloud_video_intake.sweep(self.conn)

    def test_an_eligible_hashed_video_becomes_one_original_with_one_framework_job(self):
        self.cloud()
        self.assertEqual(self.sweep(), {'originals': 1, 'queued': 1})
        [(asset_id,)] = self.execute('SELECT asset_id::TEXT FROM cloud_video.videos WHERE video_id = %s', (self.video_id,))
        [row] = self.execute("""SELECT source_type, bucket, raw_object_key, raw_sha256, source_url, tags, product_name, owner_user_id, asset_status
            FROM ads.marketing_content_assets WHERE asset_id = %s""", (asset_id,))
        self.assertEqual(row, ('cloud_video', 'cloud_video', f'cloud-video://{self.video_id}', self.sha,
                               f'https://youmou-sucaiwang.sucaicloud.com:9001/sucaiwang/{self.video_id}/f.mp4',
                               ['企业:百雀羚'], '百雀羚香粉', 'cloud-owner', 'ready'))
        [(preset, settings)] = self.execute("""SELECT preset_key, request_settings FROM ads.content_segment_suggestion_jobs
            WHERE asset_id = %s AND status = 'queued'""", (asset_id,))
        self.assertEqual((preset, settings['trigger']), ('framework', 'cloud_video_intake'))
        # Once per source hash: a second sweep, even after the job finished, queues nothing.
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET status = 'failed', error_code = 'x', finished_at = NOW() WHERE asset_id = %s", (asset_id,))
        self.assertEqual(self.sweep(), {'originals': 0, 'queued': 0})
        # A replaced file refreshes the same original and queues again.
        new_sha = 'b' * 64
        self.execute('UPDATE cloud_video.videos SET file_sha256 = %s WHERE video_id = %s', (new_sha, self.video_id))
        self.assertEqual(self.sweep(), {'originals': 0, 'queued': 1})
        self.assertEqual(self.execute('SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id = %s', (asset_id,)), [(new_sha,)])

    def test_a_file_that_is_already_an_original_is_reused_not_duplicated(self):
        existing = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id, title, asset_status, raw_sha256, raw_object_key)
            VALUES (%s, 'uploaded earlier', 'ready', %s, 'fixtures/x.mp4')""", (existing, self.sha))
        self.cloud()
        self.assertEqual(self.sweep(), {'originals': 0, 'queued': 1})
        self.assertEqual(self.execute('SELECT asset_id::TEXT FROM cloud_video.videos WHERE video_id = %s', (self.video_id,)), [(existing,)])

    def test_nothing_without_an_owner_a_hash_or_eligibility(self):
        self.cloud(sha=False)
        self.assertEqual(self.sweep(), {'originals': 0, 'queued': 0})
        self.execute('UPDATE cloud_video.videos SET file_sha256 = %s, eligibility = NULL', (self.sha,))
        self.assertEqual(self.sweep(), {'originals': 0, 'queued': 0})
        self.execute("UPDATE cloud_video.videos SET eligibility = 'recent_ge_1k'")
        with patch.dict(os.environ, {'CLOUD_VIDEO_OWNER_USER_ID': ''}):
            self.assertEqual(cloud_video_intake.sweep(self.conn), {'originals': 0, 'queued': 0})

    def test_only_a_worker_that_reads_cloud_files_claims_their_jobs_and_fetches_them(self):
        self.cloud()
        self.sweep()
        [(asset_id,)] = self.execute('SELECT asset_id::TEXT FROM cloud_video.videos WHERE video_id = %s', (self.video_id,))
        self.assertIsNone(segment_suggestion_queue.claim(self.conn, cloud=False))
        job = segment_suggestion_queue.claim(self.conn, cloud=True)
        self.assertEqual(str(job['asset_id']), asset_id)
        source = segment_suggestion_queue.load_source(self.conn, job)
        self.assertEqual(source['cloudUrl'], f'https://youmou-sucaiwang-inner.sucaicloud.com/sucaiwang/{self.video_id}/f.mp4')

        with tempfile.TemporaryDirectory() as cache, tempfile.TemporaryDirectory() as work:
            destination = Path(work) / 'raw.mp4'
            opened = []
            fetcher = worker.CloudSource(inner=None, cache_dir=cache,
                                         opener=lambda url, timeout: opened.append(url) or FakeResponse(self.body))
            fetcher.fetch(source, self.sha, destination, lambda: None)  # not cached: inner download
            self.assertEqual(opened, [source['cloudUrl']])
            (Path(cache) / f'{self.sha}.mp4').write_bytes(self.body)
            fetcher.fetch(source, self.sha, destination, lambda: None)  # cached: no download
            self.assertEqual(len(opened), 1)
            with self.assertRaises(SuggestionError):
                fetcher.fetch(source, 'c' * 64, destination, lambda: None)

    def test_selling_points_are_not_queued_automatically_for_cloud_originals(self):
        self.cloud()
        self.sweep()
        [(asset_id,)] = self.execute('SELECT asset_id::TEXT FROM cloud_video.videos WHERE video_id = %s', (self.video_id,))
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET status = 'succeeded', result_summary = '{}', finished_at = NOW() WHERE asset_id = %s", (asset_id,))
        self.execute("""INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, start_ms, end_ms,
            preset_key, preset_version, label_key, origin, status, confirmed_by, confirmed_at)
            VALUES (%s, 'owner', %s, %s, 0, 5000, 'framework', 1, 'mixed_voiceover', 'ai', 'confirmed', 'reviewer', NOW())""",
                     (str(uuid.uuid4()), asset_id, self.sha))
        self.assertEqual(selling_point_auto.sweep(self.conn), [])


if __name__ == '__main__':
    unittest.main()
