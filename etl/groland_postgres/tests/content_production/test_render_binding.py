import copy
from contextlib import ExitStack
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from content_production.render_binding import current_binding, require_binding, attach_receipt, receipt_matches, RenderBindingMismatch
from content_production.worker import process_one


class RenderBindingTests(unittest.TestCase):
    def test_api_embedded_identity_matches_worker_and_bundled_font(self):
        repo = Path(__file__).resolve().parents[4]
        expected = current_binding()
        api = json.loads((repo / 'backend-rust/src/marketing/content_assets/production/render-binding.json').read_text())
        font = json.loads((repo / 'docker/content-production/renderer/fonts/manifest.json').read_text())
        self.assertEqual(api, expected)
        self.assertEqual(expected['captionFont'], {key: font[key] for key in ('profile', 'sha256')})

    def test_binding_is_required_for_runs_and_never_replaced_with_todays_version(self):
        binding = current_binding()
        frozen = {'renderBinding': copy.deepcopy(binding)}
        self.assertEqual(require_binding(frozen, required=True), binding)
        newer = {**binding, 'rendererLockSha256': 'f' * 64}
        with patch('content_production.render_binding.current_binding', return_value=newer):
            with self.assertRaises(RenderBindingMismatch):
                require_binding(frozen)
        self.assertEqual(frozen['renderBinding'], binding)
        for value in [None, {}, {**binding, 'contractVersion': True}, {**binding, 'engineVersion': 'next'}, {**binding, 'captionFont': {'profile': 'other'}}]:
            with self.assertRaises(RenderBindingMismatch):
                require_binding({'renderBinding': value})
        with self.assertRaises(RenderBindingMismatch):
            require_binding({}, required=True)
        self.assertIsNone(require_binding({}))

    def test_receipt_keeps_original_identity_after_package_upgrade(self):
        snapshot = {'renderBinding': current_binding()}
        receipt = {'engine': snapshot['renderBinding']['engine'], 'engine_version': snapshot['renderBinding']['engineVersion']}
        attach_receipt(snapshot, receipt)
        with patch('content_production.render_binding.current_binding', side_effect=AssertionError('delivery must not compare against new installation')):
            self.assertTrue(receipt_matches(snapshot, receipt))
            self.assertFalse(receipt_matches(snapshot, {}))
            self.assertFalse(receipt_matches(snapshot, {'render_binding': {**snapshot['renderBinding'], 'contractVersion': 2}}))
            self.assertFalse(receipt_matches(snapshot, {'render_binding': {**snapshot['renderBinding'], 'contractVersion': True}}))
            cloud = {'engine': 'mediakit/multi-track-edit', 'mediakit': {'taskId': 't'}}
            plain = {**snapshot, 'editDocument': None, 'clips': [{'caption': ''}]}
            self.assertTrue(receipt_matches(plain, cloud))
            self.assertFalse(receipt_matches(plain, {**cloud, 'render_binding': snapshot['renderBinding']}))
            self.assertFalse(receipt_matches(plain, {'engine': 'mediakit/multi-track-edit'}))
            self.assertFalse(receipt_matches({**plain, 'clips': [{'caption': '字幕'}]}, cloud))
            self.assertFalse(receipt_matches({**plain, 'editDocument': {}}, cloud))
            self.assertFalse(receipt_matches({'renderBinding': {'unrecognized': 1}}, {'render_binding': {'unrecognized': 1}}))
        with self.assertRaises(RenderBindingMismatch):
            attach_receipt(snapshot, {'engine': 'other', 'engine_version': '0'})

    def test_worker_rejects_missing_or_wrong_binding_before_sources_download_or_render(self):
        for binding in [None, {**current_binding(), 'rendererLockSha256': 'f' * 64}]:
            with self.subTest(binding=binding), tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
                stack.enter_context(patch.dict(os.environ, {'CONTENT_PRODUCTION_ENABLED': 'true', 'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES': '1'}))
                mocked = {key: stack.enter_context(patch('content_production.worker.' + key)) for key in (
                    'verify_module', 'TosStorageClient', 'TosStorageConfig.from_env', 'connect_pg', 'claim',
                    'run_bridge.reconcile', 'run_bridge.linkage', 'finish', 'verify_sources', 'download', 'render_local')}
                snapshot = {'assets': [], 'aspect': 'portrait'}
                if binding is not None:
                    snapshot['renderBinding'] = binding
                mocked['claim'].return_value = {'job_id': 'job', 'snapshot': snapshot}
                mocked['run_bridge.linkage'].return_value = {'run_id': 'run'}
                mocked['finish'].return_value = True
                result = process_one(Path(tmp), Path(tmp))
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(result['errorType'], 'RenderBindingMismatch')
                for key in ('verify_sources', 'download', 'render_local'):
                    mocked[key].assert_not_called()
                mocked['TosStorageClient'].return_value.upload_file.assert_not_called()
                self.assertIn('版本', mocked['finish'].call_args.kwargs['error'])
