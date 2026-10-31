"""Disposable-database contract for queueing AI 卖点切段 after the framework review."""
import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selling_point_auto  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
POINT_LABELS = ['moisturizing', 'long_wear']


@unittest.skipUnless(DB, 'disposable database required')
class SellingPointAutoTest(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        selling_point_auto._state['allowed'] = None
        self.execute("""INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels) VALUES
            ('framework', 1, 'framework', '框架', '[{"key":"mixed_voiceover"},{"key":"live_demo"}]'),
            ('framework', 2, 'framework', '框架', '[{"key":"mixed_voiceover"},{"key":"live_demo"}]'),
            ('selling_point', 1, 'selling_point', '卖点', %s) ON CONFLICT DO NOTHING""",
                     (json.dumps([{'key': key} for key in POINT_LABELS]),))
        # Park leftovers so every test sees only its own originals.
        self.execute("UPDATE ads.marketing_content_assets SET is_deleted = TRUE")

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def original(self):
        asset, sha = str(uuid.uuid4()), uuid.uuid4().hex * 2
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id, title, asset_status, raw_sha256, raw_object_key)
            VALUES (%s, 'auto fixture', 'ready', %s, 'fixtures/x.mp4')""", (asset, sha))
        return asset, sha

    def segment(self, asset, sha, label='mixed_voiceover', status='confirmed', preset='framework', by='reviewer'):
        confirmed = status == 'confirmed'
        # Confirmed segments of one preset may not overlap; each fixture segment gets its own 5 s.
        start = len(self.execute('SELECT 1 FROM ads.content_segments WHERE asset_id = %s', (asset,))) * 5000
        self.execute("""INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, start_ms,
            end_ms, preset_key, preset_version, label_key, origin, status, confirmed_by, confirmed_at)
            VALUES (%s, 'owner', %s, %s, %s, %s, %s, 1, %s, 'ai', %s, %s, CASE WHEN %s THEN NOW() END)""",
                     (str(uuid.uuid4()), asset, sha, start, start + 5000, preset, label, status,
                      by if confirmed else None, confirmed))

    def job(self, asset, sha, preset, status='queued'):
        finished = status in ('succeeded', 'failed', 'cancelled')
        self.execute("""INSERT INTO ads.content_segment_suggestion_jobs (job_id, owner_user_id, asset_id, source_content_hash,
            preset_key, preset_version, status, error_code, result_summary, finished_at)
            VALUES (%s, 'owner', %s, %s, %s, 1, %s, CASE WHEN %s = 'failed' THEN 'x' END,
                    CASE WHEN %s = 'succeeded' THEN '{}'::jsonb END, CASE WHEN %s THEN NOW() END)""",
                     (str(uuid.uuid4()), asset, sha, preset, status, status, status, finished))

    def points_jobs(self, asset):
        return self.execute("""SELECT owner_user_id, preset_key, preset_version, request_settings
            FROM ads.content_segment_suggestion_jobs WHERE asset_id = %s AND preset_key = 'selling_point'""", (asset,))

    def test_reviewed_voiceover_queues_one_job_owned_by_the_reviewer(self):
        asset, sha = self.original()
        self.segment(asset, sha, by='first')
        self.segment(asset, sha, label='live_demo', by='last')
        self.assertEqual(len(selling_point_auto.sweep(self.conn)), 1)
        [(owner, preset, version, settings)] = self.points_jobs(asset)
        self.assertEqual((owner, preset, version), ('last', 'selling_point', 1))
        [(labels,)] = self.execute("""SELECT labels FROM ads.content_segment_presets
            WHERE preset_key = 'selling_point' AND status = 'active' ORDER BY version DESC LIMIT 1""")
        self.assertEqual(settings, {'labelKeys': [label['key'] for label in labels], 'trigger': 'auto_after_framework'})
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET status = 'failed', error_code = 'x', finished_at = NOW()")
        self.assertEqual(selling_point_auto.sweep(self.conn), [])  # once per source; re-runs stay manual

    def test_waits_for_the_framework_review_and_needs_a_voiceover(self):
        pending, pending_sha = self.original()
        self.segment(pending, pending_sha)
        self.segment(pending, pending_sha, label='live_demo', status='suggested')
        running, running_sha = self.original()
        self.segment(running, running_sha)
        self.job(running, running_sha, 'framework')
        demo_only, demo_sha = self.original()
        self.segment(demo_only, demo_sha, label='live_demo')
        self.assertEqual(selling_point_auto.sweep(self.conn), [])

    def test_existing_selling_point_work_and_old_sources_are_left_alone(self):
        manual, manual_sha = self.original()
        self.segment(manual, manual_sha)
        self.segment(manual, manual_sha, label='moisturizing', preset='selling_point')
        replaced, replaced_sha = self.original()
        self.segment(replaced, uuid.uuid4().hex * 2)  # confirmed on a previous source file only
        self.assertEqual(selling_point_auto.sweep(self.conn), [])

    def test_switch_and_missing_grant_skip_quietly(self):
        asset, sha = self.original()
        self.segment(asset, sha)
        with patch.dict(os.environ, {selling_point_auto.ENABLED_ENV: 'false'}):
            self.assertEqual(selling_point_auto.sweep(self.conn), [])
        selling_point_auto._state['allowed'] = False
        self.assertEqual(selling_point_auto.sweep(self.conn), [])
        self.assertEqual(self.points_jobs(asset), [])


if __name__ == '__main__':
    unittest.main()
