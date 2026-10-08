import copy
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_worker import run_review, review_job
from content_production.execution import Cancelled
import test_caption_review_revision as revision_fixture
from content_production.caption_execution import derive_caption_document


class CaptionWorkerTests(unittest.TestCase):
    def run_case(self, limit, *, semantic=True, fail=False, reserve=None, tick=None):
        doc, review, bindings, media, target = revision_fixture.ReviewRevisionTests().setup_case()
        if not semantic:
            review['reviews'][0]['issues'][0]['kind'] = 'uncertain_term'
        candidate = copy.deepcopy(derive_caption_document(doc)[0])
        candidate['captions'][0]['text'] = '就是\n这款'
        answers = [{'reviews': review['reviews']}, {'captions': [
            {'captionId': target['id'], 'lines': ['就是', '这款']}]},
            {'reviews': [{'captionId': c['id'], 'issues': []} for c in candidate['captions']]}]
        provider = Mock(side_effect=TimeoutError('private provider error') if fail else answers)
        reservations = reserve or Mock()
        before = copy.deepcopy(doc)
        result = run_review(doc, bindings, media, limit=limit, model='fixture',
            callback_factory=lambda schema: provider, reserve=reservations, tick=tick or (lambda: None))
        self.assertEqual(doc, before)
        return result, provider, reservations

    def test_limits_and_candidate_separation(self):
        for limit in (1, 2, 3):
            with self.subTest(limit=limit):
                result, calls, reserve = self.run_case(limit)
                self.assertEqual(calls.call_count, limit)
                self.assertEqual(reserve.call_count, limit)
                self.assertEqual(result['callsReserved'], limit)
                self.assertFalse(result['candidateRendered'])
                self.assertFalse(result['deliveryApproved'])
                self.assertEqual('candidate' in result, limit >= 2)
                self.assertEqual('candidateReview' in result, limit == 3)

    def test_term_only_stops_after_review(self):
        result, calls, _ = self.run_case(3, semantic=False)
        self.assertEqual(calls.call_count, 1)
        self.assertEqual(result['review']['nextAction'], 'verify_product_terms')

    def test_timeout_never_retries_or_leaks_error(self):
        result, calls, reserve = self.run_case(3, fail=True)
        self.assertEqual(calls.call_count, 1)
        self.assertEqual(reserve.call_count, 1)
        self.assertEqual(result['status'], 'incomplete')
        self.assertNotIn('private', str(result))

    def test_reservation_rejection_precedes_provider(self):
        provider = Mock()
        with self.assertRaises(Cancelled):
            run_review(revision_fixture.ReviewRevisionTests().setup_case()[0], {}, {}, limit=3, model='fixture',
                callback_factory=lambda schema: provider,
                reserve=Mock(side_effect=Cancelled('expired')), tick=lambda: None)
        provider.assert_not_called()

    def test_cancel_during_call_stops_followups(self):
        with self.assertRaises(Cancelled):
            self.run_case(3, tick=Mock(side_effect=[None, Cancelled('stopped')]))

    def test_default_disabled_and_preview_have_no_side_effects(self):
        for env, preview in [({}, False), ({'AIOS_CAPTION_WORKER_MAX_CALLS': '3'}, True)]:
            with patch.dict(os.environ, env, clear=True):
                self.assertIsNone(review_job(None, {'preview': preview, 'snapshot': {}}, {}, Mock()))

    def test_derived_explicit_captions_use_frozen_media_bindings(self):
        doc, _, bindings, media = revision_fixture.ReviewRevisionTests().explicit_case()
        import json
        sources, by_id = [], {}
        for index, asset in enumerate(doc['assets']):
            ident = f'asset-{index}'
            old, version = asset['assetVersionId'], f'{ident}-{asset["sha256"][:16]}'
            doc = json.loads(json.dumps(doc).replace(old, version))
            sources.append({'assetId': ident, 'sha256': asset['sha256'], 'durationMs': bindings[old]['durationMs']})
            by_id[ident] = media[old]
        derived = {'assetVersionId': 'treated-test', 'sha256': 'f' * 64, 'durationMs': 1000}
        by_id['treated-test'] = '/fixture/treated.mp4'
        job = {'preview': False, 'snapshot': {'assets': sources, 'derivedAssets': [derived], 'editDocument': doc}}
        with patch.dict(os.environ, {'AIOS_CAPTION_WORKER_MAX_CALLS': '3'}, clear=True), \
                patch('content_production.caption_worker.run_review', return_value={}) as review:
            review_job(None, job, by_id, Mock())
            self.assertEqual(review.call_args.args[1]['treated-test']['sha256'], 'f' * 64)
            self.assertEqual(review.call_args.args[2]['treated-test'], '/fixture/treated.mp4')
            job['snapshot'].pop('derivedAssets')
            review.reset_mock()
            self.assertIsNone(review_job(None, job, by_id, Mock()))
            review.assert_not_called()


if __name__ == '__main__':
    unittest.main()
