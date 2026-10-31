import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import offline, queue, structure, worker  # noqa: E402

TEST_DB = os.getenv('COMPETITOR_TEST_DATABASE_URL')


def local_frame_format():
    """Production ffmpeg encodes WebP (as for asset covers); some dev builds lack the encoder."""
    encoders = subprocess.run(['ffmpeg', '-hide_banner', '-encoders'], capture_output=True, text=True).stdout
    return worker.FRAME_FORMAT if 'webp' in encoders else ('jpg', 'image/jpeg')
AWEME = '7400000000000000123'


class PureLogicTest(unittest.TestCase):
    def test_frame_times_are_ordered_unique_and_inside_the_film(self):
        card = {'segments': [{'start_sec': 9.0}, {'start_sec': 0.0}, {'start_sec': 0.2}, {'start_sec': 30.0},
                             {'start_sec': -1}, {'start_sec': None}, {'start_sec': 3.5}, {'start_sec': 6.0},
                             {'start_sec': 7.0}, {'start_sec': 8.0}]}
        self.assertEqual(worker.frame_times(card, 20.0), [0.0, 3.5, 6.0, 7.0, 8.0])
        self.assertEqual(worker.frame_times({'segments': []}, 20.0), [])

    def test_concurrency_defaults_to_one_and_is_bounded(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(worker.CONCURRENCY_ENV, None)
            self.assertEqual(worker.concurrency(), 1)
        for raw, expected in (('4', 4), (' 8 ', 8)):
            with patch.dict(os.environ, {worker.CONCURRENCY_ENV: raw}):
                self.assertEqual(worker.concurrency(), expected)
        for bad in ('0', '9', 'x', '-1'):
            with patch.dict(os.environ, {worker.CONCURRENCY_ENV: bad}), self.assertRaises(ValueError):
                worker.concurrency()

    def test_slots_claim_analyses_in_parallel_and_stop_with_the_worker(self):
        import threading
        seen, started = [], threading.Barrier(3, timeout=5)

        def fake_process_one():
            if len(seen) < 3:
                seen.append(threading.current_thread().name)
                started.wait()
            worker.STOPPING.set()
            return {'status': 'idle'}
        with patch.dict(os.environ, {worker.CONCURRENCY_ENV: '3', worker.ENABLED_ENV: 'true'}), \
                patch.object(worker, 'process_one', side_effect=fake_process_one), \
                patch.object(worker, 'refresh_snapshots'), patch.object(worker, 'run_reports'), patch.object(worker, 'run_enrichments'), \
                patch.object(worker.signal, 'signal'):
            worker.STOPPING.clear()
            try:
                self.assertEqual(worker.main([]), 0)
            finally:
                worker.STOPPING.clear()
        self.assertEqual(sorted(seen), ['MainThread', 'competitor-slot-1', 'competitor-slot-2'])

    def test_a_cancelled_structure_returns_instead_of_running_on(self):
        import threading
        from content_production.execution import Cancelled
        cancel = threading.Event()
        cancel.set()
        seen = {}

        def build(conn, source, duration, work, tick, provider, *, timings=None, allow_retry=True):
            seen['duration'] = duration
            with self.assertRaises(Cancelled):
                tick()
            return {'status': 'failed', 'reason': 'card A failed'}, None
        with tempfile.TemporaryDirectory() as tmp, patch.object(worker, 'connect_pg'), \
                patch.object(structure, 'build', side_effect=build):
            field, recorded = worker.build_structure(Path('s.mp4'), Path(tmp) / 'structure', 12.5, None, cancel)
            self.assertTrue((Path(tmp) / 'structure').is_dir())
        self.assertEqual((field['status'], recorded, seen['duration']), ('failed', None, 12.5))

    def test_heartbeat_holds_no_connection_between_beats(self):
        import contextlib, time as clock
        opened = []

        @contextlib.contextmanager
        def connect():
            opened.append('open')
            yield object()
            opened.append('close')
        with patch.object(worker, 'HEARTBEAT_SECONDS', 0.05), patch.object(worker, 'connect_pg', connect), \
                patch.object(queue, 'heartbeat', return_value=True):
            with worker.Heartbeat({'analysis_id': 'a', 'claim_token': 't'}) as beat:
                clock.sleep(0.18)
        self.assertGreaterEqual(opened.count('open'), 2)
        self.assertEqual(opened.count('open'), opened.count('close'))
        self.assertFalse(beat.lost)

    def test_samples_are_thirty_slice_centres(self):
        times = worker.sample_times(60.0)
        self.assertEqual(len(times), 30)
        self.assertEqual((times[0], times[1], times[-1]), (1.0, 3.0, 59.0))
        self.assertEqual(worker.sample_times(0), [])

    def test_host_errors_make_a_partial_card(self):
        self.assertEqual(worker.classify([]), 'succeeded')
        self.assertEqual(worker.classify([('warning', 'hook', 'x')]), 'succeeded')
        self.assertEqual(worker.classify([('warning', 'a', 'x'), ('error', 'b', 'y')]), 'partial')
        self.assertEqual(worker.classify([], {'status': 'ok', 'sellingPointError': 'filtered_all'}), 'partial')
        self.assertEqual(worker.classify([], {'status': 'failed'}), 'partial')
        self.assertEqual(worker.classify([], {'status': 'ok', 'sellingPoints': []}), 'succeeded')

    def test_card_labels_cover_every_taxonomy_category_by_name(self):
        labels = worker.display_labels()
        self.assertEqual(labels['roles']['offer'], '说明优惠')
        self.assertEqual(labels['hook_mechanisms']['offer'], '优惠或价格先行')
        self.assertIn('selling_points', labels)
        self.assertNotIn('taxonomy_version', labels)

    def test_video_category_is_the_display_name(self):
        self.assertEqual(worker.category_name('loose_powder'), '散粉')
        self.assertEqual(worker.category_name('base_other'), '其他底妆')
        self.assertIsNone(worker.category_name('unknown'))
        self.assertIsNone(worker.category_name(None))

    def test_manifest_hash_is_order_independent(self):
        self.assertEqual(queue.manifest_hash({'a': 1, 'b': '二'}), queue.manifest_hash({'b': '二', 'a': 1}))
        self.assertRegex(queue.manifest_hash({'a': 1}), r'^[a-f0-9]{64}$')


class FakeStorage:
    def __init__(self, objects):
        self.objects = dict(objects)
        self.config = type('Config', (), {'bucket': 'bql-media', 'bucket_for': staticmethod(lambda key: 'bql-media')})()

    def download_file(self, key, target):
        target.write_bytes(self.objects[key])

    def upload_file(self, key, path, content_type=''):
        self.objects[key] = Path(path).read_bytes()

    def object_exists(self, key):
        return key in self.objects

    def delete_object(self, key):
        self.objects.pop(key, None)


def make_video(path, seconds=12):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc=size=320x240:rate=15:duration={seconds}',
                    '-f', 'lavfi', '-i', f'sine=frequency=440:duration={seconds}', '-shortest',
                    '-c:v', 'libx264', '-c:a', 'aac', str(path)], check=True)


@unittest.skipUnless(TEST_DB and shutil.which('ffmpeg'), 'needs COMPETITOR_TEST_DATABASE_URL (schema competitor) and ffmpeg')
class WorkerPostgresTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.env = patch.dict(os.environ, {'DATABASE_URL': TEST_DB, worker.ENABLED_ENV: 'true'})
        self.env.start()
        self.frames = patch.object(worker, 'FRAME_FORMAT', local_frame_format())
        self.frames.start()
        circuit = patch.object(worker, 'STORAGE_CIRCUIT', worker.StorageCircuit())
        circuit.start()
        self.addCleanup(circuit.stop)
        self.tmp = Path(tempfile.mkdtemp())
        self.video = self.tmp / 'source.mp4'
        make_video(self.video)
        self.sha = offline.sha256(self.video)
        self.conn = psycopg2.connect(TEST_DB)
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM competitor.analyses WHERE aweme_id = %s', (AWEME,))
            cur.execute('DELETE FROM competitor.videos WHERE aweme_id = %s', (AWEME,))
            cur.execute("INSERT INTO competitor.videos (aweme_id, share_url) VALUES (%s, 'https://v.douyin.com/t/')", (AWEME,))
        self.conn.commit()

    def tearDown(self):
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM competitor.analyses WHERE aweme_id = %s', (AWEME,))
            cur.execute('DELETE FROM competitor.videos WHERE aweme_id = %s', (AWEME,))
        self.conn.commit()
        self.conn.close()
        self.frames.stop()
        self.env.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def queue_analysis(self, sha, requested_by=None):
        with self.conn.cursor() as cur:
            cur.execute('INSERT INTO competitor.analyses (aweme_id, source_sha256, requested_by) VALUES (%s, %s, %s) RETURNING analysis_id::text',
                        (AWEME, sha, requested_by))
            analysis_id = cur.fetchone()[0]
        self.conn.commit()
        return analysis_id

    def row(self, analysis_id):
        with self.conn.cursor() as cur:
            cur.execute("""SELECT status, error_code, jsonb_array_length(evidence_objects), model_id, cost_yuan::float8,
                             (SELECT duration_seconds::float8 FROM competitor.videos WHERE aweme_id = %s),
                             (SELECT brand_name FROM competitor.videos WHERE aweme_id = %s),
                             (SELECT product_category FROM competitor.videos WHERE aweme_id = %s)
                           FROM competitor.analyses WHERE analysis_id = %s""", (AWEME, AWEME, AWEME, analysis_id))
            return cur.fetchone()

    def performance(self, analysis_id):
        with self.conn.cursor() as cur:
            cur.execute("SELECT usage FROM competitor.analyses WHERE analysis_id = %s", (analysis_id,))
            return cur.fetchone()[0]

    def fake_record(self, *_args, **_kwargs):
        card = {'segments': [{'start_sec': 0.0, 'end_sec': 4.0}, {'start_sec': 4.0, 'end_sec': 12.0}],
                'product': {'brand': '毛戈平', 'category': 'loose_powder'}}
        return {'status': 'ok', 'card': card, 'context': {'duration_sec': 12.0},
                'issues': [('error', 'claims[0]', 'removed')], 'input_manifest': {'source_sha256': self.sha},
                'model': offline.MODEL, 'prompt_version': 'v9', 'taxonomy_version': 'competitor-taxonomy-v3',
                'usage': {'input_tokens': 10}, 'cost': {'online_yuan': 0.042}, 'structure': {'coarse': []}}

    def test_success_writes_card_evidence_and_deletes_the_staged_original(self):
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        framework = {'status': 'ok', 'segments': [], 'costYuan': 0.018}
        recorded = {'pipeline': 'framework-v2-test', 'presets': {'framework': 2, 'sellingPoint': 1}}
        with patch.object(offline, 'analyze', self.fake_record), \
                patch.object(structure, 'build', return_value=(framework, recorded)) as build:
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(build.call_args.args[2], 12.0)
        status, error_code, evidence, model, cost, duration, brand, category = self.row(analysis_id)
        self.assertEqual((status, error_code, evidence, model), ('partial', None, 2 + worker.SAMPLE_FRAMES, offline.MODEL))
        self.assertAlmostEqual(cost, 0.06)
        with self.conn.cursor() as cur:
            cur.execute("SELECT card->'framework'->>'status', input_manifest_hash FROM competitor.analyses WHERE analysis_id = %s",
                        (analysis_id,))
            stored, manifest = cur.fetchone()
        self.assertEqual(stored, 'ok')
        self.assertEqual(manifest, queue.manifest_hash({'source_sha256': self.sha, 'structure': {**recorded, 'status': 'ok'}}))
        self.assertEqual((duration, brand, category), (12.0, '毛戈平', '散粉'))
        usage = self.performance(analysis_id)
        self.assertEqual(usage['input_tokens'], 10)
        performance = usage['performance']
        self.assertEqual(performance['boundary'], 'before_result_write')
        self.assertGreater(performance['elapsedSeconds'], 0)
        self.assertEqual(performance['stages']['evidence_upload']['calls'], 2 + worker.SAMPLE_FRAMES)
        self.assertIn('structure_total', performance['stages'])
        self.assertIn('card_total', performance['stages'])
        self.assertNotIn('result_write', performance['stages'])
        self.assertNotIn('source_cleanup', performance['stages'])
        self.assertNotIn(worker.raw_key(AWEME), storage.objects)
        prefix = worker.evidence_prefix(analysis_id)
        ext = worker.FRAME_FORMAT[0]
        self.assertEqual(sorted(k for k in storage.objects if k.startswith(prefix)),
                         sorted([f'{prefix}/frame-1.{ext}', f'{prefix}/frame-2.{ext}']
                                + [f'{prefix}/sample-{i}.{ext}' for i in range(1, worker.SAMPLE_FRAMES + 1)]))

    def test_a_changed_staged_original_fails_without_calling_the_model(self):
        analysis_id = self.queue_analysis('0' * 64)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        with patch.object(offline, 'analyze', side_effect=AssertionError('model must not be called')):
            worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(self.row(analysis_id)[:2], ('failed', 'source_changed'))
        stages = self.performance(analysis_id)['performance']['stages']
        self.assertIn('source_verify', stages)
        self.assertNotIn('card_total', stages)
        self.assertNotIn(worker.raw_key(AWEME), storage.objects)

    def test_historical_selling_retry_reuses_core_framework_transcript_and_evidence(self):
        from psycopg2.extras import Json
        from content_production.competitor_analysis import contract, recovery, taxonomy
        from content_production.segment_suggestion_provider import ProviderResult
        versions = {'pipeline': 'fixture-framework', 'presets': {'framework': 2, 'sellingPoint': 1},
                    'sellingPointPrompt': 'fixture-points'}
        fw = {'status': 'ok', **versions, 'segments': [{'startMs': 0, 'endMs': 12000, 'labelKey': 'live_demo'}],
              'transcript': [[9000, 11000, '很滋润']], 'sellingPoints': [], 'sellingPointError': 'invalid_response',
              'sellingPointInput': {'screenLines': []}, 'costYuan': 3.0, 'usage': {'input_tokens': 9999},
              'labels': {'framework': {'live_demo': '实拍'}, 'sellingPoint': {'moisturizing': '滋润'}},
              'labelOrder': {'framework': ['live_demo'], 'sellingPoint': ['moisturizing']}}
        card = {'evidence': [], 'segments': [], 'hook': {}, 'claims': [], 'product': {}, 'framework': fw}
        evidence = [{'kind': 'frame', 'objectKey': 'prior/cover', 'bucket': 'fixture', 'sha256': 'd' * 64}]
        with self.conn.cursor() as cur:
            cur.execute("""INSERT INTO competitor.analyses
              (aweme_id,source_sha256,input_manifest_hash,model_id,prompt_version,taxonomy_version,status,card,evidence_objects,cost_yuan,created_at)
              VALUES (%s,%s,%s,%s,%s,%s,'partial',%s,%s,9.9,NOW()-INTERVAL '1 second') RETURNING analysis_id::text""",
              (AWEME,self.sha,'c'*64,offline.MODEL,contract.PROMPT_VERSION,taxonomy.TAXONOMY_VERSION,Json(card),Json(evidence)))
            base_id = cur.fetchone()[0]
        self.conn.commit()
        analysis_id = self.queue_analysis(self.sha, recovery.AUTO_REPAIR_REQUESTER)
        with self.conn:
            self.assertIsNone(queue.previous_result(self.conn, {'aweme_id': AWEME,'analysis_id':analysis_id,'source_sha256':'f'*64}))
        payload = {'segments': [{'framework_index': 0, 'start_sec': 9, 'end_sec': 11, 'label_keys': ['moisturizing'],
                                 'continues_previous': False, 'quote': '很滋润'}]}
        provider = unittest.mock.Mock()
        provider.complete.return_value = ProviderResult(payload=payload, usage={'input_tokens':100}, response_id='fixture')
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes(), 'prior/cover': b'unchanged'})
        presets = ((2, [{'key':'live_demo','name':'实拍'}], 1, [{'key':'moisturizing','name':'滋润'}]), None)
        real_process = worker.process
        def run(*args, **kwargs):
            return real_process(*args, structure_provider=lambda: provider, **kwargs)
        with patch.object(worker, 'process', side_effect=run), \
                patch.object(structure, 'load_presets', return_value=presets), \
                patch.object(structure, 'versions', return_value=versions), \
                patch.object(offline, 'analyze', side_effect=AssertionError('core must be reused')), \
                patch.object(structure, 'generate', side_effect=AssertionError('framework and ASR must be reused')), \
                patch.object(recovery, 'build_proxy', side_effect=AssertionError('OCR input must be reused')):
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'succeeded')
        provider.complete.assert_called_once()
        self.assertLess(self.row(analysis_id)[4], 0.01)
        self.assertEqual(self.row(analysis_id)[2], 1)
        usage = self.performance(analysis_id)
        self.assertEqual(usage['reuse'], {'analysisId':base_id,'core':True,'framework':True})
        self.assertNotIn('card_total', usage['performance']['stages'])
        self.assertNotIn('asr_local', usage['performance']['stages'])
        self.assertEqual(storage.objects, {'prior/cover': b'unchanged'})
        with self.conn.cursor() as cur:
            cur.execute('SELECT card,cost_yuan::float8 FROM competitor.analyses WHERE analysis_id=%s',(base_id,))
            self.assertEqual(cur.fetchone(), (card, 9.9))

    def test_provider_errors_fail_once_without_retry(self):
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        record = {'status': 'provider_error', 'error': [{'type': 'HTTPError', 'http': '500'}]}
        with patch.object(offline, 'analyze', return_value=record):
            worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(self.row(analysis_id)[:2], ('failed', 'provider_error'))
        self.assertIn('card_total', self.performance(analysis_id)['performance']['stages'])

    def test_media_failure_is_timed_and_saved_without_calling_the_model(self):
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        with patch.object(worker, 'probe', side_effect=RuntimeError('bad media')), \
                patch.object(offline, 'analyze', side_effect=AssertionError('model must not be called')):
            worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(self.row(analysis_id)[:2], ('failed', 'worker_error'))
        stages = self.performance(analysis_id)['performance']['stages']
        self.assertEqual(stages['source_probe']['failures'], 1)
        self.assertNotIn('card_total', stages)
        self.assertNotIn(worker.raw_key(AWEME), storage.objects)

    def test_unstaged_rows_wait_and_lost_staging_fails(self):
        with self.conn.cursor() as cur:
            cur.execute("INSERT INTO competitor.analyses (aweme_id) VALUES (%s) RETURNING analysis_id::text", (AWEME,))
            pending = cur.fetchone()[0]
        self.conn.commit()
        self.assertIsNone(queue.claim(self.conn))
        self.assertEqual(self.row(pending)[0], 'queued')
        with self.conn.cursor() as cur:
            cur.execute("UPDATE competitor.analyses SET created_at = NOW() - INTERVAL '20 minutes' WHERE analysis_id = %s",
                        (pending,))
        self.conn.commit()
        self.assertIsNone(queue.claim(self.conn))
        self.assertEqual(self.row(pending)[:2], ('failed', 'staging_lost'))

    def ready_retry(self, analysis_id):
        with self.conn.cursor() as cur:
            cur.execute("UPDATE competitor.analyses SET heartbeat_at=NOW()-INTERVAL '6 minutes' WHERE analysis_id=%s", (analysis_id,))
        self.conn.commit()
        # Simulate a fresh process: the DB budget and delay must survive its empty circuit.
        worker.STORAGE_CIRCUIT = worker.StorageCircuit()

    def test_upload_retry_resumes_saved_result_without_any_model_call(self):
        from marketing_content_assets.tos_storage import StorageUnavailable
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        with patch.object(offline, 'analyze', self.fake_record), \
                patch.object(structure, 'build', return_value=({'status': 'ok'}, None)), \
                patch.object(storage, 'upload_file', side_effect=StorageUnavailable('TLS EOF')):
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'queued')
        self.assertEqual(self.row(analysis_id)[:2], ('queued', 'storage_retry'))
        self.assertIn(worker.raw_key(AWEME), storage.objects)
        self.assertEqual(self.performance(analysis_id)['deliveryCheckpoint']['sourceSha256'], self.sha)
        self.assertAlmostEqual(self.row(analysis_id)[4], 0.042)
        self.assertIsNone(queue.claim(self.conn))
        self.ready_retry(analysis_id)
        with patch.object(offline, 'analyze', side_effect=AssertionError('paid inference repeated')), \
                patch.object(structure, 'build', side_effect=AssertionError('structure repeated')):
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(self.row(analysis_id)[:3], ('partial', None, 32))
        self.assertAlmostEqual(self.row(analysis_id)[4], 0.042)
        self.assertNotIn('deliveryCheckpoint', self.performance(analysis_id))
        self.assertTrue(self.performance(analysis_id)['deliveryRecovery']['resumed'])
        self.assertNotIn(worker.raw_key(AWEME), storage.objects)

    def test_download_retry_budget_survives_process_restarts_and_retains_source(self):
        from marketing_content_assets.tos_storage import StorageUnavailable
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        with patch.object(storage, 'download_file', side_effect=StorageUnavailable('TLS EOF')), \
                patch.object(offline, 'analyze', side_effect=AssertionError('no source')):
            for attempt in (1, 2, 3):
                self.ready_retry(analysis_id)
                result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
                self.assertEqual(result['status'], 'queued' if attempt < 3 else 'failed')
                self.assertEqual(worker.raw_key(AWEME) in storage.objects, attempt < 3)
                with self.conn.cursor() as cur:
                    cur.execute('SELECT attempt FROM competitor.analyses WHERE analysis_id=%s', (analysis_id,))
                    self.assertEqual(cur.fetchone()[0], attempt)
        self.assertEqual(self.row(analysis_id)[:2], ('failed', 'storage_retry_exhausted'))
        self.assertIsNone(queue.claim(self.conn))

    def test_retry_delays_and_budget_are_shared_by_both_claimers(self):
        analysis_id = self.queue_analysis(self.sha)
        first = queue.claim(self.conn)
        self.assertEqual(queue.retry_storage(self.conn, first, {}), 'queued')
        for elapsed, eligible in ((59, False), (61, True)):
            with self.conn.cursor() as cur:
                cur.execute("UPDATE competitor.analyses SET heartbeat_at=NOW()-make_interval(secs => %s), created_at=NOW()-INTERVAL '30 minutes' WHERE analysis_id=%s", (elapsed, analysis_id))
            self.conn.commit()
            second = queue.claim(self.conn, 600)
            self.assertEqual(second is not None, eligible)
        self.assertEqual(queue.retry_storage(self.conn, second, {}), 'queued')
        with self.conn.cursor() as cur:
            cur.execute("UPDATE competitor.analyses SET heartbeat_at=NOW()-INTERVAL '299 seconds' WHERE analysis_id=%s", (analysis_id,))
        self.conn.commit()
        self.assertIsNone(queue.claim(self.conn))
        with self.conn.cursor() as cur:
            cur.execute("UPDATE competitor.analyses SET heartbeat_at=NOW()-INTERVAL '301 seconds' WHERE analysis_id=%s", (analysis_id,))
        self.conn.commit()
        self.assertEqual(queue.claim(self.conn)['attempt'], 3)

    def test_exhausted_paid_checkpoint_is_available_to_version_checked_reuse(self):
        analysis_id = self.queue_analysis(self.sha)
        job = queue.claim(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("""UPDATE competitor.analyses SET status='failed',error_code='storage_retry_exhausted',
              card='{"product":{}}',usage=jsonb_build_object('deliveryCheckpoint',
                jsonb_build_object('version',1,'sourceSha256',source_sha256)) WHERE analysis_id=%s""", (analysis_id,))
        self.conn.commit()
        later = self.queue_analysis(self.sha)
        self.assertEqual(queue.previous_result(self.conn, {**job,'analysis_id':later})['analysis_id'], analysis_id)
        self.assertIsNone(queue.previous_result(self.conn, {**job,'analysis_id':later,'source_sha256':'f'*64}))

    def test_checkpoint_lease_loss_requeues_but_unknown_billing_does_not(self):
        analysis_id = self.queue_analysis(self.sha)
        first = queue.claim(self.conn)
        with self.conn.cursor() as cur:
            cur.execute("""UPDATE competitor.analyses SET card='{}', usage=jsonb_build_object(
              'deliveryCheckpoint', jsonb_build_object('version',1,'sourceSha256',source_sha256)),
              heartbeat_at=NOW()-INTERVAL '6 minutes' WHERE analysis_id=%s""", (analysis_id,))
        self.conn.commit()
        self.assertIsNone(queue.claim(self.conn))  # Recovery must still observe the retry delay.
        self.assertEqual(self.row(analysis_id)[:2], ('queued', 'storage_retry'))
        self.assertFalse(queue.heartbeat(self.conn, first))
        self.assertEqual(queue.retry_storage(self.conn, first, {}), 'lease_lost')
        self.ready_retry(analysis_id)
        second = queue.claim(self.conn)
        self.assertNotEqual(first['claim_token'], second['claim_token'])
        with self.conn.cursor() as cur:
            cur.execute("UPDATE competitor.analyses SET usage=NULL,heartbeat_at=NOW()-INTERVAL '6 minutes' WHERE analysis_id=%s", (analysis_id,))
        self.conn.commit()
        self.assertIsNone(queue.claim(self.conn))
        self.assertEqual(self.row(analysis_id)[:2], ('failed', 'lease_expired'))

    def test_lost_lease_does_not_delete_source_or_write_checkpoint(self):
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        def lost(*args, **kwargs):
            with self.conn.cursor() as cur:
                cur.execute("UPDATE competitor.analyses SET status='cancelled' WHERE analysis_id=%s", (analysis_id,))
            self.conn.commit()
            return self.fake_record()
        with patch.object(offline, 'analyze', side_effect=lost), \
                patch.object(structure, 'build', return_value=({'status': 'ok'}, None)):
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'lease_lost')
        self.assertIn(worker.raw_key(AWEME), storage.objects)
        self.assertEqual(self.row(analysis_id)[0], 'cancelled')
        with self.conn.cursor() as cur:
            cur.execute('SELECT card FROM competitor.analyses WHERE analysis_id=%s', (analysis_id,))
            self.assertIsNone(cur.fetchone()[0])

    def test_database_failure_after_checkpoint_keeps_paid_result_and_raw(self):
        import psycopg2
        analysis_id = self.queue_analysis(self.sha)
        storage = FakeStorage({worker.raw_key(AWEME): self.video.read_bytes()})
        with patch.object(offline, 'analyze', self.fake_record), \
                patch.object(structure, 'build', return_value=({'status': 'ok'}, None)), \
                patch.object(queue, 'finish', side_effect=psycopg2.OperationalError('offline')):
            result = worker.process_one(storage_factory=lambda: storage, client_factory=lambda: object())
        self.assertEqual(result['status'], 'lease_lost')
        self.assertEqual(self.row(analysis_id)[0], 'running')
        self.assertIn('deliveryCheckpoint', self.performance(analysis_id))
        self.assertIn(worker.raw_key(AWEME), storage.objects)

    def test_disabled_worker_leaves_the_queue_untouched(self):
        analysis_id = self.queue_analysis(self.sha)
        with patch.dict(os.environ, {worker.ENABLED_ENV: 'false'}):
            self.assertEqual(worker.process_one()['status'], 'disabled')
        self.assertEqual(self.row(analysis_id)[0], 'queued')


if __name__ == '__main__':
    unittest.main()
