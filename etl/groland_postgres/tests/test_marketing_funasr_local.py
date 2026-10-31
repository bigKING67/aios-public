import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import requests  # noqa: E402

from marketing_content_assets import transcript_processor as processor  # noqa: E402
from marketing_content_assets.asr_client import TranscriptError  # noqa: E402
from marketing_content_assets.funasr_local import FunasrLocalClient, normalize_result  # noqa: E402
from marketing_content_assets.itn_zh import ITN_VERSION  # noqa: E402


class Response:
    def __init__(self, status_code=200, body=None):
        self.status_code, self.body = status_code, body

    def json(self):
        if self.body is None:
            raise ValueError('not json')
        return self.body


class Session:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls, self.trust_env = response, error, [], True

    def post(self, url, json=None, timeout=None):
        self.calls.append((url, json))
        if self.error:
            raise self.error
        return self.response


class FunasrLocalTests(unittest.TestCase):
    def test_segments_are_cleaned_clipped_and_normalized(self):
        body = {'utterances': [[0, 2400, '现在下单 立减六十'], [2400, 2400, '空'], [2500, 9000, '二点零  版本'],
                               ['x', 1, 'bad'], [3000, 4000, '   '], [9100, 12500, '片尾截断'], [10500, 11000, '原片之外']],
                'models': {'asr': 'paraformer-zh'}}
        result = normalize_result(body, 10_000, hotwords=True)
        self.assertEqual([(s['start_ms'], s['end_ms'], s['text']) for s in result.segments],
                         [(0, 2400, '现在下单 立减60'), (2500, 9000, '2.0 版本'), (9100, 10000, '片尾截断')])
        self.assertEqual(result.provider, 'funasr_local')
        self.assertEqual(result.script_text, '现在下单 立减60\n2.0 版本\n片尾截断')
        self.assertIn('00:00:02,500 --> 00:00:09,000', result.srt_text)
        self.assertEqual(result.request_settings, {'timing': 'vad_segments', 'itn': ITN_VERSION, 'hotwords': True})
        self.assertEqual(result.raw_response['models'], {'asr': 'paraformer-zh'})

    def test_client_posts_the_audio_path_without_a_proxy(self):
        session = Session(Response(body={'utterances': [[0, 1000, '你好']]}))
        client = FunasrLocalClient('http://127.0.0.1:8200/', '三资堂 蜜粉', session=session)
        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(tmp) / 'a.wav'
            audio.write_bytes(b'x')
            result = client.transcribe(audio, 1000)
        self.assertFalse(session.trust_env)
        self.assertEqual(session.calls[0][0], 'http://127.0.0.1:8200/transcribe')
        self.assertEqual(session.calls[0][1]['hotword'], '三资堂 蜜粉')
        self.assertTrue(session.calls[0][1]['path'].endswith('a.wav'))
        self.assertEqual(result.transcript_text, '你好')

    def test_failures_become_transcript_errors(self):
        for session in (Session(error=requests.ConnectionError('down')), Session(Response(503)), Session(Response(200))):
            client = FunasrLocalClient('http://127.0.0.1:8200', '', session=session)
            with self.assertRaises(TranscriptError):
                client.transcribe(Path('/tmp/a.wav'), 1000)
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(TranscriptError):
            FunasrLocalClient()

    def test_provider_switch_selects_funasr_but_captions_keep_seed(self):
        env = {'CONTENT_ASSET_TRANSCRIPT_PROVIDER': 'funasr_local', 'CONTENT_AI_STUDIO_LOCAL_ASR_URL': 'http://127.0.0.1:8200'}
        with patch.dict(os.environ, env, clear=True):
            self.assertIsInstance(processor.transcript_client_for_job({'metadata': {}}), FunasrLocalClient)
        self.assertEqual(processor.SOURCE_BOUND_PROVIDERS, {'seed_asr', 'funasr_local'})


if __name__ == '__main__':
    unittest.main()
