import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_treatment as fixture
from content_production.execution import file_hash
from content_production.source_caption_reference import observe_source_captions
from content_production.source_caption_boundaries import boundary_plan, refine_source_captions, summarize_boundaries


def observations(messages):
    frames = [int(p['text'].split()[1].split('，')[0]) for p in messages[1]['content'] if p['type'] == 'input_text']
    return {'samples': [{'frame': f, 'visibility': 'readable', 'lines': ['甲' if f < 22 else '乙' if f < 52 else '丙'],
                         'appearance': '夹具文字，非真实识别'} for f in frames]}


class SourceCaptionBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceTreatmentTests.setUpClass()
        motion = Path(fixture.SourceTreatmentTests.assets.name) / 'main-motion.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
            'testsrc2=size=160x288:rate=30:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(motion)],
            check=True, capture_output=True, timeout=30)
        fixture.SourceTreatmentTests.files['main'] = motion

    @classmethod
    def tearDownClass(cls):
        fixture.SourceTreatmentTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceTreatmentTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.request = {'frames': 60, 'timeline': {'startFrame': 60, 'endFrame': 120}}
        self.parent = self.case.root / 'coarse'
        self.work = self.case.root / 'dense'
        self.source = observe_source_captions(self.request, self.case.document, self.case.media, self.parent,
            model='fixture', call_model=observations, check=lambda: None)
        self.region = {'top': .65, 'bottom': .74}

    def refine(self, callback=observations, check=lambda: None):
        return refine_source_captions(self.request, self.case.document, self.case.media, self.parent, self.work,
            region=self.region, model='fixture', call_model=callback, check=check)

    def test_dense_frame_coverage_cache_and_original_frame_pixels(self):
        before = copy.deepcopy(self.case.document)
        callback = Mock(side_effect=observations)
        result = self.refine(callback)
        self.assertEqual(result['plan']['frames'], list(range(15, 31)) + list(range(45, 60)))
        windows = result['boundaries']['windows']
        self.assertEqual([w['observedTransitions'][0]['afterFrame'] for w in windows], [22, 52])
        self.assertTrue(all(w['status'] == 'locally_observed' for w in windows))
        self.assertFalse(result['boundaries']['subtitleTrackReady'])
        self.assertFalse(result['boundaries']['fullTemporalCoverage'])
        self.assertEqual(self.case.document, before)
        self.assertEqual(self.refine(callback), result)
        self.assertEqual(callback.call_count, 1)
        evidence = json.loads((self.work / 'input.json').read_text())
        # Independently decode selected frames with the same crop, proving no
        # CFR duplication/renumbering in the one-pass sparse extraction.
        for index in (0, 15, 16, 30):
            frame = result['plan']['frames'][index]
            crop = evidence['crop']
            path = self.case.root / f'expected-{frame}.jpg'
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(self.parent / 'source.mp4'),
                '-vf', f"select=eq(n\\,{frame}),crop=iw:{crop['height']}:0:{crop['y']},scale=w='min(iw,1080)':h=-2",
                '-frames:v', '1', '-q:v', '2', str(path)], check=True, capture_output=True)
            self.assertEqual(file_hash(path), evidence['samples'][index]['imageSha256'])
        self.assertEqual(len({evidence['samples'][i]['imageSha256'] for i in (0, 15, 16, 30)}), 4)
        self.region = {'top': .60, 'bottom': .74}
        with self.assertRaisesRegex(ValueError, 'reference changed'):
            self.refine(callback)
        self.assertEqual(callback.call_count, 1)

    def test_corrupt_parent_image_rejected_before_call(self):
        (self.parent / 'source-0.jpg').write_bytes(b'changed')
        callback = Mock()
        with self.assertRaisesRegex(ValueError, 'image changed'):
            self.refine(callback)
        callback.assert_not_called()

    def test_failure_and_invalid_response_do_not_retry(self):
        for name, callback, expected in [('timeout', Mock(side_effect=TimeoutError), 'failed'),
                                          ('invalid', Mock(return_value={'samples': []}), 'invalid_response')]:
            self.work = self.case.root / name
            with self.assertRaises((TimeoutError, ValueError)):
                self.refine(callback)
            result = self.refine(callback)
            self.assertEqual(result['reference']['status'], expected)
            self.assertIsNone(result['boundaries'])
            self.assertEqual(callback.call_count, 1)

    def test_anchor_conflict_uncertainty_and_multiple_changes_stay_visible(self):
        result = self.refine()
        items = copy.deepcopy(result['reference']['observations'])
        items[0]['lines'] = ['不同锚点']
        items[5].update(visibility='uncertain', lines=[])
        summary = summarize_boundaries(result['plan'], items)
        first = summary['windows'][0]
        self.assertTrue(first['anchorConflict'])
        self.assertEqual(first['uncertainFrames'], [20])
        self.assertEqual(first['status'], 'needs_inspection')
        self.assertEqual(len(first['observedTransitions']), 2)
        with self.assertRaisesRegex(ValueError, 'coverage'):
            summarize_boundaries(result['plan'], items[:-1])

    def test_band_and_window_budgets_never_silently_truncate(self):
        for region in ({'top': 0, 'bottom': 1}, {'top': True, 'bottom': .8}, {'top': .7, 'bottom': float('nan')}):
            with self.assertRaises(ValueError):
                boundary_plan(self.source, region)
        reference = copy.deepcopy(self.source)
        for index, item in enumerate(reference['observations']):
            item['lines'] = [str(index)]
        with self.assertRaisesRegex(ValueError, 'one or two'):
            boundary_plan(reference, self.region)
        reference = copy.deepcopy(self.source)
        reference['observations'][0].update(visibility='uncertain', lines=[])
        self.assertEqual(len(boundary_plan(reference, self.region)['uncertainGaps']), 1)

    def test_cancel_has_no_provider_call(self):
        callback = Mock()
        with self.assertRaises(InterruptedError):
            self.refine(callback, check=Mock(side_effect=InterruptedError))
        callback.assert_not_called()


if __name__ == '__main__':
    unittest.main()
