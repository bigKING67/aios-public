import sys
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from marketing_content_assets.seed_asr import SeedAsrClient, normalize_result, reserve_submission
from marketing_content_assets.asr_client import TranscriptError
from marketing_content_assets import transcript_processor as processor


def payload():
    return {'result': {'utterances': [{'start_time': 0, 'end_time': 1000, 'text': '你好。',
            'words': [{'text': '你好', 'start_time': 0, 'end_time': 1000}]}]}}


def response(code='20000000', body=None):
    value = MagicMock(status_code=200, headers={'X-Api-Status-Code': code}, content=b'{}')
    value.json.return_value = body
    return value


class SeedAsrTests(unittest.TestCase):
    def test_words_are_preserved_and_missing_or_outside_timing_rejected(self):
        result = normalize_result(payload(), 'request', 1000)
        self.assertEqual(result.raw_response['wordTiming'], payload()['result'])
        self.assertEqual(result.provider, 'seed_asr')
        for kind in ['missing', 'outside', 'estimated']:
            bad = payload()
            if kind == 'missing': del bad['result']['utterances'][0]['words']
            elif kind == 'outside': bad['result']['utterances'][0]['words'][0]['end_time'] = 1001
            else: bad['result']['utterances'][0]['words'][0]['start_time'] = 0.1
            with self.assertRaises(TranscriptError): normalize_result(bad, 'id', 1000)

    def test_run_dependency_selects_seed_without_global_provider_switch(self):
        with patch.dict(os.environ, {'CONTENT_ASSET_TRANSCRIPT_PROVIDER': 'ark_video', 'DOUBAO_ASR_API_KEY': 'fixture', 'AIOS_CAPTION_BASE_URL': 'https://fixture.invalid/api/v3', 'AIOS_CAPTION_API_KEY': 'fixture', 'AIOS_CAPTION_MODEL': 'fixture'}):
            client = processor.transcript_client_for_job({'metadata': {'caption_required': True}})
            self.assertIsInstance(client, SeedAsrClient)
        with patch.dict(os.environ, {'AIOS_CAPTION_BASE_URL': '', 'CONTENT_ASSET_TRANSCRIPT_PROVIDER': 'ark_video'}):
            with self.assertRaises(ValueError):
                processor.transcript_client_for_job({'metadata': {'caption_required': True}})
        from marketing_content_assets.seed_asr import prepare_seed_input
        with self.assertRaisesRegex(TranscriptError, '排队期间原片版本已改变'):
            prepare_seed_input(MagicMock(), {'raw_sha256': 'a'*64,
                'metadata': {'source_sha256': 'b'*64}}, Path('/unused'))

    def test_submit_once_and_poll_same_request_without_redirect(self):
        client = SeedAsrClient('test-only')
        client.session = MagicMock()
        client.session.post.side_effect = [response(), response('20000001'), response(body=payload())]
        with tempfile.TemporaryDirectory() as directory, patch('marketing_content_assets.seed_asr.time.sleep'):
            audio = Path(directory) / 'audio.wav'
            audio.write_bytes(b'fixture')
            result = client.transcribe(audio, 'one-request', 1000)
        self.assertEqual(result.response_id, 'one-request')
        calls = client.session.post.call_args_list
        self.assertEqual(sum(c.args[0].endswith('/submit') for c in calls), 1)
        self.assertTrue(all(c.kwargs['headers']['X-Api-Request-Id'] == 'one-request' for c in calls))
        self.assertTrue(all(c.kwargs['allow_redirects'] is False for c in calls))

    def test_unknown_submit_outcome_does_not_retry_or_leak_provider_body(self):
        import requests
        client = SeedAsrClient('test-only')
        client.session = MagicMock()
        client.session.post.side_effect = requests.Timeout('private signed url')
        with self.assertRaises(TranscriptError) as caught:
            client._post('submit', 'id', {})
        self.assertNotIn('private', str(caught.exception))
        self.assertEqual(client.session.post.call_count, 1)

    def test_reservation_precedes_paid_call_and_blocks_duplicate(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        job = {'job_id': 'job', 'attempts': 1, 'max_attempts': 3}
        cur.fetchone.return_value = ('job',)
        reserve_submission(conn, job)
        self.assertEqual(job['max_attempts'], 1)
        conn.commit.assert_called_once()
        self.assertIn('seed_asr_request_id', cur.execute.call_args.args[0])
        cur.fetchone.return_value = None
        with self.assertRaises(TranscriptError): reserve_submission(conn, job)

    def test_caption_cache_is_exactly_grounded_and_does_not_rewrite_speech(self):
        from marketing_content_assets.transcript_captions import prepare
        result = normalize_result(payload(), 'id', 1000)
        model = MagicMock(return_value={'groups': [{'lines': ['你好']}]})
        job = {'asset_id': 'asset', 'raw_sha256': 'a'*64}
        for budget in (-1, 3, True):
            with self.assertRaisesRegex(ValueError, 'revision budget'):
                prepare(result, job, 1000, call_model=model, model='fixture', revision_calls=budget)
        model.assert_not_called()
        cache = prepare(result, job, 1000, call_model=model, model='fixture')
        self.assertEqual(model.call_count, 1)
        self.assertEqual(cache['document']['cues'][0]['endMs'], 1000)
        self.assertEqual(cache['document']['sourceSha256'], 'a'*64)
        self.assertFalse(cache['termsVerified'])
        model.return_value = {'groups': [{'lines': ['改写']}]}
        with self.assertRaises(ValueError): prepare(result, job, 1000, call_model=model, model='fixture')

    def test_existing_worker_writes_word_receipt_and_source_hash(self):
        client = SeedAsrClient('test-only')
        client.transcribe = MagicMock(return_value=normalize_result(payload(), 'id', 1000))
        storage = MagicMock()
        job = {'asset_id': 'asset', 'job_id': 'job', 'attempts': 1, 'max_attempts': 3,
               'raw_object_key': 'original.mp4', 'input_object_key': 'original.mp4',
               'raw_sha256': 'a' * 64, 'duration_seconds': 1}
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, {'CONTENT_ASSET_TRANSCRIPT_CAPTIONS': 'true', 'AIOS_CAPTION_REVISION_CALLS': '2'}), \
             patch('marketing_content_assets.transcript_captions.prepare', return_value={'schema': 'fixture-cache'}) as prepare_captions, \
             patch.object(processor, '_stage_updater', return_value=MagicMock()), \
             patch.object(processor, 'connect_pg'), \
             patch.object(processor, '_complete_transcript_job') as complete, \
             patch.object(processor, 'prepare_seed_input', return_value=(Path('audio'), 1000, 'a'*64)), \
             patch.object(processor, 'reserve_submission', return_value='id'):
            processor._process_transcript_job(storage=storage, client=client, job=job,
                work_dir=Path(directory), signed_url_ttl=600, url_max_bytes=50000, proxy_target_bytes=40000)
            import json
            saved = json.loads((Path(directory) / 'transcript.json').read_text())
            self.assertEqual(saved['sourceSha256'], 'a'*64)
            self.assertEqual(saved['wordTiming'], payload()['result'])
            self.assertEqual(saved['captionPlan'], {'schema': 'fixture-cache'})
            self.assertEqual(prepare_captions.call_args.kwargs['revision_calls'], 2)
            self.assertEqual(complete.call_args.kwargs['result'].provider, 'seed_asr')
            client.transcribe.return_value = normalize_result(payload(), 'id', 1000)
            with patch('marketing_content_assets.transcript_captions.prepare', side_effect=ValueError('private provider detail')):
                processor._process_transcript_job(storage=storage, client=client, job=job,
                    work_dir=Path(directory), signed_url_ttl=600, url_max_bytes=50000, proxy_target_bytes=40000)
            failed_caption = json.loads((Path(directory) / 'transcript.json').read_text())
            self.assertEqual(failed_caption['wordTiming'], payload()['result'])
            self.assertIsNone(failed_caption['captionPlan'])
            self.assertEqual(failed_caption['captionError'], 'caption_preparation_failed')
            self.assertNotIn('private provider detail', json.dumps(failed_caption))
        # Exercise actual persistence statement assembly against a recording cursor.
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchone.return_value = ("original.mp4", "a"*64)
        processor._complete_transcript_job(conn, **complete.call_args.kwargs)
        statements = conn.cursor.return_value.__enter__.return_value.execute.call_args_list
        insert = next(c for c in statements if 'INSERT INTO ads.marketing_content_asset_transcripts' in c.args[0])
        metadata = json.loads(insert.args[1][-1])
        self.assertEqual(metadata['word_timing'], payload()['result'])
        self.assertEqual(metadata['source_sha256'], 'a'*64)
        conn.reset_mock()
        conn.cursor.return_value.__enter__.return_value.fetchone.return_value = ('original.mp4', 'b'*64)
        with self.assertRaisesRegex(RuntimeError, '原片版本已变化'):
            processor._complete_transcript_job(conn, **complete.call_args.kwargs)
        conn.commit.assert_not_called()


if __name__ == '__main__': unittest.main()
