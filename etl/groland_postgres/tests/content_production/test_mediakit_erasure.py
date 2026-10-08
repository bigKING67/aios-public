import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.mediakit_erasure import MediaKitErasure, MediaKitError, _NoRedirect


class MediaKitTests(unittest.TestCase):
    def setUp(self):
        self.provider = MediaKitErasure('fixture-key')
        self.temp = tempfile.TemporaryDirectory(prefix='mediakit-adapter-')
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'input.mp4'
        self.source.write_bytes(b'fixture-media')

    def queue(self, values):
        self.requests = []
        values = iter(values)
        def open_request(request, timeout):
            self.requests.append(request)
            value = next(values)
            if isinstance(value, Exception): raise value
            return io.BytesIO(value if isinstance(value, bytes) else json.dumps(value).encode())
        self.provider._opener = Mock(open=open_request)

    def test_upload_submit_query_download_contract_and_credential_isolation(self):
        self.queue([
            {'result': {'upload_url': 'https://upload.invalid/signed', 'file_id': 'media-fixture',
                        'upload_headers': ['Content-Type: video/mp4'], 'method': 'PUT'}}, b'',
            {'success': True, 'task_id': 'task_1'},
            {'task_id': 'task_1', 'status': 'completed', 'result': {'video_url': 'https://result.invalid/signed'}},
            b'fixture-output'])
        params = {'mode': 'Subtitle', 'model_version': 'v5'}
        task = self.provider.submit(self.source, params, lambda: None)
        result = self.provider.query(task)
        target = Path(self.temp.name) / 'output.mp4'
        self.provider.download(result, target, lambda: None)
        self.assertEqual(target.read_bytes(), b'fixture-output')
        self.assertEqual([r.get_method() for r in self.requests], ['POST', 'PUT', 'POST', 'GET', 'GET'])
        self.assertEqual(json.loads(self.requests[2].data), {**params, 'video_url': 'media-fixture'})
        for index in (0, 2, 3):
            self.assertEqual(self.requests[index].get_header('Authorization'), 'Bearer fixture-key')
        for index in (1, 4):
            self.assertIsNone(self.requests[index].get_header('Authorization'))
        self.assertIsNone(_NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid'))

    def test_submit_transport_failure_is_sanitized_and_not_retried(self):
        self.queue([urllib.error.URLError('https://host.invalid/?secret=fixture-key')])
        with self.assertRaises(MediaKitError) as raised:
            self.provider.submit(self.source, {}, lambda: None)
        self.assertNotIn('fixture-key', str(raised.exception))
        self.assertEqual(len(self.requests), 1)

    def test_bad_response_task_status_and_url_rejected(self):
        for response in (b'not-json', b'x' * 65537, [], {'success': False},
                         {'task_id': 'other', 'status': 'completed'}, {'status': 'surprise'},
                         {'status': 'completed', 'result': {'video_url': 'http://unsafe.invalid'}},
                         {'status': 'completed', 'result': {'video_url': 'https://user:pass@unsafe.invalid'}}):
            with self.subTest(response=str(response)[:80]):
                self.queue([response])
                with self.assertRaises(MediaKitError): self.provider.query('task_1')
        for task in ('../task', '', None, 'task?secret=1'):
            with self.assertRaises(MediaKitError): self.provider.query(task)

    def test_download_size_cap_and_existing_file_fail_closed(self):
        self.queue([b'12345'])
        target = Path(self.temp.name) / 'output.mp4'
        with patch('content_production.mediakit_erasure.MAX_BYTES', 4), self.assertRaises(MediaKitError):
            self.provider.download({'video_url': 'https://result.invalid/video'}, target, lambda: None)
        self.queue([b'1'])
        with self.assertRaises(FileExistsError):
            self.provider.download({'video_url': 'https://result.invalid/video'}, target, lambda: None)

    def test_failed_and_both_cancelled_spellings_are_terminal_even_with_success_false(self):
        for status in ('failed', 'canceled', 'cancelled'):
            self.queue([{'success': False, 'status': status, 'error': {'message': 'private provider detail'}}])
            result = self.provider.query('task_1')
            self.assertEqual(result, {'status': 'failed' if status == 'failed' else 'cancelled'})


if __name__ == '__main__':
    unittest.main()
