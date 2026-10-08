from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.output_profile import canvas
from content_production.run_bridge import matches_output_profile


class OutputProfileTests(unittest.TestCase):
    def test_legacy_and_hd_geometry_and_exact_preview_contract(self):
        for aspect, legacy, hd, preview in (
            ("portrait", (720, 1280), (1080, 1920), (360, 640)),
            ("landscape", (1280, 720), (1920, 1080), (640, 360)),
            ("square", (1080, 1080), (1080, 1080), (640, 640)),
        ):
            snapshot = {"aspect": aspect}
            self.assertEqual(canvas(snapshot), dict(zip(("width", "height", "fps"), (*legacy, 30))))
            snapshot["outputProfile"] = "hd_1080_v1"
            self.assertEqual(canvas(snapshot), dict(zip(("width", "height", "fps"), (*hd, 30))))
            self.assertEqual(canvas(snapshot, True), dict(zip(("width", "height", "fps"), (*preview, 30))))
            snapshot["outputProfile"] = "legacy_v1"
            self.assertEqual(canvas(snapshot, True)["width"], preview[0])

    def test_unknown_profile_and_incompatible_receipts_are_rejected(self):
        for name in (None, "", "future", {}):
            with self.assertRaises(ValueError):
                canvas({"aspect": "portrait", "outputProfile": name})
        legacy = {"aspect": "portrait"}
        receipt = {"width": 720, "height": 1280, "fps": 30}
        self.assertTrue(matches_output_profile(legacy, receipt))
        hd = {**legacy, "outputProfile": "hd_1080_v1"}
        self.assertFalse(matches_output_profile(hd, receipt))
        receipt.update(width=1080, height=1920)
        self.assertFalse(matches_output_profile(hd, receipt))
        receipt["outputProfile"] = "hd_1080_v1"
        self.assertTrue(matches_output_profile(hd, receipt))
        receipt["fps"] = 24
        self.assertFalse(matches_output_profile(hd, receipt))
        self.assertFalse(matches_output_profile({}, {}))
