"""Real local FFmpeg defect fixtures; no renderer, cloud, model or database calls."""
import copy
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import remix_qc as qc, remix_qc_media as media
from content_production.execution import Cancelled, file_hash

FFMPEG = shutil.which("ffmpeg-full") or shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe-full") or shutil.which("ffprobe")


@unittest.skipUnless(FFMPEG and FFPROBE, "requires local FFmpeg and ffprobe")
class RemixQcMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.env = patch.dict(os.environ, {"CONTENT_PRODUCTION_FFMPEG": FFMPEG, "CONTENT_PRODUCTION_FFPROBE": FFPROBE})
        cls.env.start()
        cls.normal = cls.root / "normal.mp4"
        cls.make(["-f", "lavfi", "-i", "testsrc2=size=160x288:rate=30:duration=4",
                  "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000:duration=4",
                  "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"], cls.normal)
        cls.frozen = cls.root / "frozen.mp4"
        cls.make(["-i", str(cls.normal), "-filter_complex", "[0:v]split[a][b];[a][b]freezeframes=first=30:last=38:replace=30[v]",
                  "-map", "[v]", "-map", "0:a",
                  "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy"], cls.frozen)
        cls.shifted = cls.root / "shifted.mp4"
        cls.make(["-i", str(cls.normal), "-itsoffset", "0.2", "-i", str(cls.normal),
                  "-map", "0:v", "-map", "1:a", "-c", "copy"], cls.shifted)
        cls.gap = cls.root / "gap.mp4"
        cls.make(["-i", str(cls.normal), "-vf", "setpts=PTS+if(gte(N\\,30)\\,0.2/TB\\,0)",
                  "-fps_mode", "vfr", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy"], cls.gap)
        cls.duplicate = cls.root / "duplicate.mp4"
        cls.make(["-i", str(cls.normal), "-filter_complex",
                  "[0:v]split=2[a][b];[a]trim=duration=2,setpts=PTS-STARTPTS[c];"
                  "[b]trim=duration=2,setpts=PTS-STARTPTS[d];[c][d]concat=n=2:v=1:a=0[v]",
                  "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy"], cls.duplicate)

    @classmethod
    def tearDownClass(cls):
        cls.env.stop()
        cls.tmp.cleanup()

    @staticmethod
    def make(args, output):
        subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-y", *args, str(output)],
                       check=True, capture_output=True, timeout=30)

    def review(self, video, source=None, duplicate=False, resolve=None):
        source = source or self.normal
        clips = [{"id": "c1", "assetId": "a1", "startMs": 0, "endMs": 4000}]
        assets = [{"assetId": "a1", "sha256": file_hash(source)}]
        if duplicate:
            clips[0]["endMs"] = 2000
            clips.append({"id": "c2", "assetId": "a2", "startMs": 0, "endMs": 2000})
            assets.append({"assetId": "a2", "sha256": file_hash(source)})
        snapshot = {"clips": clips, "assets": assets}
        digest = file_hash(video)
        receipt = {"host_inspection": {"status": "passed", "sha256": digest},
                   "host_output_normalization": {"output": {"sha256": digest, "videoFrames": 120},
                       "segmentLoudness": {"clips": [{"clipId": c["id"], "assetId": c["assetId"],
                           "sourceStartMs": 0, "renderedFrames": c["endMs"] * 30 // 1000} for c in clips]}}}
        before = copy.deepcopy(snapshot)
        with tempfile.TemporaryDirectory(dir=self.root) as scratch:
            report = qc.review(snapshot, video, receipt, Path(scratch), lambda: None, resolve or (lambda _: source),
                               lambda: {"status": "passed", "checkedSegments": len(clips)})
        self.assertEqual(snapshot, before)
        receipt["host_remix_qc"] = report
        self.assertEqual(qc.delivery_reason(snapshot, receipt) is None, report["status"] == "passed")
        return report, receipt

    def test_normal_moving_sample_passes(self):
        report, _ = self.review(self.normal)
        self.assertEqual(report["status"], "passed", report)
        self.assertEqual(report["checks"]["freeze"]["events"], [])

    def test_inserted_point_three_second_freeze_blocks(self):
        report, _ = self.review(self.frozen)
        self.assertEqual(report["status"], "failed", report)
        check = report["checks"]["freeze"]
        self.assertEqual(check["status"], "failed")
        self.assertGreaterEqual(check["events"][0]["endMs"] - check["events"][0]["startMs"], 300)

    def test_same_position_already_static_in_source_is_exempt(self):
        report, _ = self.review(self.frozen, source=self.frozen)
        self.assertEqual(report["status"], "passed", report)
        self.assertTrue(report["checks"]["freeze"]["events"][0]["sourceExempt"])

    def test_exact_point_two_second_tail_freeze_blocks(self):
        tail = self.root / 'tail.mp4'
        self.make(['-i', str(self.normal), '-filter_complex',
                   '[0:v]split[a][b];[a][b]freezeframes=first=114:last=119:replace=114[v]',
                   '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-c:a', 'copy'], tail)
        report, _ = self.review(tail)
        self.assertEqual(report['status'], 'failed', report)
        self.assertEqual(report['checks']['freeze']['events'][0]['startMs'], 3800)

    def test_short_original_cannot_exempt_a_longer_output_freeze(self):
        short = self.root / 'short.mp4'
        self.make(['-i', str(self.frozen), '-t', '1.1', '-c', 'copy'], short)
        report, _ = self.review(self.frozen, source=short)
        self.assertEqual((report['status'], report.get('errorStage')), ('incomplete', 'freeze'), report)

    def test_freeze_across_clip_seam_requires_both_originals_static(self):
        seam = self.root / 'seam.mp4'
        self.make(['-i', str(self.normal), '-filter_complex',
                   '[0:v]split[a][b];[a][b]freezeframes=first=57:last=65:replace=57[v]',
                   '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-c:a', 'copy'], seam)
        report, _ = self.review(seam, source=seam, duplicate=True,
                                resolve=lambda asset: seam if asset == 'a1' else self.normal)
        check = report['checks']['freeze']
        self.assertEqual(check['status'], 'failed', report)
        self.assertEqual([p['sourceAlreadyStatic'] for p in check['events'][0]['parts']], [True, False])

    def test_point_two_second_audio_offset_blocks(self):
        report, _ = self.review(self.shifted)
        self.assertEqual(report["status"], "failed", report)
        self.assertGreater(report["checks"]["timing"]["audioStartOffsetMs"], 100)

    def test_frame_timestamp_gap_blocks(self):
        report, _ = self.review(self.gap)
        self.assertEqual(report["status"], "failed", report)
        self.assertGreater(report["checks"]["timing"]["timestampGapCount"], 0)

    def test_cross_source_repeated_picture_blocks(self):
        report, receipt = self.review(self.duplicate, duplicate=True)
        self.assertEqual(report["status"], "failed", report)
        self.assertEqual(report["checks"]["pictures"], {"status": "failed", "pairCount": 1})
        self.assertTrue(receipt["host_remix_picture_review"]["findings"])

    def test_unavailable_source_is_incomplete_and_hides_url(self):
        def unavailable(_):
            raise RuntimeError("https://private/token-secret")
        report, _ = self.review(self.frozen, resolve=unavailable)
        self.assertEqual((report["status"], report["errorStage"]), ("incomplete", "freeze"))
        self.assertNotIn("token-secret", str(report))


class RemixQcContractTests(unittest.TestCase):
    def test_settings_fail_closed(self):
        for key, value in [("FREEZE_SECONDS", "nan"), ("AV_OFFSET_SECONDS", "0"),
                           ("PTS_GAP_SECONDS", "-1"), ("TIMEOUT_SECONDS", "inf")]:
            with patch.dict(os.environ, {"CONTENT_PRODUCTION_REMIX_QC_" + key: value}):
                with self.assertRaises(ValueError):
                    media.Settings.from_env()

    def test_missing_checks_or_changed_bytes_never_approve(self):
        snapshot = {"clips": []}
        receipt = {"host_inspection": {"sha256": "a" * 64}, "host_remix_qc": {
            "schema": qc.SCHEMA, "status": "passed", "snapshotSha256": qc.snapshot_hash(snapshot),
            "outputSha256": "a" * 64, "checks": {key: {"status": "passed"}
                for key in ("timing", "freeze", "pictures", "sources")}}}
        self.assertIsNone(qc.delivery_reason(snapshot, receipt))
        changed = copy.deepcopy(receipt)
        changed["host_inspection"]["sha256"] = "b" * 64
        self.assertEqual(qc.delivery_reason(snapshot, changed), qc.INCOMPLETE)
        for key in ("timing", "freeze", "pictures", "sources"):
            changed = copy.deepcopy(receipt)
            del changed["host_remix_qc"]["checks"][key]
            self.assertEqual(qc.delivery_reason(snapshot, changed), qc.INCOMPLETE)

    def test_cancellation_propagates(self):
        with self.assertRaises(Cancelled):
            qc.review({}, None, {}, None, lambda: (_ for _ in ()).throw(Cancelled()), None, None)

    def test_cancel_stops_owned_media_process(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(media.subprocess, 'Popen') as popen:
            proc = popen.return_value
            proc.poll.return_value = None
            tick = Mock(side_effect=[None, Cancelled('stop')])
            with self.assertRaises(Cancelled):
                media.command(['ffmpeg'], Path(folder)/'result', Path(folder), tick, float('inf'))
            proc.terminate.assert_called_once()
            proc.wait.assert_called_once()
