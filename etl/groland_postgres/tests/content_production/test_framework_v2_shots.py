"""The one-pass optimization must preserve the old independent detector union."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.framework_v2.shots import cut_times


@unittest.skipUnless(importlib.util.find_spec('scenedetect'), 'framework-v2 dependency required')
class ShotUnionTests(unittest.TestCase):
    def test_shared_decode_keeps_hard_cuts_flash_and_adaptive_boundaries(self):
        import cv2
        import numpy as np
        from scenedetect import AdaptiveDetector, ContentDetector, detect

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cuts.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 15, (160, 120))
            self.assertTrue(writer.isOpened())
            try:
                for k in range(240):
                    color = [(15, 20, 180), (180, 30, 10), (15, 170, 20), (100, 15, 160)][k // 60]
                    frame = np.full((120, 160, 3), color, dtype=np.uint8)
                    cv2.rectangle(frame, ((k * 3) % 120, 10), ((k * 3) % 120 + 30, 60), (220, 180, 10), -1)
                    if k == 35:
                        frame[:] = 255
                    writer.write(frame)
            finally:
                writer.release()
            expected = sorted({round(start.get_seconds(), 3)
                for detector in (AdaptiveDetector, ContentDetector)
                for start, _ in detect(str(path), detector(), show_progress=False)[1:]})
            self.assertGreaterEqual(len(expected), 3)
            self.assertEqual(cut_times(path), expected)


if __name__ == '__main__':
    unittest.main()
