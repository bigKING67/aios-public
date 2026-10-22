import json
import contextlib
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_transcript as st  # noqa: E402
from content_production.execution import Cancelled  # noqa: E402
from content_production.local_asr import engine, service  # noqa: E402

URL = 'http://127.0.0.1:8200'


class FakeConn:
    """cursor().fetchone() pops the given rows: (job cache row, library row)."""

    def __init__(self, rows):
        self.rows, self.queries, self.rolled_back = list(rows), [], False
        self.cur = self

    def cursor(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.queries.append(sql)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None

    def rollback(self):
        self.rolled_back = True


class FakeResponse:
    def __init__(self, body, status=200):
        self.body, self.status = body, status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f'HTTP {self.status}')

    def json(self):
        return self.body


class FakeSession:
    def __init__(self, body=None, error=None):
        self.body, self.error, self.calls, self.trust_env = body, error, [], True

    def post(self, url, json, timeout):
        self.calls.append((url, json, Path(json['path']).exists()))
        if self.error:
            raise self.error
        return FakeResponse(self.body)


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg required')
class ResolveLocalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        self.video = self.work / 'source.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:size=64x64:rate=15:duration=3',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-shortest', str(self.video)], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def resolve(self, conn, session=None, tick=lambda: None):
        real = st.transcribe_local
        with patch.object(st, 'transcribe_local', lambda *a, **k: real(*a, **k, session=session)):
            return st.resolve_local(conn, 'asset', 'a' * 64, self.video, 3000, dict(os.environ), tick, self.work)

    def test_off_without_the_service_url(self):
        conn = FakeConn([])
        with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: ''}):
            self.assertEqual(self.resolve(conn), (None, None))
        self.assertEqual(conn.cur.queries, [])

    def test_cache_miss_transcribes_once_and_stores_utterances(self):
        session = FakeSession({'utterances': [[100, 2500, '必须用对气垫'], [3000, 1000, 'bad']],
                               'models': {'asr': 'paraformer-zh'}})
        with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: URL + '/', st.LOCAL_ASR_HOTWORDS_ENV: '蒂洛薇 散粉'}):
            settings, summary = self.resolve(FakeConn([None, None]), session)
        self.assertEqual(summary, {'status': 'ok', 'origin': 'funasr_local', 'utterances': 1,
                                   'models': {'asr': 'paraformer-zh'}})
        self.assertEqual(settings['utterances'], [[100, 2500, '必须用对气垫']])
        url, payload, existed = session.calls[0]
        self.assertEqual(url, URL + '/transcribe')
        self.assertEqual(payload['hotword'], '蒂洛薇 散粉')
        self.assertTrue(existed and payload['path'].endswith('transcript-audio.wav'))
        self.assertFalse(Path(payload['path']).exists())  # temporary audio is removed afterwards
        self.assertFalse(session.trust_env)

    def test_cached_transcript_is_reused_without_calling_the_service(self):
        session = FakeSession({'utterances': []})
        with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: URL}):
            settings, summary = self.resolve(FakeConn([([[0, 900, '旧转写']],)]), session)
        self.assertEqual((summary['status'], summary['origin']), ('ok', 'job_cache'))
        self.assertEqual(session.calls, [])

    def test_service_failure_never_fails_the_job(self):
        conn = FakeConn([None, None])
        with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: URL}):
            settings, summary = self.resolve(conn, FakeSession(error=ConnectionError('down')))
        self.assertEqual(settings, summary)
        self.assertEqual((summary['status'], summary['errorType']), ('unavailable', 'ConnectionError'))
        self.assertTrue(conn.rolled_back)

    def test_empty_transcript_and_cancellation(self):
        with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: URL}):
            _, summary = self.resolve(FakeConn([None, None]), FakeSession({'utterances': []}))
            self.assertEqual(summary['status'], 'empty')

            def cancelled():
                raise Cancelled('lost')
            with self.assertRaises(Cancelled):
                self.resolve(FakeConn([None, None]), FakeSession({'utterances': []}), cancelled)


class WorkerHookTests(unittest.TestCase):
    def run_v2(self, transcript):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from content_production import segment_suggestion_worker as worker
        from content_production.framework_v2 import pipeline
        provider = SimpleNamespace(name='local-v2', vlm_model='qwen3.5-4b', model='lite',
                                   request_settings=lambda: {'provider': 'local-v2'})
        job = {'asset_id': 'asset', 'source_content_hash': 'a' * 64}
        events = []
        def visual(*args):
            events.append('visual')
            return [], {'pipeline': 'v2'}, {}
        def resolved():
            events.append('transcript')
            return transcript
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(st, 'local_in_background', return_value=contextlib.nullcontext(resolved)) as resolve, \
                patch.object(pipeline, 'run', side_effect=visual), \
                patch.object(worker, 'record_request', side_effect=lambda *args: events.append('record')) as record, \
                patch.object(worker, 'load_source'), \
                patch.object(worker, '_publish', side_effect=lambda *args: events.append('publish') or True) as publish:
            proxy = Path(folder) / 'proxy.mp4'
            proxy.write_bytes(b'x')
            worker._suggest_v2(Mock(), job, provider, None, {}, Path(folder) / 'source.mp4', proxy, 3000, ['a'],
                               {}, Path(folder), lambda: None, [''], {})
        self.assertEqual(events, ['record', 'visual', 'transcript'] +
                         (['record'] if transcript[0] else []) + ['publish'])
        return resolve, record.call_args.args[4], publish.call_args.args[6]

    def test_framework_job_stores_the_transcript_for_later_selling_point_jobs(self):
        stored = {'status': 'ok', 'origin': 'funasr_local', 'utterances': [[0, 900, '你好']]}
        resolve, settings, summary = self.run_v2((stored, {'status': 'ok', 'origin': 'funasr_local', 'utterances': 1}))
        self.assertEqual(resolve.call_args.args[1:3], ('asset', 'a' * 64))
        self.assertEqual(settings['transcript'], stored)
        self.assertEqual(summary['transcript']['utterances'], 1)

    def test_no_transcript_leaves_settings_unchanged(self):
        _, settings, summary = self.run_v2((None, None))
        self.assertNotIn('transcript', settings)
        self.assertNotIn('transcript', summary)


class SentenceSplitTests(unittest.TestCase):
    def test_tokens_map_back_to_film_time_and_cut_at_sentence_end(self):
        tokens = ['我', '买', '了', 'dpdp', '气', '垫', '真', '好']
        stamps = [[0, 200], [200, 400], [400, 600], [600, 1200], [1200, 1400], [1400, 1600], [1700, 1900], [1900, 2100]]
        sentences = engine.split_sentences('我买了DPDP气垫。真好！', tokens, stamps, 10_000)
        self.assertEqual(sentences, [[10_000, 11_600, '我买了DPDP气垫。'], [11_700, 12_100, '真好！']])

    def test_long_comma_chains_are_cut_short_ones_kept(self):
        tokens = list('甲乙丙丁')
        stamps = [[0, 1000], [1000, 3200], [3300, 3500], [3500, 3700]]
        self.assertEqual(engine.split_sentences('甲乙，丙丁', tokens, stamps, 0),
                         [[0, 3200, '甲乙，'], [3300, 3700, '丙丁']])
        self.assertEqual(engine.split_sentences('甲，乙丙丁', tokens, stamps, 0), [[0, 3700, '甲，乙丙丁']])


class FakePool:
    def __init__(self):
        self.calls = []

    def apply(self, function, args):
        self.calls.append(args)
        return [[0, 1000, '你好']], 0.1


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'work'
        self.root.mkdir()
        self.wav = self.root / 'job' / 'transcript-audio.wav'
        self.wav.parent.mkdir()
        self.wav.write_bytes(b'RIFF')
        self.outside = Path(self.tmp.name) / 'secret.wav'
        self.outside.write_bytes(b'RIFF')
        self.pool = FakePool()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), service.make_handler(self.pool, str(self.root), 2))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.server.server_address[1]}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def post(self, body):
        request = urllib.request.Request(self.base + '/transcribe', data=json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_only_wav_files_inside_the_work_root_are_read(self):
        link = self.root / 'escape.wav'
        link.symlink_to(self.outside)
        self.assertTrue(service.allowed(self.wav, self.root))
        for path in (self.outside, link, self.root / 'job' / 'missing.wav', self.root / 'job'):
            self.assertFalse(service.allowed(path, self.root), path)

    def test_health_and_transcribe(self):
        with urllib.request.urlopen(self.base + '/health') as response:
            self.assertEqual(json.loads(response.read())['models'], engine.MODELS)
        self.assertEqual(self.post({'path': str(self.wav), 'hotword': '散粉'}),
                         (200, {'utterances': [[0, 1000, '你好']], 'seconds': 0.1, 'models': engine.MODELS}))
        self.assertEqual(self.pool.calls, [(str(self.wav), '散粉')])
        self.assertEqual(self.post({'path': str(self.outside)})[0], 403)
        self.assertEqual(self.post({'nope': 1})[0], 400)


if __name__ == '__main__':
    unittest.main()
