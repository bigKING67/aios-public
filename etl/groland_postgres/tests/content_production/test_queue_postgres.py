"""Run only against the dedicated disposable fixture supplied by the shell runner."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import unittest
import uuid

import psycopg2
from content_production.queue import claim, finish, heartbeat
from content_production.execution import Cancelled


@unittest.skipUnless(os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL"), "requires disposable database")
class QueueTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"])
        self.addCleanup(self.conn.close)
        self.project, self.job = str(uuid.uuid4()), str(uuid.uuid4())
        with self.conn.cursor() as c:
            c.execute("INSERT INTO ads.content_production_projects (project_id,owner_user_id,title,revision) VALUES (%s,'queue-fixture','test',1)", (self.project,))
            c.execute("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,1,'{}')", (self.project,))
            c.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES (%s,%s,1,TRUE)", (self.job,self.project))
        self.conn.commit()

    def test_claim_cancel_and_fenced_completion(self):
        job = claim(self.conn)
        self.assertEqual(str(job["job_id"]), self.job)
        self.assertIsNone(claim(self.conn))
        heartbeat(self.conn, job, "render")
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='cancel_requested' WHERE job_id=%s", (self.job,))
        self.conn.commit()
        with self.assertRaises(Cancelled):
            heartbeat(self.conn, job, "upload")
        self.assertFalse(finish(self.conn, job, "completed", key="never-visible", receipt={"status":"completed"}))
        with self.conn.cursor() as c:
            c.execute("SELECT status,output_object_key,receipt FROM ads.content_production_jobs WHERE job_id=%s", (self.job,))
            self.assertEqual(c.fetchone(), ("cancelled",None,None))

    def test_stale_worker_cannot_publish_and_retry_is_explicit(self):
        job = claim(self.conn)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET heartbeat_at=NOW()-INTERVAL '3 minutes' WHERE job_id=%s", (self.job,))
        self.conn.commit()
        self.assertIsNone(claim(self.conn))
        self.assertFalse(finish(self.conn, job, "completed", key="stale", receipt={"status":"completed"}))
        with self.conn.cursor() as c:
            c.execute("SELECT status,output_object_key FROM ads.content_production_jobs WHERE job_id=%s", (self.job,))
            self.assertEqual(c.fetchone(), ("failed",None))

    def test_only_one_active_render_per_revision(self):
        with self.conn.cursor() as c:
            with self.assertRaises(psycopg2.errors.UniqueViolation):
                c.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES (%s,%s,1,TRUE)", (str(uuid.uuid4()),self.project))
        self.conn.rollback()
        job = claim(self.conn)
        self.assertTrue(finish(self.conn, job, "completed", key="output", receipt={"status":"completed"}))
