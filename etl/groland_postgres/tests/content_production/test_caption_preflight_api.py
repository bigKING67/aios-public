import unittest
import uuid
from unittest.mock import Mock, patch

import requests
from content_production.caption_preflight_api import PermissionClient, WorkerPermissionClient


class PermissionClientTests(unittest.TestCase):
    def setUp(self):
        self.job = {'job_id': str(uuid.uuid4()), 'metadata': {'caption_claim_token': str(uuid.uuid4())}}
        self.snapshot = {'assets': []}
        self.client = PermissionClient('http://127.0.0.1:8000/v1/marketing/content-assets/production',
                                       lambda job: 'fixture-session')

    def test_transport_has_no_redirect_retry_or_environment_proxy(self):
        with patch('content_production.caption_preflight_api.requests.Session') as factory:
            session = factory.return_value.__enter__.return_value
            session.post.return_value.status_code = 200
            session.post.return_value.json.return_value = {'ownerUserId': 'owner', 'sourceSnapshot': self.snapshot}
            self.client.check(self.job, 'owner', self.snapshot)
            self.assertFalse(session.trust_env)
            self.assertFalse(session.post.call_args.kwargs['allow_redirects'])
            self.assertEqual(session.post.call_args.kwargs['timeout'], (3, 10))
            session.post.assert_called_once()

    def test_rejection_mismatch_and_network_failure_fail_closed(self):
        with patch('content_production.caption_preflight_api.requests.Session') as factory:
            session = factory.return_value.__enter__.return_value
            for status in (302, 401, 403, 500):
                session.post.return_value.status_code = status
                with self.assertRaises(PermissionError):
                    self.client.check(self.job, 'owner', self.snapshot)
            session.post.return_value.status_code = 200
            for result in ({'ownerUserId': 'other', 'sourceSnapshot': self.snapshot}, {}, []):
                session.post.return_value.json.return_value = result
                with self.assertRaises(PermissionError):
                    self.client.check(self.job, 'owner', self.snapshot)
            session.post.side_effect = requests.Timeout('fixture-session sensitive detail')
            with self.assertRaisesRegex(PermissionError, '^caption permission API unavailable$'):
                self.client.check(self.job, 'owner', self.snapshot)

    def test_no_credentials_or_remote_plaintext(self):
        for url in ('http://example.com', 'https://user:password@example.com', 'https://example.com?token=x'):
            with self.assertRaises(ValueError):
                PermissionClient(url, Mock())
        self.client.access_token = lambda job: None
        with self.assertRaises(PermissionError):
            self.client.check(self.job, 'owner', self.snapshot)

    def test_worker_uses_only_in_memory_claim_capability(self):
        client = WorkerPermissionClient(self.client.base_url)
        with self.assertRaises(PermissionError):
            client.check(self.job, 'owner', self.snapshot)
        self.job['authorization_secret'] = 'fixture-claim-secret'
        with patch('content_production.caption_preflight_api.requests.Session') as factory:
            session = factory.return_value.__enter__.return_value
            session.post.return_value.status_code = 200
            session.post.return_value.json.return_value = {'ownerUserId': 'owner', 'sourceSnapshot': self.snapshot}
            client.check(self.job, 'owner', self.snapshot)
            self.assertTrue(session.post.call_args.args[0].endswith('/authorize-worker'))
            self.assertEqual(session.post.call_args.kwargs['headers']['Authorization'], 'Bearer fixture-claim-secret')
