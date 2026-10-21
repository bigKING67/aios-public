"""Evaluation-only evidence for integer annotations beyond the video endpoint."""
import json
import math


def observe(source, source_hash, env):
    from .shot_catalog import probe, run
    from .local_media_budget import media_slot
    metadata = probe(source, 'ffprobe', env=env)
    end_ms = metadata['durationMs']
    command = ['ffprobe', '-v', 'error', '-select_streams', str(metadata['streamIndex']),
        '-read_intervals', f'{max(0, end_ms/1000-1):.3f}%', '-show_frames',
        '-show_entries', 'frame=best_effort_timestamp_time,pkt_duration_time,duration_time',
        '-of', 'json', str(source)]
    with media_slot(command, lambda: None, 60) as bounded:
        payload = json.loads(run(bounded, timeout=60, env=env))
    frames = payload.get('frames', [])
    if not frames:
        return None
    frame = frames[-1]
    try:
        start = float(frame['best_effort_timestamp_time'])*1000
        duration = float(frame.get('duration_time') or frame['pkt_duration_time'])*1000
    except (KeyError, TypeError, ValueError):
        return None
    end = start + duration
    if (not all(math.isfinite(n) for n in (start, duration, end)) or duration <= 0
            or abs(end-end_ms) > 1):
        return None
    return dict(kind='decoded_video_endpoint', sourceSha256=source_hash,
                videoEndMs=end_ms, lastFrameStartMs=start, lastFrameEndMs=end)


def outside_video(error, reference, row, tolerance):
    proof = row.get('sourceVideoExtent') or {}
    prediction = row.get('pred') or []
    if (proof.get('kind') != 'decoded_video_endpoint' or not prediction
            or proof.get('sourceSha256') != row.get('sourceSha256')):
        return False
    start, end, frame_end = (proof.get(k) for k in
                            ('lastFrameStartMs', 'videoEndMs', 'lastFrameEndMs'))
    if (any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in (start, end, frame_end))
            or not 0 <= start < end or not 0 <= frame_end-end <= 1):
        return False
    a, b, label = prediction[-1]
    # Require coverage of the actual last frame with the expected final label.
    # A missing frame, partial-frame tail, audio padding or unknown endpoint
    # must not be excused as integer annotation imprecision.
    return (a*1000 <= start and abs(b*1000-end) < 1e-6
            and label == reference[-1][2] == error['expected']
            and error['actual'] is None and abs(error['start']*1000-end) < 1e-6
            and error['end'] == reference[-1][1]
            and 0 < error['end']-b <= tolerance)
