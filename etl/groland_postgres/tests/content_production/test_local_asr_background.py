import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_transcript as st
from content_production.execution import Cancelled


class BackgroundAsrTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: 'http://127.0.0.1:8200'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def start(self, tick=lambda: None):
        return st.local_in_background(object(), 'asset', 'hash', Path('source'), 1000, {}, tick, Path('work'))

    def test_runs_before_resolve_and_keeps_db_and_heartbeat_on_main_thread(self):
        caller = threading.get_ident()
        started, release = threading.Event(), threading.Event()
        def cached(*args):
            self.assertEqual(threading.get_ident(), caller)
            return None, None
        def transcribe(*args):
            self.assertNotEqual(threading.get_ident(), caller)
            started.set()
            self.assertTrue(release.wait(2))
            return [[0, 900, '并行转写']], {'asr': 'pinned'}
        ticks = []
        def tick():
            self.assertEqual(threading.get_ident(), caller)
            ticks.append(True)
            release.set()
        with patch.object(st, 'cached_utterances', side_effect=cached), \
                patch.object(st, 'transcribe_local', side_effect=transcribe):
            with self.start(tick) as resolve:
                self.assertTrue(started.wait(2))  # vision can execute while ASR is still pending
                settings, summary = resolve()
        self.assertTrue(ticks)
        self.assertEqual(settings['utterances'], [[0, 900, '并行转写']])
        self.assertEqual(summary['models'], {'asr': 'pinned'})

    def test_cached_and_disabled_paths_never_start_asr(self):
        with patch.object(st, 'cached_utterances', return_value=([[0, 900, '缓存']], 'job_cache')), \
                patch.object(st, 'transcribe_local') as call:
            with self.start() as resolve:
                self.assertEqual(resolve()[1]['origin'], 'job_cache')
            with patch.dict(os.environ, {st.LOCAL_ASR_URL_ENV: ''}), self.start() as resolve:
                self.assertEqual(resolve(), (None, None))
        call.assert_not_called()

    def test_service_failures_and_timeout_are_advisory(self):
        for error in (ConnectionError('offline'), TimeoutError('deadline')):
            with self.subTest(error=type(error).__name__), \
                    patch.object(st, 'cached_utterances', return_value=(None, None)), \
                    patch.object(st, 'transcribe_local', side_effect=error), self.start() as resolve:
                settings, summary = resolve()
                self.assertEqual(settings, summary)
                self.assertEqual(summary['status'], 'unavailable')
                self.assertEqual(summary['errorType'], type(error).__name__)

    def test_lost_lease_propagates_and_stops_owned_background_work(self):
        started, stopped = threading.Event(), threading.Event()
        def transcribe(source, duration, env, tick, work):
            started.set()
            try:
                while not stopped.wait(.01):
                    tick()
            finally:
                stopped.set()
        def cancelled():
            raise Cancelled('lease lost')
        with patch.object(st, 'cached_utterances', return_value=(None, None)), \
                patch.object(st, 'transcribe_local', side_effect=transcribe):
            with self.assertRaises(Cancelled), self.start(cancelled) as resolve:
                self.assertTrue(started.wait(2))
                resolve()
        self.assertTrue(stopped.is_set())

    def test_pipeline_failure_also_stops_background_work(self):
        started, stopped = threading.Event(), threading.Event()
        def transcribe(source, duration, env, tick, work):
            started.set()
            try:
                while not stopped.wait(.01):
                    tick()
            finally:
                stopped.set()
        with patch.object(st, 'cached_utterances', return_value=(None, None)), \
                patch.object(st, 'transcribe_local', side_effect=transcribe):
            with self.assertRaisesRegex(ValueError, 'vision failed'), self.start():
                self.assertTrue(started.wait(2))
                raise ValueError('vision failed')
        self.assertTrue(stopped.is_set())


if __name__ == '__main__':
    unittest.main()
