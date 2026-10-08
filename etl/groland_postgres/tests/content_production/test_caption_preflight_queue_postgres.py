"""Opt-in queue contracts against a disposable, loopback PostgreSQL fixture."""
import copy
import hashlib
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from unittest.mock import patch

import psycopg2
from psycopg2.extensions import parse_dsn
from psycopg2.extras import Json

from content_production import caption_preflight_queue as queue
from content_production import caption_preflight_run as run_gate


@unittest.skipUnless(os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL'), 'disposable database required')
class CaptionPreflightPostgresTests(unittest.TestCase):
    def setUp(self):
        self.dsn = os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']
        config = parse_dsn(self.dsn)
        if (config.get('host') not in ('127.0.0.1', '::1') or config.get('hostaddr')
                or config.get('service') or config.get('dbname') != 'content_production_fixture'):
            raise ValueError('requires loopback content_production_fixture database')
        self.conn = self.connect()
        self.asset = str(uuid.uuid4())
        with self.conn.cursor() as cur:
            cur.execute('INSERT INTO ads.marketing_content_assets (asset_id,title) VALUES (%s,%s)',
                        (self.asset, 'Caption queue isolated fixture'))
        self.conn.commit()
        self.addCleanup(self.clean_asset)
        self.request = {'maxCalls': 3, 'runId': str(uuid.uuid4())}

    def connect(self):
        conn = psycopg2.connect(self.dsn, options='-c statement_timeout=3000', connect_timeout=3)
        self.addCleanup(conn.close)
        return conn

    def clean_asset(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM ads.marketing_content_assets WHERE asset_id=%s', (self.asset,))
        self.conn.commit()

    def insert(self, *, operation=queue.OPERATION, request=True, attempts=0,
               max_attempts=1, status='queued', expired=False):
        job_id = str(uuid.uuid4())
        metadata = {'operation': operation}
        if request:
            metadata['caption_request'] = self.request
        with self.conn.cursor() as cur:
            cur.execute('''INSERT INTO ads.marketing_content_asset_processing_jobs
              (job_id,asset_id,job_type,status,attempts,max_attempts,metadata,started_at)
              VALUES (%s,%s,'analysis',%s,%s,%s,%s,
                CASE WHEN %s THEN CURRENT_TIMESTAMP-INTERVAL '21 minutes' ELSE NULL END)''',
              (job_id, self.asset, status, attempts, max_attempts, Json(metadata), expired))
        self.conn.commit()
        return job_id

    def row(self, job_id):
        with self.conn.cursor() as cur:
            cur.execute('''SELECT status,attempts,metadata,error_message
              FROM ads.marketing_content_asset_processing_jobs WHERE job_id=%s''', (job_id,))
            row = cur.fetchone()
        self.conn.commit()
        return row

    def test_locked_job_skipped_and_ordinary_analysis_untouched(self):
        ordinary = self.insert(operation=None)
        locked = self.insert()
        ready = self.insert()
        locker = self.connect()
        try:
            with locker.cursor() as cur:
                cur.execute('SELECT job_id FROM ads.marketing_content_asset_processing_jobs WHERE job_id=%s FOR UPDATE', (locked,))
            job = queue.claim(self.conn)
            self.assertEqual(str(job['job_id']), ready)
            self.assertEqual(self.row(ordinary)[:2], ('queued', 0))
        finally:
            locker.rollback()
        self.assertEqual(str(queue.claim(self.conn)['job_id']), locked)
        self.assertIsNone(queue.claim(self.conn))

    def test_budget_is_atomic_across_connections(self):
        job_id = self.insert()
        job = queue.claim(self.conn)
        # Simultaneous reservations from independent connections cannot overspend.
        secret = job['authorization_secret']
        self.assertEqual(len(secret), 43)
        metadata = self.row(job_id)[2]
        self.assertEqual(metadata['caption_authorization_sha256'], hashlib.sha256(secret.encode()).hexdigest())
        self.assertNotIn(secret, str(metadata))
        def reserve(_):
            conn = psycopg2.connect(self.dsn, options='-c statement_timeout=3000')
            try:
                queue._mutate(conn, job, self.request, reserve=True)
                return True
            except ValueError:
                return False
            finally:
                conn.close()
        with ThreadPoolExecutor(max_workers=6) as pool:
            accepted = list(pool.map(reserve, range(6)))
        self.assertEqual(sum(accepted), 3)
        self.assertEqual(self.row(job_id)[2]['caption_calls_reserved'], 3)
        queue._mutate(self.conn, job, self.request, report={'status': 'needs_inspection'})
        row = self.row(job_id)
        self.assertEqual(row[0], 'succeeded')
        self.assertFalse(row[2]['host_caption_preflight']['deliveryApproved'])
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, job, self.request, report={})

    def test_changed_token_request_and_cancelled_state_reject_receipt(self):
        job_id = self.insert()
        job = queue.claim(self.conn)
        old = copy.deepcopy(job)
        old['metadata']['caption_claim_token'] = str(uuid.uuid4())
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, old, self.request, report={})
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, job, dict(self.request, maxCalls=4), reserve=True)
        with self.conn.cursor() as cur:
            cur.execute("UPDATE ads.marketing_content_asset_processing_jobs SET status='cancelled' WHERE job_id=%s", (job_id,))
        self.conn.commit()
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, job, self.request, report={})
        self.assertNotIn('host_caption_preflight', self.row(job_id)[2])

    def test_expired_claim_fails_without_retry_and_rejects_old_result(self):
        job_id = self.insert()
        job = queue.claim(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("UPDATE ads.marketing_content_asset_processing_jobs SET started_at=CURRENT_TIMESTAMP-INTERVAL '21 minutes' WHERE job_id=%s", (job_id,))
        self.conn.commit()
        attempted = self.insert(attempts=1)
        retryable = self.insert(max_attempts=3)
        self.assertIsNone(queue.claim(self.conn))
        self.assertEqual(self.row(job_id)[0], 'failed')
        self.assertEqual(self.row(job_id)[3], 'caption_preflight_expired')
        self.assertEqual(self.row(attempted)[:2], ('queued', 1))
        self.assertEqual(self.row(retryable)[:2], ('queued', 0))
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, job, self.request, report={})

    def test_missing_request_can_be_failed_without_requeue(self):
        job_id = self.insert(request=False)
        job = queue.claim(self.conn)
        queue._mutate(self.conn, job, None, failure='caption_preflight_failed')
        self.assertEqual(self.row(job_id)[0], 'failed')
        self.assertIsNone(queue.claim(self.conn))

    def test_expired_without_sweeper_cannot_reserve_or_succeed(self):
        job_id = self.insert()
        job = queue.claim(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("UPDATE ads.marketing_content_asset_processing_jobs SET started_at=clock_timestamp()-INTERVAL '21 minutes' WHERE job_id=%s", (job_id,))
        self.conn.commit()
        # No claim/sweeper runs between expiry and the attempted writes.
        for kwargs in ({'reserve': True}, {'report': {'status': 'candidates_observed'}}):
            with self.assertRaises(ValueError):
                queue._mutate(self.conn, job, self.request, **kwargs)
        self.assertEqual(self.row(job_id)[2]['caption_calls_reserved'], 0)
        self.assertNotIn('host_caption_preflight', self.row(job_id)[2])
        # A worker may still record failure without gaining a new execution lease.
        queue._mutate(self.conn, job, self.request, failure='caption_preflight_failed')
        self.assertEqual(self.row(job_id)[0], 'failed')

    def test_transaction_start_does_not_extend_expired_lease(self):
        job_id = self.insert()
        job = queue.claim(self.conn)
        with self.conn.cursor() as cur:
            # Freeze CURRENT_TIMESTAMP in this transaction, then set the lease
            # just beyond its expiry using wall clock in another connection.
            cur.execute('SELECT CURRENT_TIMESTAMP')
        other = self.connect()
        with other.cursor() as cur:
            cur.execute("UPDATE ads.marketing_content_asset_processing_jobs SET started_at=clock_timestamp()-INTERVAL '20 minutes' WHERE job_id=%s", (job_id,))
        other.commit()
        with self.assertRaises(ValueError):
            queue._mutate(self.conn, job, self.request, reserve=True)
        self.assertEqual(self.row(job_id)[2]['caption_calls_reserved'], 0)

    def test_local_media_preflight_persists_real_database_receipt(self):
        # Reuse the media/model fixture, but exercise the real claim and all DB writes.
        from test_caption_preflight_queue import CaptionPreflightQueueTests
        CaptionPreflightQueueTests.setUpClass()
        self.addCleanup(CaptionPreflightQueueTests.tearDownClass)
        case = CaptionPreflightQueueTests()
        case.setUp()
        self.addCleanup(case.doCleanups)
        case.sources[0]['assetId'] = self.asset
        self.request = case.request
        # Run uses canonical version IDs, rather than trusting callback-owned IDs.
        version = f"{self.asset}-{case.sources[0]['sha256'][:16]}"
        case.sources[0]['assetVersionId'] = version
        self.request['assetVersionId'] = version
        self.create_run(case.sources)
        job_id = self.insert()
        with self.conn.cursor() as cur:
            cur.execute('UPDATE ads.marketing_content_asset_processing_jobs SET input_object_key=%s WHERE job_id=%s',
                        (case.sources[0]['objectKey'], job_id))
        self.conn.commit()
        from content_production import caption_preflight_worker as worker
        @contextmanager
        def connection():
            yield self.conn
        def download(storage, key, target, expected, tick):
            tick()
            self.assertEqual(expected, case.sources[0]['sha256'])
            storage.download_file(key, target)
            tick()
        env = {'PATH': os.environ.get('PATH', os.defpath), 'CONTENT_PRODUCTION_ENABLED': 'true', 'CONTENT_PRODUCTION_RUNS_ENABLED': 'true',
               'AIOS_CAPTION_PREFLIGHT_ENABLED': 'true', 'AIOS_VISUAL_REVIEW_MODEL': 'fixture',
               'AIOS_CAPTION_PREFLIGHT_API_BASE_URL': 'http://127.0.0.1:8000/production',
               'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES': '1'}
        with patch.dict(os.environ, env, clear=True), patch.object(worker, 'connect_pg', connection), \
             patch.object(worker, 'provider', return_value=case.model), \
             patch.object(worker, 'TosStorageConfig'), patch.object(worker, 'TosStorageClient', return_value=case.storage), \
             patch.object(worker, 'WorkerPermissionClient'), patch.object(worker, 'download', download):
            result = worker.process_one(case.case.case.case.root / 'postgres-consumer')
        self.assertEqual(result['candidateCount'], 1)
        self.assertEqual(result['callsReserved'], 3)
        self.assertFalse(result['deliveryApproved'])
        row = self.row(job_id)
        report = row[2]['host_caption_preflight']['report']
        self.assertEqual(row[:2], ('succeeded', 1))
        self.assertEqual(row[2]['caption_calls_reserved'], 3)
        self.assertEqual(case.model.call_count, 3)

        self.assertEqual(report['candidates'][0]['frameCount'], 60)
        self.assertEqual(row[2]['host_caption_preflight']['report'], report)
        self.assertFalse(row[2]['host_caption_preflight']['deliveryApproved'])
        self.assertIsNone(queue.consume_one(self.conn, case.storage, case.case.case.case.root / 'postgres-consumer',
                                           authorize=case.authorize, call_model=case.model))
        self.assertEqual(case.model.call_count, 3)

    def create_run(self, sources):
        with self.conn.cursor() as cur:
            cur.execute('''INSERT INTO ads.content_production_runs
              (run_id,owner_user_id,idempotency_key,request,source_snapshot,status)
              VALUES (%s,'caption-fixture-owner',%s,'{}',%s,'running')''',
              (self.request['runId'], str(uuid.uuid4()), Json({'assets': sources})))
        self.conn.commit()
        run_id = self.request['runId']
        def cleanup():
            self.conn.rollback()
            with self.conn.cursor() as cur:
                cur.execute('DELETE FROM ads.content_production_runs WHERE run_id=%s', (run_id,))
            self.conn.commit()
        self.addCleanup(cleanup)

    def bound_run_job(self):
        source = {'assetId': self.asset, 'sha256': 'a' * 64,
                  'objectKey': 'private/source.mp4', 'durationMs': 3000}
        self.request.update(executionVersion=1, assetVersionId=f"{self.asset}-{'a' * 16}", sourceSha256='a' * 64)
        self.create_run([source])
        job_id = self.insert()
        with self.conn.cursor() as cur:
            cur.execute('UPDATE ads.marketing_content_asset_processing_jobs SET input_object_key=%s WHERE job_id=%s',
                        (source['objectKey'], job_id))
        self.conn.commit()
        return queue.claim(self.conn)

    def test_live_run_state_and_source_binding(self):
        job = self.bound_run_job()
        calls = []
        def permissions(owner, snapshot):
            calls.append(owner)
            snapshot['assets'].clear()  # Caller cannot alter the frozen returned sources.
        sources = run_gate.authorize_run(self.conn, job, authorize_sources=permissions)
        self.assertEqual(sources[0]['assetVersionId'], self.request['assetVersionId'])
        self.assertEqual(calls, ['caption-fixture-owner'])
        for update in ("status='paused'", "status='cancelled'", "status='cancelling'",
                       "status='running',pause_requested=TRUE", "execution_version=2",
                       "stage='production'"):
            with self.subTest(update=update):
                with self.conn.cursor() as cur:
                    cur.execute('UPDATE ads.content_production_runs SET ' + update + ' WHERE run_id=%s',
                                (self.request['runId'],))
                self.conn.commit()
                with self.assertRaisesRegex(ValueError, 'inactive or superseded'):
                    run_gate.authorize_run(self.conn, job, authorize_sources=permissions)
                with self.conn.cursor() as cur:
                    cur.execute("UPDATE ads.content_production_runs SET status='running',pause_requested=FALSE,execution_version=1,stage='planning' WHERE run_id=%s", (self.request['runId'],))
                self.conn.commit()
        self.assertEqual(len(calls), 1)
        job['input_object_key'] = 'other.mp4'
        with self.assertRaisesRegex(ValueError, 'does not match Run source'):
            run_gate.authorize_run(self.conn, job, authorize_sources=permissions)

    def test_permission_failure_and_concurrent_pause_stop_authorization(self):
        job = self.bound_run_job()
        def denied(owner, snapshot):
            raise PermissionError('fixture access revoked')
        with self.assertRaises(PermissionError):
            run_gate.authorize_run(self.conn, job, authorize_sources=denied)
        other = self.connect()
        def pause(owner, snapshot):
            with other.cursor() as cur:
                cur.execute("UPDATE ads.content_production_runs SET status='paused' WHERE run_id=%s", (self.request['runId'],))
            other.commit()
        with self.assertRaisesRegex(ValueError, 'inactive or superseded'):
            run_gate.authorize_run(self.conn, job, authorize_sources=pause)
