import contextlib
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import health
from marketing_content_assets import repository, tos_storage
import requests


class HealthTest(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.cursor = self.conn.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.side_effect = [(1,), ('competitor/evidence/sample.webp',), (0, 0, 0, 0)]
        self.storage = MagicMock()
        self.storage.config.connect_ip = ''
        self.storage._signed_url_and_headers.return_value = ('https://sample.invalid', {})
        response = self.storage.session.get.return_value.__enter__.return_value
        response.status_code = 206
        response.raw.read.return_value = b'bytes'

    def test_probes_real_dependencies_readonly_without_inference_or_upload(self):
        session = MagicMock()
        session.get.side_effect = [Mock(status_code=200, json=lambda: {'ready': True}),
            Mock(status_code=200, json=lambda: {'data': [{'id': 'qwen3.5-4b'}]})]
        with patch.object(repository, 'connect_pg', return_value=contextlib.nullcontext(self.conn)), \
                patch.object(tos_storage.TosStorageConfig, 'from_env'), \
                patch.object(tos_storage, 'TosStorageClient', return_value=self.storage), \
                patch.object(requests, 'Session', return_value=contextlib.nullcontext(session)), \
                patch.dict(health.os.environ, {'CONTENT_AI_STUDIO_LOCAL_ASR_URL': 'http://localhost:8200',
                                              'FRAMEWORK_V2_VLM_BASE_URL': 'http://localhost:8100/v1',
                                              'FRAMEWORK_V2_VLM_MODEL': 'qwen3.5-4b'}):
            result = health.check()
        self.assertTrue(result['ok'])
        self.assertEqual(set(result['checks']), {'database', 'storage', 'asr', 'vlm', 'analysis_pipeline'})
        self.conn.set_session.assert_called_once_with(readonly=True)
        self.conn.rollback.assert_called_once()
        self.storage.upload_file.assert_not_called()
        self.storage.session.post.assert_not_called()
        self.assertEqual(session.get.call_count, 2)
        session.post.assert_not_called()
        self.storage.session.close.assert_called_once()

    def test_pinned_target_and_transport_error_are_safe_and_do_not_claim_route_proof(self):
        self.storage.config.connect_ip = '100.64.0.2'
        self.storage.session.get.side_effect = requests.ConnectionError('https://user:secret@host?token=private')
        with patch.object(repository, 'connect_pg', return_value=contextlib.nullcontext(self.conn)), \
                patch.object(tos_storage.TosStorageConfig, 'from_env'), \
                patch.object(tos_storage, 'TosStorageClient', return_value=self.storage), \
                patch.dict(health.os.environ, {'CONTENT_AI_STUDIO_LOCAL_ASR_URL': '', 'FRAMEWORK_V2_VLM_BASE_URL': ''}):
            result = health.check()
        self.assertEqual(result['checks']['storage'], {'ok': False, 'errorType': 'ConnectionError',
            'transportMode': 'pinned_ip', 'configuredConnectIp': '100.64.0.2'})
        self.assertNotIn('secret', str(result)); self.assertNotIn('private', str(result))
        self.storage.session.close.assert_called_once()

    def test_stalled_queue_is_unhealthy_even_when_storage_and_database_respond(self):
        self.cursor.fetchone.side_effect = [(1,), ('competitor/evidence/sample.webp',), (1, 0, 0, 0)]
        with patch.object(repository, 'connect_pg', return_value=contextlib.nullcontext(self.conn)), \
                patch.object(tos_storage.TosStorageConfig, 'from_env'), \
                patch.object(tos_storage, 'TosStorageClient', return_value=self.storage), \
                patch.dict(health.os.environ, {'CONTENT_AI_STUDIO_LOCAL_ASR_URL': '', 'FRAMEWORK_V2_VLM_BASE_URL': ''}):
            result = health.check()
        self.assertFalse(result['ok'])
        self.assertTrue(result['checks']['database']['ok'])
        self.assertTrue(result['checks']['storage']['ok'])
        self.assertEqual(result['checks']['analysis_pipeline']['queuedOver20Min'], 1)

    def test_failed_db_and_model_errors_are_sanitized(self):
        session = MagicMock()
        session.get.side_effect = requests.ConnectionError('https://user:secret@host')
        with patch.object(repository, 'connect_pg', side_effect=RuntimeError('password=private')), \
                patch.object(requests, 'Session', return_value=contextlib.nullcontext(session)), \
                patch.dict(health.os.environ, {'CONTENT_AI_STUDIO_LOCAL_ASR_URL': 'http://localhost:8200',
                                              'FRAMEWORK_V2_VLM_BASE_URL': ''}):
            result = health.check()
        self.assertFalse(result['ok'])
        self.assertNotIn('secret', str(result)); self.assertNotIn('private', str(result))
        self.assertFalse(result['checks']['database']['ok'])
        self.assertFalse(result['checks']['asr']['ok'])

    def test_peer_probe_accepts_relay_and_is_bounded(self):
        with patch.object(health.subprocess, 'run', return_value=Mock(returncode=0)) as run:
            self.assertTrue(health.peer_check('100.64.0.1')['ok'])
        self.assertIn('--until-direct=false', run.call_args.args[0])
        self.assertEqual(run.call_args.kwargs['timeout'], 8)
        with patch.object(health.subprocess, 'run') as run, self.assertRaises(ValueError):
            health.peer_check('not-an-ip')
        run.assert_not_called()


if __name__ == '__main__': unittest.main()
