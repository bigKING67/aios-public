import copy
import unittest
from content_production.selected_review_actions import propose_follow_up


def report():
    return {'runId': 'run', 'jobId': 'job', 'documentSha256': 'a'*64, 'outputSha256': 'b'*64,
            'entries': [{'clipId': 'clip', 'status': 'reviewed',
                'window': {'clipId': 'clip', 'startFrame': 927, 'endFrame': 960,
                           'assetVersionId': 'source-version', 'sha256': 'c'*64},
                'checks': [{'kind': k, 'verdict': 'no_issue_observed', 'observation': 'clear'}
                           for k in ('picture_narration', 'visible_artifacts')],
                'textReview': {'status': 'reviewed', 'checks': [{'id': 'clip', 'relation': 'compatible', 'reason': 'compatible'}]}}]}


class FollowUpTests(unittest.TestCase):
    def test_clear_observations_never_approve_delivery_or_change_input(self):
        value = report(); before = copy.deepcopy(value)
        result = propose_follow_up(value)
        self.assertEqual(result['status'], 'observations_only')
        self.assertEqual(result['proposals'], [])
        self.assertFalse(result['deliveryApproved'])
        self.assertEqual(result['execution'], 'not_started')
        self.assertEqual(value, before)
        self.assertEqual(result['binding']['outputSha256'], value['outputSha256'])

    def test_independent_conflicts_have_different_actions_and_resolvable_evidence(self):
        value = report(); entry = value['entries'][0]
        for check in entry['checks']: check['verdict'] = 'issue_observed'
        entry['textReview']['checks'][0].update(relation='conflict', reason='old activity text conflicts')
        result = propose_follow_up(value)
        self.assertEqual(result['status'], 'revision_proposed')
        self.assertEqual([(p['category'], p['action']) for p in result['proposals']], [
            ('picture_narration', 'reselect_source'), ('visible_artifacts', 'compare_source_and_render'),
            ('visible_text', 'reselect_source')])
        for proposal in result['proposals']:
            node = value
            for key in proposal['evidencePath'].split('/')[1:]:
                node = node[int(key)] if isinstance(node, list) else node[key]
            self.assertIsInstance(node, dict)
            self.assertEqual(proposal['target']['startFrame'], 927)
            self.assertEqual(proposal['target']['assetVersionId'], 'source-version')
        self.assertFalse(result['constraints']['automaticErasureAllowed'])
        self.assertFalse(result['constraints']['automaticCaptionRewriteAllowed'])

    def test_missing_failed_or_uncertain_review_requests_evidence_not_reediting(self):
        for state in ('missing', 'uncertain', 'incomplete'):
            value = report(); entry = value['entries'][0]
            if state == 'missing':
                entry.pop('checks'); entry.pop('textReview'); entry['reason'] = 'bounded_review_budget'
            elif state == 'uncertain':
                entry['checks'][0]['verdict'] = 'uncertain'
                entry['textReview']['checks'][0]['relation'] = 'uncertain'
            else:
                entry['textReview'] = {'status': 'incomplete', 'errorStage': 'text_provider'}
            result = propose_follow_up(value)
            self.assertEqual(result['status'], 'evidence_required')
            self.assertTrue(all(p['action'] == 'collect_evidence' for p in result['proposals']))
            self.assertFalse(result['deliveryApproved'])
        value = report(); value['entries'] = []
        self.assertEqual(propose_follow_up(value)['status'], 'evidence_required')


if __name__ == '__main__': unittest.main()
