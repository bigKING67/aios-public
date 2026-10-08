import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.reference_edit import build_reference_edit
from content_production.edit_document import compile_document


class ReferenceEditTests(unittest.TestCase):
    def setUp(self):
        self.reference = {"assetVersionId": "original", "sha256": "a" * 64, "frames": 180}
        self.replacements = [{"startFrame": 60, "endFrame": 120,
                              "asset": {"assetVersionId": "generated", "sha256": "b" * 64, "frames": 60}}]
        self.canvas = {"width": 1080, "height": 1920, "fps": {"num": 30, "den": 1}}

    def build(self, audio=True):
        return build_reference_edit("project", 2, self.reference, self.replacements, self.canvas, audio)

    def test_preserves_original_before_after_and_continuous_sound(self):
        before = copy.deepcopy((self.reference, self.replacements))
        document = self.build()
        clips = document["clips"]
        self.assertEqual([c["timeline"] for c in clips], [
            {"startFrame": 0, "endFrame": 60}, {"startFrame": 60, "endFrame": 120},
            {"startFrame": 120, "endFrame": 180}, {"startFrame": 0, "endFrame": 180}])
        self.assertEqual(clips[2]["sourceMap"][0]["sourceStart"], {"num": 120, "den": 30})
        spec = compile_document(document, {"original": {"sha256": "a" * 64, "durationMs": 6000},
                                           "generated": {"sha256": "b" * 64, "durationMs": 2000}},
                                {"original": "/original.mp4", "generated": "/generated.mp4"}, "swap")
        self.assertEqual([c["volume"] for c in spec["clips"]], [0, 0, 0])
        self.assertEqual(spec["audio"][0]["frames"], 180)
        self.assertEqual((self.reference, self.replacements), before)

    def test_rejects_missing_overlapping_inexact_and_unchanged_outputs(self):
        for case in ("empty", "overlap", "short", "long", "bounds", "same_hash", "version_conflict", "bool"):
            self.setUp()
            with self.subTest(case=case):
                if case == "empty": self.replacements.clear()
                elif case == "overlap": self.replacements.append(copy.deepcopy(self.replacements[0]))
                elif case == "short": self.replacements[0]["asset"]["frames"] = 59
                elif case == "long": self.replacements[0]["asset"]["frames"] = 61
                elif case == "bounds": self.replacements[0]["endFrame"] = 181
                elif case == "same_hash": self.replacements[0]["asset"]["sha256"] = "a" * 64
                elif case == "version_conflict": self.replacements[0]["asset"]["assetVersionId"] = "original"
                elif case == "bool": self.replacements[0]["startFrame"] = True
                with self.assertRaises(ValueError): self.build()

    def test_full_replacement_without_sound_has_no_unused_original(self):
        self.replacements[0].update(startFrame=0, endFrame=180)
        self.replacements[0]["asset"]["frames"] = 180
        document = self.build(False)
        self.assertEqual(len(document["clips"]), 1)
        self.assertEqual([a["assetVersionId"] for a in document["assets"]], ["generated"])

    def test_adjacent_out_of_order_shots_are_sorted_without_gaps(self):
        second = copy.deepcopy(self.replacements[0])
        second.update(startFrame=0, endFrame=60)
        self.replacements.append(second)
        document = self.build()
        self.assertEqual([c["timeline"]["startFrame"] for c in document["clips"]], [0, 60, 120, 0])
        self.assertEqual(len(document["assets"]), 2)


if __name__ == "__main__":
    unittest.main()
