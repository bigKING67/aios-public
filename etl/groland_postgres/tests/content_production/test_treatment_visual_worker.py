import copy
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

import test_source_treatment as fixture
from content_production.caption_quality import document_digest
from content_production.execution import Cancelled, file_hash
from content_production.source_treatment_adoption import _prepare
from content_production.treatment_visual_input import KINDS
from content_production.treatment_visual_worker import review_render, review_job
from content_production.workspace import WorkspaceLimit


class VisualWorkerTests(unittest.TestCase):
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
        assets = []
        for asset in self.case.document['assets']:
            old = asset['assetVersionId']
            version = f"{old}-{asset['sha256'][:16]}"
            asset['assetVersionId'] = version
            self.case.bindings[version] = self.case.bindings.pop(old)
            self.case.media[version] = self.case.media.pop(old)
            for cue in self.case.document['captions']:
                if cue['anchor']['assetVersionId'] == old:
                    cue['anchor']['assetVersionId'] = version
            assets.append({'assetId': old, 'sha256': asset['sha256'], 'objectKey': old+'.mp4',
                'durationMs': self.case.bindings[version]['durationMs']})
        snapshot = {'assets': assets, 'editDocument': copy.deepcopy(self.case.document)}
        self.case.advance()
        state = self.case.advance()
        operation = Path(state['workDir'])
        load = lambda name: json.loads((operation / name).read_text())
        frozen, _ = _prepare({'snapshot': snapshot, 'latest_revision': 1}, state, load('request.json'),
            load('candidate.json'), load('media.json'), operation, 'fixture', lambda: None)
        self.job = {'snapshot': frozen, 'project_id': 'fixture', 'job_id': 'job', 'revision': 2, 'preview': False}
        self.link = {'run_id': 'run', 'execution_version': 3, 'plan_revision': 4}
        self.media = {a['assetId']: self.case.files[a['assetId']] for a in assets}
        self.media[frozen['derivedAssets'][0]['assetVersionId']] = operation / 'output.mp4'
        self.video = self.case.files['main']  # Only binding tests here; E2E uses actual render.
        self.receipt = {'edit_document': {'sha256': document_digest(frozen['editDocument'])},
            'host_inspection': {'status': 'passed', 'sha256': file_hash(self.video)},
            'output': {'sha256': file_hash(self.video)}}
        self.answer = {'checks': [{'kind': k, 'verdict': 'uncertain', 'startFrame': 0,
            'endFrame': 60, 'observation': '有界传输夹具'} for k in KINDS]}
        self.callback = Mock(return_value=self.answer)
        self.reserve, self.rights = Mock(), Mock()
        self.saved = []

    def review(self, tick=lambda: None):
        def comparison(*args):
            path = args[-2] / 'comparison.mp4'
            path.write_bytes(b'fixture')
            return path
        with patch('content_production.treatment_visual_worker.comparison_video', side_effect=comparison), \
                patch('content_production.treatment_visual_worker.prepare_caption_evidence', return_value=({'samples': []}, [])):
            return review_render(self.job, self.link, self.media, self.video, self.receipt, self.case.root,
                limit=1, model='fixture', callback_factory=lambda: self.callback,
                reserve=self.reserve, persist=lambda r: self.saved.append(copy.deepcopy(r)),
                revalidate=self.rights, tick=tick)

    def test_reserved_before_dispatch_and_bound_to_current_run(self):
        before = copy.deepcopy(self.job['snapshot'])
        def call(_):
            self.assertEqual(self.saved[-1]['entries'][0]['status'], 'reserved')
            self.assertEqual(self.saved[-1]['callsReserved'], 1)
            self.reserve.assert_called_once()
            self.rights.assert_called_once()
            return self.answer
        self.callback.side_effect = call
        result = self.review()
        self.assertEqual(result['identity']['executionVersion'], 3)
        self.assertEqual(result['identity']['projectRevision'], 2)
        self.assertEqual(result['status'], 'reviewed')
        self.assertEqual(result['entries'][0]['status'], 'inconclusive')
        self.assertFalse(result['deliveryApproved'])
        self.assertEqual(self.job['snapshot'], before)

    def test_no_issues_and_picture_issues_never_grant_delivery(self):
        for c in self.answer['checks']: c['verdict'] = 'no_issue_observed'
        self.answer['checks'][0]['verdict'] = 'issue_observed'
        result = self.review()
        self.assertEqual(result['entries'][0]['nextActions'], ['repair_or_replace_picture'])
        self.assertFalse(result['deliveryApproved'])

    def test_invalid_response_keeps_cost_and_no_raw_response(self):
        self.callback.return_value = {'private': 'never-persist-this'}
        result = self.review()
        self.assertEqual(result['status'], 'incomplete')
        self.assertEqual(result['callsReserved'], 1)
        self.callback.assert_called_once()
        self.assertNotIn('never-persist-this', json.dumps(self.saved))
        self.assertIn('responseSha256', result['entries'][0])

    def test_transport_failure_no_retry_and_no_private_error(self):
        self.callback.side_effect = TimeoutError('private-provider-url')
        result = self.review()
        self.assertEqual(result['callsReserved'], 1)
        self.assertEqual(result['status'], 'incomplete')
        self.callback.assert_called_once()
        self.assertNotIn('private-provider-url', json.dumps(result))

    def test_rights_revoked_does_not_transmit_or_reserve(self):
        self.rights.side_effect = RuntimeError('rights revoked')
        with self.assertRaisesRegex(RuntimeError, 'rights revoked'):
            self.review()
        self.callback.assert_not_called()
        self.reserve.assert_not_called()

    def test_stale_render_rejected_before_spending(self):
        self.receipt['edit_document']['sha256'] = 'f'*64
        with self.assertRaises(ValueError): self.review()
        self.reserve.assert_not_called()
        self.callback.assert_not_called()

    def test_real_comparison_has_four_panels_and_exact_frame_count(self):
        import subprocess
        from content_production.derived_assets import document_media
        from content_production.source_treatment_media import prepare_excerpt
        from content_production.treatment_visual_input import comparison_video, review_messages
        asset = self.job['snapshot']['derivedAssets'][0]
        request = asset['treatmentRequest']
        folder = self.case.root / 'comparison-test'
        folder.mkdir()
        before = folder / 'input.mp4'
        prepare_excerpt(self.media[asset['parentAssetId']], request, before, lambda: None)
        video = comparison_video(before, self.media[asset['assetVersionId']], request,
            self.job['snapshot']['editDocument'], document_media(self.job['snapshot'], self.media),
            self.video, folder, lambda: None)
        probe = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', str(video)],
            check=True, capture_output=True, text=True)
        stream = json.loads(probe.stdout)['streams'][0]
        self.assertEqual((stream['width'], stream['height'], stream['nb_read_frames']), (720, 1280, '60'))
        messages, metadata = review_messages(request, self.job['snapshot']['editDocument'], video)
        self.assertEqual(len(metadata['panels']), 4)
        self.assertTrue(messages[1]['content'][0]['video_url'].startswith('data:video/mp4;base64,'))

    def test_cancel_and_workspace_limit_propagate(self):
        for error in (Cancelled('cancel'), WorkspaceLimit('budget')):
            with self.subTest(error=type(error).__name__):
                with self.assertRaises(type(error)):
                    self.review(tick=Mock(side_effect=error))
        self.callback.assert_not_called()

    def test_caption_detail_samples_exact_ranges_and_binds_actual_images(self):
        from content_production.caption_visual_evidence import sample_plan, prepare_caption_evidence
        from content_production.derived_assets import document_media
        from content_production.source_treatment_media import prepare_excerpt
        from content_production.treatment_visual_input import comparison_video, review_messages
        document = self.job['snapshot']['editDocument']
        template = copy.deepcopy(document['captions'][0])
        document['captions'] = []
        for index, (start, end) in enumerate([(60, 61), (61, 70), (70, 100), (100, 120)]):
            cue = copy.deepcopy(template)
            cue['id'] = f'cue{index}'
            cue['anchor'].update(sourceStart={'num': start, 'den': 30}, sourceEnd={'num': end, 'den': 30})
            document['captions'].append(cue)
        asset = self.job['snapshot']['derivedAssets'][0]
        request = asset['treatmentRequest']
        before_doc = copy.deepcopy(document)
        plan = sample_plan(request, document)
        self.assertEqual(plan['eligibleIntervals'], 4)
        self.assertEqual([(s['relativeFrame'], s['captionId']) for s in plan['samples']], [(5, 'cue1'), (24, 'cue2'), (49, 'cue3')])
        self.assertEqual(document, before_doc)
        folder = self.case.root / 'caption-details'
        folder.mkdir()
        before = folder / 'input.mp4'
        prepare_excerpt(self.media[asset['parentAssetId']], request, before, lambda: None)
        comparison = comparison_video(before, self.media[asset['assetVersionId']], request, document,
            document_media(self.job['snapshot'], self.media), self.video, folder, lambda: None)
        evidence, images = prepare_caption_evidence(request, document, folder, lambda: None)
        self.assertEqual(len(images), 3)
        import struct
        for image, sample in zip(images, evidence['samples']):
            data = image.read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', data[16:24]), (160, sample['cropHeight'] * 2))
            self.assertEqual(sample['imageSha256'], file_hash(image))
        messages, metadata = review_messages(request, document, comparison,
            caption_evidence=evidence, detail_images=images)
        self.assertEqual(len(messages[1]['content']), 5)
        self.assertEqual(messages[1]['content'][1]['detail'], 'high')
        self.assertEqual(metadata['captionEvidence']['geometryBasis'], 'requested_style_band_not_detected_text')
        images[0].write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'image changed'):
            review_messages(request, document, comparison, caption_evidence=evidence, detail_images=images)
        # Combined input budget is checked before reading/base64 encoding a large file.
        evidence['samples'][0]['imageSha256'] = file_hash(images[0])
        with comparison.open('wb') as stream: stream.truncate(12 * 1024 * 1024)
        with self.assertRaisesRegex(ValueError, 'combined'):
            review_messages(request, document, comparison, caption_evidence=evidence, detail_images=images)

    def test_single_frame_caption_never_samples_after_its_end(self):
        from content_production.caption_visual_evidence import sample_plan
        document = self.job['snapshot']['editDocument']
        document['captions'][0]['anchor'].update(sourceStart={'num': 60, 'den': 30}, sourceEnd={'num': 61, 'den': 30})
        request = self.job['snapshot']['derivedAssets'][0]['treatmentRequest']
        plan = sample_plan(request, document)
        self.assertEqual(plan['samples'][0]['relativeFrame'], 0)
        self.assertEqual(plan['samples'][0]['endFrame'], 1)
        document['captions'] = []
        self.assertEqual(sample_plan(request, document)['samples'], [])

    def test_disabled_preview_and_untreated_never_call_model(self):
        import os
        for enabled, preview, treated in [('0', False, True), ('1', True, True), ('1', False, False)]:
            job = copy.deepcopy(self.job)
            job['preview'] = preview
            if not treated: job['snapshot'].pop('derivedAssets')
            with patch.dict(os.environ, {'AIOS_VISUAL_REVIEW_MAX_CALLS': enabled}), patch('content_production.treatment_visual_worker.chat_completion_callback') as model:
                self.assertIsNone(review_job(None, job, self.link, self.media, self.video, self.receipt,
                    self.case.root, lambda: None, lambda: None))
                model.assert_not_called()


if __name__ == '__main__': unittest.main()
