import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_transcript as st
from content_production.execution import Cancelled
from content_production.segment_suggestion_contract import (
    PROMPT_V4, PROMPT_V5, build_prompt, response_schema,
)


class FakeCursor:
    def __init__(self, rows):
        self.rows, self.queries = rows, []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.queries.append(sql)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


class FakeConn:
    def __init__(self, rows):
        self.cur, self.rolled_back = FakeCursor(rows), False

    def cursor(self):
        return self.cur

    def rollback(self):
        self.rolled_back = True


class FakeClient:
    def __init__(self, segments=None, error=None):
        self.segments, self.error, self.calls = segments or [], error, []

    def transcribe(self, audio, request_id, duration_ms):
        self.calls.append((audio.name, duration_ms))
        if self.error:
            raise self.error
        return SimpleNamespace(segments=self.segments)


class TranscriptTextTests(unittest.TestCase):
    def test_compact_keeps_valid_timed_text_only(self):
        segments = [{'start_ms': 0, 'end_ms': 1500, 'text': ' 必须  用对气垫 '}, {'start_ms': 2000, 'end_ms': 1000, 'text': 'x'},
                    {'start_ms': 3000, 'end_ms': 4000, 'text': '  '}, {'start_ms': 1.5, 'end_ms': 2, 'text': 'x'}, 'bad']
        self.assertEqual(st.compact(segments), [[0, 1500, '必须 用对气垫']])

    def test_hint_lines_and_bounds(self):
        text, truncated = st.hint_text([[0, 1500, '必须用对气垫'], [61_200, 65_000, '今天下单买一送一']])
        self.assertEqual(text, '[0:00.0-0:01.5] 必须用对气垫\n[1:01.2-1:05.0] 今天下单买一送一')
        self.assertFalse(truncated)
        self.assertEqual(st.hint_text([[52_700, 59_970, '质地']])[0], '[0:52.7-0:59.9] 质地')
        many = [[i * 1000, i * 1000 + 900, '字' * 79] for i in range(200)]
        text, truncated = st.hint_text(many)
        self.assertTrue(truncated)
        self.assertLessEqual(len(text), st.MAX_HINT_CHARS)

    def test_cached_shape_is_validated(self):
        self.assertEqual(st.valid_cached([[0, 10, 'a']]), [[0, 10, 'a']])
        for bad in (None, [], [[0, 10]], [[10, 0, 'a']], [[0, 10, ' ']], 'x'):
            self.assertIsNone(st.valid_cached(bad))


class ResolveTests(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.work, True)

    def resolve(self, conn, client=None, source=None, duration_ms=3000):
        return st.resolve(conn, 'asset', 'a' * 64, source or self.work / 'missing.mp4', duration_ms, dict(os.environ),
                          lambda: None, self.work, client)

    def test_earlier_job_transcript_is_reused_without_asr(self):
        client = FakeClient()
        hint, settings, summary = self.resolve(FakeConn([([[0, 1000, '你好']],)]), client)
        self.assertEqual(hint, '[0:00.0-0:01.0] 你好')
        self.assertEqual(summary, {'status': 'ok', 'origin': 'job_cache', 'utterances': 1, 'hintChars': len(hint), 'truncated': False})
        self.assertEqual(settings['utterances'], [[0, 1000, '你好']])
        self.assertEqual(client.calls, [])

    def test_library_seed_asr_transcript_is_the_second_source(self):
        conn = FakeConn([None, ([{'start_ms': 0, 'end_ms': 900, 'text': '旁白'}],)])
        hint, _, summary = self.resolve(conn, FakeClient())
        self.assertEqual((hint, summary['origin']), ('[0:00.0-0:00.9] 旁白', 'library'))

    def test_failures_continue_without_a_transcript(self):
        conn = FakeConn([None, None])
        hint, settings, summary = self.resolve(conn, FakeClient())  # the source has no audio file to read
        self.assertIsNone(hint)
        self.assertEqual(settings, summary)
        self.assertEqual(summary['status'], 'unavailable')
        self.assertTrue(conn.rolled_back)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg required')
    def test_asr_runs_on_the_audio_track_and_cancellation_propagates(self):
        video = self.work / 'talk.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=black:size=64x64:rate=15:duration=3',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-shortest', str(video)], check=True)
        client = FakeClient([{'start_ms': 100, 'end_ms': 2500, 'text': '必须用对气垫'}])
        hint, settings, summary = self.resolve(FakeConn([None, None]), client, video)
        self.assertEqual(summary['origin'], 'seed_asr')
        self.assertEqual(hint, '[0:00.1-0:02.5] 必须用对气垫')
        self.assertEqual(client.calls[0][0], 'transcript-audio.wav')
        self.assertAlmostEqual(client.calls[0][1], 3000, delta=100)

        def cancelled():
            raise Cancelled('lost')
        with self.assertRaises(Cancelled):
            st.resolve(FakeConn([None, None]), 'asset', 'a' * 64, video, 3000, dict(os.environ), cancelled, self.work,
                       FakeClient([{'start_ms': 0, 'end_ms': 10, 'text': 'x'}]))


class PromptV5Tests(unittest.TestCase):
    labels = [{'key': 'a', 'name': '甲', 'definition': ''}, {'key': 'b', 'name': '乙', 'definition': ''}]

    def test_v5_is_v4_plus_transcript_and_rule(self):
        v4 = build_prompt('自定义预设', self.labels, PROMPT_V4, '切点统计')
        v5 = build_prompt('自定义预设', self.labels, PROMPT_V5, '切点统计', transcript='[0:00.0-0:01.0] 你好')
        self.assertIn('口播字幕（语音识别，[分:秒-分:秒] 文本）：\n[0:00.0-0:01.0] 你好', v5)
        self.assertIn('\n9. 口播字幕只作辅助', v5)
        stripped = v5.replace('\n口播字幕（语音识别，[分:秒-分:秒] 文本）：\n[0:00.0-0:01.0] 你好', '')
        head, _, tail = stripped.partition('\n9. 口播字幕只作辅助')
        self.assertEqual(head + '\n要求' + tail.split('\n要求', 1)[1], v4)
        for name in ('混剪口播', '实拍内容', '街采', '机制', 'KOC'):
            self.assertNotIn(name, v5)

    def test_v5_without_transcript_says_so_and_older_versions_reject_one(self):
        self.assertIn('本次没有口播字幕', build_prompt('预设', self.labels, PROMPT_V5, None))
        with self.assertRaises(ValueError):
            build_prompt('预设', self.labels, PROMPT_V4, None, transcript='x')

    def test_v5_schema_keeps_the_person_field(self):
        item = response_schema(self.labels, PROMPT_V5)['properties']['segments']['items']
        self.assertIn('same_person_as_previous', item['required'])


if __name__ == '__main__':
    unittest.main()
