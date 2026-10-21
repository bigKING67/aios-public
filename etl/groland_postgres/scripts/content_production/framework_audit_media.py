"""Local cut/keyframe evidence for framework verification. No model calls."""
import os
import shutil
from pathlib import Path

from .segment_shot_hints import parse_scored_cuts, refine_command, MAX_LOG_BYTES
from .segment_suggestion_provider import run_media
from .framework_face_presence import annotate

MAX_FRAMES = 192


def _board_binary(env):
    # macOS keeps the full FFmpeg distribution alongside the small one. Linux
    # deployments normally provide drawtext in their regular FFmpeg package.
    full = shutil.which('ffmpeg-full', path=env.get('PATH'))
    if not full:
        local = Path.home() / '.local/bin/ffmpeg-full'
        full = str(local) if local.is_file() and os.access(local, os.X_OK) else None
    return full or 'ffmpeg'


def prepare(source, ranges, work, env, tick):
    """Exact local intervals + numbered boards; never substitute detector counts for facts."""
    work.mkdir(parents=True, exist_ok=True)
    merged = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    frames = []
    for part, (start, end) in enumerate(merged):
        log_path = work / f'cuts-{part}.log'
        try:
            with log_path.open('wb') as stream:
                code = run_media(refine_command(source, start, end - start, .12), env, tick, 300,
                                 stderr=stream, poll_seconds=.2)
            if code or log_path.stat().st_size > MAX_LOG_BYTES:
                raise ValueError('Framework cut detection failed')
            cuts = [start, *[t for t, _ in parse_scored_cuts(log_path.read_text(errors='replace'), start)
                            if start + 200 < t < end - 200], end]
        finally:
            log_path.unlink(missing_ok=True)
        cuts = sorted(set(cuts))
        for a, b in zip(cuts, cuts[1:]):
            # Even a short flash can be a real insert. Observe it instead of
            # leaving artificial holes that split otherwise continuous footage.
            times = [(a + b) // 2] if b - a < 6000 else [a + 1000, (a + b) // 2, b - 1000]
            for at in times:
                if len(frames) >= MAX_FRAMES:
                    raise ValueError(f'Framework visual audit exceeds {MAX_FRAMES} frames; no partial audit')
                index = len(frames)
                image = work / f'{index}.jpg'
                code = run_media(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(at / 1000),
                                  '-i', str(source), '-frames:v', '1', '-vf', 'scale=-2:640',
                                  '-q:v', '2', str(image)], env, tick, 60, poll_seconds=.1)
                if code or not image.is_file() or not image.stat().st_size:
                    raise ValueError('Framework frame extraction failed')
                frames.append({'index': index, 'start_ms': a, 'end_ms': b, 'frame_ms': at})
    annotate(frames, work)
    boards = []
    binary = _board_binary(env)
    # Four large tiles preserve eyes/hands/overlays. Dense 16-tile boards made
    # Lite describe plainly visible faces as offscreen hands in real evaluations.
    for batch in range(0, len(frames), 4):
        selected = frames[batch:batch + 4]
        args, filters, layout = [binary, '-nostdin', '-v', 'error', '-y'], [], []
        for j, frame in enumerate(selected):
            args += ['-i', str(work / f"{frame['index']}.jpg")]
            label = f"#{frame['index']} {frame['start_ms'] / 1000:.2f}-{frame['end_ms'] / 1000:.2f}s"
            filters.append(f'[{j}:v]scale=360:640:force_original_aspect_ratio=decrease,'
                           f"pad=360:668:0:28:black,drawtext=text='{label}':x=4:y=4:"
                           f'fontcolor=white:fontsize=16[v{j}]')
            layout.append(f'{j % 2 * 360}_{j // 2 * 668}')
        if len(selected) == 1:
            filters.append('[v0]null[out]')
        else:
            filters.append(''.join(f'[v{j}]' for j in range(len(selected))) +
                           f'xstack=inputs={len(selected)}:layout=' + '|'.join(layout) + ':fill=black[out]')
        board = work / f'board-{batch // 4}.jpg'
        args += ['-filter_complex', ';'.join(filters), '-map', '[out]', '-frames:v', '1', str(board)]
        if run_media(args, env, tick, 60, poll_seconds=.1) or not board.is_file():
            raise ValueError('Framework board rendering failed; FFmpeg drawtext is required')
        boards.append(board)
    return frames, boards
