"""Timed voice-over transcript for AI 切段 prompts (segment-suggest-v5).

Seed ASR transcribes the original audio once per source hash; the utterances are
stored in the job's `request_settings.transcript` (model input, not returned by the
job API) and reused by later jobs of the same source. Like the shot hint, the
transcript is advisory: any failure continues with a prompt that says no
transcript is available and never fails the job. Cancellation or a lost lease
(`Cancelled`, raised by `tick`) still propagates.
"""
import os
import uuid
import wave

from .execution import Cancelled
from .segment_suggestion_provider import call_with_ticks, run_media

MAX_DURATION_MS = 600_000
MAX_UTTERANCES = 400
MAX_LINE_CHARS = 80
MAX_HINT_CHARS = 6000
AUDIO_TIMEOUT_SECONDS = 180
# Seed ASR: one submit plus up to 30 polls of 2 s, each request bounded at 60 s.
ASR_DEADLINE_SECONDS = 300


def audio_command(source, output, ffmpeg='ffmpeg'):
    # Same input the library's Seed ASR path uses: first audio stream, 16 kHz mono PCM, at most 10 minutes.
    return [ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-map', '0:a:0', '-vn', '-ac', '1',
            '-ar', '16000', '-c:a', 'pcm_s16le', '-t', str(MAX_DURATION_MS // 1000), str(output)]


def compact(segments):
    """[(start_ms, end_ms, text)] from transcript segments; drops empty or invalid entries."""
    result = []
    for segment in segments or []:
        if not isinstance(segment, dict):
            continue
        start, end, text = segment.get('start_ms'), segment.get('end_ms'), segment.get('text')
        if type(start) is int and type(end) is int and 0 <= start < end and isinstance(text, str) and text.strip():
            result.append([start, end, ' '.join(text.split())])
    return result[:MAX_UTTERANCES]


def valid_cached(value):
    """Utterances stored by an earlier job, or None when the stored shape is unusable."""
    if not isinstance(value, list) or not value:
        return None
    rows = [row for row in value if isinstance(row, list) and len(row) == 3 and type(row[0]) is int
            and type(row[1]) is int and 0 <= row[0] < row[1] and isinstance(row[2], str) and row[2].strip()]
    return rows[:MAX_UTTERANCES] if len(rows) == len(value) else None


def cached_utterances(conn, asset_id, source_hash):
    """Utterances of the same source: an earlier suggestion job first, then the library's Seed ASR transcript."""
    with conn.cursor() as cur:
        cur.execute("""SELECT request_settings->'transcript'->'utterances' FROM ads.content_segment_suggestion_jobs
          WHERE asset_id=%s AND source_content_hash=%s AND request_settings->'transcript'->>'status'='ok'
          ORDER BY created_at DESC LIMIT 1""", (asset_id, source_hash))
        row = cur.fetchone()
        cached = valid_cached(row[0]) if row else None
        if cached:
            return cached, 'job_cache'
        cur.execute("""SELECT segments FROM ads.marketing_content_asset_transcripts
          WHERE asset_id=%s AND status='active' AND provider='seed_asr' AND metadata->>'source_sha256'=%s
          ORDER BY updated_at DESC LIMIT 1""", (asset_id, source_hash))
        row = cur.fetchone()
    utterances = compact(row[0]) if row else []
    return (utterances, 'library') if utterances else (None, None)


def transcribe(source, duration_ms, env, tick, work, client=None):
    """Seed ASR on the original's audio track; returns utterances. Raises on any failure."""
    from marketing_content_assets.seed_asr import SeedAsrClient
    if not 0 < duration_ms <= MAX_DURATION_MS:
        raise ValueError('source longer than the transcript limit')
    audio = work / 'transcript-audio.wav'
    if run_media(audio_command(source, audio), env, tick, AUDIO_TIMEOUT_SECONDS):
        raise ValueError('no readable audio track')
    with wave.open(str(audio), 'rb') as stream:
        audio_ms = round(stream.getnframes() * 1000 / stream.getframerate())
    if audio_ms <= 0:
        raise ValueError('empty audio track')
    client = client or SeedAsrClient(os.getenv('DOUBAO_ASR_API_KEY', ''))
    # Seed ASR validates word timing against the duration it is given; use the extracted audio length.
    request_id = str(uuid.uuid4())
    # Keeps the job lease alive while the ASR call blocks (the lease expires after 2 minutes).
    result = call_with_ticks(lambda: client.transcribe(audio, request_id, audio_ms), tick, ASR_DEADLINE_SECONDS)
    return compact(result.segments)


def _clock(ms):
    # Truncate to tenths so 59 970 ms reads 0:59.9, never 0:60.0.
    tenths = ms // 100
    return f'{tenths // 600}:{tenths % 600 // 10:02d}.{tenths % 10}'


def hint_text(utterances):
    """Bounded prompt text: one `[m:ss.s-m:ss.s] text` line per utterance. Returns (text, truncated)."""
    lines, used, truncated = [], 0, False
    for start, end, text in utterances:
        line = f'[{_clock(start)}-{_clock(end)}] {text[:MAX_LINE_CHARS]}'
        truncated = truncated or len(text) > MAX_LINE_CHARS
        if used + len(line) + 1 > MAX_HINT_CHARS:
            truncated = True
            break
        lines.append(line)
        used += len(line) + 1
    return '\n'.join(lines), truncated


def resolve(conn, asset_id, source_hash, source, duration_ms, env, tick, work, client=None):
    """(hint or None, settings for request_settings.transcript, summary for result_summary)."""
    try:
        utterances, origin = cached_utterances(conn, asset_id, source_hash)
        if utterances is None:
            utterances, origin = transcribe(source, duration_ms, env, tick, work, client), 'seed_asr'
    except Cancelled:
        raise
    except Exception as error:  # Advisory input: continue without it, keep only the error type.
        conn.rollback()
        summary = {'status': 'unavailable', 'errorType': type(error).__name__}
        return None, summary, summary
    if not utterances:
        summary = {'status': 'empty', 'origin': origin}
        return None, summary, summary
    text, truncated = hint_text(utterances)
    summary = {'status': 'ok', 'origin': origin, 'utterances': len(utterances), 'hintChars': len(text),
               'truncated': truncated}
    return text, {**summary, 'utterances': utterances}, summary
