"""Seed ASR audio-only adapter for the existing transcript job worker."""
from __future__ import annotations

import base64
import os
import subprocess
import time
import uuid
import wave
from pathlib import Path
from types import SimpleNamespace

import requests

from .asr_client import TranscriptError, TranscriptResult, segments_to_srt

ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel'


class SeedAsrClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise TranscriptError('缺少 DOUBAO_ASR_API_KEY')
        self.api_key = api_key
        self.session = requests.Session()
        self.config = SimpleNamespace(provider='seed_asr', model='seed-asr-2.0')

    def _post(self, action, request_id, payload):
        try:
            response = self.session.post(f'{ENDPOINT}/{action}', json=payload, headers={
                'X-Api-Key': self.api_key, 'X-Api-Resource-Id': 'volc.seedasr.auc',
                'X-Api-Request-Id': request_id, 'X-Api-Sequence': '-1',
            }, timeout=(10, 60), allow_redirects=False)
        except requests.RequestException:
            raise TranscriptError('Seed ASR 网络异常，提交状态可能未知；不自动重复提交') from None
        if response.status_code != 200:
            raise TranscriptError(f'Seed ASR HTTP {response.status_code}')
        code = response.headers.get('X-Api-Status-Code')
        if code not in {'20000000', '20000001', '20000002'}:
            raise TranscriptError('Seed ASR 提供方拒绝或识别失败')
        if len(response.content) > 4 * 1024 * 1024:
            raise TranscriptError('Seed ASR 响应超过限制')
        if action == 'query' and code == '20000000':
            try:
                return code, response.json()
            except ValueError:
                raise TranscriptError('Seed ASR 返回无效 JSON') from None
        return code, None

    def transcribe(self, audio: Path, request_id: str, duration_ms: int) -> TranscriptResult:
        if not 0 < audio.stat().st_size <= 20 * 1024 * 1024:
            raise TranscriptError('ASR 音频大小超出限制')
        code, _ = self._post('submit', request_id, {
            'user': {'uid': 'aios-transcript-worker'},
            'audio': {'data': base64.b64encode(audio.read_bytes()).decode(), 'format': 'wav'},
            'request': {'model_name': 'bigmodel', 'enable_itn': True,
                        'enable_punc': True, 'enable_ddc': False},
        })
        if code != '20000000':
            raise TranscriptError('Seed ASR 未确认提交成功')
        for _ in range(30):
            code, payload = self._post('query', request_id, {})
            if code == '20000000':
                return normalize_result(payload, request_id, duration_ms)
            time.sleep(2)
        raise TranscriptError('Seed ASR 等待超时；保留任务号，不自动重复提交')


def normalize_result(payload, request_id, duration_ms):
    """Keep real word timing; never interpolate timestamps from script segments."""
    from content_production.semantic_captions import prepare_words, speech_context
    result = payload.get('result') if isinstance(payload, dict) else None
    try:
        words = prepare_words(result, 0, duration_ms)
        if any(w['endMs'] > duration_ms for w in words):
            raise ValueError('outside source')
        segments = []
        for index, utterance in enumerate(result['utterances'], 1):
            start, end, text = utterance.get('start_time'), utterance.get('end_time'), utterance.get('text')
            if (type(start) is not int or type(end) is not int or not 0 <= start < end <= duration_ms
                    or not isinstance(text, str) or not text.strip()):
                raise ValueError('invalid utterance')
            for word in utterance['words']:
                if word['text'].strip() and not start <= word['start_time'] < word['end_time'] <= end:
                    raise ValueError('word outside utterance')
            segments.append({'index': index, 'start_ms': start, 'end_ms': end,
                             'text': text, 'confidence': None})
        speech_context(result, words, 0)
        # Whitelist timing/text fields; no raw provider metadata enters the stored receipt.
        timing = {'utterances': [{'text': u['text'], 'start_time': u['start_time'],
                   'end_time': u['end_time'], 'words': [
                       {k: w[k] for k in ('text', 'start_time', 'end_time')}
                       for w in u['words'] if w['text'].strip()]} for u in result['utterances']]}
    except (ValueError, KeyError, TypeError):
        raise TranscriptError('Seed ASR 缺少有效逐字时间，拒绝以估算时间替代') from None
    text = '\n'.join(s['text'] for s in segments)
    return TranscriptResult('seed_asr', 'seed-asr-2.0', 'zh', text, text,
                            segments_to_srt(segments), segments, None,
                            {'id': request_id, 'wordTiming': timing},
                            {'enable_ddc': False, 'timing': 'provider_words'})


def prepare_seed_input(storage, job, work_dir: Path):
    """Only original audio is allowed; verify downloaded bytes before extracting."""
    from content_production.worker import download
    source_hash = str(job.get('raw_sha256') or '')
    if len(source_hash) != 64 or any(c not in '0123456789abcdef' for c in source_hash):
        raise TranscriptError('逐字转写需要原片 SHA256')
    from .worker_runtime import job_metadata
    expected = job_metadata(job).get('source_sha256')
    if expected is not None and expected != source_hash:
        raise TranscriptError('转写排队期间原片版本已改变')
    key = job.get('raw_object_key')
    if not key or job.get('input_object_key') not in (None, '', key):
        raise TranscriptError('逐字转写仅支持原片输入')
    duration_ms = round(float(job.get('duration_seconds') or 0) * 1000)
    if not 0 < duration_ms <= 600_000:
        raise TranscriptError('逐字转写当前支持不超过10分钟原片')
    work_dir.mkdir(parents=True, exist_ok=True)
    source, audio = work_dir / 'asr-source.mp4', work_dir / 'asr-audio.wav'
    download(storage, key, source, source_hash, lambda: None)
    try:
        subprocess.run([os.getenv('FFMPEG_BINARY', 'ffmpeg'), '-nostdin', '-v', 'error', '-n',
                        '-i', str(source), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000',
                        '-c:a', 'pcm_s16le', '-t', '600', str(audio)],
                       check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.SubprocessError, OSError):
        raise TranscriptError('原片音轨提取失败') from None
    with wave.open(str(audio), 'rb') as stream:
        actual_ms = round(stream.getnframes() * 1000 / stream.getframerate())
    if abs(actual_ms - duration_ms) > 250:
        raise TranscriptError('原片音轨时长与资产记录不一致')
    return audio, duration_ms, source_hash


def reserve_submission(conn, job):
    """Durably fence paid submission. Unknown outcomes require explicit reconciliation."""
    from psycopg2.extras import Json
    request_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE ads.marketing_content_asset_processing_jobs
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                max_attempts = attempts
            WHERE job_id = %s AND status = 'running'
              AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'seed_asr_request_id')
            RETURNING job_id
        """, (Json({'seed_asr_request_id': request_id}), str(job['job_id'])))
        if cur.fetchone() is None:
            raise TranscriptError('ASR 已有提交记录或任务状态已改变，拒绝重复付费提交')
    conn.commit()
    job['max_attempts'] = job['attempts']
    return request_id
