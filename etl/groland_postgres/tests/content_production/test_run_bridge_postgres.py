"""Disposable DB only: recover the job-finish / Run-publication crash window."""
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import unittest
import uuid
from unittest.mock import patch
import psycopg2
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.run_bridge import reconcile
from content_production.queue import claim, heartbeat, finish
from content_production.execution import Cancelled
from content_production.render_binding import current_binding


@unittest.skipUnless(os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL"), "requires disposable database")
class RunBridgeTests(unittest.TestCase):
    def test_completed_job_requires_the_frozen_render_binding(self):
        binding = current_binding()
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_revisions SET snapshot=snapshot || %s::jsonb WHERE project_id=%s",
                      (json.dumps({'renderBinding': binding}), self.project))
        self.conn.commit()
        self.complete()
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ('waiting', 2, 'invalid_render_receipt'))
        for supplied, expected in [({**binding, 'rendererLockSha256': 'f'*64}, 'waiting'), (binding, 'succeeded')]:
            with self.conn.cursor() as c:
                c.execute("UPDATE ads.content_production_runs SET status='running' WHERE run_id=%s", (self.run,))
                c.execute("UPDATE ads.content_production_jobs SET receipt=receipt || %s::jsonb WHERE job_id=%s",
                          (json.dumps({'render_binding': supplied}), self.job))
            self.conn.commit()
            reconcile(self.conn)
            self.assertEqual(self.state()[0], expected)

    def test_caption_reservations_are_fenced_bounded_and_survive_finish(self):
        from content_production.caption_worker import reserve_call
        token = str(uuid.uuid4())
        job = {'job_id': self.job, 'claim_token': token}
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='running',claim_token=%s,heartbeat_at=clock_timestamp() WHERE job_id=%s", (token, self.job))
        self.conn.commit()
        reserve_call(self.conn, job, 'review', 2)
        for phase, claimed in [('review', job), ('revision', {**job, 'claim_token': str(uuid.uuid4())})]:
            with self.assertRaises(Cancelled):
                reserve_call(self.conn, claimed, phase, 2)
        reserve_call(self.conn, job, 'revision', 2)
        with self.assertRaises(Cancelled):
            reserve_call(self.conn, job, 'rereview', 2)
        self.assertTrue(finish(self.conn, job, 'failed'))
        with self.conn.cursor() as c:
            c.execute('SELECT receipt FROM ads.content_production_jobs WHERE job_id=%s', (self.job,))
            self.assertEqual(set(c.fetchone()[0]['host_caption_calls']), {'review', 'revision'})
        self.conn.commit()
        reconcile(self.conn)

    def test_caption_cancel_and_expired_lease_never_reserve(self):
        from content_production.caption_worker import reserve_call
        token = str(uuid.uuid4())
        job = {'job_id': self.job, 'claim_token': token}
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='running',claim_token=%s,heartbeat_at=clock_timestamp()-INTERVAL '3 minutes' WHERE job_id=%s", (token, self.job))
        self.conn.commit()
        with self.assertRaises(Cancelled):
            reserve_call(self.conn, job, 'review', 3)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET heartbeat_at=clock_timestamp() WHERE job_id=%s", (self.job,))
        self.conn.commit()
        reserve_call(self.conn, job, 'review', 3)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='cancel_requested' WHERE job_id=%s", (self.job,))
        self.conn.commit()
        with self.assertRaises(Cancelled):
            reserve_call(self.conn, job, 'revision', 3)
        self.assertTrue(finish(self.conn, job, 'cancelled', receipt={'fake': True}))
        with self.conn.cursor() as c:
            c.execute('SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=%s', (self.job,))
            receipt, key = c.fetchone()
            self.assertEqual(set(receipt), {'host_caption_calls'})
            self.assertIsNone(key)
        self.conn.commit()
        reconcile(self.conn)

    def test_visual_calls_are_separate_fenced_and_survive_failed_finish(self):
        from content_production.treatment_visual_worker import reserve_call, checkpoint
        from content_production.caption_worker import reserve_call as caption_reserve
        token = str(uuid.uuid4())
        job = {'job_id': self.job, 'claim_token': token}
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='running',claim_token=%s,heartbeat_at=clock_timestamp() WHERE job_id=%s", (token, self.job))
        self.conn.commit()
        caption_reserve(self.conn, job, 'review', 1)
        reserve_call(self.conn, job, 'a'*64, 2)
        for sha, claimed in [('a'*64, job), ('b'*64, {**job, 'claim_token': str(uuid.uuid4())})]:
            with self.assertRaises(Cancelled): reserve_call(self.conn, claimed, sha, 2)
        reserve_call(self.conn, job, 'b'*64, 2)
        with self.assertRaises(Cancelled): reserve_call(self.conn, job, 'c'*64, 2)
        report = {'status': 'incomplete', 'callsReserved': 2, 'deliveryApproved': False}
        checkpoint(self.conn, job, report)
        self.assertTrue(finish(self.conn, job, 'failed'))
        with self.conn.cursor() as c:
            c.execute('SELECT receipt FROM ads.content_production_jobs WHERE job_id=%s', (self.job,))
            saved = c.fetchone()[0]
            self.assertEqual(set(saved['host_visual_calls']), {'a'*64, 'b'*64})
            self.assertEqual(saved['host_visual_review'], report)
            self.assertEqual(set(saved['host_caption_calls']), {'review'})
        self.conn.commit()

    def test_visual_expired_cancelled_jobs_cannot_spend_or_overwrite_evidence(self):
        from content_production.treatment_visual_worker import reserve_call, checkpoint
        token = str(uuid.uuid4())
        job = {'job_id': self.job, 'claim_token': token}
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='running',claim_token=%s,heartbeat_at=clock_timestamp()-INTERVAL '3 minutes' WHERE job_id=%s", (token, self.job))
        self.conn.commit()
        with self.assertRaises(Cancelled): reserve_call(self.conn, job, 'a'*64, 1)
        with self.assertRaises(Cancelled): checkpoint(self.conn, job, {'fake': True})
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET heartbeat_at=clock_timestamp() WHERE job_id=%s", (self.job,))
        self.conn.commit()
        reserve_call(self.conn, job, 'a'*64, 1)
        report = {'status': 'reserved', 'deliveryApproved': False}
        checkpoint(self.conn, job, report)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='cancel_requested' WHERE job_id=%s", (self.job,))
        self.conn.commit()
        with self.assertRaises(Cancelled): reserve_call(self.conn, job, 'b'*64, 2)
        with self.assertRaises(Cancelled): checkpoint(self.conn, job, {'fake': True})
        self.assertTrue(finish(self.conn, job, 'cancelled', receipt={'fake': True}))
        with self.conn.cursor() as c:
            c.execute('SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=%s', (self.job,))
            saved, key = c.fetchone()
            self.assertEqual(saved['host_visual_review'], report)
            self.assertEqual(set(saved['host_visual_calls']), {'a'*64})
            self.assertEqual(set(saved), {'host_visual_calls', 'host_visual_review'})
            self.assertIsNone(key)
        self.conn.commit()

    def setUp(self):
        self.env = patch.dict(os.environ, {"CONTENT_PRODUCTION_RUNS_ENABLED": "true"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.conn = psycopg2.connect(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"])
        self.addCleanup(self.conn.close)
        self.run, self.project, self.job = (str(uuid.uuid4()) for _ in range(3))
        with self.conn.cursor() as c:
            c.execute("INSERT INTO ads.content_production_projects (project_id,owner_user_id,title,revision) VALUES (%s,'bridge','fixture',1)", (self.project,))
            c.execute("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,1,'{\"aspect\":\"portrait\"}')", (self.project,))
            c.execute("INSERT INTO ads.content_production_runs (run_id,owner_user_id,idempotency_key,request,source_snapshot,plan_revision,project_id,project_revision) VALUES (%s,'bridge',%s,'{}','{}',1,%s,1)", (self.run, self.run, self.project))
            c.execute("INSERT INTO ads.content_production_plans (run_id,revision,execution_version,document,origin) VALUES (%s,1,1,'{}','user')", (self.run,))
            c.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES (%s,%s,1,FALSE)", (self.job, self.project))
            c.execute("INSERT INTO ads.content_production_run_renders (run_id,execution_version,plan_revision,job_id) VALUES (%s,1,1,%s)", (self.run, self.job))
            c.execute("UPDATE ads.content_production_runs SET status='running',stage='production',render_job_id=%s WHERE run_id=%s", (self.job, self.run))
        self.conn.commit()

    def complete(self, receipt=None):
        if receipt is None:
            receipt = {"host_run_id": self.run, "host_project_id": self.project, "host_revision": 1,
                       "host_execution_version": 1, "host_plan_revision": 1,
                       "host_inspection": {"schema": "aios.media-inspection.v1", "status": "passed", "width": 720, "height": 1280, "fps": 30}}
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET status='completed',output_object_key='isolated-output',receipt=%s::JSONB WHERE job_id=%s", (json.dumps(receipt), self.job))
        self.conn.commit()

    def state(self):
        with self.conn.cursor() as c:
            c.execute("SELECT status,version,waiting_reason,pause_requested FROM ads.content_production_runs WHERE run_id=%s", (self.run,))
            result = c.fetchone()
        self.conn.commit()
        return result

    def test_caption_quality_does_not_publish_technical_success(self):
        from content_production.caption_quality import assess_rendered_captions
        from edit_document_fixture import fixture
        doc, _, _ = fixture()
        doc['captions'] = [{'id': 'c', 'text': '字幕', 'stylePreset': 'basic-bottom-v1',
                           'anchor': {'kind': 'timeline', 'startFrame': 0, 'endFrame': 60}}]
        for mode, reason in [('valid', 'caption_quality_pending'), ('short', 'caption_revision_required'),
                             ('missing', 'caption_quality_receipt_invalid'), ('forged', 'caption_quality_receipt_invalid')]:
            with self.subTest(mode=mode):
                doc['captions'][0]['anchor']['endFrame'] = 10 if mode == 'short' else 60
                with self.conn.cursor() as c:
                    c.execute("UPDATE ads.content_production_revisions SET snapshot=%s::jsonb WHERE project_id=%s", (json.dumps({'aspect':'portrait', 'editDocument':doc}), self.project))
                    c.execute("UPDATE ads.content_production_runs SET status='running',stage='production' WHERE run_id=%s", (self.run,))
                self.conn.commit()
                self.complete()
                quality = assess_rendered_captions(doc)
                if mode == 'forged': quality['status'] = 'passed'
                if mode != 'missing':
                    with self.conn.cursor() as c:
                        c.execute("UPDATE ads.content_production_jobs SET receipt=receipt || %s::jsonb WHERE job_id=%s", (json.dumps({'caption_quality':quality}), self.job))
                    self.conn.commit()
                self.assertEqual(reconcile(self.conn), 1)
                self.assertEqual(self.state()[0], 'waiting')
                self.assertEqual(self.state()[2], reason)
                self.assertEqual(reconcile(self.conn), 0)
                with self.conn.cursor() as c:
                    c.execute("SELECT stage FROM ads.content_production_runs WHERE run_id=%s", (self.run,))
                    self.assertEqual(c.fetchone()[0], 'inspection')
                self.conn.commit()

    def test_new_process_recovers_completed_job_without_second_render(self):
        self.complete()  # durable job receipt, as if the worker died before updating Run
        self.assertEqual(self.state()[0], "running")
        env = {k: os.environ[k] for k in ("PATH", "CONTENT_PRODUCTION_TEST_DATABASE_URL", "CONTENT_PRODUCTION_RUNS_ENABLED")}
        env["PYTHONPATH"] = str(Path(__file__).resolve().parents[2] / "scripts")
        command = [sys.executable, "-c", "import os,psycopg2; from content_production.run_bridge import reconcile; c=psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']); print(reconcile(c)); c.close()"]
        result = subprocess.run(command, env=env, capture_output=True, check=True, text=True, timeout=15)
        self.assertEqual(result.stdout.strip(), "1")
        self.assertEqual(self.state(), ("succeeded", 2, None, False))
        result = subprocess.run(command, env=env, capture_output=True, check=True, text=True, timeout=15)
        self.assertEqual(result.stdout.strip(), "0")
        self.assertEqual(self.state()[1], 2)
        with self.conn.cursor() as c:
            c.execute("SELECT COUNT(*) FROM ads.content_production_jobs WHERE project_id=%s", (self.project,))
            self.assertEqual(c.fetchone()[0], 1)

    def test_pause_and_old_execution_never_activate_delivery(self):
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_runs SET pause_requested=TRUE WHERE run_id=%s", (self.run,))
        self.conn.commit()
        self.complete()
        self.assertEqual(reconcile(self.conn), 1)
        self.assertEqual(self.state(), ("paused", 2, "render_paused", False))
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_runs SET status='running',execution_version=2 WHERE run_id=%s", (self.run,))
        self.conn.commit()
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ("waiting", 3, "render_superseded"))

    def test_cancel_acknowledges_without_publishing_late_success(self):
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_runs SET status='cancelling',execution_version=2 WHERE run_id=%s", (self.run,))
        self.conn.commit()
        self.complete()
        reconcile(self.conn)
        self.assertEqual(self.state(), ("cancelled", 2, None, False))
        self.assertEqual(reconcile(self.conn), 0)

    def test_missing_identity_or_inspection_is_not_success(self):
        self.complete({"status": "completed", "host_inspection": {"status": "passed"}})
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ("waiting", 2, "invalid_render_receipt"))

    def test_wrong_output_profile_cannot_activate_hd_task(self):
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_revisions SET snapshot=snapshot || '{\"outputProfile\":\"hd_1080_v1\"}'::JSONB WHERE project_id=%s", (self.project,))
        self.conn.commit()
        self.complete()  # Simulates an incompatible old worker's technically valid 720p receipt.
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ("waiting", 2, "invalid_render_receipt"))
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_runs SET status='running' WHERE run_id=%s", (self.run,))
            c.execute("UPDATE ads.content_production_jobs SET receipt=jsonb_set(receipt,'{host_inspection}',receipt->'host_inspection' || '{\"outputProfile\":\"hd_1080_v1\",\"width\":1080,\"height\":1920}'::JSONB) WHERE job_id=%s", (self.job,))
        self.conn.commit()
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ("succeeded", 3, None))

    def test_expired_lease_cannot_renew_or_publish_before_another_claim(self):
        job = claim(self.conn)
        self.assertEqual(str(job["job_id"]), self.job)
        with self.conn.cursor() as c:
            c.execute("UPDATE ads.content_production_jobs SET heartbeat_at=NOW()-INTERVAL '3 minutes' WHERE job_id=%s", (self.job,))
        self.conn.commit()
        with self.assertRaises(Cancelled):
            heartbeat(self.conn, job, "too late")
        self.assertFalse(finish(self.conn, job, "completed", key="late", receipt={"status": "completed"}))
        self.assertIsNone(claim(self.conn))
        reconcile(self.conn)
        self.assertEqual(self.state()[:3], ("waiting", 2, "render_failed"))

    def test_lock_wait_does_not_extend_publication_lease(self):
        job = claim(self.conn)
        other = psycopg2.connect(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"])
        self.addCleanup(other.close)
        with other.cursor() as c:
            c.execute("SELECT pg_backend_pid()")
            pid = c.fetchone()[0]
        other.commit()
        with self.conn.cursor() as c:
            c.execute("SELECT job_id FROM ads.content_production_jobs WHERE job_id=%s FOR UPDATE", (self.job,))
        result = []
        thread = threading.Thread(target=lambda: result.append(finish(other, job, "completed", key="late", receipt={"status": "completed"})))
        thread.start()
        observer = psycopg2.connect(os.environ["CONTENT_PRODUCTION_TEST_DATABASE_URL"])
        observer.autocommit = True
        try:
            deadline = time.monotonic() + 5
            while True:
                with observer.cursor() as c:
                    c.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s", (pid,))
                    if c.fetchone()[0] == "Lock":
                        break
                if time.monotonic() > deadline:
                    self.fail("publisher did not reach the controlled lock wait")
                time.sleep(0.01)
            with self.conn.cursor() as c:
                # The waiter's transaction began before this deadline. Expire it while it waits.
                c.execute("UPDATE ads.content_production_jobs SET heartbeat_at=clock_timestamp()-INTERVAL '119.9 seconds' WHERE job_id=%s", (self.job,))
                c.execute("SELECT pg_sleep(0.2)")
            self.conn.commit()
        finally:
            self.conn.rollback()
            observer.close()
            thread.join(timeout=5)
        self.assertFalse(thread.is_alive())
        self.assertEqual(result, [False])
        self.assertIsNone(claim(self.conn))
        reconcile(self.conn)
        self.assertEqual(self.state()[2], "render_failed")
