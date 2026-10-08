import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_shot_hints as hints
from content_production.execution import Cancelled

SETTINGS = {'enabled': True, 'threshold': 0.3, 'windowSeconds': 5}


class StatisticsTests(unittest.TestCase):
    def test_windows_count_half_open_and_drop_flash_cuts(self):
        stats = hints.summarize([0, 100, 4999, 5000, 5100, 12000, 19900, 25000], 20000, 5000)
        # 0/100 are within 250ms of the start, 5100 is a flash after 5000, 19900 is within 250ms of the end.
        self.assertEqual(stats['cuts'], [4999, 12000])
        self.assertEqual(stats['counts'], [1, 0, 1, 0])
        self.assertEqual(stats['effectiveWindowMs'], 5000)

    def test_quiet_spans_keep_longest_in_time_order(self):
        cuts = [7000, 8000, 30000, 31000, 45000, 46000, 60000, 61000, 70000]
        stats = hints.summarize(cuts, 100000, 5000)
        # Spans >= 6s: 0-7, 8-30, 31-45, 46-60, 61-70, 70-100; the five longest in time order.
        self.assertEqual(stats['quietSpans'], [(8000, 30000), (31000, 45000), (46000, 60000), (61000, 70000), (70000, 100000)])

    def test_no_cuts(self):
        stats = hints.summarize([], 12345, 5000)
        self.assertEqual((stats['cuts'], stats['counts'], stats['quietSpans']), ([], [0, 0, 0], [(0, 12345)]))
        text = hints.format_hint(stats, 0.3)
        self.assertIn('共 0 个切点', text)
        self.assertIn('全片未检测到镜头切换', text)

    def test_tail_cuts_and_very_short_video(self):
        # Cuts at or past the end (detector/probe mismatch) never create an extra window.
        stats = hints.summarize([9800, 10000, 10500], 10000, 3000)
        self.assertEqual((stats['cuts'], stats['counts']), ([], [0, 0, 0, 0]))
        stats = hints.summarize([200, 500], 800, 5000)
        self.assertEqual((stats['cuts'], stats['counts'], stats['quietSpans']), ([500], [1], []))
        self.assertIn('0-0.8s:1', hints.format_hint(stats, 0.3))
        with self.assertRaises(ValueError):
            hints.summarize([], 0, 5000)

    def test_long_video_merges_windows(self):
        cuts = list(range(1000, 600000, 2000))
        stats = hints.summarize(cuts, 600000, 5000)
        # 120 five-second windows exceed MAX_WINDOWS=60 -> merged into 10-second windows.
        self.assertEqual(stats['effectiveWindowMs'], 10000)
        self.assertEqual(len(stats['counts']), 60)
        self.assertEqual(sum(stats['counts']), len(stats['cuts']))
        text = hints.format_hint(stats, 0.3)
        self.assertIn('每 10 秒切点数（片长较长，已按每 5 秒窗口合并）', text)
        self.assertIn('没有超过 6 秒的连续无切换区间', text)
        self.assertLessEqual(len(text), hints.MAX_HINT_CHARS)

    def test_hint_format_and_truncation(self):
        stats = hints.summarize([12800, 48800, 50000], 52400, 5000)
        text = hints.format_hint(stats, 0.3)
        self.assertEqual(text.splitlines()[0], '镜头切换统计（本地画面检测，场景阈值 0.3）：全片 52.4s，共 3 个切点，平均每分钟 3.4 个。')
        self.assertIn('每 5 秒切点数：0-5s:0, 5-10s:0, 10-15s:1,', text)
        self.assertIn('50-52.4s:1', text)
        self.assertIn('0–12.8s(12.8s)、12.8–48.8s(36.0s)', text)
        with patch.object(hints, 'MAX_HINT_CHARS', 180):
            short = hints.format_hint(stats, 0.3)
        self.assertLessEqual(len(short), 180)
        self.assertIn('个窗口省略', short)
        self.assertIn('12.8–48.8s(36.0s)', short)

    def test_settings_validation(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(hints.settings_from_env(), SETTINGS)
        for name, value in ((hints.THRESHOLD_ENV, '1.5'), (hints.THRESHOLD_ENV, 'nan'), (hints.WINDOW_ENV, '0'),
                            (hints.WINDOW_ENV, '2.5'), (hints.ENABLED_ENV, 'yes')):
            with self.subTest(name=name, value=value), patch.dict(os.environ, {name: value}, clear=True):
                with self.assertRaises(ValueError):
                    hints.settings_from_env()
        with patch.dict(os.environ, {hints.ENABLED_ENV: '0', hints.THRESHOLD_ENV: '0.4', hints.WINDOW_ENV: '10'}, clear=True):
            self.assertEqual(hints.settings_from_env(), {'enabled': False, 'threshold': 0.4, 'windowSeconds': 10})

    def test_command_reuses_shot_catalog_filter(self):
        command = hints.detection_command(Path('/w/proxy.mp4'), 0.3)
        self.assertEqual(command[command.index('-vf') + 1], 'select=gt(scene\\,0.3),showinfo')
        self.assertEqual(command[-3:], ['-f', 'null', '-'])
        self.assertIn('/w/proxy.mp4', command)
        self.assertNotIn('-v', command)  # showinfo needs the default info log level


class DetectTests(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix='shot-hints-'))
        self.addCleanup(shutil.rmtree, self.work, True)

    def test_disabled_does_not_run_ffmpeg(self):
        with patch.object(hints, 'run_media') as run:
            hint, summary = hints.detect(self.work / 'p.mp4', 10000, {**SETTINGS, 'enabled': False}, {}, lambda: None,
                                         self.work / 'log')
        run.assert_not_called()
        self.assertIsNone(hint)
        self.assertEqual(summary['status'], 'disabled')

    def test_failures_degrade_without_raising(self):
        cases = ((lambda *a, **k: 1, 'shot_detection_failed'),
                 (lambda *a, **k: (_ for _ in ()).throw(TimeoutError()), 'shot_detection_timeout'),
                 (lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError()), 'shot_detection_failed'))
        for fake, warning in cases:
            with self.subTest(warning=warning), patch.object(hints, 'run_media', fake):
                hint, summary = hints.detect(self.work / 'p.mp4', 10000, SETTINGS, {}, lambda: None, self.work / 'log')
            self.assertIsNone(hint)
            self.assertEqual((summary['status'], summary['warning']), ('failed', warning))
            self.assertFalse((self.work / 'log').exists())

    def test_cancellation_propagates(self):
        def cancelled(*_args, **_kwargs):
            raise Cancelled('lease lost')
        with patch.object(hints, 'run_media', cancelled), self.assertRaises(Cancelled):
            hints.detect(self.work / 'p.mp4', 10000, SETTINGS, {}, lambda: None, self.work / 'log')

    @unittest.skipUnless(shutil.which('ffmpeg'), 'local FFmpeg required')
    def test_actual_hard_cuts_are_counted(self):
        video = self.work / 'cuts.mp4'
        # Three 4-second colour blocks: hard cuts at 4s and 8s.
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=160x284:r=15:d=4',
                        '-f', 'lavfi', '-i', 'color=blue:s=160x284:r=15:d=4', '-f', 'lavfi', '-i', 'color=green:s=160x284:r=15:d=4',
                        '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        str(video)], check=True, timeout=60)
        ticks = []
        hint, summary = hints.detect(video, 12000, SETTINGS, dict(os.environ), lambda: ticks.append(1), self.work / 'log')
        self.assertEqual(summary['status'], 'ok')
        self.assertEqual(summary['cutCount'], 2)
        self.assertEqual(summary['windowCount'], 3)
        self.assertTrue(ticks)
        self.assertIn('每 5 秒切点数：0-5s:1, 5-10s:1, 10-12s:0', hint)
        self.assertEqual(summary['hintChars'], len(hint))
        self.assertFalse((self.work / 'log').exists())


if __name__ == '__main__':
    unittest.main()


class BoundaryRefineTests(unittest.TestCase):
    def test_parse_scored_cuts_pairs_metadata_times_with_scores(self):
        log = ('[Parsed_metadata_2 @ 0x1] frame:0    pts:45     pts_time:1.5\n'
               '[Parsed_metadata_2 @ 0x1] lavfi.scene_score=0.412\n'
               '[Parsed_showinfo_3 @ 0x2] n:0 pts_time:9.9\n'
               '[Parsed_metadata_2 @ 0x1] frame:1    pts:60     pts_time:2.0\n'
               '[Parsed_metadata_2 @ 0x1] lavfi.scene_score=0.25\n')
        self.assertEqual(hints.parse_scored_cuts(log, 1000), [(2500, 0.412), (3000, 0.25)])

    def test_parse_scored_cuts_floors_so_the_cut_frame_starts_the_next_segment(self):
        # 30 fps frame at 0.796667 s: rounding would give 797 ms, after the frame, so a [start, end) trim
        # would end the previous segment with the next shot's first frame.
        log = ('[Parsed_metadata_2 @ 0x1] frame:23   pts:12236  pts_time:0.796667\n'
               '[Parsed_metadata_2 @ 0x1] lavfi.scene_score=0.61\n')
        self.assertEqual(hints.parse_scored_cuts(log, 107570), [(108366, 0.61)])

    def test_snap_env_is_validated(self):
        with patch.dict(os.environ, {hints.SNAP_ENV: ''}):
            self.assertTrue(hints.snap_enabled_from_env())
        with patch.dict(os.environ, {hints.SNAP_ENV: '0'}):
            self.assertFalse(hints.snap_enabled_from_env())
        with patch.dict(os.environ, {hints.SNAP_ENV: 'yes'}):
            with self.assertRaises(ValueError):
                hints.snap_enabled_from_env()

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg required')
    def test_refine_finds_the_frame_accurate_cut_near_a_late_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder) / 'cut.mp4'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=160x284:rate=30:duration=3',
                            '-f', 'lavfi', '-i', 'color=blue:size=160x284:rate=30:duration=3', '-filter_complex',
                            '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(video)],
                           check=True)
            env, log = dict(os.environ), Path(folder) / 'log'
            self.assertEqual([cut for cut, _ in hints.refine_cuts(video, 3250, env, lambda: None, log)], [3000])
            self.assertEqual(hints.refine_cuts(video, 1500, env, lambda: None, log), [])
            self.assertFalse(log.exists())

