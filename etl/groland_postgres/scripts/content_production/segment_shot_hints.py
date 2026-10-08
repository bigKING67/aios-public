"""Local shot-cut statistics for AI 切段 prompts (zero model cost).

FFmpeg scene detection runs on the job's proxy video (the same timeline the
model sees) and reuses the shot catalog filter and showinfo parser. The result
is a compact, bounded text hint: cuts per fixed window plus the longest spans
without a detected cut. Detection is advisory; any failure degrades to a prompt
without the hint and never fails the job.

Length rules: at most MAX_WINDOWS windows are listed — when the video needs
more, adjacent windows are merged into an integer multiple of the configured
window (the hint states the effective width). At most MAX_QUIET_SPANS quiet
spans of at least MIN_QUIET_SPAN_MS are listed. If the text still exceeds
MAX_HINT_CHARS, trailing window entries are dropped and the hint says so.
"""
import math
import os
import re
import time

from .segment_suggestion_provider import run_media
from .shot_catalog import parse_boundaries, scene_filter

THRESHOLD_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SHOT_THRESHOLD'
WINDOW_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SHOT_WINDOW_SECONDS'
ENABLED_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SHOT_HINTS'
DEFAULT_THRESHOLD = 0.3
DEFAULT_WINDOW_SECONDS = 5
MAX_WINDOWS = 60
MAX_QUIET_SPANS = 5
MIN_QUIET_SPAN_MS = 6000
# Cuts closer than this to the previous kept cut (or to either end) are flashes, not shots.
MIN_CUT_GAP_MS = 250
MAX_HINT_CHARS = 1500
MAX_LOG_BYTES = 8 * 1024 * 1024
DETECT_TIMEOUT_SECONDS = 300


def settings_from_env():
    """Validated detector settings; invalid values raise ValueError (worker stays unavailable)."""
    enabled = (os.getenv(ENABLED_ENV) or '1').strip()
    if enabled not in {'0', '1'}:
        raise ValueError(f'{ENABLED_ENV} must be 0 or 1')
    raw = (os.getenv(THRESHOLD_ENV) or '').strip()
    threshold = float(raw) if raw else DEFAULT_THRESHOLD
    if not math.isfinite(threshold) or not 0.05 <= threshold <= 0.9:
        raise ValueError(f'{THRESHOLD_ENV} must be between 0.05 and 0.9')
    raw = (os.getenv(WINDOW_ENV) or '').strip()
    window = int(raw) if raw else DEFAULT_WINDOW_SECONDS
    if not 1 <= window <= 60:
        raise ValueError(f'{WINDOW_ENV} must be an integer 1–60')
    return {'enabled': enabled == '1', 'threshold': threshold, 'windowSeconds': window}


SNAP_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_SNAP'
SNAP_THRESHOLD = 0.2
SNAP_BEFORE_MS = 800
SNAP_AFTER_MS = 300
SNAP_TIMEOUT_SECONDS = 60
_METADATA_TIME = re.compile(r'\[Parsed_metadata_[^\]]+\].*?\bpts_time:([0-9]+(?:\.[0-9]+)?)')
_SCENE_SCORE = re.compile(r'lavfi\.scene_score=([0-9]+(?:\.[0-9]+)?)')


def snap_enabled_from_env():
    value = (os.getenv(SNAP_ENV) or '1').strip()
    if value not in {'0', '1'}:
        raise ValueError(f'{SNAP_ENV} must be 0 or 1')
    return value == '1'


def refine_command(video, start_ms, duration_ms, threshold=SNAP_THRESHOLD, ffmpeg='ffmpeg'):
    # Frame-accurate: decodes only this window of the original at its native frame rate.
    return [ffmpeg, '-nostdin', '-hide_banner', '-xerror', '-ss', f'{start_ms / 1000:.3f}', '-t', f'{duration_ms / 1000:.3f}',
            '-i', str(video), '-map', '0:v:0', '-vf',
            f"scale=-2:360,select=gt(scene\\,{threshold}),metadata=print:key=lavfi.scene_score", '-an', '-f', 'null', '-']


def parse_scored_cuts(log, offset_ms):
    """(ms, score) pairs from `metadata=print` output; times are relative to the seek offset.

    Floors to the millisecond: a 30 fps cut frame at 108.3667 s must become 108366, not 108367,
    because a [start, end) trim would otherwise end the previous segment with that frame
    (2026-10-01 frame-exact check: 3 of 6 remaining flash frames were this rounding).
    """
    cuts, current = [], None
    for line in log.splitlines():
        found = _METADATA_TIME.search(line)
        if found:
            current = math.floor(float(found.group(1)) * 1000) + offset_ms
            continue
        score = _SCENE_SCORE.search(line)
        if score and current is not None:
            cuts.append((current, float(score.group(1))))
            current = None
    return cuts


def refine_cuts(video, boundary_ms, env, tick, log_path, timeout=SNAP_TIMEOUT_SECONDS):
    """Scored scene changes within [boundary - SNAP_BEFORE_MS, boundary + SNAP_AFTER_MS] of the original."""
    start = max(boundary_ms - SNAP_BEFORE_MS, 0)
    try:
        with open(log_path, 'wb') as log:
            code = run_media(refine_command(video, start, boundary_ms + SNAP_AFTER_MS - start), env, tick, timeout,
                             stderr=log, poll_seconds=0.1)
        if code:
            raise ValueError('boundary refine exited with an error')
        if os.path.getsize(log_path) > MAX_LOG_BYTES:
            raise ValueError('unexpected detector output size')
        with open(log_path, encoding='utf-8', errors='replace') as log:
            return parse_scored_cuts(log.read(), start)
    finally:
        try:
            os.unlink(log_path)
        except FileNotFoundError:
            pass


def detection_command(video, threshold, ffmpeg='ffmpeg'):
    # Default log level: showinfo frame lines are written at info level to stderr.
    return [ffmpeg, '-nostdin', '-hide_banner', '-xerror', '-i', str(video), '-map', '0:v:0',
            '-vf', scene_filter(threshold), '-an', '-f', 'null', '-']


def normalize_cuts(cuts_ms, duration_ms):
    kept = []
    for cut in sorted(set(cuts_ms)):
        previous = kept[-1] if kept else 0
        if cut - previous >= MIN_CUT_GAP_MS and duration_ms - cut >= MIN_CUT_GAP_MS:
            kept.append(cut)
    return kept


def window_counts(cuts_ms, duration_ms, window_ms):
    """Cuts per half-open window; merges windows so that at most MAX_WINDOWS remain."""
    windows = max(1, math.ceil(duration_ms / window_ms))
    effective = window_ms * math.ceil(windows / MAX_WINDOWS)
    counts = [0] * max(1, math.ceil(duration_ms / effective))
    for cut in cuts_ms:
        counts[min(cut // effective, len(counts) - 1)] += 1
    return effective, counts


def quiet_spans(cuts_ms, duration_ms):
    """Longest spans without a detected cut (>= MIN_QUIET_SPAN_MS), returned in time order."""
    bounds = [0, *cuts_ms, duration_ms]
    spans = [(start, end) for start, end in zip(bounds, bounds[1:]) if end - start >= MIN_QUIET_SPAN_MS]
    longest = sorted(spans, key=lambda span: (span[0] - span[1], span[0]))[:MAX_QUIET_SPANS]
    return sorted(longest)


def summarize(cuts_ms, duration_ms, window_ms):
    if not isinstance(duration_ms, int) or duration_ms <= 0 or window_ms <= 0:
        raise ValueError('Duration and window must be positive')
    cuts = normalize_cuts(cuts_ms, duration_ms)
    effective, counts = window_counts(cuts, duration_ms, window_ms)
    return {'durationMs': duration_ms, 'cuts': cuts, 'windowMs': window_ms, 'effectiveWindowMs': effective,
            'counts': counts, 'quietSpans': quiet_spans(cuts, duration_ms)}


def _sec(ms):
    return str(ms // 1000) if ms % 1000 == 0 else f'{ms / 1000:.1f}'


def format_hint(stats, threshold):
    duration, effective = stats['durationMs'], stats['effectiveWindowMs']
    cuts = stats['cuts']
    per_minute = len(cuts) / (duration / 60000)
    header = (f'镜头切换统计（本地画面检测，场景阈值 {threshold:g}）：全片 {_sec(duration)}s，'
              f'共 {len(cuts)} 个切点，平均每分钟 {per_minute:.1f} 个。')
    if not cuts:
        return header + '全片未检测到镜头切换。'
    entries = [f'{_sec(i * effective)}-{_sec(min((i + 1) * effective, duration))}s:{count}'
               for i, count in enumerate(stats['counts'])]
    spans = stats['quietSpans']
    quiet = ('最长的连续无切换区间（按时间顺序）：' + '、'.join(
        f'{_sec(start)}–{_sec(end)}s({(end - start) / 1000:.1f}s)' for start, end in spans)
        if spans else f'没有超过 {MIN_QUIET_SPAN_MS // 1000} 秒的连续无切换区间。')
    label = f'每 {_sec(effective)} 秒切点数'
    if effective != stats['windowMs']:
        label += f'（片长较长，已按每 {_sec(stats["windowMs"])} 秒窗口合并）'
    shown = len(entries)
    while True:
        omitted = '' if shown == len(entries) else f', …（其余 {len(entries) - shown} 个窗口省略）'
        text = f'{header}\n{label}：{", ".join(entries[:shown])}{omitted}\n{quiet}'
        if len(text) <= MAX_HINT_CHARS or shown <= 1:
            return text[:MAX_HINT_CHARS]
        shown -= 1


def detect(video, duration_ms, settings, env, tick, log_path, timeout=DETECT_TIMEOUT_SECONDS):
    """Returns (hint or None, result-summary dict). Cancellation raised by `tick` propagates."""
    base = {'enabled': settings['enabled'], 'input': 'proxy', 'method': 'ffmpeg-scene',
            'threshold': settings['threshold'], 'windowMs': settings['windowSeconds'] * 1000}
    if not settings['enabled']:
        return None, {**base, 'status': 'disabled'}
    started = time.monotonic()
    try:
        with open(log_path, 'wb') as log:
            code = run_media(detection_command(video, settings['threshold']), env, tick, timeout, stderr=log,
                             poll_seconds=0.2)
        if code:
            raise ValueError('scene detector exited with an error')
        if os.path.getsize(log_path) > MAX_LOG_BYTES:
            raise ValueError('unexpected detector output size')
        with open(log_path, encoding='utf-8', errors='replace') as log:
            boundaries = parse_boundaries(log.read())
        stats = summarize(boundaries, duration_ms, base['windowMs'])
        hint = format_hint(stats, settings['threshold'])
    except (ValueError, OSError) as error:
        # TimeoutError is an OSError. Diagnostics stay generic (FFmpeg logs can hold paths).
        warning = 'shot_detection_timeout' if isinstance(error, TimeoutError) else 'shot_detection_failed'
        return None, {**base, 'status': 'failed', 'warning': warning, 'errorType': type(error).__name__,
                      'elapsedMs': round((time.monotonic() - started) * 1000)}
    finally:
        try:
            os.unlink(log_path)
        except FileNotFoundError:
            pass
    return hint, {**base, 'status': 'ok', 'cutCount': len(stats['cuts']), 'effectiveWindowMs': stats['effectiveWindowMs'],
                  'windowCount': len(stats['counts']), 'quietSpans': [list(span) for span in stats['quietSpans']],
                  'hintChars': len(hint), 'elapsedMs': round((time.monotonic() - started) * 1000)}
