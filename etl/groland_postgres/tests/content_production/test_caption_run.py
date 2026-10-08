import copy
import unittest
from unittest.mock import Mock
from uuid import uuid4

from content_production.caption_run import restore_run_captions, adopt_run_caption_candidate
from edit_document_fixture import fixture


class CaptionRunTests(unittest.TestCase):
    def case(self):
        document, bindings, _ = fixture()
        document['clips'][-1]['id'] = 'narration'
        sources = []
        for asset in document['assets']:
            ident = str(uuid4())
            old, new = asset['assetVersionId'], f"{ident}-{asset['sha256'][:16]}"
            bindings[new] = bindings.pop(old)
            asset['assetVersionId'] = new
            sources.append({'assetId': ident, 'objectKey': f'{ident}.mp4', 'sha256': asset['sha256'], 'durationMs': 6000})
        source = sources[-1]
        target = {'assets': sources, 'editDocument': document, 'renderBinding': {'captionFont': {'profile': 'test', 'sha256': 'd' * 64}},
                  'derivedAssets': [{'assetVersionId': 'treated-fixture', 'sha256': 'e' * 64, 'objectKey': 'treated.mp4', 'durationMs': 1000}]}
        reference = copy.deepcopy(target)
        reference['editDocument']['captionDisplayPolicy'] = 'source-hold-v1'
        reference['editDocument']['captions'] = [{
            'id': 'speech', 'text': '保留原字幕', 'stylePreset': 'source-style-v1',
            'style': {'fontHeight': .035, 'centerY': .72, 'color': '#ffffff', 'strokeWidth': .0015, 'weight': 700},
            'anchor': {'kind': 'source', 'clipId': 'narration', 'assetVersionId': document['assets'][-1]['assetVersionId'],
                       'sourceStart': {'num': 1, 'den': 1}, 'sourceEnd': {'num': 2, 'den': 1}}}]
        run = {'runId': str(uuid4()), 'projectId': str(uuid4()), 'projectRevision': 2, 'planRevision': 1,
               'version': 7, 'status': 'waiting', 'request': {'narrationAssetId': source['assetId']}}
        detail = {'run': run, 'plan': {'document': {'clips': [], 'reasons': [], 'summary': 'fixture'}}}
        ref_id = str(uuid4())
        calls = []
        def api(method, path, body=None):
            calls.append((method, path, copy.deepcopy(body)))
            if method == 'GET' and path.startswith('runs/'):
                return copy.deepcopy(detail)
            if path == f"projects/{run['projectId']}":
                return {'project': {'revision': 2, 'snapshot': target}}
            if path == f'projects/{ref_id}':
                return {'project': {'revision': 1, 'snapshot': reference}}
            if path.endswith('/plan-revisions'):
                return {'run': {**run, 'version': 8, 'planRevision': 2}}
            if path.endswith('/produce'):
                return {'run': {**run, 'projectRevision': 3, 'renderJobId': 'job'}}
            raise AssertionError(path)
        return api, calls, detail, reference, ref_id

    def test_reference_is_copied_and_one_versioned_render_is_queued(self):
        api, calls, detail, reference, ref_id = self.case()
        original = copy.deepcopy(reference)
        result = restore_run_captions(api, detail['run']['runId'], reference_project_id=ref_id, reference_revision=1)
        writes = [c for c in calls if c[0] == 'POST']
        self.assertEqual(len(writes), 2)
        cue = writes[0][2]['document']['narrationCaptions']['cues'][0]
        self.assertEqual(cue['text'], '保留原字幕')
        self.assertEqual(cue['startMs'], 1000)
        self.assertEqual(cue['style'], reference['editDocument']['captions'][0]['style'])
        self.assertEqual(writes[1][2]['expectedProjectRevision'], 2)
        self.assertEqual(result['restoration']['referenceRevision'], 1)
        self.assertFalse(result['restoration']['deliveryApproved'])
        self.assertEqual(reference, original)

    def test_stale_reference_missing_style_wrong_font_and_wrong_source_do_not_write(self):
        for change in ['revision', 'style', 'font', 'source', 'submillisecond']:
            api, calls, detail, ref, ref_id = self.case()
            cue = ref['editDocument']['captions'][0]
            if change == 'style': cue['stylePreset'] = 'basic-bottom-v1'; cue.pop('style')
            if change == 'font': ref['renderBinding']['captionFont']['sha256'] = 'f' * 64
            if change == 'source': ref['assets'][-1]['sha256'] = 'f' * 64
            if change == 'submillisecond': cue['anchor']['sourceStart'] = {'num': 3001, 'den': 3000}
            with self.subTest(change=change), self.assertRaises(ValueError):
                restore_run_captions(api, detail['run']['runId'], reference_project_id=ref_id,
                                     reference_revision=2 if change == 'revision' else 1)
            self.assertFalse(any(c[0] == 'POST' for c in calls))

    def test_unknown_write_outcome_is_not_retried(self):
        api, calls, detail, _, ref_id = self.case()
        def failing(method, path, body=None):
            if method == 'POST':
                calls.append((method, path, body))
                raise TimeoutError('outcome unknown')
            return api(method, path, body)
        with self.assertRaises(TimeoutError):
            restore_run_captions(failing, detail['run']['runId'], reference_project_id=ref_id, reference_revision=1)
        self.assertEqual(sum(c[0] == 'POST' for c in calls), 1)

    def test_missing_or_stale_candidate_does_not_write(self):
        _, _, detail, _, _ = self.case()
        api = Mock(side_effect=[detail, {}])
        self.assertEqual(adopt_run_caption_candidate(api, detail['run']['runId'])['status'], 'no_candidate')
        candidate = {'expectedVersion': 6, 'expectedPlanRevision': 1, 'expectedProjectRevision': 2}
        api = Mock(side_effect=[detail, {'captionCandidate': candidate}])
        with self.assertRaises(ValueError): adopt_run_caption_candidate(api, detail['run']['runId'])
        self.assertEqual(api.call_count, 2)
