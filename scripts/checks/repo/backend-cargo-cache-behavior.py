#!/usr/bin/env python3
"""Destructive cache operations are exercised only in disposable Git fixtures."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path('scripts/backend-rust/cache-maintenance.py')
spec = importlib.util.spec_from_file_location('cargo_cache', ROOT / SCRIPT)
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)


class CacheBehavior(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='aios-cargo-cache-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        for relative in [SCRIPT, Path('scripts/config/backend-cargo-cache.json')]:
            destination = self.root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        self.incremental = self.root / cache.TARGET / 'debug/incremental'
        self.incremental.mkdir(parents=True)
        (self.incremental / 'object').write_text('cache')
        self.deps = self.incremental.parent / 'deps'
        self.deps.mkdir()
        (self.deps / 'keep').write_text('dependency')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        cargo = self.bin / 'cargo'
        cargo.write_text(f'#!{sys.executable}\nimport sys\n'
                         'if "hold" in sys.argv:\n'
                         ' print("READY", flush=True)\n'
                         ' sys.stdin.readline()\n'
                         'sys.exit(7 if "fail" in sys.argv else 0)\n')
        cargo.chmod(0o755)
        self.env = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
                    'CARGO_TARGET_DIR': str(self.root / cache.TARGET)}

    def cli(self, *args):
        return subprocess.run([sys.executable, str(self.root / SCRIPT), *args],
                              cwd=self.root, env=self.env, capture_output=True,
                              text=True, timeout=15)

    def hold_build(self):
        child = subprocess.Popen([sys.executable, str(self.root / SCRIPT), 'run', 'hold'],
                                 cwd=self.root, env=self.env, stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: child.poll() is None and child.kill())
        self.assertEqual(child.stdout.readline().strip(), 'READY')
        return child

    def test_dry_run_and_incremental_only(self):
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['mode'], 'dry-run')
        self.assertTrue(self.incremental.exists())
        result = self.cli('--apply')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.incremental.exists())
        self.assertTrue((self.deps / 'keep').exists())

    def test_full_cleanup_preserves_other_cache(self):
        protected = self.root / '.cache/evidence'
        protected.write_text('keep')
        result = self.cli('--all', '--apply')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / cache.TARGET).exists())
        self.assertTrue(protected.exists())

    def test_unknown_option_fails(self):
        self.assertNotEqual(self.cli('--force').returncode, 0)
        self.assertTrue(self.incremental.exists())

    def test_tracked_files_protected(self):
        subprocess.run(['git', 'add', str(cache.TARGET)], cwd=self.root, check=True)
        result = self.cli('--all', '--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('tracked', result.stderr)
        self.assertTrue(self.incremental.exists())

    def test_nested_symlink_protected(self):
        (self.incremental / 'link').symlink_to(self.deps, target_is_directory=True)
        result = self.cli('--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('symlink', result.stderr)
        self.assertTrue((self.deps / 'keep').exists())

    def test_ancestor_symlink_protected(self):
        target = self.root / cache.TARGET
        moved = self.root / 'external'
        target.rename(moved)
        target.symlink_to(moved, target_is_directory=True)
        self.assertNotEqual(self.cli('--all', '--apply').returncode, 0)
        self.assertTrue((moved / 'debug/deps/keep').exists())

    def test_open_file_blocks_cleanup(self):
        with (self.incremental / 'object').open():
            result = self.cli('--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('in use', result.stderr)
        self.assertTrue(self.incremental.exists())

    def test_process_inspection_errors_fail_closed(self):
        with patch.object(cache.subprocess, 'run', return_value=subprocess.CompletedProcess(
                [], 1, '', 'inspection warning')):
            with self.assertRaisesRegex(RuntimeError, 'cannot prove'):
                cache.assert_unused(self.incremental)

    def test_shared_builds_and_exclusive_cleanup(self):
        first = self.hold_build()
        second = self.hold_build()
        try:
            self.assertNotEqual(self.cli('--apply').returncode, 0)
            self.assertNotEqual(self.cli('run', 'clean').returncode, 0)
            self.assertTrue(self.incremental.exists())
        finally:
            first.communicate('\n', timeout=5)
            second.communicate('\n', timeout=5)
        self.assertEqual(self.cli('--apply').returncode, 0)

    def test_signal_releases_lock_and_exit_code_preserved(self):
        child = self.hold_build()
        child.send_signal(signal.SIGTERM)
        child.communicate(timeout=5)
        self.assertEqual(child.returncode, -signal.SIGTERM)
        self.assertEqual(self.cli('run', 'fail').returncode, 7)
        self.assertEqual(self.cli('--apply').returncode, 0)

    def test_overrides_skip_automatic_maintenance(self):
        self.env['CARGO_TARGET_DIR'] = str(self.root / 'custom')
        self.assertEqual(self.cli('run', 'check').returncode, 0)
        self.assertFalse((self.root / cache.STATE).exists())
        self.env['CARGO_TARGET_DIR'] = str(self.root / cache.TARGET)
        self.assertEqual(self.cli('run', 'check', '--target-dir=custom').returncode, 0)
        self.assertFalse((self.root / cache.STATE).exists())

    def test_budget_idle_and_unknown_age(self):
        now = time.time()
        report = {'totalBytes': 1, 'incrementalBytes': 1}
        self.assertEqual(cache.reasons(report, 0, now), [])
        self.assertEqual(cache.reasons(report, now - 15 * 86400, now), ['idle'])
        report['totalBytes'] = cache.POLICY['totalBudgetBytes'] + 1
        report['incrementalBytes'] = cache.POLICY['incrementalBudgetBytes'] + 1
        self.assertEqual(cache.reasons(report, now, now), ['total-budget', 'incremental-budget'])

    def test_daily_throttle_and_last_use(self):
        self.assertEqual(self.cli('run', 'check').returncode, 0)
        checked = cache.timestamp(self.root, 'last-check')
        self.assertGreater(cache.timestamp(self.root, 'last-use'), 0)
        with patch.object(cache, 'audit', side_effect=AssertionError('must not scan')):
            cache.auto_maintain(self.root)
        self.assertEqual(cache.timestamp(self.root, 'last-check'), checked)

    def test_budget_cleanup_leaves_deps_and_reports_remaining(self):
        policy_file = self.root / 'scripts/config/backend-cargo-cache.json'
        policy = json.loads(policy_file.read_text())
        policy.update(totalBudgetBytes=1, incrementalBudgetBytes=1)
        policy_file.write_text(json.dumps(policy))
        result = self.cli('run', 'check')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.incremental.exists())
        self.assertTrue((self.deps / 'keep').exists())
        self.assertIn('remainingBytes=', result.stderr)
        self.assertEqual(self.cli('run', 'check').stderr, '')

    def test_scan_failure_is_throttled(self):
        fd = cache.lock_file(self.root)
        try:
            with patch.object(cache, 'audit', side_effect=OSError('scan failed')):
                with self.assertRaises(OSError):
                    cache.auto_maintain(self.root)
                cache.auto_maintain(self.root)
        finally:
            os.close(fd)

    def test_canonical_cli_override_still_locks(self):
        for target, args in [
            ('custom', ['--target-dir', str(self.root / cache.TARGET)]),
            (str(cache.TARGET), ['--', '--target-dir', 'custom']),
            ('custom', ['--config', 'build.target-dir="custom"']),
        ]:
            with self.subTest(target=target, args=args):
                self.env['CARGO_TARGET_DIR'] = str(self.root / target)
                child = subprocess.Popen([
                    sys.executable, str(self.root / SCRIPT), 'run', 'hold', *args,
                ], cwd=self.root, env=self.env, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertEqual(child.stdout.readline().strip(), 'READY')
                    self.assertNotEqual(self.cli('--apply').returncode, 0)
                finally:
                    child.communicate('\n', timeout=5)

    def test_fmt_does_not_trigger_maintenance(self):
        self.assertEqual(self.cli('run', 'fmt').returncode, 0)
        self.assertFalse((self.root / cache.STATE).exists())

    def test_idle_cleanup_and_no_repeated_full_purge(self):
        fd = cache.lock_file(self.root)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            cache.mark(self.root, 'last-use')
            old = time.time() - 15 * 86400
            os.utime(self.root / cache.STATE / 'last-use', (old, old))
            cache.auto_maintain(self.root)
            self.assertFalse(self.incremental.exists())
            self.assertTrue((self.deps / 'keep').exists())
        finally:
            os.close(fd)


if __name__ == '__main__':
    unittest.main()
