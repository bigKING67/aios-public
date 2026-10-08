import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_treatment as fixture
from content_production.source_caption_reference import observe_source_captions
from content_production.source_caption_groups import match_source_caption_groups
from content_production.source_caption_coverage import coverage_plan, summarize_coverage, complete_source_caption_coverage


class SourceCaptionCoverageTests(unittest.TestCase):
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
        self.request = {'frames': 120, 'timeline': {'startFrame': 30, 'endFrame': 150}}
        self.parent, self.group_work, self.work = [self.case.root / name for name in ('coarse', 'groups', 'coverage')]
        self.region = {'top': .65, 'bottom': .74}
        self.coarse = observe_source_captions(self.request, self.case.document, self.case.media, self.parent,
            model='fixture', call_model=self.transcribe, check=lambda: None)
        self.groups = match_source_caption_groups(self.request, self.case.document, self.case.media,
            self.parent, self.group_work, region=self.region, model='fixture', call_model=self.classify, check=lambda: None)
        self.plan = coverage_plan(self.groups, self.coarse, 120, 3)

    @staticmethod
    def group_id(frame):
        return 'g0' if frame < 22 else 'g1' if frame < 52 else 'g2'

    def transcribe(self, messages):
        frames = [int(p['text'].split()[1].split('，')[0]) for p in messages[1]['content'] if p['type'] == 'input_text']
        return {'samples': [{'frame': f, 'visibility': 'readable', 'lines': [self.group_id(f)],
                             'appearance': 'transport fixture only'} for f in frames]}

    def classify(self, messages):
        frames = [int(p['text'].split()[1].split('，')[0]) for p in messages[1]['content']
                  if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
        return {'samples': [{'frame': f, 'groupId': self.group_id(f)} for f in frames]}

    def complete(self, callback=None, limit=3, check=lambda: None):
        return complete_source_caption_coverage(self.request, self.case.document, self.case.media,
            self.parent, self.group_work, self.work, region=self.region, model='fixture', call_limit=limit,
            call_model=callback or self.classify, check=check)

    def receipts(self):
        return [{'status': 'observed', 'callsReserved': 1,
                 'observations': [{'frame': f, 'groupId': self.group_id(f)} for f in p['frames']]}
                for p in self.plan['pages']]

    def test_derived_window_suggestions_do_not_invalidate_existing_coverage_identity(self):
        legacy = {k: copy.deepcopy(self.groups[k]) for k in ('reference', 'plan', 'boundaries')}
        expected = coverage_plan(legacy, self.coarse, 120, 3)
        augmented = copy.deepcopy(legacy)
        augmented['selectionWindows'] = {'untrustedDerivedSuggestion': 'ignored'}
        self.assertEqual(coverage_plan(augmented, self.coarse, 120, 3), expected)
        from content_production.caption_quality import document_digest
        self.assertEqual(expected['groupReferenceSha256'], document_digest(legacy))
        augmented['reference']['observations'][0]['groupId'] = 'uncertain'
        self.assertNotEqual(coverage_plan(augmented, self.coarse, 120, 3)['groupReferenceSha256'],
                            expected['groupReferenceSha256'])

    def test_real_extraction_completes_grid_reuses_seeds_and_resumes_without_calls(self):
        callback = Mock(side_effect=self.classify)
        result = self.complete(callback)
        self.assertEqual(len(self.plan['seedObservations']), 37)
        self.assertEqual([len(p['targetFrames']) for p in self.plan['pages']], [29, 29, 25])
        self.assertEqual(callback.call_count, 3)
        self.assertEqual(result['observedFrameCount'], 120)
        self.assertTrue(result['frameCoverageComplete'])
        self.assertTrue(result['allGroupsResolved'])
        self.assertEqual([(r['startFrame'], r['endFrame']) for r in result['scopeIntervals']], [(0, 22), (22, 52), (52, 120)])
        self.assertFalse(result['scopeEdgesAreCueBoundaries'])
        original = json.loads((self.parent / 'input.json').read_text())
        self.assertEqual(result['sourceBinding']['sourceSha256'], original['sourceSha256'])
        self.assertEqual(result['sourceBinding']['assetVersionId'], original['assetVersionId'])
        self.assertEqual([r['frameCount'] for r in result['scopeIntervals']], [22, 30, 68])
        from fractions import Fraction
        offset = original['sourceMap']['sourceStart']
        offset = Fraction(offset['num'], offset['den'])
        for interval in result['scopeIntervals']:
            for key, frame_key in [('sourceStart', 'startFrame'), ('sourceEnd', 'endFrame')]:
                time = interval['sourceMap'][key]
                self.assertEqual(Fraction(time['num'], time['den']), offset + Fraction(interval[frame_key], 30))
        self.assertFalse(result['executableEditAllowed'])

        self.assertFalse(result['subtitleTrackReady'])
        self.assertFalse(result['deliveryApproved'])
        self.assertEqual(self.complete(callback), result)
        self.assertEqual(callback.call_count, 3)
        report = self.work / 'coverage.json'
        tampered = json.loads(report.read_text())
        tampered['deliveryApproved'] = True
        report.write_text(json.dumps(tampered))
        self.assertEqual(self.complete(callback), result)  # Recompute, never trust a summary cache.
        with self.assertRaisesRegex(ValueError, 'budget changed'):
            self.complete(callback, limit=4)
        self.assertEqual(callback.call_count, 3)
        image = self.work / 'page-0/source-0.jpg'
        image.write_bytes(image.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'image changed'):
            self.complete(callback)
        self.assertEqual(callback.call_count, 3)

    def test_lost_second_page_stops_without_retry_or_later_spending(self):
        calls = 0
        def callback(messages):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise TimeoutError('lost provider outcome')
            return self.classify(messages)
        with self.assertRaises(TimeoutError):
            self.complete(callback)
        result = self.complete(callback)
        self.assertEqual(calls, 2)
        self.assertEqual(result['status'], 'partial')
        self.assertFalse(result['frameCoverageComplete'])
        self.assertEqual(result['callsReserved'], 2)
        self.assertFalse((self.work / 'page-2').exists())
        self.assertEqual(result['scopeIntervals'], [])

    def test_unknown_and_bad_page_anchor_prevent_intervals(self):
        for mode in ('other', 'anchor'):
            receipts = self.receipts()
            if mode == 'other':
                for receipt in receipts:
                    for item in receipt['observations']:
                        if item['frame'] == 70:
                            item['groupId'] = 'other'
            else:
                receipts[0]['observations'][self.plan['pages'][0]['frames'].index(15)]['groupId'] = 'g2'
            result = summarize_coverage(self.plan, receipts)
            self.assertTrue(result['frameCoverageComplete'])
            self.assertFalse(result['allGroupsResolved'])
            self.assertEqual(result['status'], 'needs_inspection')
            self.assertEqual(result['scopeIntervals'], [])

    def test_one_frame_absence_is_preserved_not_interpolated(self):
        receipts = self.receipts()
        for receipt in receipts:
            for item in receipt['observations']:
                if item['frame'] == 70:
                    item['groupId'] = 'absent'
        result = summarize_coverage(self.plan, receipts)
        blanks = [r for r in result['scopeIntervals'] if r['groupId'] == 'absent']
        self.assertEqual(blanks, [{'startFrame': 70, 'endFrame': 71, 'groupId': 'absent', 'lines': []}])

    def test_budget_and_changed_parent_fail_before_dispatch(self):
        callback = Mock()
        with self.assertRaisesRegex(ValueError, 'authorized call limit'):
            self.complete(callback, limit=2)
        self.assertFalse(self.work.exists())
        (self.parent / 'source-0.jpg').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'image changed'):
            self.complete(callback)
        callback.assert_not_called()

    def test_coarse_dense_conflict_cannot_be_resolved_by_filling_other_frames(self):
        groups = copy.deepcopy(self.groups)
        groups['reference']['observations'][0]['groupId'] = 'g2'
        plan = coverage_plan(groups, self.coarse, 120, 3)
        self.assertEqual(len(plan['seedConflicts']), 1)
        result = summarize_coverage(plan, self.receipts())
        self.assertTrue(result['frameCoverageComplete'])
        self.assertFalse(result['allGroupsResolved'])
        self.assertIn(15, result['unresolvedFrames'])

    def test_cancel_does_not_create_or_dispatch_coverage(self):
        callback = Mock()
        with self.assertRaises(InterruptedError):
            self.complete(callback, check=Mock(side_effect=InterruptedError))
        callback.assert_not_called()
        self.assertFalse(self.work.exists())


if __name__ == '__main__':
    unittest.main()


class PartialCaptionSelectionTests(unittest.TestCase):
    def test_unknown_frames_split_local_windows_without_approving_full_scope(self):
        plan = {'frames': 60, 'callLimit': 1, 'seedConflicts': [], 'pages': [],
                'groups': [{'id': 'g0', 'lines': ['原字幕'], 'anchorFrame': 0}],
                'seedObservations': [{'frame': f, 'groupId': 'other' if 30 <= f < 35 else 'g0'} for f in range(60)]}
        report = summarize_coverage(plan, [])
        self.assertEqual(report['status'], 'needs_inspection')
        self.assertEqual(report['scopeIntervals'], [])
        self.assertFalse(report['allGroupsResolved'])
        self.assertFalse(report['deliveryApproved'])
        self.assertEqual([(i['startFrame'], i['endFrame']) for i in report['selectionIntervals']], [(0,30),(35,60)])
        plan['seedObservations'].pop()
        self.assertEqual(summarize_coverage(plan, [])['selectionIntervals'], [])
        plan['seedObservations'].append({'frame':59,'groupId':'g0'})
        plan['seedConflicts'] = [{'frame': 12}]
        self.assertEqual(summarize_coverage(plan, [])['selectionIntervals'], [])
