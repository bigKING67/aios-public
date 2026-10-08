import os
import json
import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import selected_semantic_review as review
from content_production.caption_quality import document_digest
from content_production.execution import Cancelled, file_hash


def answer():
    return {'checks': [{'kind': k, 'verdict': 'uncertain', 'observation': 'requires evidence'} for k in review.KINDS]}


class SelectedSemanticTests(unittest.TestCase):
    def test_response_contract_rejects_forged_approval_duplicates_and_extra_fields(self):
        self.assertEqual(len(review.validate(answer())), 3)
        for mode in ('approval', 'duplicate', 'extra'):
            value = answer()
            if mode == 'approval': value['checks'][0]['verdict'] = 'passed'
            if mode == 'duplicate': value['checks'][1]['kind'] = value['checks'][0]['kind']
            if mode == 'extra': value['deliveryApproved'] = True
            with self.assertRaises(ValueError): review.validate(value)

    def run_case(self, *, words=True, failure=False, revoked=False, changed=False, limit=1, text_failure=False, visibility="readable", second_revoked=False, picture_verdict=None):
        conn = Mock(); conn.cursor.return_value.__enter__ = Mock(return_value=Mock(fetchone=lambda: ({'brief': 'fixture'},)))
        conn.cursor.return_value.__exit__ = Mock(return_value=False)
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder); video = work/'video.mp4'; video.write_bytes(b'fixture')
            snapshot = {'editDocument': {}}
            binding = {'documentSha256': document_digest({}), 'outputSha256': file_hash(video),
                       'windows': [{'clipId': 'a', 'startFrame': 0, 'endFrame': 30}, {'clipId': 'b', 'startFrame': 30, 'endFrame': 60}]}
            if changed: binding['outputSha256'] = 'a'*64
            receipt = {'host_selected_source_quality': binding}
            job = {'job_id': 'job', 'snapshot': snapshot, 'preview': False}
            link = {'run_id': 'run', 'execution_version': 1, 'plan_revision': 1}
            checkpoints = []
            def provider(messages):
                if failure: raise RuntimeError('provider lost')
                if isinstance(messages[1]['content'], str):
                    self.assertTrue(any(r['callsReserved'] == 1 and r['entries'][0]['status'] == 'observed'
                                        for r in checkpoints))
                    if text_failure: raise RuntimeError('text provider lost')
                    payload = json.loads(messages[1]['content'])
                    self.assertEqual(set(payload['items'][0]), {'id', 'visibleTexts', 'brief', 'narration', 'literalContextMatches'})
                    return {'checks': [{'id': payload['items'][0]['id'], 'relation': 'compatible', 'reason': 'text matches'}]}
                checks = [c for c in answer()['checks'] if c['kind'] != 'visible_text']
                if picture_verdict:
                    for check in checks:
                        check.update(verdict=picture_verdict if check['kind'] == 'picture_narration' else 'no_issue_observed',
                                     observation='实际冲洗；要求揉搓起泡过程' if check['kind'] == 'picture_narration' else '无明显技术缺陷')
                return {'checks': checks,
                        'visibleText': {'visibility': visibility, 'texts': ['text'] if visibility == 'readable' else []}}
            callback = Mock(side_effect=provider)
            def excerpt(source, request, target, tick): target.write_bytes(b'excerpt')
            rights = Mock(side_effect=[None, Cancelled('revoked later')] if second_revoked else Cancelled('revoked') if revoked else None)
            with patch.dict(os.environ, {'AIOS_VISUAL_REVIEW_MAX_CALLS': str(limit), 'AIOS_VISUAL_REVIEW_MODEL': 'fixture'}), \
                 patch.object(review, 'narration', return_value={'current': [{'text': 'text'}]} if words else None), \
                 patch.object(review, 'prepare_excerpt', excerpt), patch.object(review, 'chat_completion_callback', return_value=callback), \
                 patch.object(review, 'reserve_call') as reserve, \
                 patch.object(review, 'checkpoint', side_effect=lambda conn, job, report, **kwargs: checkpoints.append(copy.deepcopy(report))):
                if revoked or changed or second_revoked:
                    with self.assertRaises(Cancelled if revoked or second_revoked else ValueError):
                        review.review_job(conn, job, link, video, receipt, work, lambda: None, rights)
                    self.assertEqual(reserve.call_count, 1 if second_revoked else 0)
                    self.assertEqual(callback.call_count, 1 if second_revoked else 0)
                    return
                result = review.review_job(conn, job, link, video, receipt, work, lambda: None, rights)
                if callback.called:
                    sent_fps = callback.call_args_list[0].args[0][1]['content'][0]['fps']
                    self.assertEqual(sent_fps, result['samplingFps'])
                    self.assertTrue(0.2 <= sent_fps <= 5)
                    metadata = json.loads(callback.call_args_list[0].args[0][1]['content'][1]['text'])
                    self.assertNotIn('frames', metadata)
                    self.assertEqual(metadata['sourceFrameCount'], 30)
                    self.assertEqual(metadata['sampling'], {'requestedFps': sent_fps, 'decodedFrameCount': 'unknown'})
                return result, callback.call_count, reserve.call_count

    def test_budget_and_missing_narration_do_not_fake_coverage(self):
        result, calls, reserved = self.run_case()
        self.assertEqual((calls, reserved), (1, 1))
        self.assertEqual(result['entries'][0]['status'], 'observed')
        self.assertEqual(result['entries'][0]['textReview']['reason'], 'bounded_review_budget')
        self.assertEqual(result['entries'][1]['status'], 'not_reviewed')
        self.assertFalse(result['deliveryApproved'])
        result, calls, reserved = self.run_case(words=False)
        self.assertEqual((calls, reserved), (0, 0))
        self.assertEqual(result['entries'][0]['reason'], 'same_version_narration_missing')

    def test_split_uses_two_distinct_reservations_and_keeps_decisions_separate(self):
        result, calls, reserved = self.run_case(limit=2)
        self.assertEqual((calls, reserved), (2, 2))
        entry = result['entries'][0]
        self.assertEqual(entry['status'], 'reviewed')
        self.assertEqual({c['kind'] for c in entry['checks']}, {'picture_narration', 'visible_artifacts'})
        self.assertEqual(entry['textReview']['checks'][0]['relation'], 'compatible')
        self.assertNotEqual(entry['inputSha256'], entry['textReview']['inputSha256'])
        self.assertEqual(result['entries'][1]['reason'], 'bounded_review_budget')
        self.assertFalse(result['deliveryApproved'])

    def test_compatible_text_never_overrides_picture_conflict_or_missing_action_evidence(self):
        for verdict, action in [('issue_observed', 'reselect_source'), ('uncertain', 'collect_evidence')]:
            result, calls, reserved = self.run_case(limit=2, picture_verdict=verdict)
            self.assertEqual((calls, reserved), (2, 2))
            self.assertEqual(result['entries'][0]['textReview']['checks'][0]['relation'], 'compatible')
            proposals = [p for p in result['followUp']['proposals'] if p['target']['clipId'] == 'a']
            self.assertEqual([(p['category'], p['action']) for p in proposals], [('picture_narration', action)])
            self.assertEqual(proposals[0]['target']['startFrame'], 0)
            self.assertEqual(proposals[0]['evidencePath'], '/entries/0/checks/0')
            self.assertFalse(result['deliveryApproved'])
            self.assertEqual(result['followUp']['execution'], 'not_started')
            self.assertFalse(result['followUp']['constraints']['automaticCaptionRewriteAllowed'])

    def test_unclear_or_unseen_text_never_becomes_clean_approval(self):
        for visibility in ('uncertain', 'none_observed'):
            result, calls, reserved = self.run_case(limit=2, visibility=visibility)
            self.assertEqual((calls, reserved), (2, 2))  # one observation per window, no text call
            for entry in result['entries']:
                self.assertEqual(entry['status'], 'observed')
                self.assertEqual(entry['textReview']['reason'], 'insufficient_text_observation')

    def test_second_call_failure_retains_observation_and_consumes_budget(self):
        result, calls, reserved = self.run_case(limit=2, text_failure=True)
        self.assertEqual((calls, reserved), (2, 2))
        entry = result['entries'][0]
        self.assertEqual(entry['visibleText']['texts'], ['text'])
        self.assertEqual(entry['textReview']['status'], 'incomplete')
        self.assertEqual(entry['errorStage'], 'text_provider')
        self.assertEqual(result['callsReserved'], 2)
        self.run_case(limit=2, second_revoked=True)

    def test_lost_outcome_is_reserved_once_without_retry(self):
        result, calls, reserved = self.run_case(failure=True)
        self.assertEqual((calls, reserved), (1, 1))
        self.assertEqual(result['entries'][0]['status'], 'incomplete')
        self.assertEqual(result['callsReserved'], 1)

    def test_revoked_rights_and_changed_render_prevent_dispatch(self):
        self.run_case(revoked=True)
        self.run_case(changed=True)


if __name__ == '__main__': unittest.main()
