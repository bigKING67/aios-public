import copy
import shutil
import tempfile
import uuid
from pathlib import Path
import unittest
from unittest.mock import Mock, MagicMock, patch

import test_source_caption_input as fixture
from content_production import caption_preflight_queue as queue


class CaptionPreflightQueueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceCaptionInputTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixture.SourceCaptionInputTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceCaptionInputTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.conn = MagicMock()
        self.cursor = self.conn.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.return_value = ('owned-job',)
        self.sources = copy.deepcopy(self.case.sources)
        self.sources[0].update(assetId=str(uuid.uuid4()), objectKey='private/source.mp4')
        self.request = {'runId': str(uuid.uuid4()), 'executionVersion': 1,
            'assetVersionId': self.case.version, 'sourceSha256': self.sources[0]['sha256'],
            'startFrame': 30, 'frames': 60, 'requiredFrames': 33, 'region': {'top': .65, 'bottom': .74},
            'model': 'fixture', 'maxCalls': 3}
        self.job = {'job_id': str(uuid.uuid4()), 'asset_id': self.sources[0]['assetId'],
            'input_object_key': 'private/source.mp4', 'attempts': 1, 'max_attempts': 1,
            'metadata': {'operation': queue.OPERATION, 'caption_claim_token': str(uuid.uuid4()),
                         'caption_request': self.request}}
        self.storage = Mock()
        self.storage.download_file.side_effect = lambda key, path: shutil.copyfile(
            self.case.case.case.media[self.case.version], path)
        self.authorize = Mock(return_value=self.sources)
        def model(name, messages):
            self.assertEqual(name, 'fixture')
            samples = [p for p in messages[1]['content'] if p['type'] == 'input_text'
                       and p['text'].startswith('待判断帧')]
            if samples:
                return {'samples': [{'frame': int(p['text'].split()[1].split('，')[0]), 'groupId': 'g0'} for p in samples]}
            answer = fixture.fixture.observations(messages)
            for item in answer['samples']:
                item['lines'] = ['原片字幕']
            return answer
        self.model = Mock(side_effect=model)

    def run_job(self):
        with patch.object(queue, 'claim', return_value=self.job):
            return queue.consume_one(self.conn, self.storage, self.case.case.case.root / 'consumer',
                authorize=self.authorize, call_model=self.model)

    def test_real_preflight_reserved_calls_and_job_only_success(self):
        result = self.run_job()
        self.assertEqual(result['candidates'][0]['frameCount'], 60)
        self.assertEqual(self.model.call_count, 3)
        writes = [c.args for c in self.cursor.execute.call_args_list if c.args[0].startswith('UPDATE')]
        self.assertEqual(len(writes), 4)  # Three reservations and one terminal receipt.
        self.assertEqual(writes[-1][1][0], 'succeeded')
        self.assertTrue(all('caption_claim_token' in sql and 'attempts=1' in sql for sql, _ in writes))
        self.assertTrue(all('UPDATE ads.marketing_content_asset_processing_jobs' in sql for sql, _ in writes))

    def test_revoked_access_and_wrong_source_never_call_provider(self):
        self.authorize.side_effect = ValueError('revoked')
        with self.assertRaisesRegex(ValueError, 'revoked'):
            self.run_job()
        self.storage.download_file.assert_not_called()
        self.model.assert_not_called()
        self.assertEqual(self.cursor.execute.call_args.args[1][0], 'failed')
        self.authorize.side_effect = None
        self.job['input_object_key'] = 'different-source'
        with self.assertRaisesRegex(ValueError, 'frozen job input'):
            self.run_job()
        self.model.assert_not_called()

    def test_lost_response_keeps_reservation_and_has_no_retry(self):
        self.model.side_effect = TimeoutError('private provider detail')
        with self.assertRaises(TimeoutError):
            self.run_job()
        self.assertEqual(self.model.call_count, 1)
        terminal = self.cursor.execute.call_args.args
        self.assertEqual(terminal[1][0], 'failed')
        self.assertNotIn('private provider detail', str(terminal))

    def test_access_revoked_during_model_call_cannot_publish_success(self):
        original = self.model.side_effect
        def revoke(model, messages):
            answer = original(model, messages)
            self.authorize.side_effect = ValueError('revoked during call')
            return answer
        self.model.side_effect = revoke
        with self.assertRaisesRegex(ValueError, 'revoked during call'):
            self.run_job()
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual(self.cursor.execute.call_args.args[1][0], 'failed')

    def test_claim_and_stale_terminal_write(self):
        self.cursor.fetchone.return_value = None
        self.assertIsNone(queue.claim(self.conn))
        sql = self.cursor.execute.call_args.args[0]
        self.assertIn('FOR UPDATE SKIP LOCKED', sql)
        self.assertIn('attempts=0 AND max_attempts=1', sql)
        expiry = self.cursor.execute.call_args_list[-2].args[0]
        self.assertIn('caption_preflight_expired', expiry)
        self.assertNotIn("status='queued'", expiry)
        with self.assertRaisesRegex(ValueError, 'claim changed'):
            queue._mutate(self.conn, self.job, self.request, report={})
