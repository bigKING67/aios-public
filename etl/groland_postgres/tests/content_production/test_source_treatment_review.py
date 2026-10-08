import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
import test_source_treatment as fixture
from content_production.caption_quality import assess_rendered_captions, caption_delivery_reason, document_digest
from content_production.edit_document import resolve_caption_display
from content_production.execution import Cancelled, file_hash
from content_production.source_treatment_captions import restore_narration_captions
from content_production.source_treatment_review import KINDS, prepare_review_candidate, review_treatment_render, validate_review


class TreatmentReviewTests(unittest.TestCase):
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
        self.reference = copy.deepcopy(self.case.document)
        self.reference['captions'][0]['anchor'].update(sourceStart={'num': 1, 'den': 1}, sourceEnd={'num': 5, 'den': 1})
        self.reference['captions'][0]['text'] = '主讲原声字幕'
        self.case.document['captions'] = []
        self.case.advance()
        state = self.case.advance()
        self.operation = Path(state['workDir'])
        self.prepared = prepare_review_candidate(self.operation, self.reference, self.case.bindings, self.case.media,
                                                 check=lambda: None)
        # Render receipt fixture isolates review binding. Actual renderer is tested separately.
        self.video = self.case.files['main']
        self.receipt = {'edit_document': {'sha256': document_digest(self.prepared['document'])},
                        'host_inspection': {'status': 'passed', 'sha256': file_hash(self.video)},
                        'output': {'sha256': file_hash(self.video)}}
        self.work = self.case.root / 'review'
        self.answer = {'checks': [{'kind': kind, 'verdict': 'uncertain', 'startFrame': 0, 'endFrame': 60,
                                   'observation': '四宫格夹具不足以确认该项质量'} for kind in KINDS]}

    def review(self, callback=None, check=lambda: None):
        def comparison(*args):
            path = self.work / 'comparison.mp4'
            path.write_bytes(b'bounded video transport fixture')
            return path
        with patch('content_production.source_treatment_review._comparison', side_effect=comparison), \
                patch('content_production.source_treatment_review.prepare_caption_evidence', return_value=({'samples': []}, [])):
            return review_treatment_render(self.operation, self.prepared, self.video, self.receipt, self.work,
                model='fixture-review-model', call_model=callback or (lambda _: self.answer), check=check)

    def test_restoration_preserves_text_times_style_and_only_overlays_changed_picture(self):
        candidate = self.prepared['document']
        base = json.loads((self.operation / 'candidate.json').read_text())
        self.assertEqual(candidate['clips'], base['clips'])
        self.assertEqual(candidate['assets'], base['assets'])
        self.assertEqual(candidate['captions'], self.reference['captions'])
        self.assertEqual(candidate['revision'], base['revision'] + 1)
        cue = resolve_caption_display(candidate)[0]
        self.assertEqual(cue['renderRanges'], [{'startFrame': 60, 'endFrame': 120}])
        self.assertEqual(cue['preservedSourceRanges'], [{'startFrame': 30, 'endFrame': 60}, {'startFrame': 120, 'endFrame': 150}])
        self.assertEqual(prepare_review_candidate(self.operation, self.reference, self.case.bindings, self.case.media,
                                                   check=lambda: None), self.prepared)
        self.assertEqual(self.case.provider.submits, 1)  # Restoring captions never submits erasure again.
        self.assertEqual(caption_delivery_reason({'editDocument': candidate},
            {'caption_quality': assess_rendered_captions(candidate)}), 'caption_quality_pending')

    def test_wrong_reference_default_style_and_cut_caption_rejected(self):
        base = json.loads((self.operation / 'candidate.json').read_text())
        bindings = json.loads((self.operation / 'bindings.json').read_text())
        media = json.loads((self.operation / 'media.json').read_text())
        for case in ('hash', 'version', 'style', 'cut', 'existing'):
            reference, target, ref_bindings = copy.deepcopy(self.reference), copy.deepcopy(base), copy.deepcopy(self.case.bindings)
            if case == 'hash':
                reference['assets'][0]['sha256'] = 'f' * 64
                ref_bindings['main']['sha256'] = 'f' * 64
            elif case == 'version':
                reference['assets'][0]['assetVersionId'] = 'other-version'
                reference['captions'][0]['anchor']['assetVersionId'] = 'other-version'
                ref_bindings['other-version'] = ref_bindings['main']
            elif case == 'style':
                reference['captions'][0]['stylePreset'] = 'basic-bottom-v1'
                del reference['captions'][0]['style']
            elif case == 'cut':
                target['clips'][-1]['timeline']['endFrame'] = 120
                target['clips'][-1]['sourceMap'][0].update(endFrame=120, sourceEnd={'num': 4, 'den': 1})
            else:
                target['captions'] = copy.deepcopy(reference['captions'])
            with self.subTest(case=case), self.assertRaises(ValueError):
                restore_narration_captions(target, bindings, media, reference, ref_bindings,
                                           {**self.case.media, 'other-version': self.case.media['main']})

    def test_restore_remaps_narration_clip_id_without_changing_source_times(self):
        base = json.loads((self.operation / 'candidate.json').read_text())
        base['clips'][-1]['id'] = 'new-narration-id'
        bindings, media = (json.loads((self.operation / name).read_text()) for name in ('bindings.json', 'media.json'))
        restored, _ = restore_narration_captions(base, bindings, media, self.reference, self.case.bindings, self.case.media)
        cue = copy.deepcopy(self.reference['captions'][0]); cue['anchor']['clipId'] = 'new-narration-id'
        self.assertEqual(restored['captions'], [cue])

    def test_review_reserves_one_call_and_keeps_uncertainty_and_no_approval(self):
        model = Mock(return_value=self.answer)
        report = self.review(model)
        self.assertEqual(report['status'], 'inconclusive')
        self.assertEqual(report['nextActions'], ['inspect_uncertainty'])
        self.assertFalse(report['deliveryApproved'])
        self.assertEqual(self.review(model), report)
        self.assertEqual(model.call_count, 1)
        content = model.call_args[0][0][1]['content']
        self.assertEqual(content[0]['fps'], 2)
        metadata = json.loads(content[1]['text'])
        self.assertEqual(metadata['expectedCaptions'][0]['startFrame'], 0)
        self.assertEqual(metadata['expectedCaptions'][0]['endFrame'], 60)
        self.assertEqual(metadata['eraseRegionsInSourcePanel'], fixture.REGIONS)
        self.assertTrue(metadata['protectSceneAndPackagingText'])

    def test_findings_route_captions_and_picture_independently(self):
        for entry in self.answer['checks']:
            entry['verdict'] = 'issue_observed' if entry['kind'] in ('residual_text', 'caption_readability') else 'no_issue_observed'
        report = self.review()
        self.assertEqual(report['nextActions'], ['repair_or_replace_picture', 'revise_subtitles'])
        self.assertEqual(report['status'], 'issues_found')
        self.assertFalse(report['deliveryApproved'])

    def test_alignment_finding_does_not_automatically_reselect_picture(self):
        for entry in self.answer['checks']:
            entry['verdict'] = 'issue_observed' if entry['kind'] == 'visual_alignment' else 'no_issue_observed'
        report = self.review()
        self.assertEqual(report['nextActions'], ['inspect_alignment'])
        self.assertFalse(report['deliveryApproved'])

    def test_no_observed_issues_never_grants_delivery(self):
        for entry in self.answer['checks']: entry['verdict'] = 'no_issue_observed'
        report = self.review()
        self.assertEqual(report['status'], 'no_issues_reported')
        self.assertEqual(report['nextActions'], ['await_product_quality_evidence'])
        self.assertFalse(report['deliveryApproved'])

    def test_invalid_model_evidence_preserved_and_not_called_twice(self):
        self.answer['checks'].pop()
        model = Mock(return_value=self.answer)
        with self.assertRaisesRegex(ValueError, 'coverage'): self.review(model)
        self.assertEqual(json.loads((self.work / 'model-response.json').read_text()), self.answer)
        self.assertEqual(self.review(model)['status'], 'invalid_response')
        self.assertEqual(model.call_count, 1)

    def test_transport_failure_and_cancellation_do_not_repeat_calls(self):
        model = Mock(side_effect=TimeoutError('fixture'))
        with self.assertRaises(TimeoutError): self.review(model)
        self.assertEqual(self.review(model)['status'], 'failed')
        self.assertEqual(model.call_count, 1)
        self.work = self.case.root / 'cancelled-review'
        stopped = False
        def cancel_after_call(_):
            nonlocal stopped
            stopped = True
            return self.answer
        def check():
            if stopped: raise Cancelled('fixture')
        with self.assertRaises(Cancelled): self.review(cancel_after_call, check)
        self.assertEqual(self.review(model)['status'], 'failed')
        self.assertEqual(model.call_count, 1)

    def test_changed_render_candidate_and_report_fail_before_another_call(self):
        model = Mock(return_value=self.answer)
        self.review(model)
        for key in ('deliveryApproved', 'nextActions'):
            original = (self.work / 'review.json').read_text()
            report = json.loads(original)
            report[key] = True if key == 'deliveryApproved' else ['approve']
            (self.work / 'review.json').write_text(json.dumps(report))
            with self.assertRaises(ValueError): self.review(model)
            (self.work / 'review.json').write_text(original)
        self.receipt['edit_document']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'inspected render'): self.review(model)
        self.assertEqual(model.call_count, 1)

    def test_unknown_fields_missing_dimensions_and_bad_time_ranges_rejected(self):
        for case in ('approved', 'missing', 'repeat', 'negative', 'zero', 'beyond', 'bool'):
            answer = copy.deepcopy(self.answer)
            if case == 'approved': answer['approved'] = True
            elif case == 'missing': answer['checks'].pop()
            elif case == 'repeat': answer['checks'][1] = copy.deepcopy(answer['checks'][0])
            elif case == 'negative': answer['checks'][0]['startFrame'] = -1
            elif case == 'zero': answer['checks'][0]['endFrame'] = 0
            elif case == 'beyond': answer['checks'][0]['endFrame'] = 61
            else: answer['checks'][0]['startFrame'] = True
            with self.subTest(case=case), self.assertRaises(ValueError): validate_review(answer, 60)


if __name__ == '__main__': unittest.main()
