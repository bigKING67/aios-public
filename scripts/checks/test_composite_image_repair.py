import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "composite", Path(__file__).parents[1] / "ops/composite-image-repair.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProtectedPixels(unittest.TestCase):
    def test_protected_pixels_and_feather(self):
        source, repair = bytes([20] * 12 * 12 * 3), bytes([220] * 12 * 12 * 3)
        rect = (2, 2, 8, 8)
        result = module.blend(source, repair, 12, 12, rect, 2)
        self.assertEqual(module.outside_changes(source, result, 12, 12, rect), 0)
        self.assertEqual(result[(2 * 12 + 2) * 3], 20)
        self.assertEqual(result[(3 * 12 + 3) * 3], 120)
        self.assertEqual(result[(4 * 12 + 4) * 3], 220)

    def test_outside_change_is_detected(self):
        original = bytes(12 * 12 * 3)
        changed = bytearray(original)
        changed[0] = 1
        self.assertEqual(module.outside_changes(original, changed, 12, 12, (2, 2, 8, 8)), 1)

    def test_invalid_regions_fail(self):
        for rect, feather in [((-1, 0, 3, 3), 0), ((0, 0, 13, 12), 0), ((0, 0, 4, 4), 3)]:
            with self.subTest(rect=rect, feather=feather), self.assertRaises(ValueError):
                module.blend(bytes(432), bytes(432), 12, 12, rect, feather)


if __name__ == "__main__":
    unittest.main()
