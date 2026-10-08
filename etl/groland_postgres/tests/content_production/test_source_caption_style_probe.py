import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from content_production.execution import file_hash
from content_production.source_caption_style_probe import equal_text_samples, mask_metrics, probe_white_caption_style


class CaptionStyleProbeTests(unittest.TestCase):
    def test_matching_text_only(self):
        request = {'frames': 120, 'timeline': {'startFrame': 600}}
        coverage = {'frameCoverageComplete': True, 'allGroupsResolved': True, 'frames': 120,
                    'scopeIntervals': [{'startFrame': 0, 'endFrame': 24, 'lines': ['原字幕']}]}
        cues = [{'text': '原字幕', 'renderRanges': [{'startFrame': 600, 'endFrame': 626}]},
                {'text': '不同文字', 'renderRanges': [{'startFrame': 600, 'endFrame': 720}]}]
        with patch('content_production.source_caption_style_probe.resolve_caption_display', return_value=cues):
            self.assertEqual(equal_text_samples(request, {}, coverage)['frames'], [2, 6, 11, 16, 21])
            coverage['scopeIntervals'][0]['lines'] = ['原', '字幕']
            with self.assertRaisesRegex(ValueError, 'equal-text'):
                equal_text_samples(request, {}, coverage)

    def test_empty_and_clipped_masks_rejected(self):
        with self.assertRaisesRegex(ValueError, 'not found'):
            mask_metrics(bytes(100), 10, 10)
        with self.assertRaisesRegex(ValueError, 'band edge'):
            mask_metrics(bytes([255] * 100), 10, 10)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'requires ffmpeg')
    def test_real_decode_geometry_and_digest_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [root / 'source.mkv', root / 'candidate.mkv']
            for path, x, y, width in [(paths[0], 30, 48, 80), (paths[1], 20, 50, 100)]:
                subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
                    f'color=black:s=160x120:r=30:d=1,drawbox=x={x}:y={y}:w={width}:h=20:color=white:t=4',
                    '-c:v', 'ffv1', str(path)], check=True, capture_output=True)
            args = dict(frames=[2, 6, 11, 15, 20], region={'top': .25, 'bottom': .75},
                        source_sha256=file_hash(paths[0]), candidate_sha256=file_hash(paths[1]), check=lambda: None)
            result = probe_white_caption_style(*paths, root / 'probe', **args)
            self.assertEqual((result['source']['width'], result['source']['height']), (80, 20))
            self.assertEqual((result['candidate']['width'], result['candidate']['height']), (100, 20))
            self.assertEqual(result['candidate']['bbox']['top'] - result['source']['bbox']['top'], 2)
            self.assertFalse(result['deliveryApproved'])
            self.assertEqual(result['fontIdentity'], 'unverified')
            args['candidate_sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'media changed'):
                probe_white_caption_style(*paths, root / 'probe', **args)
            args['frames'] = [2, 2, 3]
            with self.assertRaisesRegex(ValueError, 'unique ordered'):
                probe_white_caption_style(*paths, root / 'probe', **args)


if __name__ == '__main__':
    unittest.main()
