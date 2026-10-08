import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_treatment as fixture
from content_production.source_caption_reference import compare_groups, observe_source_captions, validate_observations


class SourceCaptionReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceTreatmentTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixture.SourceTreatmentTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceTreatmentTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.request = {'frames': 60, 'timeline': {'startFrame': 60, 'endFrame': 120}}
        self.work = self.case.root / 'source-reference'
        self.calls = 0

    def answer(self, messages):
        self.calls += 1
        payload = json.dumps(messages, ensure_ascii=False)
        self.assertNotIn('保留字幕', payload)  # Never hint the target caption text.
        self.assertNotIn('expectedCaptions', payload)
        parts = messages[1]['content']
        frames = [int(p['text'].split()[1].split('，')[0]) for p in parts if p['type'] == 'input_text']
        self.assertEqual(frames, [0, 15, 30, 45, 59])
        self.assertTrue(all(p['image_url'].startswith('data:image/jpeg;base64,') and p['detail'] == 'high'
                            for p in parts if p['type'] == 'input_image'))
        return {'samples': [{'frame': f, 'visibility': 'absent', 'lines': [],
                             'appearance': '纯色画面，无口播字幕'} for f in frames]}

    def run_reference(self, call=None, check=lambda: None):
        return observe_source_captions(self.request, self.case.document, self.case.media, self.work,
            model='fixture', call_model=call or self.answer, check=check)

    def test_real_extraction_source_mapping_and_cached_evidence(self):
        original = copy.deepcopy(self.case.document)
        result = self.run_reference()
        self.assertEqual(result['status'], 'observed')
        self.assertFalse(result['deliveryApproved'])
        self.assertFalse(result['subtitleTrackReady'])
        self.assertEqual(result['exactCueBoundaries'], 'unverified')
        self.assertEqual(self.case.document, original)
        evidence = json.loads((self.work / 'input.json').read_text())
        self.assertEqual(evidence['sourceMap'], {'sourceStart': {'num': 2, 'den': 1}, 'sourceEnd': {'num': 4, 'den': 1}})
        self.assertEqual(self.run_reference(), result)
        self.assertEqual(self.calls, 1)
        image = self.work / 'source-0.jpg'
        image.write_bytes(image.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'image changed'):
            self.run_reference()
        self.assertEqual(self.calls, 1)

    def test_lost_response_never_calls_twice(self):
        call = Mock(side_effect=TimeoutError('unknown provider outcome'))
        with self.assertRaises(TimeoutError):
            self.run_reference(call)
        self.assertEqual(self.run_reference(call)['status'], 'failed')
        self.assertEqual(call.call_count, 1)

    def test_invalid_response_never_retries(self):
        call = Mock(return_value={'samples': []})
        with self.assertRaisesRegex(ValueError, 'coverage'):
            self.run_reference(call)
        self.assertEqual(self.run_reference(call)['status'], 'invalid_response')
        self.assertEqual(call.call_count, 1)

    def test_cancel_before_dispatch_and_outside_narration(self):
        call = Mock()
        with self.assertRaises(InterruptedError):
            self.run_reference(call, check=Mock(side_effect=InterruptedError))
        self.assertFalse(self.work.exists())
        self.request['timeline'] = {'startFrame': 150, 'endFrame': 210}
        with self.assertRaisesRegex(ValueError, 'exceeds narration'):
            self.run_reference(call)
        call.assert_not_called()

    def test_changed_source_hash_and_excessive_window_rejected(self):
        original = copy.deepcopy(self.case.document)
        self.case.document['assets'][0]['sha256'] = '0' * 64
        with self.assertRaises(ValueError):
            self.run_reference()
        self.assertEqual(self.calls, 0)
        self.case.document = original
        self.request = {'frames': 151, 'timeline': {'startFrame': 0, 'endFrame': 151}}
        with self.assertRaisesRegex(ValueError, 'bounded 30fps'):
            self.run_reference()

    def test_cached_quality_upgrade_rejected(self):
        self.run_reference()
        path = self.work / 'reference.json'
        saved = json.loads(path.read_text())
        saved['exactFontIdentity'] = 'verified'
        path.write_text(json.dumps(saved))
        with self.assertRaisesRegex(ValueError, 'reference changed'):
            self.run_reference()
        self.assertEqual(self.calls, 1)

    def test_unsupported_fps_and_retimed_narration_rejected(self):
        self.case.document['canvas']['fps'] = {'num': 24, 'den': 1}
        with self.assertRaisesRegex(ValueError, 'bounded 30fps'):
            self.run_reference()
        self.case.document['canvas']['fps'] = {'num': 30, 'den': 1}
        audio_track = next(t['id'] for t in self.case.document['tracks'] if t['kind'] == 'audio')
        audio = next(c for c in self.case.document['clips'] if c['trackId'] == audio_track)
        audio['sourceMap'][0]['sourceEnd'] = {'num': 12, 'den': 1}
        with self.assertRaisesRegex(ValueError, '1x source timing'):
            self.run_reference()
        self.assertEqual(self.calls, 0)

    def test_group_comparison_preserves_lines_and_unknowns(self):
        self.case.document['captions'][0]['anchor'].update(
            sourceStart={'num': 2, 'den': 1}, sourceEnd={'num': 4, 'den': 1})
        items = [{'frame': i, 'visibility': visibility, 'lines': lines} for i, visibility, lines in
                 [(0, 'readable', ['保留字幕']), (15, 'readable', ['保留', '字幕']), (30, 'uncertain', []), (45, 'absent', [])]]
        result = compare_groups(items, self.request, self.case.document)
        self.assertEqual([r['status'] for r in result],
                         ['same_at_sample', 'different_at_sample', 'uncertain', 'different_at_sample'])
        self.case.document['captions'] = []
        self.assertTrue(all(r['status'] == 'not_rendered' for r in compare_groups(items, self.request, self.case.document)))

    def test_visible_grouping_and_uncertainty_validation(self):
        evidence = {'samples': [{'frame': 0}]}
        good = {'samples': [{'frame': 0, 'visibility': 'readable', 'lines': ['原字幕第一行', '第二行'],
                             'appearance': '白字黑色描边，位于下方'}]}
        self.assertEqual(validate_observations(good, evidence)[0]['lines'], good['samples'][0]['lines'])
        for key, value in [('frame', True), ('frame', 1), ('visibility', 'uncertain'), ('visibility', 'absent'),
                           ('lines', []), ('lines', ['猜测\n补全']), ('appearance', '')]:
            bad = copy.deepcopy(good)
            bad['samples'][0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                validate_observations(bad, evidence)


if __name__ == '__main__':
    unittest.main()
