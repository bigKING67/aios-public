"""Safety contracts; all Docker operations are simulated."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('cache_maintenance',
    Path(__file__).resolve().parents[1] / 'ops/vps-build-cache-maintenance.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def row(ident='a' * 25, **overrides):
    data = dict(ID=ident, Size='70GB', LastUsedAt='8 days ago',
                Reclaimable=True, Shared=False, Type='regular')
    data.update(overrides)
    return data


def records(*rows):
    return m.parse_inventory('\n'.join(json.dumps(r) for r in rows))


class MaintenanceTests(unittest.TestCase):
    def test_protected_types_flags_and_recent_ages(self):
        for change in [dict(Type='exec.cachemount'), dict(Type='internal'),
                       dict(Shared=True), dict(Reclaimable=False),
                       dict(LastUsedAt='6 days ago'), dict(LastUsedAt='Never'),
                       dict(LastUsedAt='About a week ago')]:
            with self.subTest(change=change):
                self.assertFalse(m.eligible(next(iter(records(row(**change)).values()))))
        self.assertTrue(m.eligible(next(iter(records(row(LastUsedAt='7 days ago')).values()))))

    def test_malformed_inventory_fails(self):
        for change in [dict(Size='???'), dict(Shared='false'), dict(ID='*'),
                       dict(LastUsedAt=None), dict(Reclaimable=1)]:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                records(row(**change))
        with self.assertRaises(ValueError):
            records(row(), row())

    def test_budget_boundaries(self):
        disk = SimpleNamespace(total=100, free=20)
        cache = {'x': {'size': m.TRIGGER}}
        self.assertFalse(m.pressure(cache, disk))
        self.assertTrue(m.pressure(cache, SimpleNamespace(total=100, free=19)))
        self.assertFalse(m.target_met(cache, disk))
        self.assertTrue(m.target_met({'x': {'size': m.TARGET}}, disk))

    def exercise(self, apply=True, inventories=None, active=None, protections=None):
        cache = records(row())
        report = {}
        with patch.object(m, 'local_root', return_value='/var/lib/docker'), \
             patch.object(m.shutil, 'disk_usage', return_value=SimpleNamespace(total=100, free=80)), \
             patch.object(m, 'build_active', side_effect=active or [False] * 10), \
             patch.object(m, 'inventory', side_effect=inventories or [cache] * 10), \
             patch.object(m, 'protected', side_effect=protections or [{}] * 10), \
             patch.object(m, 'health'), patch.object(m, 'run', return_value='') as command:
            m.maintain(apply, report)
        return report, command

    def test_dry_run_never_prunes(self):
        report, command = self.exercise(apply=False)
        self.assertEqual(report['status'], 'dry_run')
        command.assert_not_called()

    def test_exact_id_and_recency_guard(self):
        cache = records(row())
        report, command = self.exercise(inventories=[cache, cache, {}])
        command.assert_called_once_with(m.BUILDX + ['prune', '--force', '--filter',
            'id=' + 'a' * 25, '--filter', 'until=168h'])
        self.assertEqual(report['deleted_ids'], ['a' * 25])
        self.assertEqual(report['status'], 'target_met')

    def test_recently_reused_candidate_is_preserved(self):
        cache = records(row())
        fresh = records(row(LastUsedAt='1 minute ago'))
        report, command = self.exercise(inventories=[cache, fresh, fresh])
        command.assert_not_called()
        self.assertEqual(report['status'], 'safe_candidates_exhausted')

    def test_active_build_skips_before_and_during(self):
        report, command = self.exercise(active=[True])
        self.assertEqual(report['status'], 'skipped_active_build')
        command.assert_not_called()
        report, command = self.exercise(active=[False, True])
        self.assertEqual(report['status'], 'stopped_active_build')
        command.assert_not_called()

    def test_under_budget_and_no_safe_candidates_do_not_prune(self):
        for cache in [records(row(Size='40GB')), records(row(Type='exec.cachemount'))]:
            report, command = self.exercise(inventories=[cache] * 5)
            command.assert_not_called()

    def test_protected_inventory_drift_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'protected inventory changed'):
            self.exercise(protections=[{}, {'images': ['new']}, {'images': ['new']}])

    def test_unexpected_cache_deletion_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'unexpected cache inventory change'):
            self.exercise(apply=False, inventories=[records(row()), {}])

    def test_process_detection(self):
        for process in ['cargo cargo build', 'docker docker buildx build .',
                        'docker-buildx docker-buildx build .', 'buildctl buildctl build']:
            with patch.object(m, 'run', return_value=process):
                self.assertTrue(m.build_active())
        with patch.object(m, 'run', return_value='buildkitd buildkitd\ndocker docker ps'):
            self.assertFalse(m.build_active())

    def test_prune_failure_stops_and_still_checks_inventory(self):
        cache = records(row(), row('b' * 25))
        report = {}
        with patch.object(m, 'local_root', return_value='/var/lib/docker'), \
             patch.object(m.shutil, 'disk_usage', return_value=SimpleNamespace(total=100, free=80)), \
             patch.object(m, 'build_active', return_value=False), \
             patch.object(m, 'inventory', return_value=cache) as inv, \
             patch.object(m, 'protected', return_value={}), \
             patch.object(m, 'health') as health, \
             patch.object(m, 'run', side_effect=RuntimeError('prune failed')) as command:
            with self.assertRaisesRegex(RuntimeError, 'prune failed'):
                m.maintain(True, report)
            self.assertEqual(command.call_count, 1)
            self.assertEqual(inv.call_count, 3)
            self.assertEqual(health.call_count, 2)

    def test_exclusive_lock_prevents_maintenance(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(m, 'STATE', Path(directory)), \
             patch.object(m.sys, 'argv', ['maintenance']), \
             patch.object(m, 'maintain') as maintain, \
             patch('builtins.print'):
            with (Path(directory) / 'maintenance.lock').open('a') as lock:
                m.fcntl.flock(lock, m.fcntl.LOCK_EX | m.fcntl.LOCK_NB)
                self.assertEqual(m.main(), 0)
            maintain.assert_not_called()

    def test_degraded_api_fails_health_check(self):
        with patch.object(m, 'run', return_value='aios-api\tUp 2 hours'), \
             patch.object(m.urllib.request, 'build_opener') as opener:
            opener.return_value.open.return_value = io.StringIO(json.dumps(
                dict(status='degraded', database='unreachable', dragonfly='ok')))
            with self.assertRaisesRegex(RuntimeError, 'health is not ready'):
                m.health()

    def test_only_owned_old_reports_are_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            owned = root / 'run-20260101T000000000000Z-12.json'
            other = root / 'run-important.json'
            owned.write_text('{}')
            other.write_text('{}')
            with patch.object(m.time, 'time', return_value=owned.stat().st_mtime + 91 * 86400):
                m.retain_reports(root)
            self.assertFalse(owned.exists())
            self.assertTrue(other.exists())


if __name__ == '__main__':
    unittest.main()
