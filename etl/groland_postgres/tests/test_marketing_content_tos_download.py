"""Transport regressions: TLS EOF, interrupted real streams, budgets and permanent errors."""
import http.server
import socket
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from marketing_content_assets import tos_storage as m


class Response:
    def __init__(self, status=200, chunks=(b'complete',)):
        self.status_code, self.chunks = status, chunks
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def iter_content(self, **_):
        for chunk in self.chunks:
            if isinstance(chunk, Exception): raise chunk
            yield chunk


class DownloadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.target = Path(self.tmp.name) / 'source.mp4'
        self.target.write_bytes(b'previous')
        self.client = m.TosStorageClient(m.TosStorageConfig('ak', 'sk', 'https://example.invalid', 'r', 'b'))
        self.client.session = Mock()
        sleep = patch.object(m.time, 'sleep')
        sleep.start(); self.addCleanup(sleep.stop)

    def test_tls_eof_and_mid_stream_failure_restart_without_publishing_partial_bytes(self):
        self.client.session.get.side_effect = [requests.exceptions.SSLError('unexpected EOF'),
            Response(chunks=(b'partial', requests.exceptions.ChunkedEncodingError('reset'))), Response()]
        self.client.download_file('raw/x', self.target)
        self.assertEqual(self.target.read_bytes(), b'complete')
        self.assertEqual(self.client.session.get.call_count, 3)
        self.assertEqual(list(self.target.parent.glob('.download-*')), [])

    def test_exhausted_transport_does_not_destroy_existing_target_or_leak_urls(self):
        self.client.session.get.side_effect = requests.ConnectionError('https://user:secret@host?token=abc')
        with self.assertRaises(m.StorageUnavailable) as caught:
            self.client.download_file('raw/x', self.target)
        self.assertNotIn('secret', str(caught.exception))
        self.assertEqual(self.target.read_bytes(), b'previous')
        self.assertEqual(self.client.session.get.call_count, 3)

    def test_permissions_missing_objects_and_certificates_are_not_retried(self):
        for failure in (Response(403), Response(404), requests.exceptions.SSLError('CERTIFICATE_VERIFY_FAILED')):
            with self.subTest(failure=failure):
                self.client.session.get.reset_mock(side_effect=True)
                self.client.session.get.side_effect = [failure]
                with self.assertRaises((RuntimeError, requests.exceptions.SSLError)):
                    self.client.download_file('raw/x', self.target)
                self.assertEqual(self.client.session.get.call_count, 1)
                self.assertEqual(self.target.read_bytes(), b'previous')

    def test_rate_limit_and_server_failure_retry_but_not_forever(self):
        self.client.session.get.side_effect = [Response(429), Response(503), Response()]
        self.client.download_file('raw/x', self.target)
        self.assertEqual(self.target.read_bytes(), b'complete')
        self.client.session.get.side_effect = [Response(503)] * 3
        with self.assertRaises(m.StorageUnavailable): self.client.download_file('raw/x', self.target)

    def test_deadline_stops_before_new_request(self):
        with patch.object(m, 'DOWNLOAD_DEADLINE_SECONDS', 0), self.assertRaises(m.StorageUnavailable):
            self.client.download_file('raw/x', self.target)
        self.client.session.get.assert_not_called()

    def test_real_http_disconnect_during_download_retries_whole_file(self):
        payload, calls = b'x' * (m.MB + 37), []
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                calls.append(1)
                self.send_response(200)
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload[:100] if len(calls) == 1 else payload)
                self.wfile.flush()
                if len(calls) == 1:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.client.session = requests.Session()
            self.client.session.trust_env = False
            try:
                with patch.object(self.client, '_signed_url_and_headers',
                                  return_value=(f'http://127.0.0.1:{server.server_port}/file', {})):
                    self.client.download_file('raw/x', self.target)
            finally:
                self.client.session.close()
                server.shutdown(); thread.join()
        self.assertEqual(self.target.read_bytes(), payload)
        self.assertEqual(len(calls), 2)
        self.assertEqual(list(self.target.parent.glob('.download-*')), [])


if __name__ == '__main__': unittest.main()
