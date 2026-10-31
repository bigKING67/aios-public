"""Local FunASR adapter for the transcript job worker (compute node only, no call fee).

The node's `content_production.local_asr` service (127.0.0.1) transcribes a wav it can read under
its allowed root, so the worker's temp directory must sit inside that root. Times are the VAD
segment bounds of the original audio; numbers pass through the conservative `itn_zh` rules.
"""
from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace

import requests

from .asr_client import TranscriptError, TranscriptResult, segments_to_srt
from .itn_zh import ITN_VERSION, normalize

URL_ENV = 'CONTENT_AI_STUDIO_LOCAL_ASR_URL'
HOTWORDS_ENV = 'CONTENT_AI_STUDIO_LOCAL_ASR_HOTWORDS'
DEADLINE_SECONDS = 600
MAX_UTTERANCES = 2000


class FunasrLocalClient:
    def __init__(self, url: str | None = None, hotwords: str | None = None, session=None):
        url = (url if url is not None else os.getenv(URL_ENV, '')).strip()
        if not url:
            raise TranscriptError(f'缺少 {URL_ENV}，本机没有本地语音识别服务')
        self.url = url.rstrip('/') + '/transcribe'
        self.hotwords = (hotwords if hotwords is not None else os.getenv(HOTWORDS_ENV, '')).strip()
        self.session = session or requests.Session()
        self.session.trust_env = False  # localhost: never through a proxy
        self.config = SimpleNamespace(provider='funasr_local', model='funasr-paraformer-zh')

    def transcribe(self, audio: Path, duration_ms: int) -> TranscriptResult:
        try:
            response = self.session.post(self.url, json={'path': str(audio.resolve()), 'hotword': self.hotwords},
                                         timeout=(5, DEADLINE_SECONDS))
        except requests.RequestException:
            raise TranscriptError('本地语音识别服务不可用') from None
        if response.status_code != 200:
            raise TranscriptError(f'本地语音识别 HTTP {response.status_code}')
        try:
            body = response.json()
        except ValueError:
            raise TranscriptError('本地语音识别返回无效 JSON') from None
        return normalize_result(body, duration_ms, bool(self.hotwords))


def normalize_result(body, duration_ms, hotwords=False):
    """Segments from `{"utterances": [[start_ms, end_ms, text]], "models": {...}}`; invalid rows dropped."""
    segments = []
    for row in (body.get('utterances') if isinstance(body, dict) else None) or []:
        if not (isinstance(row, list) and len(row) == 3):
            continue
        start, end, text = row
        if type(start) is not int or type(end) is not int or not isinstance(text, str):
            continue
        end = min(end, duration_ms)
        text = normalize(' '.join(text.split()))
        if 0 <= start < end and text:
            segments.append({'index': len(segments) + 1, 'start_ms': start, 'end_ms': end, 'text': text,
                             'confidence': None})
        if len(segments) == MAX_UTTERANCES:
            break
    models = body.get('models') if isinstance(body, dict) and isinstance(body.get('models'), dict) else {}
    text = '\n'.join(segment['text'] for segment in segments)
    # An audio track with no speech is a valid empty transcript, not a failure.
    return TranscriptResult('funasr_local', 'funasr-paraformer-zh', 'zh', text, text,
                            segments_to_srt(segments) if segments else '', segments, None,
                            {'id': '', 'models': models},
                            {'timing': 'vad_segments', 'itn': ITN_VERSION, 'hotwords': hotwords})
