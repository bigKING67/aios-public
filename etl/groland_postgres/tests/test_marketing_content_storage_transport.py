"""Pinned storage regression: real sockets, TLS/SNI and SigV4; no cloud writes."""
import contextlib
from dataclasses import replace
import ipaddress
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'content_production'))
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig, UploadTuning
from object_fixture import start_store


class StorageConfigTest(unittest.TestCase):
    def test_optional_ip_config_and_literal_validation(self):
        env = {'TOS_ACCESS_KEY_ID': 'fixture', 'TOS_SECRET_ACCESS_KEY': 'fixture'}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(TosStorageConfig.from_env().connect_ip, '')
        for address in ('127.0.0.1', '100.64.0.2', 'fd7a:115c:a1e0::2'):
            with patch.dict(os.environ, {**env, 'TOS_CONNECT_IP': ' ' + address + ' '}, clear=True):
                self.assertEqual(TosStorageConfig.from_env().connect_ip, address)
        for address in ('https://100.64.0.2', 'storage.invalid', '127.0.0.1:443', '[::1]', 'fe80::1%eth0'):
            with patch.dict(os.environ, {**env, 'TOS_CONNECT_IP': address}, clear=True):
                with self.assertRaisesRegex(ValueError, 'TOS_CONNECT_IP'):
                    TosStorageConfig.from_env()

    def test_unconfigured_client_keeps_environment_proxy_behavior(self):
        client = TosStorageClient(TosStorageConfig('fixture', 'fixture', 'https://storage.test', 'r', 'media'))
        try:
            with patch.dict(os.environ, {'https_proxy': 'http://proxy.invalid:8181', 'NO_PROXY': ''}):
                settings = client.session.merge_environment_settings('https://media.storage.test/x', {}, None, None, None)
            self.assertEqual(settings['proxies']['https'], 'http://proxy.invalid:8181')
        finally:
            client.session.close()


@unittest.skipUnless(shutil.which('openssl'), 'requires openssl for isolated TLS fixture')
class StorageTransportTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory(prefix='aios-pinned-storage-')
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.cert, key = self.root / 'cert.pem', self.root / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-keyout', str(key), '-out', str(self.cert), '-subj', '/CN=*.storage.test',
                        '-addext', 'subjectAltName=DNS:*.storage.test',
                        '-addext', 'basicConstraints=critical,CA:FALSE'], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        key.chmod(0o600)
        self.source = self.root / 'source.bin'
        self.source.write_bytes(bytes(range(256)) * 16)
        access, secret = 'isolated-fixture', secrets.token_hex(24)
        self.server, self.counts = start_store(self.root, self.source, self.cert, key, access, secret,
            {'raw/source.bin': self.source, 'competitor/evidence/source.bin': self.source})
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.sni = []
        self.server.socket.context.set_servername_callback(lambda _sock, name, _context: self.sni.append(name))
        self.config = TosStorageConfig(access, secret, f'https://storage.test:{self.server.server_port}',
            'fixture', 'media', derived_bucket='derived', connect_ip='127.0.0.1')
        env = patch.dict(os.environ, {'HTTPS_PROXY': 'http://proxy.invalid:8181',
            'https_proxy': 'http://proxy.invalid:8181', 'HTTP_PROXY': 'http://proxy.invalid:8181',
            'ALL_PROXY': 'http://proxy.invalid:8181', 'NO_PROXY': '', 'no_proxy': '',
            'REQUESTS_CA_BUNDLE': str(self.cert)})
        env.start(); self.addCleanup(env.stop)
        self.addresses = []
        real_resolve = socket.getaddrinfo
        def only_ip(host, *args, **kwargs):
            # Permit numeric socket resolution but make system DNS/fake-IP use fail the test.
            ipaddress.ip_address(host)
            self.addresses.append(host)
            return real_resolve(host, *args, **kwargs)
        dns = patch.object(socket, 'getaddrinfo', side_effect=only_ip)
        dns.start(); self.addCleanup(dns.stop)

    def client(self, config=None, **tuning):
        client = TosStorageClient(config or self.config,
            UploadTuning(**{'attempts': 1, **tuning}))
        self.addCleanup(client.session.close)
        return client

    def test_signed_get_head_range_and_original_sni_for_both_buckets(self):
        client = self.client()
        for key in ('raw/source.bin', 'competitor/evidence/source.bin'):
            with self.subTest(key=key):
                self.assertTrue(client.object_exists(key))
                target = self.root / 'download.bin'
                client.download_file(key, target)
                self.assertEqual(target.read_bytes(), self.source.read_bytes())
                url, headers = client._signed_url_and_headers('GET', key, {'range': 'bytes=0-1023'})
                with client.session.get(url, headers=headers, timeout=5,
                                        proxies={'https': 'http://explicit-proxy.invalid:8181'}) as response:
                    self.assertEqual(response.status_code, 206)
                    self.assertEqual(response.content, self.source.read_bytes()[:1024])
                self.assertNotIn('127.0.0.1', client.presign_get_url(key))
                self.assertNotIn('127.0.0.1', client.presign_put_url(key, 'video/mp4'))
        self.assertEqual(set(self.sni), {'media.storage.test', 'derived.storage.test'})
        self.assertEqual(set(self.addresses), {'127.0.0.1'})
        self.assertEqual(self.counts['rejected'], 0)

    def test_single_and_parallel_multipart_uploads_round_trip(self):
        for multipart, prefix in ((False, 'production'), (True, 'production'), (True, 'competitor/evidence')):
            with self.subTest(multipart=multipart, prefix=prefix):
                client = self.client(multipart_threshold_bytes=1 if multipart else 10000,
                                     part_size_bytes=1000, concurrency=3)
                key = f'{prefix}/test-{multipart}/output.bin'
                client.upload_file(key, self.source)
                target = self.root / 'uploaded.bin'
                client.download_file(key, target)
                self.assertEqual(target.read_bytes(), self.source.read_bytes())
        self.assertEqual(self.counts['put'], 3)
        self.assertEqual(set(self.sni), {'media.storage.test', 'derived.storage.test'})
        self.assertEqual(self.counts['rejected'], 0)
        self.assertEqual(set(self.addresses), {'127.0.0.1'})

    def test_health_uses_same_pinned_range_read_without_uploading(self):
        from content_production.competitor_analysis import health
        from marketing_content_assets import repository
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchone.side_effect = [
            (1,), ('competitor/evidence/source.bin',), (0, 0, 0, 0)]
        with patch.object(repository, 'connect_pg', return_value=contextlib.nullcontext(conn)), \
                patch.object(TosStorageConfig, 'from_env', return_value=self.config), \
                patch.dict(os.environ, {'CONTENT_AI_STUDIO_LOCAL_ASR_URL': '', 'FRAMEWORK_V2_VLM_BASE_URL': ''}):
            result = health.check()
        self.assertTrue(result['ok'])
        self.assertEqual(result['checks']['storage'], {'ok': True, 'httpStatus': 206, 'readBytes': 1024,
            'transportMode': 'pinned_ip', 'configuredConnectIp': '127.0.0.1'})
        self.assertEqual(self.counts, {'get': 1, 'put': 0, 'rejected': 0})

    def test_certificate_name_and_chain_are_still_verified(self):
        wrong_host = replace(self.config, endpoint=f'https://wrong.test:{self.server.server_port}')
        client = self.client(wrong_host)
        with self.assertRaises(requests.exceptions.SSLError):
            client.download_file('raw/source.bin', self.root / 'bad-host.bin')
        client = self.client()
        client.session.verify = True  # Fixture CA is no longer trusted.
        with self.assertRaises(requests.exceptions.SSLError):
            client.download_file('raw/source.bin', self.root / 'untrusted.bin')
        self.assertEqual(self.counts['get'], 0)
        self.assertFalse((self.root / 'bad-host.bin').exists())
        self.assertFalse((self.root / 'untrusted.bin').exists())

    def test_disabling_verification_and_unconfigured_origins_fail_before_connect(self):
        client = self.client()
        url, headers = client._signed_url_and_headers('GET', 'raw/source.bin', {})
        with self.assertRaisesRegex(ValueError, 'certificate verification'):
            client.session.get(url, headers=headers, verify=False, timeout=5)
        for foreign in (url.replace('https:', 'http:'), url.replace('media.storage.test', 'foreign.storage.test')):
            with self.assertRaises(requests.exceptions.InvalidURL):
                client.session.get(foreign, headers=headers, timeout=5)
        self.assertEqual(self.addresses, [])

    def test_redirect_is_not_followed_to_public_or_untrusted_origin(self):
        handler = self.server.RequestHandlerClass
        def redirect(request):
            request.send_response(302)
            request.send_header('Location', 'https://foreign.invalid/leak')
            request.send_header('Content-Length', '0')
            request.end_headers()
        client = self.client()
        with patch.object(handler, 'do_GET', redirect), self.assertRaises(requests.exceptions.InvalidURL):
            client.download_file('raw/source.bin', self.root / 'redirect.bin')
        self.assertEqual(self.addresses, ['127.0.0.1'])
        self.assertFalse((self.root / 'redirect.bin').exists())

    def test_failed_private_connection_never_falls_back_to_dns(self):
        from marketing_content_assets import tos_storage
        client = self.client(replace(self.config, connect_ip='127.0.0.2'))
        with patch.object(tos_storage.time, 'sleep'), self.assertRaises(tos_storage.StorageUnavailable):
            client.download_file('raw/source.bin', self.root / 'unreachable.bin')
        self.assertEqual(self.addresses, ['127.0.0.2'] * tos_storage.DOWNLOAD_ATTEMPTS)
        self.assertEqual(self.counts['get'], 0)


if __name__ == '__main__':
    unittest.main()
