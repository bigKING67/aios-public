import os
import sys
import uuid
from pathlib import Path
import unittest
import psycopg2
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.semantic_queue import claim, heartbeat, finish
from content_production.execution import Cancelled


@unittest.skipUnless(os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL'), 'disposable database required')
class SemanticQueueTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.id = str(uuid.uuid4())
        with self.conn.cursor() as c:
            c.execute((Path(__file__).resolve().parents[1] / 'sql/test_content_production_semantic_jobs.sql').read_text())
            c.execute("INSERT INTO ads.content_production_semantic_jobs(job_id,owner_user_id,catalog_id,request_hash,snapshot) SELECT %s,'semantic-queue-fixture',catalog_id,repeat('a',64),'{}' FROM ads.content_production_shot_catalogs LIMIT 1", (self.id,))
        self.conn.commit()

    def test_running_cancel_cannot_publish_catalog(self):
        job = claim(self.conn)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_semantic_jobs SET status='cancel_requested' WHERE job_id=%s", (self.id,))
        self.conn.commit()
        with self.assertRaises(Cancelled):
            heartbeat(self.conn, job, 'extract')
        self.assertFalse(finish(self.conn, job, 'completed', {'shots': []}))
        with self.conn.cursor() as c:
            c.execute("SELECT status,result FROM ads.content_production_semantic_jobs WHERE job_id=%s", (self.id,))
            self.assertEqual(c.fetchone(), ('cancelled', None))

    def test_expired_worker_cannot_finish_or_reclaim(self):
        job = claim(self.conn)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_semantic_jobs SET heartbeat_at=NOW()-INTERVAL '3 minutes' WHERE job_id=%s", (self.id,))
        self.conn.commit()
        self.assertIsNone(claim(self.conn))
        self.assertFalse(finish(self.conn, job, 'completed', {'shots': []}))
        with self.conn.cursor() as c:
            c.execute("SELECT status,result FROM ads.content_production_semantic_jobs WHERE job_id=%s", (self.id,))
            self.assertEqual(c.fetchone(), ('failed', None))

    def test_failed_publication_rolls_back(self):
        job = claim(self.conn)
        with self.assertRaises(ValueError):
            finish(self.conn, job, 'completed')
        self.conn.rollback()
        with self.conn.cursor() as c:
            c.execute("SELECT status,result FROM ads.content_production_semantic_jobs WHERE job_id=%s", (self.id,))
            self.assertEqual(c.fetchone(), ('running', None))
        finish(self.conn, job, 'failed')
