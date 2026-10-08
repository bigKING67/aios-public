import copy
import hashlib
import sys
from pathlib import Path
import subprocess
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.inspection import inspect_output, inspect_media
from content_production.execution import Cancelled


class InspectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory(prefix="aios-inspection-")
        cls.video = Path(cls.folder.name) / "video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=black:size=720x1280:rate=30:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(cls.video)], check=True, timeout=30)
        cls.snapshot = {"aspect": "portrait", "clips": [{"startMs": 0, "endMs": 1000}], "assets": [{"assetId": "fixture", "sha256": "a" * 64}]}
        cls.receipt = {"status": "completed", "preview": False, "output": {"sha256": hashlib.sha256(cls.video.read_bytes()).hexdigest()}, "assets": [{"id": "afixture", "sha256": "a" * 64}]}

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_decodes_real_media_and_keeps_content_quality_unverified(self):
        result = inspect_output(self.video, self.snapshot, False, self.receipt, lambda: None)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["fps"], 30)
        self.assertEqual(result["semantic"], "unverified")

    def test_wrong_duration_dimensions_or_receipt_fails(self):
        snapshot = copy.deepcopy(self.snapshot)
        snapshot["clips"][0]["endMs"] = 2000
        with self.assertRaises(ValueError):
            inspect_output(self.video, snapshot, False, self.receipt, lambda: None)
        snapshot = copy.deepcopy(self.snapshot)
        snapshot["aspect"] = "landscape"
        with self.assertRaises(ValueError):
            inspect_output(self.video, snapshot, False, self.receipt, lambda: None)
        receipt = copy.deepcopy(self.receipt)
        receipt["output"]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            inspect_output(self.video, self.snapshot, False, receipt, lambda: None)

    def test_cancel_interrupts_owned_decode_child(self):
        calls = 0
        def tick():
            nonlocal calls
            calls += 1
            if calls >= 2:
                raise Cancelled("fixture cancellation")
        with self.assertRaises(Cancelled):
            inspect_output(self.video, self.snapshot, False, self.receipt, tick)

    def test_independent_audio_cannot_succeed_with_a_silent_video(self):
        with self.assertRaisesRegex(ValueError, "independent audio"):
            inspect_media(self.video, {"width": 720, "height": 1280, "fps": 30}, 30,
                          {"afixture": "a" * 64}, "hyperframes-av-v1", False, self.receipt,
                          lambda: None, require_audio=True)
