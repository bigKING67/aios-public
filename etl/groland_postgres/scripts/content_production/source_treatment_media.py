"""Exact, silent erasure excerpts and technical acceptance, never quality approval."""
import json
import math
import subprocess
import time
from fractions import Fraction
from pathlib import Path

from .execution import file_hash, renderer_env
from .inspection import inspect_media
from .mediakit_erasure import MAX_BYTES


def _probe(path, work, *, count=False):
    command = ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json']
    if count:
        command.append('-count_frames')
    result = subprocess.run([*command, str(path)], capture_output=True, timeout=60,
                            env=renderer_env(work), check=True)
    return json.loads(result.stdout)


def _video(metadata):
    streams = [s for s in metadata['streams'] if s['codec_type'] == 'video']
    if len(streams) != 1:
        raise ValueError('treatment requires one source video stream')
    stream = streams[0]
    pts = float(stream.get('start_time', 'nan'))
    if not math.isfinite(pts) or abs(pts) > .001 or stream.get('color_transfer') in ('smpte2084', 'arib-std-b67'):
        raise ValueError('treatment does not support nonzero PTS or HDR sources')
    if any(int(side.get('rotation', 0)) % 360 for side in stream.get('side_data_list', [])):
        raise ValueError('treatment requires an unrotated source')
    if stream.get('sample_aspect_ratio') not in (None, 'N/A', '1:1'):
        raise ValueError('treatment requires square source pixels')
    for key in ('width', 'height'):
        if not 64 <= stream[key] <= 1920 or stream[key] % 2:
            raise ValueError('treatment source dimensions are unsupported')
    return stream


def inspect_excerpt(path: Path, expected: dict, frames: int, tick, lock_fd=None):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('treatment output is missing or exceeds the byte budget')
    tick()
    stream = _video(_probe(path, path.parent, count=True))
    if int(stream.get('nb_read_frames', -1)) != frames:
        raise ValueError('treatment output frame count differs from the fixed slot')
    digest = file_hash(path)
    report = inspect_media(path, expected, frames, {}, 'source-text-treatment-v1', False,
        {'status': 'completed', 'preview': False, 'assets': [], 'output': {'sha256': digest}}, tick, lock_fd)
    return {**report, 'frames': frames}


def prepare_excerpt(source: Path, request: dict, target: Path, tick, lock_fd=None):
    tick()
    if source.is_symlink() or not source.is_file() or file_hash(source) != request['source']['sha256']:
        raise ValueError('treatment source hash differs from the frozen asset')
    stream = _video(_probe(source, target.parent))
    duration = float(stream.get('duration', 'nan'))
    mapping = request['sourceMap']
    start, end = (Fraction(mapping[key]['num'], mapping[key]['den']) for key in ('sourceStart', 'sourceEnd'))
    if not math.isfinite(duration) or end > Fraction(str(duration)):
        raise ValueError('treatment range exceeds actual source media')
    geometry = {key: stream[key] for key in ('width', 'height')}
    # Crop in decoded source time, reset PTS, and keep the original raster/style.
    filters = f'trim=start={float(start):.9f}:end={float(end):.9f},setpts=PTS-STARTPTS,fps=30,setsar=1'
    command = ['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(source), '-map', '0:v:0',
               '-vf', filters, '-frames:v', str(request['frames']), '-an', '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)]
    with (target.parent / 'excerpt.log').open('wb') as log:
        proc = subprocess.Popen(command, env=renderer_env(target.parent), stdout=subprocess.DEVNULL, stderr=log,
                                pass_fds=() if lock_fd is None else (lock_fd,))
        started = time.monotonic()
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() - started > 180:
                    raise TimeoutError('treatment excerpt preparation timed out')
                time.sleep(.1)
            if proc.returncode:
                raise ValueError('treatment excerpt preparation failed')
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
    return inspect_excerpt(target, geometry, request['frames'], tick, lock_fd)
