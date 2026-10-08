import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import remix_mediakit, remix_normalization as rn
from content_production.execution import Cancelled
from content_production.inspection import inspect_output
from content_production.worker import remix_normalization_applies


def ffmpeg(*arguments):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *arguments], check=True, timeout=120)


def loudness(file, start=None, duration=None):
    window = ([] if start is None else ["-ss", str(start)]) + ([] if duration is None else ["-t", str(duration)])
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *window, "-i", str(file), "-map", "0:a:0",
                             "-af", "ebur128=peak=true:framelog=verbose", "-f", "null", "-"],
                            capture_output=True, text=True, timeout=120, check=True)
    integrated = float(re.findall(r"I:\s*(-?[0-9.]+) LUFS", result.stderr)[-1])
    peak = float(re.findall(r"Peak:\s*(-?[0-9.]+) dBFS", result.stderr)[-1])
    return integrated, peak


class SettingsTests(unittest.TestCase):
    def test_defaults(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            settings = rn.Settings.from_env()
        self.assertEqual((settings.segment_target_lufs, settings.max_gain_db, settings.target_lufs,
                          settings.true_peak_dbtp, settings.video_bitrate, settings.audio_bitrate),
                         (-16.0, 12.0, -14.0, -1.0, "6M", "128k"))

    def test_env_overrides_and_rejections(self):
        with mock.patch.dict(os.environ, {"CONTENT_PRODUCTION_REMIX_OUTPUT_LUFS": "-16",
                                          "CONTENT_PRODUCTION_REMIX_VIDEO_BITRATE": "4.5M",
                                          "CONTENT_PRODUCTION_REMIX_X264_PRESET": "fast"}, clear=True):
            settings = rn.Settings.from_env()
        self.assertEqual((settings.target_lufs, settings.video_bitrate, settings.x264_preset), (-16.0, "4.5M", "fast"))
        for name, value in (("CONTENT_PRODUCTION_REMIX_OUTPUT_LUFS", "loud"),
                            ("CONTENT_PRODUCTION_REMIX_OUTPUT_LUFS", "-2"),
                            ("CONTENT_PRODUCTION_REMIX_OUTPUT_TRUE_PEAK", "nan"),
                            ("CONTENT_PRODUCTION_REMIX_VIDEO_BITRATE", "6 Mbps"),
                            ("CONTENT_PRODUCTION_REMIX_VIDEO_BITRATE", "9M"),  # above default maxrate
                            ("CONTENT_PRODUCTION_REMIX_AUDIO_BITRATE", "8k"),
                            ("CONTENT_PRODUCTION_REMIX_X264_PRESET", "placebo;rm"),
                            ("CONTENT_PRODUCTION_REMIX_NORMALIZE_TIMEOUT_SECONDS", "5")):
            with self.subTest(name=name, value=value), mock.patch.dict(os.environ, {name: value}, clear=True):
                with self.assertRaises(ValueError):
                    rn.Settings.from_env()


class GainTests(unittest.TestCase):
    settings = rn.Settings()

    def test_gain_moves_towards_target_and_is_clamped(self):
        self.assertEqual(rn.clip_gain_db(-20.0, self.settings), 4.0)
        self.assertEqual(rn.clip_gain_db(-10.5, self.settings), -5.5)
        self.assertEqual(rn.clip_gain_db(-45.0, self.settings), 12.0)
        self.assertEqual(rn.clip_gain_db(5.0, self.settings), -12.0)

    def test_silent_or_unmeasurable_audio_is_left_untouched(self):
        for value in (None, float("-inf"), float("nan"), -70.0, -80.0):
            self.assertEqual(rn.clip_gain_db(value, self.settings), 0.0)

    def test_parse_integrated_reads_the_summary(self):
        text = "[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -19.4 LUFS\n    Threshold: -29.6 LUFS\n"
        self.assertEqual(rn.parse_integrated(text), -19.4)
        self.assertIsNone(rn.parse_integrated("  Integrated loudness:\n    I:         -inf LUFS\n"))
        with self.assertRaises(rn.NormalizationError):
            rn.parse_integrated("no summary")

    def test_commands_are_argument_lists_on_the_frame_grid(self):
        command = rn.measure_command(Path("/w/source-0.mp4"), 12345, 45)
        self.assertEqual(command[:4], ["-ss", "12.345", "-t", "1.500000"])
        self.assertIn("ebur128=framelog=verbose", command)
        clips = [{"renderedFrames": 30, "linearGain": 2.0}, {"renderedFrames": 45, "linearGain": 0.5},
                 {"renderedFrames": 10, "linearGain": 1.0}]
        graph = rn.gain_filter(clips)
        self.assertIn("asetnsamples=n=160", graph)
        self.assertIn("if(lt(t,0.999990),2.000000,if(lt(t,2.499990),0.500000,1.000000))", graph)
        self.assertTrue(rn.gain_filter(clips[:1]).endswith("volume=volume='2.000000':eval=frame"))
        encode = rn.encode_command(Path("in.mp4"), Path("out.mp4"), {"width": 1080, "height": 1920},
                                   self.settings, "anull")
        for flag, value in (("-b:v", "6M"), ("-maxrate", "7.5M"), ("-bufsize", "12M"), ("-c:a", "aac"),
                            ("-b:a", "128k"), ("-ar", "48000"), ("-ac", "2"), ("-movflags", "+faststart"),
                            ("-pix_fmt", "yuv420p"), ("-fps_mode", "passthrough")):
            self.assertEqual(encode[encode.index(flag) + 1], value)
        self.assertNotIn("-af", rn.encode_command(Path("in.mp4"), Path("out.mp4"),
                                                  {"width": 1080, "height": 1920}, self.settings, None))

    def test_loudnorm_second_pass_uses_measured_values(self):
        measured = {"input_i": "-20.1", "input_tp": "-3.2", "input_lra": "4.0", "input_thresh": "-30.5",
                    "target_offset": "0.3"}
        graph = rn.loudnorm_filter(rn.Settings(), measured)
        self.assertIn("measured_I=-20.10:measured_TP=-3.20:measured_LRA=4.00:measured_thresh=-30.50:offset=0.30:linear=true", graph)
        self.assertEqual(rn.parse_loudnorm("x\n{\n" + ",".join(f'"{k}": "{v}"' for k, v in measured.items()) + "\n}\n")["input_i"], "-20.1")
        silent = '{"input_i": "-inf", "input_tp": "-inf", "input_lra": "0.00", "input_thresh": "-70.00", "target_offset": "inf"}'
        with self.assertRaises(rn.NormalizationError):
            rn.parse_loudnorm(silent)
        self.assertIsNone(rn.parse_loudnorm(silent, allow_silent=True))
        with self.assertRaises(rn.NormalizationError):
            rn.parse_loudnorm(silent.replace('"input_i": "-inf"', '"input_i": "-20"'), allow_silent=True)

    def test_only_final_framework_remix_renders_apply(self):
        job = {"preview": False, "snapshot": {"clips": []}}
        self.assertTrue(remix_normalization_applies(job, {"task_type": "framework_remix"}))
        self.assertFalse(remix_normalization_applies(job, {"task_type": "picture_remix"}))
        self.assertFalse(remix_normalization_applies(job, None))
        self.assertFalse(remix_normalization_applies({**job, "preview": True}, {"task_type": "framework_remix"}))
        self.assertFalse(remix_normalization_applies({"preview": False, "snapshot": {"editDocument": {}}},
                                                     {"task_type": "framework_remix"}))


class RealMediaTests(unittest.TestCase):
    """Two sources 12 dB apart, concatenated like the renderer, then normalized."""

    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="aios-remix-norm-")
        root = Path(cls.folder.name)
        cls.quiet, cls.loud, cls.mute = root / "quiet.mp4", root / "loud.mp4", root / "mute.mp4"
        for file, volume, color in ((cls.quiet, "0.25", "0x3050a0"), (cls.loud, "1.0", "0xa05030")):
            ffmpeg("-f", "lavfi", "-i", f"testsrc2=size=540x960:rate=30:duration=6,drawbox=c={color}:t=40",
                   "-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:duration=6:seed=7",
                   "-filter_complex", f"[1:a]volume={volume},aformat=channel_layouts=stereo[a]",
                   "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                   "-ar", "48000", str(file))
        ffmpeg("-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=6", "-c:v", "libx264",
               "-pix_fmt", "yuv420p", str(cls.mute))
        cls.snapshot = {"aspect": "portrait", "outputProfile": "hd_1080_v1",
                        "assets": [{"assetId": "q", "sha256": "a" * 64}, {"assetId": "l", "sha256": "b" * 64}],
                        "clips": [{"id": "slot-1", "assetId": "q", "startMs": 500, "endMs": 4500, "volume": 1.0},
                                  {"id": "slot-2", "assetId": "l", "startMs": 1000, "endMs": 5000, "volume": 1.0}]}
        cls.media = {"q": cls.quiet, "l": cls.loud}
        # Stand-in for the renderer output: the same windows, scaled onto the canvas.
        cls.rendered = root / "render" / "video.mp4"
        cls.rendered.parent.mkdir()
        ffmpeg("-ss", "0.5", "-t", "4", "-i", str(cls.quiet), "-ss", "1", "-t", "4", "-i", str(cls.loud),
               "-filter_complex", "[0:v]scale=1080:1920,setsar=1[v0];[1:v]scale=1080:1920,setsar=1[v1];"
               "[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]", "-r", "30",
               "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "320k", "-ar", "48000", str(cls.rendered))

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def receipt(self):
        digest = hashlib.sha256(self.rendered.read_bytes()).hexdigest()
        return {"status": "completed", "preview": False, "output": {"file": "video.mp4", "sha256": digest},
                "assets": [{"id": "aq", "sha256": "a" * 64}, {"id": "al", "sha256": "b" * 64}]}

    def test_measure_normalize_and_inspect_final_bytes(self):
        settings = rn.Settings()
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            work = Path(scratch)
            clips = rn.measure_clips(self.snapshot, self.media, settings, work, lambda: None)
            self.assertEqual([c["status"] for c in clips], ["measured", "measured"])
            self.assertGreater(clips[0]["gainDb"], clips[1]["gainDb"])
            before_quiet, _ = loudness(self.rendered, 0.5, 3)
            before_loud, _ = loudness(self.rendered, 4.5, 3)
            receipt = self.receipt()
            renderer_sha = receipt["output"]["sha256"]
            video, receipt = rn.finalize(self.rendered, receipt, self.snapshot, clips, settings, work, lambda: None)
            after_quiet, _ = loudness(video, 0.5, 3)
            after_loud, _ = loudness(video, 4.5, 3)
            overall, peak = loudness(video)
            record = receipt["host_output_normalization"]
            self.assertGreater(abs(before_loud - before_quiet), 10)
            self.assertLess(abs(after_loud - after_quiet), 2)
            self.assertLess(abs(overall - settings.target_lufs), 1.5)
            self.assertLess(peak, 0)
            self.assertEqual(record["rendererOutput"]["sha256"], renderer_sha)
            self.assertEqual(receipt["output"]["sha256"], hashlib.sha256(video.read_bytes()).hexdigest())
            self.assertEqual(record["output"]["videoFrames"], 240)
            self.assertEqual(record["segmentLoudness"]["clips"], clips)
            self.assertIn(record["loudnorm"]["normalizationType"], ("linear", "dynamic"))
            probe = rn.probe(video, work)
            streams = {s["codec_type"]: s for s in probe["streams"]}
            self.assertEqual((streams["video"]["codec_name"], streams["video"]["width"], streams["video"]["height"],
                              streams["video"]["pix_fmt"], streams["video"]["avg_frame_rate"]),
                             ("h264", 1080, 1920, "yuv420p", "30/1"))
            self.assertEqual((streams["audio"]["codec_name"], streams["audio"]["sample_rate"], streams["audio"]["channels"]),
                             ("aac", "48000", 2))
            self.assertLess(int(streams["video"]["bit_rate"]), 7_500_000 * 1.1)
            self.assertGreater(int(streams["video"]["bit_rate"]), 2_000_000)
            self.assertLess(abs(int(streams["audio"]["bit_rate"]) - 128_000), 16_000)
            # Technical inspection now describes the delivered bytes.
            inspection = inspect_output(video, self.snapshot, False, receipt, lambda: None)
            self.assertEqual(inspection["sha256"], receipt["output"]["sha256"])
            self.assertAlmostEqual(inspection["durationSeconds"], 8.0, delta=1 / 30)
            json.dumps(receipt)

    def test_cloud_render_keeps_video_bytes_and_only_normalizes_audio(self):
        """MediaKit output: canvas-sized H.264 with 44.1 kHz audio; video is copied, audio fixed to 48 kHz/-14 LUFS."""
        settings = rn.Settings()
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            work = Path(scratch)
            cloud = work / "cloud.mp4"
            ffmpeg("-i", str(self.rendered), "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac",
                   "-ar", "44100", str(cloud))
            digest = hashlib.sha256(cloud.read_bytes()).hexdigest()
            receipt = {**self.receipt(), "engine": remix_mediakit.ENGINE,
                       "output": {"file": "video.mp4", "sha256": digest}}
            clips = rn.measure_rendered_clips(cloud, self.snapshot, settings, work, lambda: None)
            self.assertEqual([c["measuredOn"] for c in clips], ["rendered_output"] * 2)
            self.assertEqual([c["renderedFrames"] for c in clips], [120, 120])
            self.assertGreater(clips[0]["gainDb"], clips[1]["gainDb"])  # quiet window boosted more
            video, receipt = rn.finalize(cloud, receipt, self.snapshot, clips, settings, work, lambda: None,
                                         copy_video=True)
            video_md5 = lambda file: subprocess.run(["ffmpeg", "-v", "error", "-i", str(file), "-map", "0:v", "-c", "copy",
                                                     "-f", "md5", "-"], capture_output=True, text=True, check=True).stdout
            self.assertEqual(video_md5(video), video_md5(cloud))
            streams = {s["codec_type"]: s for s in rn.probe(video, work)["streams"]}
            self.assertEqual((streams["audio"]["sample_rate"], streams["audio"]["channels"]), ("48000", 2))
            overall, _ = loudness(video)
            self.assertLess(abs(overall - settings.target_lufs), 1.5)
            self.assertEqual(receipt["host_output_normalization"]["encode"]["videoCodec"], "copy")
            inspection = inspect_output(video, self.snapshot, False, receipt, lambda: None)
            self.assertEqual(inspection["sha256"], receipt["output"]["sha256"])

    def test_cloud_render_with_wrong_canvas_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            work = Path(scratch)
            small = work / "small.mp4"
            ffmpeg("-i", str(self.rendered), "-vf", "scale=540:960", "-c:v", "libx264", "-preset", "ultrafast",
                   "-c:a", "copy", str(small))
            receipt = {**self.receipt(), "output": {"file": "video.mp4",
                                                     "sha256": hashlib.sha256(small.read_bytes()).hexdigest()}}
            with self.assertRaises(rn.NormalizationError):
                rn.finalize(small, receipt, self.snapshot, [], rn.Settings(), work, lambda: None, copy_video=True)

    def test_source_without_audio_is_not_measured(self):
        snapshot = {"clips": [{"id": "slot-1", "assetId": "m", "startMs": 0, "endMs": 2000, "volume": 1.0}]}
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            clips = rn.measure_clips(snapshot, {"m": self.mute}, rn.Settings(), Path(scratch), lambda: None)
        self.assertEqual((clips[0]["status"], clips[0]["gainDb"], clips[0]["integratedLufs"]), ("no_audio", 0.0, None))

    def test_silent_source_window_keeps_unity_gain(self):
        silent = Path(self.folder.name) / "silent.mp4"
        ffmpeg("-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=3", "-f", "lavfi",
               "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p",
               "-c:a", "aac", str(silent))
        snapshot = {"clips": [{"id": "slot-1", "assetId": "s", "startMs": 0, "endMs": 2000, "volume": 1.0}]}
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            clips = rn.measure_clips(snapshot, {"s": silent}, rn.Settings(), Path(scratch), lambda: None)
        self.assertEqual((clips[0]["status"], clips[0]["gainDb"]), ("silent", 0.0))

    def test_all_silent_rendered_audio_keeps_track_without_loudnorm(self):
        rendered = Path(self.folder.name) / "silent-render" / "video.mp4"
        rendered.parent.mkdir()
        ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=2", "-f", "lavfi",
               "-i", "anullsrc=r=48000:cl=stereo", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast",
               "-pix_fmt", "yuv420p", "-c:a", "aac", str(rendered))
        receipt = {"status": "completed", "preview": False,
                   "output": {"file": "video.mp4", "sha256": hashlib.sha256(rendered.read_bytes()).hexdigest()}}
        clips = [{"renderedFrames": 60, "linearGain": 1.0}]
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            video, receipt = rn.finalize(rendered, receipt, {"aspect": "portrait", "outputProfile": "hd_1080_v1"},
                                         clips, rn.Settings(), Path(scratch), lambda: None)
            record = receipt["host_output_normalization"]
            self.assertEqual(record["loudnorm"]["status"], "silent")
            self.assertEqual((record["output"]["videoFrames"], receipt["output"]["audio"]), (60, True))
            self.assertEqual(receipt["output"]["sha256"], hashlib.sha256(video.read_bytes()).hexdigest())

    def test_changed_renderer_output_and_cancellation_fail_closed(self):
        receipt = self.receipt()
        receipt["output"]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            with self.assertRaises(rn.NormalizationError):
                rn.finalize(self.rendered, receipt, self.snapshot, [], rn.Settings(), Path(scratch), lambda: None)
        calls = 0

        def tick():
            nonlocal calls
            calls += 1
            if calls >= 3:
                raise Cancelled("fixture cancellation")
        clips = [{"renderedFrames": 120, "linearGain": 1.0}, {"renderedFrames": 120, "linearGain": 1.0}]
        with tempfile.TemporaryDirectory(dir=self.folder.name) as scratch:
            with self.assertRaises(Cancelled):
                rn.finalize(self.rendered, self.receipt(), self.snapshot, clips, rn.Settings(), Path(scratch), tick)


if __name__ == "__main__":
    unittest.main()
