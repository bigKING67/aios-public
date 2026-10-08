import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from content_production import caption_preflight_worker as worker


class CaptionPreflightWorkerTests(unittest.TestCase):
    def test_disabled_or_invalid_configuration_never_opens_database(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(worker, 'connect_pg') as connect:
            with self.assertRaisesRegex(RuntimeError, 'disabled'):
                worker.process_one(Path('/unused'))
            os.environ.update(CONTENT_PRODUCTION_ENABLED='true', CONTENT_PRODUCTION_RUNS_ENABLED='true',
                              AIOS_CAPTION_PREFLIGHT_ENABLED='true', AIOS_CAPTION_PREFLIGHT_MAX_CALLS='8')
            with self.assertRaisesRegex(ValueError, '3..7'):
                worker.process_one(Path('/unused'))
            os.environ['AIOS_CAPTION_PREFLIGHT_MAX_CALLS'] = '3'
            with self.assertRaises(ValueError):
                worker.process_one(Path('/unused'))
            connect.assert_not_called()

    def test_host_budget_and_model_gate_precede_permission_network(self):
        client, tick = Mock(), Mock()
        gate = worker.BoundedPermissions(client, 'fixture', 3, tick)
        for request in ({'model': 'other', 'maxCalls': 3}, {'model': 'fixture', 'maxCalls': 4}):
            with self.assertRaises(ValueError):
                gate.check({'metadata': {'caption_request': request}}, 'owner', {})
        client.check.assert_not_called()
        gate.check({'metadata': {'caption_request': {'model': 'fixture', 'maxCalls': 3}}}, 'owner', {})
        client.check.assert_called_once()

    def test_provider_uses_responses_and_does_not_retry(self):
        with patch.object(worker, 'chat_completion_callback') as factory:
            call = worker.provider('fixture', 'https://model.invalid', 'fixture-key')
            self.assertEqual(factory.call_args.kwargs['protocol'], 'responses')
            factory.return_value.side_effect = TimeoutError('fixture private detail')
            with self.assertRaises(ValueError):
                call('changed-model', [])
            factory.return_value.assert_not_called()
            with self.assertRaises(TimeoutError):
                call('fixture', [])
            factory.return_value.assert_called_once()

    def test_process_owns_private_workspace_and_closes_storage_on_failure(self):
        env = {'CONTENT_PRODUCTION_ENABLED': 'true', 'CONTENT_PRODUCTION_RUNS_ENABLED': 'true',
               'AIOS_CAPTION_PREFLIGHT_ENABLED': 'true', 'AIOS_VISUAL_REVIEW_MODEL': 'fixture',
               'AIOS_CAPTION_PREFLIGHT_API_BASE_URL': 'http://127.0.0.1:8000/production',
               'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES': '1'}
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, env, clear=True), \
             patch.object(worker, 'provider'), patch.object(worker, 'TosStorageConfig'), \
             patch.object(worker, 'TosStorageClient') as storage, patch.object(worker, 'connect_pg'), \
             patch.object(worker, 'consume_api_preflight') as consume:
            def execute(conn, client, directory, **kwargs):
                self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
                self.assertTrue(callable(kwargs['download_source']))
                raise TimeoutError('provider interrupted')
            consume.side_effect = execute
            with self.assertRaises(TimeoutError):
                worker.process_one(Path(folder))
            consume.assert_called_once()
            storage.return_value.session.close.assert_called_once()
            self.assertFalse(list(Path(folder).glob('aios-render-v1/job-*')))
