import os
import subprocess
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.segment_suggestion_contract import response_schema
from content_production.segment_suggestion_provider import (
    LIVE_ENV, ArkSegmentProvider, MockSegmentProvider, SuggestionError, build_proxy, call_with_ticks, provider_from_env,
    run_media,
)
from content_production import segment_suggestion_provider as provider_module
from content_production.execution import Cancelled


def no_network(*_args, **_kwargs):
    raise AssertionError('tests must never reach the network')


class LiveGuardTests(unittest.TestCase):
    def test_ark_provider_refuses_without_explicit_live_flag(self):
        env = {key: value for key, value in os.environ.items() if key != LIVE_ENV}
        env.update({'ARK_API_KEY': 'fixture-only', 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER': 'ark'})
        with patch.dict(os.environ, env, clear=True), patch('requests.Session.post', no_network), \
                patch('requests.Session.request', no_network):
            with self.assertRaises(RuntimeError):
                ArkSegmentProvider()
            with self.assertRaises(RuntimeError):
                provider_from_env()
            for flag in ('true', 'yes', '0', ''):
                os.environ[LIVE_ENV] = flag
                with self.assertRaises(RuntimeError):
                    ArkSegmentProvider()

    def test_default_provider_is_ark_and_unknown_is_rejected(self):
        with patch.dict(os.environ, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER': 'mock'}):
            self.assertIsInstance(provider_from_env(), MockSegmentProvider)
        with patch.dict(os.environ, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER': 'other'}):
            with self.assertRaises(ValueError):
                provider_from_env()

    def test_live_provider_wraps_failures_without_echoing_provider_text(self):
        from marketing_content_assets.ark_responses import ArkResponsesError

        class FailingClient:
            session = None

            def _post(self, _payload):
                raise ArkResponsesError('HTTP 500 secret-signature=abc')
        with patch.dict(os.environ, {LIVE_ENV: '1', 'ARK_API_KEY': 'fixture-only'}):
            provider = ArkSegmentProvider()
        provider.client = FailingClient()
        proxy = Path(__file__)
        with self.assertRaises(SuggestionError) as caught:
            provider.suggest(proxy, 'prompt', response_schema([{'key': 'a', 'name': 'A', 'definition': ''}]), 1000)
        self.assertEqual(caught.exception.code, 'provider_error')
        self.assertNotIn('secret', str(caught.exception))
        self.assertIn('ArkResponsesError HTTP 500', str(caught.exception))


class MockProviderTests(unittest.TestCase):
    def test_default_mock_payload_uses_schema_labels(self):
        schema = response_schema([{'key': k, 'name': k, 'definition': ''} for k in ('a', 'b', 'c', 'd')])
        result = MockSegmentProvider().suggest(Path('proxy.mp4'), 'p', schema, 9000)
        self.assertEqual([s['label_key'] for s in result.payload['segments']], ['a', 'b', 'c'])
        self.assertEqual(result.payload['segments'][-1]['end_sec'], 9.0)


class CallWithTicksTests(unittest.TestCase):
    def test_ticks_while_waiting_and_propagates_errors(self):
        ticks, release = [], threading.Event()

        def slow():
            release.wait(5)
            return 'done'

        def tick():
            ticks.append(1)
            release.set()
        self.assertEqual(call_with_ticks(slow, tick, 10), 'done')
        self.assertTrue(ticks)
        with self.assertRaises(KeyError):
            call_with_ticks(lambda: {}['missing'], lambda: None, 10)

    def test_deadline_raises_timeout_code(self):
        event = threading.Event()
        with self.assertRaises(SuggestionError) as caught:
            call_with_ticks(lambda: event.wait(5), lambda: None, 0)
        event.set()
        self.assertEqual(caught.exception.code, 'provider_timeout')


class RunMediaTests(unittest.TestCase):
    """run_media is shared by the proxy build and shot detection; it must reap its process group."""

    def spawn(self):
        started = []
        real = subprocess.Popen

        def spy(*args, **kwargs):
            self.assertTrue(kwargs.get('start_new_session'))
            started.append(real(*args, **kwargs))
            return started[-1]
        return started, patch.object(provider_module.subprocess, 'Popen', spy)

    def test_returns_exit_code_and_ticks(self):
        ticks = []
        self.assertEqual(run_media(['sh', '-c', 'sleep 0.3; exit 3'], dict(os.environ), lambda: ticks.append(1), 10,
                                   poll_seconds=0.05), 3)
        self.assertTrue(ticks)

    def test_timeout_and_cancellation_terminate_the_process(self):
        def cancel():
            raise Cancelled('lease lost')
        for tick, error in ((lambda: None, TimeoutError), (cancel, Cancelled)):
            started, spy = self.spawn()
            with self.subTest(error=error.__name__), spy, self.assertRaises(error):
                run_media(['sleep', '30'], dict(os.environ), tick, 0.1, poll_seconds=0.05)
            self.assertIsNotNone(started[0].poll())

    def test_build_proxy_maps_timeout_and_failure(self):
        for fake in (lambda *a, **k: (_ for _ in ()).throw(TimeoutError()), lambda *a, **k: 1):
            with self.subTest(), patch.object(provider_module, 'run_media', fake), self.assertRaises(SuggestionError) as caught:
                build_proxy(Path('in.mp4'), Path('out.mp4'), {}, lambda: None)
            self.assertEqual(caught.exception.code, 'proxy_failed')
        with patch.object(provider_module, 'run_media', lambda *a, **k: (_ for _ in ()).throw(Cancelled('x'))):
            with self.assertRaises(Cancelled):
                build_proxy(Path('in.mp4'), Path('out.mp4'), {}, lambda: None)


if __name__ == '__main__':
    unittest.main()
