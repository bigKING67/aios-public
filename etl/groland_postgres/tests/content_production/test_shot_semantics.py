import copy
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.shot_semantic_contract import digest
from content_production.shot_semantics import analyze, search

OBSERVATION = {'description': '手持白色洗发水瓶', 'subjects': ['一只手'], 'objects': ['白色瓶子'],
               'setting': '室内', 'visibleText': [], 'reuseIdeas': ['建议用作开场钩子']}


class SemanticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'frames').mkdir()
        self.catalog = self.root / 'catalog.json'
        self.output = self.root / 'semantics.json'
        self.frame = b'\xff\xd8\xfffixture\xff\xd9'
        raw_hash = 'a' * 64
        self.shots = []
        for index in range(2):
            start, end = index * 1000, (index + 1) * 1000
            shot_id = digest(f'{raw_hash}:{start}:{end}'.encode())[:24]
            name = f'frames/{index}.jpg'
            (self.root / name).write_bytes(self.frame)
            self.shots.append({'shotId': shot_id, 'startMs': start, 'endMs': end,
                               'representativeFrame': {'path': name, 'sha256': digest(self.frame), 'requestedAtMs': start + 500},
                               'semanticStatus': 'not_analyzed', 'observations': None})
        self.value = {'schema': 'aios.shot-catalog.v1', 'assetId': '11111111-1111-1111-1111-111111111111',
                      'rawSha256': raw_hash, 'timebase': 'raw-relative-ms', 'coverage': 'complete',
                      'source': {'durationMs': 2000}, 'shots': self.shots}
        self.save_catalog()
        self.client = SimpleNamespace(config=SimpleNamespace(model='fixture-model'), session=Mock(), _post=Mock(return_value=self.response()))
        self.factory = Mock(return_value=self.client)

    def response(self, observation=None):
        return {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps(observation or OBSERVATION, ensure_ascii=False)}]}]}

    def save_catalog(self):
        self.catalog.write_text(json.dumps(self.value))

    def build(self, **kwargs):
        return analyze(self.catalog, [shot['shotId'] for shot in self.shots], self.output,
                       confirmed=kwargs.pop('confirmed', True), client_factory=self.factory, **kwargs)

    def test_bound_evidence_and_visible_search_excludes_suggestions(self):
        result = self.build()
        self.assertEqual(len(result['shots']), 2)
        self.assertEqual(self.client._post.call_count, 2)
        request = self.client._post.call_args.args[0]
        self.assertFalse(request['store'])
        self.assertEqual(request['input'][0]['content'][0]['type'], 'input_image')
        self.assertNotIn(str(self.root), json.dumps(request))
        self.assertEqual(search(self.catalog, self.output, '洗发水')['items'][0]['endMs'], 1000)
        self.assertEqual(search(self.catalog, self.output, '开场钩子')['items'], [])
        self.client.session.close.assert_called_once()

    def test_confirmation_unknown_ids_and_existing_output_prevent_calls(self):
        with self.assertRaises(ValueError):
            self.build(confirmed=False)
        with self.assertRaises(ValueError):
            analyze(self.catalog, ['unknown'], self.output, confirmed=True, client_factory=self.factory)
        self.output.write_text('keep')
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual(self.output.read_text(), 'keep')
        self.factory.assert_not_called()

    def test_invalid_local_inputs_preflight_before_any_call(self):
        original = copy.deepcopy(self.value)
        for mutation in ('traversal', 'symlink', 'bad_hash', 'non_contiguous'):
            with self.subTest(mutation=mutation):
                self.value = copy.deepcopy(original)
                if mutation == 'traversal':
                    self.value['shots'][1]['representativeFrame']['path'] = '../secret.jpg'
                elif mutation == 'symlink':
                    (self.root / 'frames/link.jpg').symlink_to(self.root / 'frames/0.jpg')
                    self.value['shots'][1]['representativeFrame']['path'] = 'frames/link.jpg'
                elif mutation == 'bad_hash':
                    self.value['shots'][1]['representativeFrame']['sha256'] = '0' * 64
                else:
                    self.value['shots'][1]['startMs'] = 1100
                self.save_catalog()
                with self.assertRaises(ValueError):
                    self.build()
                self.factory.assert_not_called()

    def test_partial_or_invalid_provider_result_never_publishes_or_retries(self):
        for response in ({'status': 'incomplete'}, self.response({**OBSERVATION, 'startMs': 99})):
            with self.subTest(response=response):
                self.client._post.reset_mock()
                self.client._post.side_effect = [self.response(), response]
                with self.assertRaises(ValueError):
                    self.build()
                self.assertEqual(self.client._post.call_count, 2)
                self.assertFalse(self.output.exists())

    def test_provider_failure_does_not_retry(self):
        self.client._post.side_effect = RuntimeError('fixture provider error')
        with self.assertRaises(RuntimeError):
            self.build()
        self.assertEqual(self.client._post.call_count, 1)
        self.assertFalse(self.output.exists())

    def test_changed_frame_after_call_prevents_publish(self):
        def changed(_payload):
            (self.root / 'frames/0.jpg').write_bytes(b'changed')
            return self.response()
        self.client._post.side_effect = changed
        with self.assertRaises(ValueError):
            self.build()
        self.assertFalse(self.output.exists())

    def test_search_rejects_forged_times_duplicate_and_stale_catalog(self):
        result = self.build()
        for mutation in ('time', 'duplicate', 'catalog'):
            with self.subTest(mutation=mutation):
                invalid = copy.deepcopy(result)
                if mutation == 'time':
                    invalid['shots'][0]['endMs'] += 1
                elif mutation == 'duplicate':
                    invalid['shots'][1] = invalid['shots'][0]
                else:
                    invalid['catalogSha256'] = '0' * 64
                self.output.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):
                    search(self.catalog, self.output, '瓶')

    def test_existing_ark_client_loopback_http_transport(self):
        from dataclasses import replace
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
        captured = []
        response = self.response()
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                captured.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                data = json.dumps(response).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.dict('os.environ', {'ARK_API_KEY': 'local-fixture-only'}, clear=True):
                config = replace(ArkResponsesConfig.from_env(), base_url=f'http://127.0.0.1:{server.server_port}/responses', model='fixture-model')
                analyze(self.catalog, [self.shots[0]['shotId']], self.output, confirmed=True,
                        client_factory=lambda: ArkResponsesClient(config))
            self.assertEqual(len(captured), 1)
            self.assertEqual(len(search(self.catalog, self.output, '洗发水')['items']), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_output_created_during_call_is_preserved(self):
        def competing(_payload):
            self.output.write_text('competing output')
            return self.response()
        self.client._post.side_effect = competing
        with self.assertRaises(FileExistsError):
            self.build()
        self.assertEqual(self.output.read_text(), 'competing output')
        self.assertEqual(list(self.root.glob('.shot-semantic-*')), [])


if __name__ == '__main__':
    unittest.main()
