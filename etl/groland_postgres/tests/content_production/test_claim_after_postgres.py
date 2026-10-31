"""Disposable-database contract: a fallback instance (claim_after) leaves fresh jobs to the compute node."""
import hashlib
import os
import sys
import unittest
import uuid
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_suggestion_queue, shot_queue  # noqa: E402
from content_production.competitor_analysis import queue as competitor_queue  # noqa: E402
from marketing_content_assets import processing_batch_repository, transcript_processor  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
SHA = 'a' * 64
OLD, FRESH = "NOW() - INTERVAL '20 minutes'", 'NOW()'


@unittest.skipUnless(DB, 'disposable database required')
class ClaimAfterTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.tag = uuid.uuid4().hex[:8]
        self.aweme_prefix = '99' + str(int(self.tag[:4], 16)).zfill(5)
        self.assets = []
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            ids = [str(a) for a in self.assets]
            cur.execute('DELETE FROM ads.content_segment_suggestion_jobs WHERE asset_id::text = ANY(%s)', (ids,))
            cur.execute('DELETE FROM ads.content_production_shot_jobs WHERE asset_id::text = ANY(%s)', (ids,))
            cur.execute('DELETE FROM ads.marketing_content_asset_processing_jobs WHERE asset_id::text = ANY(%s)', (ids,))
            cur.execute('DELETE FROM ads.marketing_content_assets WHERE asset_id::text = ANY(%s)', (ids,))
            cur.execute('DELETE FROM ads.content_segment_presets WHERE preset_key = %s', (f'claim_{self.tag}',))
            cur.execute("DELETE FROM competitor.analyses WHERE aweme_id LIKE %s", (self.aweme_prefix + '%',))
            cur.execute("DELETE FROM competitor.videos WHERE aweme_id LIKE %s", (self.aweme_prefix + '%',))
        self.conn.commit()

    def asset(self):
        asset_id = uuid.uuid4()
        self.assets.append(asset_id)
        with self.conn.cursor() as cur:
            cur.execute("""INSERT INTO ads.marketing_content_assets (asset_id, title, raw_object_key, raw_sha256)
                           VALUES (%s, %s, %s, %s)""", (str(asset_id), f'claim-after {self.tag}', f'raw/{asset_id}.mp4',
                                                          hashlib.sha256(asset_id.bytes).hexdigest()))
        self.conn.commit()
        return asset_id

    def run_sql(self, sql, *params):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
        self.conn.commit()

    def assert_fallback_takes_only_the_old_job(self, add_job, claim, ident):
        """Fresh and old job queued; the fallback claims the old one, then nothing; the node claims the fresh one."""
        old, fresh = add_job(OLD), add_job(FRESH)
        first = claim(600)
        self.assertEqual(ident(first), str(old))
        self.assertIsNone(claim(600))
        self.assertEqual(ident(claim(None)), str(fresh))

    def test_segment_suggestion_queue(self):
        key = f'claim_{self.tag}'
        self.run_sql("""INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
                        VALUES (%s, 1, 'framework', 'claim test', '[{"key":"a","name":"A"}]'::jsonb)""", key)

        def add(created_at):
            job_id = uuid.uuid4()
            self.run_sql(f"""INSERT INTO ads.content_segment_suggestion_jobs
                  (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, created_at)
                  VALUES (%s, 'tester', %s, %s, %s, 1, {created_at})""", str(job_id), str(self.asset()), SHA, key)
            return job_id
        self.assert_fallback_takes_only_the_old_job(
            add, lambda after: segment_suggestion_queue.claim(self.conn, claim_after=after), lambda job: str(job['job_id']))

    def test_segment_claim_after_also_bounds_the_dimension_filter(self):
        key = f'claim_{self.tag}'
        self.run_sql("""INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels)
                        VALUES (%s, 1, 'framework', 'claim test', '[{"key":"a","name":"A"}]'::jsonb)""", key)
        self.run_sql(f"""INSERT INTO ads.content_segment_suggestion_jobs
              (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, created_at)
              VALUES (%s, 'tester', %s, %s, %s, 1, NOW())""", str(uuid.uuid4()), str(self.asset()), SHA, key)
        self.assertIsNone(segment_suggestion_queue.claim(self.conn, ['framework'], None, claim_after=600))

    def test_shot_queue(self):
        def add(created_at):
            job_id = uuid.uuid4()
            self.run_sql(f"""INSERT INTO ads.content_production_shot_jobs
                  (job_id, owner_user_id, asset_id, raw_sha256, snapshot, created_at)
                  VALUES (%s, 'tester', %s, %s, '{{}}'::jsonb, {created_at})""", str(job_id), str(self.asset()), SHA)
            return job_id
        self.assert_fallback_takes_only_the_old_job(
            add, lambda after: shot_queue.claim(self.conn, after), lambda job: str(job['job_id']))

    def test_processing_batch_queue(self):
        def add(queued_at):
            asset_id = self.asset()
            self.run_sql(f"""INSERT INTO ads.marketing_content_asset_processing_jobs (job_id, asset_id, job_type, status, queued_at)
                  VALUES (%s, %s, 'preview', 'queued', {queued_at})""", str(uuid.uuid4()), str(asset_id))
            return asset_id
        self.assert_fallback_takes_only_the_old_job(
            add, lambda after: processing_batch_repository.claim_next_processing_batch(self.conn, after),
            lambda batch: str(batch.asset_id) if batch else None)

    def test_transcript_queue(self):
        def add(queued_at):
            job_id = uuid.uuid4()
            self.run_sql(f"""INSERT INTO ads.marketing_content_asset_processing_jobs (job_id, asset_id, job_type, status, queued_at)
                  VALUES (%s, %s, 'transcript', 'queued', {queued_at})""", str(job_id), str(self.asset()))
            return job_id
        self.assert_fallback_takes_only_the_old_job(
            add, lambda after: transcript_processor._claim_next_transcript_job(self.conn, after),
            lambda job: str(job['job_id']) if job else None)

    def test_competitor_queue(self):
        counter = iter(range(10))

        def add(created_at):
            aweme = f'{self.aweme_prefix}{next(counter):06d}'
            self.run_sql("INSERT INTO competitor.videos (aweme_id, share_url) VALUES (%s, 'https://v.douyin.com/t/')", aweme)
            with self.conn.cursor() as cur:
                cur.execute(f"""INSERT INTO competitor.analyses (aweme_id, source_sha256, created_at)
                      VALUES (%s, %s, {created_at}) RETURNING analysis_id::text""", (aweme, SHA))
                analysis_id = cur.fetchone()[0]
            self.conn.commit()
            return analysis_id
        self.assert_fallback_takes_only_the_old_job(
            add, lambda after: competitor_queue.claim(self.conn, after), lambda job: job['analysis_id'] if job else None)


if __name__ == '__main__':
    unittest.main()
