import contextlib
import hashlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_suggestion_worker as worker
from content_production.segment_suggestion_provider import LIVE_ENV, MockSegmentProvider, SuggestionError, provider_from_env
from content_production.segment_suggestion_queue import normalize_product

ENABLED = {'CONTENT_AI_STUDIO_ENABLED': 'true', 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_ENABLED': 'true'}


def no_database(*_args, **_kwargs):
    raise AssertionError('an unavailable worker must not connect, claim or write jobs')


class Stop(Exception):
    pass


class UnavailableWorkerTests(unittest.TestCase):
    def setUp(self):
        env = {key: value for key, value in os.environ.items()
               if key != LIVE_ENV and not key.startswith('CONTENT_AI_STUDIO_')}
        env['CONTENT_PRODUCTION_WORK_DIR'] = tempfile.mkdtemp(prefix='segment-suggest-worker-')
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.dict(os.environ, env, clear=True))
        stack.enter_context(patch.object(worker, 'connect_pg', no_database))
        # main() installs a SIGTERM handler; keep the test process handler untouched.
        stack.enter_context(patch.object(worker.signal, 'signal'))

    def test_disabled_or_unconfigured_provider_raises_before_claiming(self):
        with self.assertRaises(worker.WorkerUnavailable):
            worker.process_one(Path('/tmp'), provider_factory=MockSegmentProvider, source_factory=lambda: None)
        os.environ.update(ENABLED)
        # Default ark provider without the explicit live flag.
        with self.assertRaises(worker.WorkerUnavailable) as raised:
            worker.process_one(Path('/tmp'), provider_factory=provider_from_env, source_factory=lambda: None)
        self.assertIn(LIVE_ENV, str(raised.exception))
        os.environ['CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER'] = 'Mock'
        with self.assertRaises(worker.WorkerUnavailable):
            worker.process_one(Path('/tmp'), provider_factory=provider_from_env, source_factory=lambda: None)

    def test_source_configuration_error_is_unavailable_and_closes_provider(self):
        os.environ.update(ENABLED)
        closed = []

        class Provider(MockSegmentProvider):
            def close(self):
                closed.append(True)

        def broken_source():
            raise RuntimeError('缺少 TOS_ACCESS_KEY_ID/TOS_SECRET_ACCESS_KEY')
        with self.assertRaises(worker.WorkerUnavailable):
            worker.process_one(Path('/tmp'), provider_factory=Provider, source_factory=broken_source)
        self.assertEqual(closed, [True])

    def test_invalid_prompt_or_shot_settings_are_unavailable_before_claiming(self):
        os.environ.update(ENABLED)
        for name, value in (('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION', 'segment-suggest-v9'),
                            ('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SHOT_THRESHOLD', '2'),
                            ('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SHOT_WINDOW_SECONDS', 'x')):
            with self.subTest(name=name), patch.dict(os.environ, {name: value}):
                with self.assertRaises(worker.WorkerUnavailable):
                    worker.process_one(Path('/tmp'), provider_factory=MockSegmentProvider, source_factory=lambda: None)

    def test_config_defaults_to_v4_and_v1_disables_shot_detection(self):
        config = worker.suggest_config()
        self.assertEqual((config['promptVersion'], config['shots']['enabled']), ('segment-suggest-v4', True))
        with patch.dict(os.environ, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION': 'segment-suggest-v1'}):
            config = worker.suggest_config()
        self.assertEqual((config['promptVersion'], config['shots']['enabled']), ('segment-suggest-v1', False))

    def test_once_exits_nonzero_with_reason(self):
        os.environ.update(ENABLED)
        stderr = io.StringIO()
        with patch.object(sys, 'argv', ['worker', '--once']), contextlib.redirect_stderr(stderr):
            with self.assertRaises(SystemExit) as exited:
                worker.main()
        self.assertEqual(exited.exception.code, worker.UNAVAILABLE_EXIT_CODE)
        self.assertIn(LIVE_ENV, stderr.getvalue())

    def test_long_running_worker_idles_and_warns_once_per_reason(self):
        os.environ.update(ENABLED)
        sleeps = []

        def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) >= 3:
                raise Stop()
        stderr, stdout = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['worker']), patch.object(worker.time, 'sleep', fake_sleep), \
                contextlib.redirect_stderr(stderr), contextlib.redirect_stdout(stdout):
            with self.assertRaises(Stop):
                worker.main()
        self.assertEqual(sleeps, [worker.IDLE_POLL_SECONDS] * 3)
        self.assertEqual(stderr.getvalue().count('"unavailable"'), 1)
        self.assertEqual(stdout.getvalue(), '')


class LocalSourceTests(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp(prefix='segment-suggest-local-')).resolve()
        self.root = self.base / 'root'
        self.root.mkdir()
        self.data = b'fixture'
        self.sha = hashlib.sha256(self.data).hexdigest()
        (self.root / 'ok.mp4').write_bytes(self.data)
        (self.base / 'outside.mp4').write_bytes(self.data)
        (self.root / 'link-out.mp4').symlink_to(self.base / 'outside.mp4')
        (self.root / 'link-in.mp4').symlink_to(self.root / 'ok.mp4')
        self.source = worker.LocalSource(self.root)

    def fetch(self, key):
        destination = self.base / 'copy.mp4'
        self.source.fetch({'objectKey': key}, self.sha, destination, lambda: None)
        return destination

    def test_reads_regular_file_under_root(self):
        self.assertEqual(self.fetch('ok.mp4').read_bytes(), self.data)

    def test_rejects_traversal_absolute_and_symlinks(self):
        for key in ('../outside.mp4', str(self.base / 'outside.mp4'), 'link-out.mp4', 'link-in.mp4', 'missing.mp4', '.'):
            with self.subTest(key=key), self.assertRaises(SuggestionError) as raised:
                self.fetch(key)
            self.assertEqual(raised.exception.code, 'source_unavailable')

    def test_hash_mismatch_is_source_changed(self):
        (self.root / 'ok.mp4').write_bytes(b'changed')
        with self.assertRaises(SuggestionError) as raised:
            self.fetch('ok.mp4')
        self.assertEqual(raised.exception.code, 'source_changed')


class ProductNameTests(unittest.TestCase):
    def test_matches_rust_control_character_rule(self):
        self.assertEqual(normalize_product('  精华 '), '精华')
        for value in ('', '   ', None, 'a\u0085b', 'a\x7fb', 'a\nb', 'x' * 201):
            self.assertIsNone(normalize_product(value))


if __name__ == '__main__':
    unittest.main()


class BilledUsageTests(unittest.TestCase):
    """Failures after a billed model call keep its usage for the job record."""

    def run_suggest(self, error):
        def fake(conn, job, provider, fetcher, work, *, billed, **options):
            billed['usage'] = {'total_tokens': 42}
            raise error
        with patch.object(worker, '_suggest', fake):
            worker.suggest(None, {}, None, None, None, min_ms=1000, proxy_limit=1)

    def test_terminal_errors_without_usage_get_the_billed_usage(self):
        with self.assertRaises(SuggestionError) as caught:
            self.run_suggest(SuggestionError('source_changed', '原片内容已变化'))
        self.assertEqual(caught.exception.usage, {'total_tokens': 42})

    def test_unexpected_errors_carry_the_billed_usage(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_suggest(RuntimeError('boom'))
        self.assertEqual(caught.exception.billed_usage, {'total_tokens': 42})
