from concurrent.futures import Future
import multiprocessing
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.execution import Cancelled
from content_production.framework_v2 import inference_slots as slots
from content_production.framework_v2.local_vlm import LocalVlm


def contender(root, ready, go, current, peak):
    os.environ[slots.LIMIT_ENV] = '2'
    ready.put(True)
    if not go.wait(10):
        raise TimeoutError('test start')
    with slots.acquire('http://localhost:8100/v1', root=root):
        with current.get_lock():
            current.value += 1
            peak.value = max(peak.value, current.value)
        time.sleep(.15)
        with current.get_lock():
            current.value -= 1


class InferenceSlotsTests(unittest.TestCase):
    def test_node_limit_is_shared_by_independent_processes(self):
        ctx = multiprocessing.get_context('spawn')
        ready, go = ctx.Queue(), ctx.Event()
        current, peak = ctx.Value('i', 0), ctx.Value('i', 0)
        with tempfile.TemporaryDirectory() as root:
            processes = [ctx.Process(target=contender, args=(root, ready, go, current, peak)) for _ in range(5)]
            try:
                for process in processes:
                    process.start()
                for _ in processes:
                    ready.get(timeout=15)
                go.set()
                for process in processes:
                    process.join(10)
                    self.assertEqual(process.exitcode, 0)
            finally:
                for process in processes:
                    if process.is_alive():
                        process.terminate()
                        process.join(5)
        self.assertEqual(peak.value, 2)
        self.assertEqual(current.value, 0)

    def test_wait_can_cancel_and_exception_releases_slot(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {slots.LIMIT_ENV: '1'}):
            def cancelled():
                raise Cancelled('lost lease')
            with slots.acquire('endpoint', root=root):
                with self.assertRaises(Cancelled), slots.acquire('endpoint', cancelled, root=root):
                    self.fail('cancelled waiter entered')
            with self.assertRaisesRegex(ValueError, 'failed'), slots.acquire('endpoint', root=root):
                raise ValueError('request failed')
            with slots.acquire('endpoint', root=root):
                pass

    def test_wait_deadline_is_bounded(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {slots.LIMIT_ENV: '1'}), \
                slots.acquire('endpoint', root=root), patch.object(slots, 'WAIT_SECONDS', 0):
            with self.assertRaises(TimeoutError), slots.acquire('endpoint', root=root):
                self.fail('occupied slot entered')

    def test_future_wait_keeps_heartbeats_and_propagates_cancellation(self):
        with patch.dict(os.environ, {'FRAMEWORK_V2_VLM_BASE_URL': 'http://localhost',
                                    'FRAMEWORK_V2_VLM_API_KEY': 'fixture-only'}):
            client = LocalVlm()
        future = Future()
        ticks = []
        def tick():
            ticks.append(True)
            if len(ticks) == 2:
                future.set_result('done')
        self.assertEqual(client._result(future, tick), 'done')
        self.assertEqual(len(ticks), 2)
        def cancelled():
            raise Cancelled('lost lease')
        with self.assertRaises(Cancelled):
            client._result(Future(), cancelled)
        self.assertTrue(client.cancelled.is_set())


if __name__ == '__main__':
    unittest.main()
