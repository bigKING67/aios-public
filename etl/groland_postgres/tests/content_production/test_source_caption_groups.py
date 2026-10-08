import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_caption_boundaries as fixture
from content_production.source_caption_groups import (group_plan, match_source_caption_groups,
    response_schema, summarize_groups, validate_groups, selection_windows)
from content_production.source_caption_boundaries import boundary_plan


class SourceCaptionGroupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceCaptionBoundaryTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixture.SourceCaptionBoundaryTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceCaptionBoundaryTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.work = self.case.case.root / 'groups'

    def answer(self, messages):
        payload = json.dumps(messages, ensure_ascii=False)
        for text in ('甲', '乙', '丙', '保留字幕'):
            self.assertNotIn(text, payload)  # Only reference images, never caption answers.
        parts = messages[1]['content']
        anchors = [p for p in parts if p['type'] == 'input_text' and p['text'].startswith('原片参考字幕组')]
        self.assertEqual(len(anchors), 3)
        frames = [int(p['text'].split()[1].split('，')[0]) for p in parts
                  if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
        self.assertEqual(frames, list(range(15, 31)) + list(range(45, 60)))
        return {'samples': [{'frame': f, 'groupId': 'g0' if f < 22 else 'g1' if f < 52 else 'g2'} for f in frames]}

    def match(self, callback=None):
        c = self.case
        return match_source_caption_groups(c.request, c.case.document, c.case.media, c.parent, self.work,
            region=c.region, model='fixture', call_model=callback or self.answer, check=lambda: None)

    def test_continuous_inspection_yields_a_full_second_without_bridging_samples(self):
        from content_production.source_caption_reference import observe_source_captions
        from content_production.source_caption_groups import continuous_plan
        c = self.case
        parent = c.case.root / 'stable-coarse'
        def coarse(messages):
            answer = fixture.observations(messages)
            for item in answer['samples']:
                item['lines'] = ['原片整句']
            return answer
        reference = observe_source_captions(c.request, c.case.document, c.case.media, parent,
            model='fixture', call_model=coarse, check=lambda: None)
        def dense(messages):
            frames = [int(p['text'].split()[1].split('，')[0]) for p in messages[1]['content']
                      if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
            self.assertEqual(frames, list(range(31)))
            return {'samples': [{'frame': f, 'groupId': 'g0'} for f in frames]}
        callback = Mock(side_effect=dense)
        def run(interval=(0, 30), work=None):
            return match_source_caption_groups(c.request, c.case.document, c.case.media, parent,
                work or self.work, region=c.region, model='fixture', call_model=callback,
                check=lambda: None, continuous_interval=interval)
        result = run()
        window = result['selectionWindows']['windows'][0]
        self.assertEqual((window['startFrame'], window['endFrameExclusive'], window['frameCount']), (0, 31, 31))
        self.assertFalse(result['selectionWindows']['executableEditAllowed'])
        self.assertEqual(run(), result)
        self.assertEqual(callback.call_count, 1)
        with self.assertRaises(ValueError):
            run((15, 30))  # A different frozen plan cannot reuse the old reservation.
        for interval in [(0, 45), (True, 30), (1, 30), (30, 0)]:
            with self.assertRaises(ValueError):
                continuous_plan(reference, c.region, *interval)
        self.assertEqual(callback.call_count, 1)

    def test_original_groups_are_frozen_and_direct_match_does_not_retranscribe(self):
        before = copy.deepcopy(self.case.source)
        callback = Mock(side_effect=self.answer)
        result = self.match(callback)
        self.assertEqual(result['reference']['schema'], 'aios.source-caption-group-reference.v1')
        self.assertEqual([g['lines'] for g in result['plan']['groups']], [['甲'], ['乙'], ['丙']])
        windows = result['boundaries']['windows']
        self.assertEqual([w['observedTransitions'][0]['afterFrame'] for w in windows], [22, 52])
        self.assertTrue(all(not w['anchorConflict'] for w in windows))
        self.assertEqual(result['boundaries']['textProvenance'], 'frozen_source_observation')
        self.assertFalse(result['boundaries']['subtitleTrackReady'])
        proposals = result['selectionWindows']
        self.assertEqual([(w['startFrame'], w['endFrameExclusive']) for w in proposals['windows']],
                         [(15, 22), (22, 31), (45, 52), (52, 60)])
        self.assertEqual([w['frameCount'] for w in proposals['windows']], [7, 9, 7, 8])
        self.assertFalse(proposals['executableEditAllowed'])
        self.assertEqual(proposals['sourceSha256'], result['reference']['identity']['sourceSha256'])
        original = json.loads((self.case.parent / 'input.json').read_text())
        from fractions import Fraction
        mapping = original['sourceMap']['sourceStart']
        offset = Fraction(mapping['num'], mapping['den'])
        first = proposals['windows'][0]['sourceMap']['sourceStart']
        self.assertEqual(Fraction(first['num'], first['den']), offset + Fraction(15, 30))
        wrong = copy.deepcopy(original)
        wrong['sourceSha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'source or plan changed'):
            selection_windows(result['reference'], result['plan'], result['boundaries'], wrong)
        conflicting = copy.deepcopy(result['boundaries'])
        conflicting['windows'][0]['status'] = 'needs_inspection'
        filtered = selection_windows(result['reference'], result['plan'], conflicting, original)
        self.assertEqual([w['startFrame'] for w in filtered['windows']], [45, 52])

        self.assertEqual(self.case.source, before)
        self.assertEqual(self.match(callback), result)
        self.assertEqual(callback.call_count, 1)
        # No dense transcription operation was needed or created.
        self.assertFalse(self.case.work.exists())
        path = self.work / 'source-0.jpg'
        path.write_bytes(path.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'image changed'):
            self.match(callback)
        self.assertEqual(callback.call_count, 1)

    def test_failures_and_rewritten_text_cannot_retry_or_be_adopted(self):
        for name, callback, status in [('lost', Mock(side_effect=TimeoutError), 'failed'),
            ('rewritten', Mock(return_value={'samples': [{'frame': 15, 'groupId': 'g0', 'lines': ['改字']}]}), 'invalid_response')]:
            self.work = self.case.case.root / name
            with self.assertRaises((ValueError, TimeoutError)):
                self.match(callback)
            result = self.match(callback)
            self.assertEqual(result['reference']['status'], status)
            self.assertIsNone(result['boundaries'])
            self.assertIsNone(result['selectionWindows'])
            self.assertEqual(callback.call_count, 1)

    def test_unknown_groups_missing_frames_and_spelling_fields_rejected(self):
        evidence = {'samples': [{'frame': 15}], 'groups': [{'id': 'g0'}]}
        good = {'samples': [{'frame': 15, 'groupId': 'g0'}]}
        self.assertEqual(validate_groups(good, evidence), good['samples'])
        for item in ({'frame': 15, 'groupId': 'g99'}, {'frame': True, 'groupId': 'g0'},
                     {'frame': 14, 'groupId': 'g0'}, {'frame': 15, 'groupId': 'g0', 'text': '溫'}):
            with self.assertRaises(ValueError):
                validate_groups({'samples': [item]}, evidence)
        with self.assertRaises(ValueError):
            validate_groups({'samples': []}, evidence)

    def test_new_text_uncertainty_and_anchor_mismatch_keep_inspection(self):
        plan = group_plan(boundary_plan(self.case.source, self.case.region))
        schema = response_schema(plan)
        self.assertEqual(schema['properties']['samples']['items']['properties']['groupId']['enum'],
                         ['g0', 'g1', 'g2', 'absent', 'other', 'uncertain'])
        items = [{'frame': f, 'groupId': 'g0' if f < 22 else 'g1' if f < 52 else 'g2'} for f in plan['frames']]
        items[0]['groupId'] = 'g2'
        items[5]['groupId'] = 'other'
        items[7]['groupId'] = 'uncertain'
        result = summarize_groups(plan, items)
        first = result['windows'][0]
        self.assertTrue(first['anchorConflict'])
        self.assertEqual(first['unresolvedFrames'], [20, 22])
        self.assertEqual(first['status'], 'needs_inspection')
        self.assertFalse(result['fullTemporalCoverage'])
        self.assertFalse(result['deliveryApproved'])


if __name__ == '__main__':
    unittest.main()
