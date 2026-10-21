import multiprocessing
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import local_media_budget as budget
from content_production.segment_suggestion_provider import run_media

COMMAND = ['ffmpeg', '-i', 'in.mp4', '-c:v', 'libx264', 'out.mp4']


def hold_slot(home, queue):
    with patch.object(budget.sys, 'platform', 'darwin'), patch.object(budget.Path, 'home', return_value=Path(home)):
        with budget.media_slot(COMMAND, lambda: None, 10):
            start = time.monotonic()
            time.sleep(.15)
            queue.put((start, time.monotonic()))


class LocalMediaBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        for mocker in (patch.object(budget.sys, 'platform', 'darwin'),
                       patch.object(budget.Path, 'home', return_value=Path(self.temp.name))):
            mocker.start()
            self.addCleanup(mocker.stop)

    def test_cross_process_limit(self):
        # Independent interpreters must share slots, not just a thread semaphore.
        ctx = multiprocessing.get_context('spawn')
        queue = ctx.Queue()
        children = [ctx.Process(target=hold_slot, args=(self.temp.name, queue)) for _ in range(5)]
        try:
            for child in children:
                child.start()
            intervals = [queue.get(timeout=15) for _ in children]
            events = sorted([(a, 1) for a, _ in intervals] + [(b, -1) for _, b in intervals])
            active = peak = 0
            for _, delta in events:
                active += delta
                peak = max(peak, active)
            self.assertLessEqual(peak, 2)
            for child in children:
                child.join(5)
                self.assertEqual(child.exitcode, 0)
        finally:
            for child in children:
                if child.is_alive():
                    child.terminate()
                    child.join(5)
            queue.close()

    def test_wait_timeout_ticks_and_cancel(self):
        ticks = []
        with budget.media_slot(COMMAND, lambda: None, 1), budget.media_slot(COMMAND, lambda: None, 1):
            with self.assertRaisesRegex(TimeoutError, 'slot wait'):
                with budget.media_slot(COMMAND, lambda: ticks.append(1), .15):
                    self.fail('third command acquired a slot')
            self.assertGreaterEqual(len(ticks), 2)
            def cancel():
                raise RuntimeError('cancelled')
            with self.assertRaisesRegex(RuntimeError, 'cancelled'):
                with budget.media_slot(COMMAND, cancel, 1):
                    self.fail('cancelled command acquired a slot')

    def test_spawn_failure_releases_slot(self):
        with patch('content_production.segment_suggestion_provider.subprocess.Popen', side_effect=OSError('spawn failed')):
            with self.assertRaises(OSError):
                run_media(COMMAND, {}, lambda: None, 1)
        with budget.media_slot(COMMAND, lambda: None, 1), budget.media_slot(COMMAND, lambda: None, 1):
            pass

    def test_non_mac_and_non_ffmpeg_unchanged(self):
        with patch.object(budget.sys, 'platform', 'linux'):
            with budget.media_slot(COMMAND, lambda: None, 1) as result:
                self.assertEqual(result, COMMAND)
        with budget.media_slot(['ffprobe', 'in.mp4'], lambda: None, 1) as result:
            self.assertEqual(result, ['ffprobe', 'in.mp4'])

    def test_real_ffmpeg_single_and_multi_input(self):
        for inputs, filters in ((['-f', 'lavfi', '-i', 'color=size=32x32:rate=5'], []),
                (['-f', 'lavfi', '-i', 'color=size=32x32:rate=5',
                  '-f', 'lavfi', '-i', 'color=size=32x32:rate=5'],
                 ['-filter_complex', '[0:v][1:v]hstack[out]', '-map', '[out]'])):
            output = Path(self.temp.name) / 'smoke.mp4'
            command = ['ffmpeg', '-v', 'error', '-y', *inputs, *filters,
                       '-frames:v', '2', '-c:v', 'libx264', str(output)]
            with tempfile.TemporaryFile() as errors:
                code = run_media(command, dict(os.environ), lambda: None, 10, stderr=errors, poll_seconds=.05)
                errors.seek(0)
                self.assertEqual(code, 0, errors.read().decode())
            probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                    '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', str(output)],
                                   check=True, capture_output=True, text=True)
            self.assertEqual(probe.stdout.strip(), '2')


if __name__ == '__main__':
    unittest.main()
