"""Bounded original-frame shot observations; never uses proxy timestamps."""
from fractions import Fraction
import re
import time

from .segment_suggestion_provider import run_media

RADIUS_MS = 1100
MAX_WINDOWS = 120
TOTAL_SECONDS = 90
_TIME_BASE = re.compile(r'config in time_base: (\d+/\d+)')
_PTS = re.compile(r'\bn:\s*\d+\s+pts:\s*(-?\d+)\s+pts_time:')


def parse_cuts(log):
    """Keep rational PTS: rounded decimal logs can reintroduce a residual frame."""
    time_base, cuts = None, []
    for line in log.splitlines():
        base = _TIME_BASE.search(line)
        if base:
            time_base = Fraction(base[1])
        pts = _PTS.search(line)
        if pts and time_base:
            cuts.append(Fraction(int(pts[1])) * time_base * 1000)
    if time_base is None:
        raise ValueError('missing original time base')
    return sorted(set(cuts))


def observe(source, positions, duration_ms, env, tick, work):
    """Per-position cuts or None (failed/budget exhausted); cancellation propagates."""
    observations, cache, attempts = {}, [], 0
    deadline = time.monotonic() + TOTAL_SECONDS
    for position in sorted(set(positions)):
        tick()
        start, end = max(0, position - RADIUS_MS), min(duration_ms, position + RADIUS_MS)
        reused = next((cuts for left, right, cuts in cache if left <= start and right >= end), None)
        if reused is not None:
            observations[position] = reused
            continue
        remaining = deadline - time.monotonic()
        if attempts >= MAX_WINDOWS or remaining <= 0:
            observations[position] = None
            continue
        log_path = work / 'selling-point-boundary.log'
        attempts += 1
        try:
            command = ['ffmpeg', '-nostdin', '-hide_banner', '-xerror', '-copyts', '-start_at_zero',
                       '-ss', f'{start / 1000:.3f}', '-i', str(source), '-t', f'{(end - start) / 1000:.3f}',
                       '-map', '0:v:0', '-vf', 'scale=-2:360,select=gt(scene\\,0.2),showinfo',
                       '-an', '-f', 'null', '-']
            with log_path.open('wb') as log:
                code = run_media(command, env, tick, min(10, remaining), stderr=log, poll_seconds=0.1)
            if code or log_path.stat().st_size > 1024 * 1024:
                raise ValueError('local shot detector failed')
            cuts = [cut for cut in parse_cuts(log_path.read_text(errors='replace')) if start < cut < end]
            observations[position] = cuts
            cache.append((start, end, cuts))
        except (ValueError, OSError):
            observations[position] = None
        finally:
            log_path.unlink(missing_ok=True)
    return observations
