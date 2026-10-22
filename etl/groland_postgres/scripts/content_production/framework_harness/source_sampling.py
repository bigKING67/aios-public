"""Opt-in source-frame sampling. Never changes business labels or production cuts.

Coarse physical cut candidates may be aligned to one unambiguous native-frame
scene observation. Store integer PTS and frame indices; decimal seconds are UI
metadata only. Synthetic observation divisions are not evidence of a cut.
"""
from bisect import bisect_left
from decimal import Decimal, localcontext
from fractions import Fraction
import json
import math
import subprocess

from ..execution import file_hash
from ..selling_point_boundary_media import parse_cuts

RADIUS_MS = 200
SCENE_THRESHOLD = .2


def frame_table(metadata):
    stream = metadata['streams'][0]
    base = Fraction(stream['time_base'])
    pts = [int(frame['best_effort_timestamp']) for frame in metadata['frames']]
    if base <= 0 or not pts or any(b <= a for a, b in zip(pts, pts[1:])):
        raise ValueError('Source PTS must be present and strictly increasing')
    tail = metadata['frames'][-1]
    duration = int(tail.get('duration', tail.get('pkt_duration', 0)))
    if duration <= 0:
        raise ValueError('Missing duration of final source frame')
    return dict(timeBase=str(base), originPts=pts[0], pts=pts, endPts=pts[-1]+duration)


def observe(source, expected_sha, *, ffmpeg='ffmpeg', ffprobe='ffprobe'):
    if file_hash(source) != expected_sha:
        raise ValueError('Source changed before frame observation')
    metadata = json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=time_base,start_pts:frame=best_effort_timestamp,duration,pkt_duration',
        '-of', 'json', str(source)], timeout=120))
    table = frame_table(metadata)
    command = [ffmpeg, '-nostdin', '-hide_banner', '-xerror', '-copyts', '-i', str(source), '-map', '0:v:0',
        '-vf', f'scale=-2:360,select=gt(scene\\,{SCENE_THRESHOLD}),showinfo', '-an', '-f', 'null', '-']
    result = subprocess.run(command, text=True, capture_output=True, timeout=120)
    if result.returncode or len(result.stderr) > 8*1024*1024:
        raise ValueError('Native scene observation failed')
    index = {Fraction(p)*Fraction(table['timeBase'])*1000: i for i, p in enumerate(table['pts'])}
    cuts = parse_cuts(result.stderr)
    if any(t not in index for t in cuts):
        raise ValueError('Scene timestamps do not map to actual source frames')
    if file_hash(source) != expected_sha:
        raise ValueError('Source changed during observation')
    return dict(sourceSha256=expected_sha, table=table, sceneFrames=[index[t] for t in cuts],
                sceneThreshold=SCENE_THRESHOLD, command=command)


def source_time(table, frame):
    pts = table['pts'][frame] if frame < len(table['pts']) else table['endPts']
    return (pts-table['originPts'])*Fraction(table['timeBase'])


def time_anchor(table, frame):
    """Exact frame clock plus a five-decimal display; display is never a cut input."""
    if type(frame) is not int or not 0 <= frame <= len(table['pts']):
        raise ValueError('Frame anchor is outside the source')
    value = source_time(table, frame)
    pts = table['pts'][frame] if frame < len(table['pts']) else table['endPts']
    with localcontext() as context:
        context.prec = 40
        display = format(Decimal(value.numerator)/Decimal(value.denominator), '.5f')
    return dict(frame=frame, pts=pts, timeBase=table['timeBase'],
                secondsExact=str(value), secondsDecimal=display)


def boundary(table, scene_frames, seconds, physical, *, radius_ms=RADIUS_MS):
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError('Invalid observation boundary')
    if type(radius_ms) is not int or not 0 < radius_ms <= RADIUS_MS:
        raise ValueError('Alignment radius exceeds the bounded research policy')
    requested = Fraction(str(seconds))
    if requested > source_time(table, len(table['pts'])):
        raise ValueError('Boundary exceeds source duration')
    nearest_index = bisect_left(table['pts'], table['originPts']+requested/Fraction(table['timeBase']))
    candidates = [i for i in scene_frames if 0 < i < len(table['pts']) and
                  abs(source_time(table, i)-requested)*1000 <= radius_ms]
    if not physical:
        status, chosen = 'observation_division', nearest_index
    elif len(candidates) == 1:
        status, chosen = 'aligned', candidates[0]
    else:
        status, chosen = ('ambiguous' if candidates else 'unresolved'), nearest_index
    pts = table['pts'][chosen] if chosen < len(table['pts']) else table['endPts']
    return dict(requestedSeconds=seconds, status=status, frame=chosen, pts=pts,
        timeBase=table['timeBase'], seconds=float(source_time(table, chosen)),
        shiftSeconds=float(source_time(table, chosen)-requested), candidateFrames=candidates)


def align_case(case, observation):
    intervals = case['intervals']
    if (case['sourceSha256'] != observation['sourceSha256'] or len(intervals) != 3 or
            any(b <= a for a, b in intervals) or
            any(abs(left[1]-right[0]) > .000001 for left, right in zip(intervals, intervals[1:]))):
        raise ValueError('Invalid source-bound observation intervals')
    positions = [intervals[0][0], *[b for _, b in intervals]]
    rows = [boundary(observation['table'], observation['sceneFrames'], p,
                     any(abs(p-cut) <= .001 for cut in case['physicalCuts'])) for p in positions]
    if any(b['frame'] <= a['frame'] for a, b in zip(rows, rows[1:])):
        raise ValueError('Alignment collapses or reorders observation intervals')
    units = []
    for group, a, b in zip(('A', 'B', 'C'), rows, rows[1:]):
        units.append(dict(group=group, startFrame=a['frame'], endFrameExclusive=b['frame'],
            internalSceneFrames=[i for i in observation['sceneFrames'] if a['frame'] < i < b['frame']]))
    return dict(case=case['id'], sourceSha256=case['sourceSha256'], boundaries=rows, units=units,
        ready=all(r['status'] not in ('ambiguous', 'unresolved') for r in rows), automaticAdoption=False)


def export_command(source, target, start, end, ffmpeg='ffmpeg'):
    if type(start) is not int or type(end) is not int or not 0 <= start < end:
        raise ValueError('Invalid half-open source frame interval')
    return [ffmpeg, '-nostdin', '-hide_banner', '-v', 'error', '-i', str(source), '-map', '0:v:0', '-an',
        '-vf', f'trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,scale=320:-2',
        '-fps_mode:v', 'passthrough', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-n', str(target)]


def verify_clip(source_table, clip_table, start, end):
    """Validate all exported PTS, not just duration or selected endpoints."""
    if len(clip_table['pts']) != end-start:
        raise ValueError('Export lost or duplicated source frames')
    base = Fraction(source_table['timeBase'])
    target_base = Fraction(clip_table['timeBase'])
    differences = [(b-a)*base for a, b in zip(source_table['pts'][start:end-1], source_table['pts'][start+1:end])]
    if clip_table['originPts'] != 0 or not differences or target_base >= min(differences)/2:
        raise ValueError('Export time base cannot prove sub-frame alignment')
    # Re-encoding can quantize to the destination track's tick; never accept a frame drift.
    for original, actual in zip(source_table['pts'][start:end], clip_table['pts'], strict=True):
        expected = (original-source_table['pts'][start])*base
        received = (actual-clip_table['originPts'])*target_base
        if abs(expected-received) > target_base:
            raise ValueError('Export timestamps drift from source PTS')
