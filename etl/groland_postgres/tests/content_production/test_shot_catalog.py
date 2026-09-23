import sys
import tempfile
import unittest
import shutil
import subprocess
import json
import hashlib
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.shot_catalog import build_catalog, parse_boundaries, partition, probe


class ShotCatalogTests(unittest.TestCase):
    def test_partition_preserves_coverage_and_rejects_too_many_shots(self):
        self.assertEqual(partition(4000, [0, 20, 1000, 1000, 1050, 3000, 3999, 5000]), [(0, 1000), (1000, 3000), (3000, 4000)])
        self.assertEqual(partition(900, []), [(0, 900)])
        with self.assertRaises(ValueError):
            partition(50000, list(range(300, 49000, 300)))

    def test_parse_only_frame_timestamps(self):
        log = 'Duration: 00:00:05\n[Parsed_showinfo_1 @ 0x0] n: 0 pts: 512 pts_time:1.234 fmt:yuv420p\nprogress pts_time:9.5'
        self.assertEqual(parse_boundaries(log), [1234])

    def test_unknown_timestamp_mapping_rejected(self):
        with patch('content_production.shot_catalog.run', return_value=b'{"streams":[{"codec_type":"video","duration":"3","start_time":"2"}],"format":{}}'):
            with self.assertRaises(ValueError):
                probe(Path('unused'), 'unused')

    def test_hash_mismatch_and_existing_output_fail_before_media_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.mp4'
            source.write_bytes(b'fixture')
            with patch('content_production.shot_catalog.run') as run:
                with self.assertRaises(ValueError):
                    build_catalog(source, Path(folder) / 'out', '11111111-1111-1111-1111-111111111111', ffmpeg='unused', ffprobe='unused', expected_sha256='0'*64)
                with self.assertRaises(ValueError):
                    build_catalog(source, Path(folder), '11111111-1111-1111-1111-111111111111', ffmpeg='unused', ffprobe='unused')
                run.assert_not_called()

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'local FFmpeg required')
    def test_actual_hard_cut_and_frame_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'two-scenes.mp4'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=160x120:r=25:d=1',
                            '-f', 'lavfi', '-i', 'color=white:s=160x120:r=25:d=1',
                            '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-threads', '1', str(source)],
                           check=True, capture_output=True, timeout=30)
            identity = hashlib.sha256(source.read_bytes()).hexdigest()
            output = Path(folder) / 'catalog'
            result = build_catalog(source, output, '11111111-1111-1111-1111-111111111111',
                                   ffmpeg='ffmpeg', ffprobe='ffprobe', expected_sha256=identity)
            self.assertEqual([(s['startMs'], s['endMs']) for s in result['shots']], [(0, 1000), (1000, 2000)])
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), identity)
            self.assertEqual(json.loads((output / 'catalog.json').read_text()), result)
            for shot in result['shots']:
                self.assertEqual(shot['semanticStatus'], 'not_analyzed')
                frame = output / shot['representativeFrame']['path']
                self.assertEqual(hashlib.sha256(frame.read_bytes()).hexdigest(), shot['representativeFrame']['sha256'])
            self.assertNotIn(str(source), (output / 'catalog.json').read_text())


if __name__ == '__main__':
    unittest.main()
