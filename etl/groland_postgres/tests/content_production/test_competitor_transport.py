import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis.transport import StorageCircuit
from content_production.competitor_analysis import worker


class CircuitTest(unittest.TestCase):
    def test_no_claim_during_outage_and_only_one_probe_after_cooldown(self):
        now = [0]
        gate = StorageCircuit(clock=lambda: now[0])
        store = Mock()
        self.assertTrue(gate.allowed(store))
        store.object_exists.assert_not_called()
        gate.trip('raw')
        self.assertFalse(gate.allowed(store))
        now[0] = 60
        entered, release = threading.Event(), threading.Event()
        def probe(_):
            entered.set()
            if not release.wait(2): raise AssertionError('probe never released')
            return True
        store.object_exists.side_effect = probe
        results = []
        thread = threading.Thread(target=lambda: results.append(gate.allowed(store)))
        thread.start()
        self.assertTrue(entered.wait(2))
        self.assertFalse(gate.allowed(store))
        store.object_exists.assert_called_once()
        release.set(); thread.join()
        self.assertEqual(results, [True])
        self.assertTrue(gate.allowed(store))
        store.object_exists.assert_called_once()

    def test_failed_probe_keeps_gate_closed_and_concurrent_failure_wins(self):
        now = [0]
        gate = StorageCircuit(clock=lambda: now[0])
        gate.trip('raw')
        now[0] = 60
        store = Mock()
        store.object_exists.side_effect = RuntimeError('still offline')
        self.assertFalse(gate.allowed(store))
        self.assertEqual(gate.retry_at, 120)
        now[0] = 120
        def races(_): gate.trip('newer failure')
        store.object_exists.side_effect = races
        self.assertFalse(gate.allowed(store))
        self.assertIsNotNone(gate.key)

    def test_worker_does_not_claim_when_circuit_is_open(self):
        gate = StorageCircuit()
        gate.trip('raw')
        with patch.object(worker, 'enabled', return_value=True), \
                patch.object(worker, 'STORAGE_CIRCUIT', gate), patch.object(worker, 'connect_pg') as db:
            self.assertEqual(worker.process_one(storage_factory=Mock)['status'], 'waiting_network')
        db.assert_not_called()


if __name__ == '__main__': unittest.main()
