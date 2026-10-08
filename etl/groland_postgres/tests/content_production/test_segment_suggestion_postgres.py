"""Disposable-database contract for the AI 切段 worker with the mock provider only."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
import psycopg2
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_shot_hints, segment_transcript
from content_production.segment_suggestion_provider import MockSegmentProvider
from content_production.segment_suggestion_queue import claim, fail, heartbeat
from content_production.segment_suggestion_worker import LocalSource, WorkerUnavailable, process_one
from content_production.execution import Cancelled

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
ENV = {'DATABASE_URL': DB or '', 'CONTENT_AI_STUDIO_ENABLED': 'true', 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_ENABLED': 'true'}
PAYLOAD = {'segments': [
    {'start_sec': 0, 'end_sec': 2.5, 'label_key': 'mixed_voiceover', 'confidence': 0.9, 'reason': '快切口播'},
    {'start_sec': 2.5, 'end_sec': 5.9, 'label_key': 'live_demo', 'confidence': 0.7, 'reason': '同人演示'},
    {'start_sec': 5.9, 'end_sec': 6.0, 'label_key': 'promotion', 'confidence': 0.4, 'reason': '过短'},
    {'start_sec': 1, 'end_sec': 2, 'label_key': 'not_in_preset', 'confidence': 0.4, 'reason': '未知'},
]}


@unittest.skipUnless(DB and shutil.which('ffmpeg') and shutil.which('ffprobe'), 'disposable database and ffmpeg required')
class SegmentSuggestionWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media = Path(tempfile.mkdtemp(prefix='segment-suggest-media-'))
        cls.video = cls.media / 'fixtures' / 'whole.mp4'
        cls.video.parent.mkdir()
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x568:rate=15:duration=6',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-shortest', str(cls.video)], check=True)
        cls.sha = hashlib.sha256(cls.video.read_bytes()).hexdigest()
        # A hard red->blue cut at exactly 3.000 s for boundary calibration.
        cls.cut_video = cls.media / 'fixtures' / 'cut.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:size=320x568:rate=15:duration=3',
                        '-f', 'lavfi', '-i', 'color=blue:size=320x568:rate=15:duration=3', '-f', 'lavfi', '-i',
                        'sine=frequency=440:duration=6', '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]',
                        '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(cls.cut_video)],
                       check=True)
        cls.cut_sha = hashlib.sha256(cls.cut_video.read_bytes()).hexdigest()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.media, ignore_errors=True)

    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.work = Path(tempfile.mkdtemp(prefix='segment-suggest-work-'))
        self.addCleanup(shutil.rmtree, self.work, True)
        # The worker claims the oldest queued job; park leftovers from other suites in this disposable database.
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET status='cancelled',finished_at=NOW() WHERE status IN ('queued','running')")
        self.asset = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,raw_sha256,raw_object_key,
            duration_seconds,product_name) VALUES (%s,'suggest fixture','ready',%s,'fixtures/whole.mp4',6,'精华')""",
                     (self.asset, self.sha))
        # Raw hashes are unique among active assets; retire the fixture afterwards.
        self.addCleanup(self.execute, 'UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=%s', (self.asset,))

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def segment(self, start, end, origin, status, sha=None, label='mixed_voiceover'):
        segment_id = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,end_ms,
            preset_key,preset_version,label_key,origin,status,confirmed_by,confirmed_at) VALUES
            (%s,'owner',%s,%s,%s,%s,'framework',1,%s,%s,%s,CASE WHEN %s='confirmed' THEN 'owner' END,
             CASE WHEN %s='confirmed' THEN NOW() END)""",
                     (segment_id, self.asset, sha or self.sha, start, end, label, origin, status, status, status))
        return segment_id

    def job(self, sha=None, settings=None):
        job_id = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.content_segment_suggestion_jobs (job_id,owner_user_id,asset_id,source_content_hash,
            preset_key,preset_version,request_settings) VALUES (%s,'requester',%s,%s,'framework',1,%s)""",
                     (job_id, self.asset, sha or self.sha, json.dumps(settings or {})))
        return job_id

    def run_worker(self, provider, env=None):
        with patch.dict(os.environ, {**ENV, **(env or {})}):
            return process_one(self.work, provider_factory=lambda: provider,
                               source_factory=lambda: LocalSource(self.media))

    def test_late_model_boundary_snaps_to_the_frame_accurate_cut(self):
        self.execute('UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=%s', (self.asset,))
        self.asset = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,raw_sha256,raw_object_key,
            duration_seconds,product_name) VALUES (%s,'cut fixture','ready',%s,'fixtures/cut.mp4',6,'精华')""",
                     (self.asset, self.cut_sha))
        self.addCleanup(self.execute, 'UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=%s', (self.asset,))
        job_id = self.job(sha=self.cut_sha)
        # Late by ~0.3 s and with the 10 ms sliver the live model often leaves between neighbours.
        late = {'segments': [{'start_sec': 0, 'end_sec': 3.29, 'label_key': 'mixed_voiceover', 'confidence': 0.9, 'reason': '口播'},
                             {'start_sec': 3.3, 'end_sec': 6, 'label_key': 'live_demo', 'confidence': 0.8, 'reason': '演示'}]}
        self.assertEqual(self.run_worker(MockSegmentProvider(late)), {'jobId': job_id, 'status': 'succeeded'})
        rows = self.execute("""SELECT start_ms,end_ms FROM ads.content_segments WHERE asset_id=%s AND origin='ai'
                               AND status='suggested' ORDER BY start_ms""", (self.asset,))
        self.assertEqual([tuple(row) for row in rows], [(0, 3000), (3000, 6000)])
        summary = self.execute('SELECT result_summary FROM ads.content_segment_suggestion_jobs WHERE job_id=%s', (job_id,))[0][0]
        self.assertEqual(summary['boundarySnap'],
                         {'enabled': True, 'boundaries': 1, 'snapped': 1, 'failed': 0, 'shiftsMs': [-295]})
        with patch.dict(os.environ, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SNAP': '0'}):
            job_id = self.job(sha=self.cut_sha)
            self.run_worker(MockSegmentProvider(late))
        summary = self.execute('SELECT result_summary FROM ads.content_segment_suggestion_jobs WHERE job_id=%s', (job_id,))[0][0]
        self.assertEqual(summary['boundarySnap'], {'enabled': False})

    def test_single_label_answer_is_retried_once_and_billed_twice(self):
        collapsed = {'segments': [{'start_sec': a, 'end_sec': b, 'label_key': 'street_interview', 'confidence': 0.6,
                                   'reason': '单一'} for a, b in ((0, 2), (2, 4), (4, 6))]}

        class Sequence(MockSegmentProvider):
            answers = [collapsed, PAYLOAD]

            def suggest(self, proxy, prompt, schema, duration_ms):
                self.payload = self.answers[len(self.calls)]
                result = super().suggest(proxy, prompt, schema, duration_ms)
                return replace(result, usage={'total_tokens': 100, 'input_tokens_details': {'cached_tokens': 1}},
                                       response_id=f'resp-{len(self.calls)}')
        job_id = self.job()
        provider = Sequence()
        with patch('content_production.segment_suggestion_contract.DEGENERATE_MIN_DURATION_MS', 0):
            result = self.run_worker(provider)
        self.assertEqual(result, {'jobId': job_id, 'status': 'succeeded'})
        self.assertEqual(len(provider.calls), 2)
        summary, usage = self.execute(
            'SELECT result_summary,usage FROM ads.content_segment_suggestion_jobs WHERE job_id=%s', (job_id,))[0]
        self.assertEqual(summary['degenerateRetry'],
                         {'label': 'street_interview', 'firstResponseId': 'resp-1', 'stillDegenerate': False})
        self.assertEqual(summary['responseId'], 'resp-2')
        self.assertEqual(usage, {'total_tokens': 200, 'input_tokens_details': {'cached_tokens': 2}})
        labels = [row[0] for row in self.execute(
            """SELECT label_key FROM ads.content_segments WHERE asset_id=%s AND origin='ai' AND status='suggested'
               ORDER BY start_ms""", (self.asset,))]
        self.assertEqual(labels[:2], ['mixed_voiceover', 'live_demo'])

    def test_mock_run_writes_suggestions_and_supersedes_only_ai_suggested(self):
        human = self.segment(0, 1000, 'human', 'confirmed')
        human_draft = self.segment(1000, 2000, 'human', 'suggested')
        ai_confirmed = self.segment(2000, 3000, 'ai', 'confirmed')
        ai_rejected = self.segment(3000, 3500, 'ai', 'rejected')
        old_ai = self.segment(3000, 4000, 'ai', 'suggested')
        old_hash = self.segment(4000, 5000, 'human', 'confirmed', sha='b' * 64)
        job_id = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        result = self.run_worker(provider)
        self.assertEqual(result, {'jobId': job_id, 'status': 'succeeded'})
        self.assertEqual(len(provider.calls), 1)
        self.assertIn('混剪口播', provider.calls[0]['prompt'])  # definitions come from the stored preset
        self.assertTrue(provider.calls[0]['proxy'].endswith('proxy.mp4'))
        # v4 (default) requires the person-continuity observation in the strict schema.
        self.assertIn('same_person_as_previous', provider.calls[0]['schema']['properties']['segments']['items']['required'])

        status, code, model, prompt, settings, summary, attempt = self.execute(
            """SELECT status,error_code,model,prompt_version,request_settings,result_summary,attempt
               FROM ads.content_segment_suggestion_jobs WHERE job_id=%s""", (job_id,))[0]
        self.assertEqual((status, code, model, prompt, attempt), ('succeeded', None, 'mock-segment-provider', 'segment-suggest-v4', 1))
        self.assertEqual(settings['provider'], 'mock')
        self.assertEqual(settings['promptVersion'], 'segment-suggest-v4')
        self.assertEqual(len(settings['promptSha256']), 64)
        self.assertEqual(settings['shotDetection'], {'enabled': True, 'threshold': 0.3, 'windowSeconds': 5, 'hintIncluded': True})
        shots = summary['shotDetection']
        self.assertEqual((shots['status'], shots['input'], shots['threshold'], shots['windowMs']), ('ok', 'proxy', 0.3, 5000))
        self.assertIsInstance(shots['cutCount'], int)
        self.assertIsInstance(shots['elapsedMs'], int)
        self.assertEqual(summary['promptVersion'], 'segment-suggest-v4')
        self.assertIn('镜头切换统计（本地画面检测，场景阈值 0.3）', provider.calls[0]['prompt'])
        self.assertIn('不要为了覆盖全片而硬归类', provider.calls[0]['prompt'])
        all_keys = ['mixed_voiceover', 'live_demo', 'street_interview', 'promotion', 'koc']
        self.assertEqual(settings['labelKeys'], all_keys)  # legacy job without a subset uses every label
        self.assertEqual(summary['labelKeys'], all_keys)
        self.assertLessEqual(abs(settings['durationMs'] - 6000), 100)
        self.assertEqual(summary['segmentsInserted'], 2)
        self.assertEqual(summary['supersededSuggestions'], 1)
        self.assertEqual(summary['skippedConfirmedDuplicates'], 0)  # confirmed 0–1 s / 2–3 s overlap < 80%
        self.assertEqual(summary['dropped']['unknown_label'], 1)
        self.assertEqual(summary['dropped']['too_short'], 1)

        rows = self.execute("""SELECT start_ms,end_ms,label_key,product_name,owner_user_id,evidence,source_duration_ms
            FROM ads.content_segments WHERE asset_id=%s AND origin='ai' AND status='suggested' ORDER BY start_ms""", (self.asset,))
        self.assertEqual([(r[0], r[1], r[2]) for r in rows], [(0, 2500, 'mixed_voiceover'), (2500, 5900, 'live_demo')])
        self.assertEqual({r[3] for r in rows}, {'精华'})
        self.assertEqual({r[4] for r in rows}, {'requester'})
        self.assertEqual({r[6] for r in rows}, {6000})
        evidence = rows[0][5]
        self.assertEqual((evidence['jobId'], evidence['model'], evidence['promptVersion'], evidence['confidence'], evidence['reason']),
                         (job_id, 'mock-segment-provider', 'segment-suggest-v4', 0.9, '快切口播'))

        states = dict(self.execute("SELECT segment_id::TEXT,status FROM ads.content_segments WHERE asset_id=%s", (self.asset,)))
        self.assertEqual(states[human], 'confirmed')
        self.assertEqual(states[human_draft], 'suggested')
        self.assertEqual(states[ai_confirmed], 'confirmed')
        self.assertEqual(states[ai_rejected], 'rejected')
        self.assertEqual(states[old_ai], 'rejected')
        self.assertEqual(states[old_hash], 'stale')
        superseded = self.execute("SELECT evidence FROM ads.content_segments WHERE segment_id=%s", (old_ai,))[0][0]
        self.assertEqual(superseded['supersededByJobId'], job_id)
        self.assertEqual(self.run_worker(MockSegmentProvider(PAYLOAD)), {'status': 'idle'})

    def test_label_subset_limits_the_call_and_drops_other_labels(self):
        subset = ['mixed_voiceover', 'live_demo', 'street_interview', 'promotion']
        # The API stores the subset; the worker must merge its call settings instead of replacing it.
        job_id = self.job(settings={'labelKeys': subset})
        payload = {'segments': PAYLOAD['segments'][:2] + [
            {'start_sec': 5.0, 'end_sec': 6.0, 'label_key': 'koc', 'confidence': 0.9, 'reason': '素人分享'}]}
        provider = MockSegmentProvider(payload)
        self.assertEqual(self.run_worker(provider), {'jobId': job_id, 'status': 'succeeded'})
        call = provider.calls[0]
        self.assertNotIn('koc（KOC）', call['prompt'])
        self.assertIn('promotion（机制）', call['prompt'])
        enum = call['schema']['properties']['segments']['items']['properties']['label_key']['enum']
        self.assertEqual(enum, subset)
        settings, summary = self.execute("""SELECT request_settings,result_summary FROM ads.content_segment_suggestion_jobs
            WHERE job_id=%s""", (job_id,))[0]
        self.assertEqual((settings['labelKeys'], settings['provider']), (subset, 'mock'))
        self.assertEqual(summary['labelKeys'], subset)
        self.assertEqual(summary['dropped']['unknown_label'], 1)
        self.assertEqual(summary['unknownLabels'], ['koc'])
        labels = [row[0] for row in self.execute("""SELECT label_key FROM ads.content_segments WHERE asset_id=%s
            AND origin='ai' AND status='suggested' ORDER BY start_ms""", (self.asset,))]
        self.assertEqual(labels, ['mixed_voiceover', 'live_demo'])

    def test_v1_prompt_is_selectable_and_skips_shot_detection(self):
        job_id = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with patch.object(segment_shot_hints, 'run_media') as detector:
            result = self.run_worker(provider, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION': 'segment-suggest-v1'})
        self.assertEqual(result, {'jobId': job_id, 'status': 'succeeded'})
        detector.assert_not_called()
        self.assertIn('尽量覆盖全片', provider.calls[0]['prompt'])
        self.assertNotIn('镜头切换统计', provider.calls[0]['prompt'])
        prompt, settings, summary = self.execute("""SELECT prompt_version,request_settings,result_summary
            FROM ads.content_segment_suggestion_jobs WHERE job_id=%s""", (job_id,))[0]
        self.assertEqual((prompt, settings['promptVersion'], summary['promptVersion']), ('segment-suggest-v1',) * 3)
        self.assertFalse(settings['shotDetection']['enabled'])
        self.assertEqual(summary['shotDetection']['status'], 'disabled')

    def test_v5_transcribes_once_and_reuses_the_transcript_for_the_same_source(self):
        v5 = {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION': 'segment-suggest-v5'}
        first = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with patch.object(segment_transcript, 'transcribe', return_value=[[0, 2400, '必须用对气垫']]) as asr:
            self.assertEqual(self.run_worker(provider, v5), {'jobId': first, 'status': 'succeeded'})
        asr.assert_called_once()
        self.assertIn('[0:00.0-0:02.4] 必须用对气垫', provider.calls[0]['prompt'])
        settings, summary = self.execute("""SELECT request_settings,result_summary FROM ads.content_segment_suggestion_jobs
            WHERE job_id=%s""", (first,))[0]
        self.assertEqual(settings['transcript']['utterances'], [[0, 2400, '必须用对气垫']])
        self.assertEqual(summary['transcript'], {'status': 'ok', 'origin': 'seed_asr', 'utterances': 1,
                                                 'hintChars': len('[0:00.0-0:02.4] 必须用对气垫'), 'truncated': False})
        self.assertNotIn('utterances', json.dumps(summary['transcript'], ensure_ascii=False).replace('"utterances": 1', ''))
        second = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with patch.object(segment_transcript, 'transcribe') as asr:
            self.assertEqual(self.run_worker(provider, v5), {'jobId': second, 'status': 'succeeded'})
        asr.assert_not_called()
        self.assertIn('必须用对气垫', provider.calls[0]['prompt'])
        summary = self.execute('SELECT result_summary FROM ads.content_segment_suggestion_jobs WHERE job_id=%s', (second,))[0][0]
        self.assertEqual(summary['transcript']['origin'], 'job_cache')

    def test_v5_transcript_failure_degrades_to_prompt_without_it(self):
        job_id = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with patch.object(segment_transcript, 'transcribe', side_effect=RuntimeError('asr down')):
            result = self.run_worker(provider, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION': 'segment-suggest-v5'})
        self.assertEqual(result, {'jobId': job_id, 'status': 'succeeded'})
        self.assertIn('本次没有口播字幕', provider.calls[0]['prompt'])
        settings, summary = self.execute("""SELECT request_settings,result_summary FROM ads.content_segment_suggestion_jobs
            WHERE job_id=%s""", (job_id,))[0]
        self.assertEqual(summary['transcript'], {'status': 'unavailable', 'errorType': 'RuntimeError'})
        self.assertEqual(settings['transcript'], summary['transcript'])

    def test_invalid_prompt_version_leaves_job_queued(self):
        job_id = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with self.assertRaises(WorkerUnavailable):
            self.run_worker(provider, {'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION': 'segment-suggest-v9'})
        self.assertEqual(provider.calls, [])
        self.assertEqual(self.execute("SELECT status FROM ads.content_segment_suggestion_jobs WHERE job_id=%s",
                                      (job_id,))[0][0], 'queued')

    def test_shot_detection_failure_degrades_to_prompt_without_statistics(self):
        job_id = self.job()
        provider = MockSegmentProvider(PAYLOAD)
        with patch.object(segment_shot_hints, 'run_media', return_value=1):
            self.assertEqual(self.run_worker(provider), {'jobId': job_id, 'status': 'succeeded'})
        self.assertIn('本次没有镜头切换统计', provider.calls[0]['prompt'])
        settings, summary = self.execute("""SELECT request_settings,result_summary FROM ads.content_segment_suggestion_jobs
            WHERE job_id=%s""", (job_id,))[0]
        self.assertFalse(settings['shotDetection']['hintIncluded'])
        self.assertEqual((summary['shotDetection']['status'], summary['shotDetection']['warning']),
                         ('failed', 'shot_detection_failed'))
        self.assertEqual(summary['segmentsInserted'], 2)

    def test_unknown_stored_subset_fails_without_model_call(self):
        job_id = self.job(settings={'labelKeys': ['not_in_preset']})
        provider = MockSegmentProvider(PAYLOAD)
        self.assertEqual(self.run_worker(provider), {'jobId': job_id, 'status': 'failed', 'errorCode': 'invalid_request'})
        self.assertEqual(provider.calls, [])

    def test_changed_source_fails_without_model_call_or_writes(self):
        job_id = self.job(sha='c' * 64)
        provider = MockSegmentProvider(PAYLOAD)
        result = self.run_worker(provider)
        self.assertEqual(result, {'jobId': job_id, 'status': 'failed', 'errorCode': 'source_changed'})
        self.assertEqual(provider.calls, [])
        status, code, finished = self.execute(
            "SELECT status,error_code,finished_at IS NOT NULL FROM ads.content_segment_suggestion_jobs WHERE job_id=%s", (job_id,))[0]
        self.assertEqual((status, code, finished), ('failed', 'source_changed', True))
        self.assertEqual(self.execute("SELECT COUNT(*) FROM ads.content_segments WHERE asset_id=%s", (self.asset,))[0][0], 0)
        # No automatic retry: the failed job is not claimed again.
        self.assertEqual(self.run_worker(provider), {'status': 'idle'})

    def test_provider_failure_keeps_existing_suggestions(self):
        old_ai = self.segment(0, 1000, 'ai', 'suggested')
        job_id = self.job()
        result = self.run_worker(MockSegmentProvider(error=RuntimeError('boom')))
        self.assertEqual((result['jobId'], result['status'], result['errorCode']), (job_id, 'failed', 'internal_error'))
        self.assertEqual(self.execute("SELECT status FROM ads.content_segments WHERE segment_id=%s", (old_ai,))[0][0], 'suggested')
        model = self.execute("SELECT model FROM ads.content_segment_suggestion_jobs WHERE job_id=%s", (job_id,))[0][0]
        self.assertEqual(model, 'mock-segment-provider')  # intent recorded before the call

    def test_expired_lease_fails_and_cannot_publish(self):
        job_id = self.job()
        job = claim(self.conn)
        self.assertEqual(str(job['job_id']), job_id)
        self.execute("UPDATE ads.content_segment_suggestion_jobs SET heartbeat_at=NOW()-INTERVAL '3 minutes' WHERE job_id=%s", (job_id,))
        self.assertIsNone(claim(self.conn))
        self.assertEqual(self.execute("SELECT status,error_code FROM ads.content_segment_suggestion_jobs WHERE job_id=%s",
                                      (job_id,))[0], ('failed', 'lease_expired'))
        with self.assertRaises(Cancelled):
            heartbeat(self.conn, job, 'late')
        self.assertFalse(fail(self.conn, job, 'provider_error', 'late'))


if __name__ == '__main__':
    unittest.main()
