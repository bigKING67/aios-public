import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from content_production import framework_local_evidence as local


def metadata(at, score):
    return (f'[Parsed_metadata_2 @ x] frame:0 pts:1 pts_time:{at}\n'
            f'[Parsed_metadata_2 @ x] lavfi.scene_score={score}\n')


class LocalEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.mp4'
        self.source.write_bytes(b'unchanged original source')
        self.identity = local.file_hash(self.source)
        self.output = self.root / 'result'

    def test_changed_source_and_unpinned_model_are_rejected_before_decode(self):
        with patch.object(local, 'run_media') as media:
            with self.assertRaisesRegex(ValueError, 'expected identity'):
                local.prepare(self.source, self.output, self.root, '0' * 64)
            (self.root / next(iter(local.MODEL_HASHES))).write_bytes(b'not the official model')
            with self.assertRaisesRegex(ValueError, 'pinned official weights'):
                local.prepare(self.source, self.output, self.root, self.identity)
            media.assert_not_called()
            self.assertFalse(self.output.exists())

    def test_actual_native_frame_timestamps_floor_without_grid_rounding(self):
        frames = self.root / 'frames'
        frames.mkdir()
        for name in ('00001.jpg', '00002.jpg', '00003.jpg'):
            (frames / name).write_bytes(name.encode())
        rows = local.sampled_frames(metadata('0', '0') + metadata('108.366667', '0.35') +
                                    metadata('108.4', '0.48'), frames, 110000)
        self.assertEqual([r['atMs'] for r in rows], [0, 108366, 108400])
        self.assertEqual([r['cutCandidate'] for r in rows], [False, True, True])
        self.assertEqual(local.file_hash(frames / '00002.jpg'), rows[1]['sha256'])

    def test_partial_or_truncated_frames_are_never_accepted(self):
        frames = self.root / 'frames'
        frames.mkdir()
        (frames / '00001.jpg').write_bytes(b'image')
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            local.sampled_frames(metadata('0', '0') + metadata('2', '0.1'), frames, 4000)
        with patch.object(local, 'MAX_FRAMES', 0):
            with self.assertRaisesRegex(ValueError, 'excessive'):
                local.sampled_frames(metadata('0', '0'), frames, 4000)

    def test_decoder_failure_or_cancellation_publishes_nothing(self):
        for error in (None, RuntimeError('cancelled')):
            with self.subTest(error=error), patch.object(local, 'pinned_models', return_value=[]), \
                    patch.object(local, 'probe', return_value={'durationMs': 10000}), \
                    patch.object(local, 'run_media', return_value=1, side_effect=error):
                with self.assertRaises((ValueError, RuntimeError)):
                    local.prepare(self.source, self.output, self.root, self.identity)
                self.assertFalse(self.output.exists())
                self.assertEqual(list(self.root.glob('.framework-local-*')), [])

    def test_no_face_is_uncertain_and_exact_image_reuse_does_not_establish_continuity(self):
        import cv2
        import numpy as np

        frames = self.root / 'frames'
        frames.mkdir()
        (frames / '00001.jpg').write_bytes(b'example')
        rows = [{'index': 0, 'path': 'frames/00001.jpg', 'sha256': 'a'},
                {'index': 1, 'path': 'frames/00001.jpg', 'sha256': 'a'}]
        detector = Mock()
        detector.detect.return_value = (0, None)
        with patch.object(cv2, 'FaceDetectorYN_create', return_value=detector), \
                patch.object(cv2, 'FaceRecognizerSF_create') as recognizer, \
                patch.object(cv2, 'imread', return_value=np.zeros((64, 64, 3), dtype=np.uint8)):
            facts = local.visual_signals(rows, self.root, self.root, lambda: None)
        self.assertEqual(facts['uniqueImages'], 1)
        self.assertEqual(facts['imagesWithFeatures'], 0)
        detector.detect.assert_called_once()
        recognizer.return_value.feature.assert_not_called()
        self.assertTrue(all(row['face']['status'] == 'uncertain' for row in rows))
        self.assertTrue(all(row['semanticStatus'] == 'unassessed' for row in rows))
        self.assertEqual(facts['adjacentPairs'][0]['faceCosine'], None)
        self.assertTrue(facts['adjacentPairs'][0]['exactImageMatch'])
        self.assertEqual(facts['adjacentPairs'][0]['sourceContinuity'], 'unassessed')


if __name__ == '__main__':
    unittest.main()
