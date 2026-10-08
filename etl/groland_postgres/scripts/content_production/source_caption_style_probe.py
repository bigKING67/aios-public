"""Local white-text/dark-edge diagnostics, not OCR or automatic font matching."""
import math
import subprocess

from .edit_document import resolve_caption_display
from .execution import file_hash, renderer_env
from .source_treatment_media import _probe, _video


def equal_text_samples(request, document, coverage):
    """Only compare matching visible line groups; regrouping must not bias style."""
    if (coverage.get('frameCoverageComplete') is not True or coverage.get('allGroupsResolved') is not True
            or coverage.get('frames') != request['frames']):
        raise ValueError('style probe needs validated complete scope observations')
    start = request['timeline']['startFrame']
    candidates = []
    for source in coverage['scopeIntervals']:
        if not source['lines']:
            continue
        for cue in resolve_caption_display(document):
            if cue['text'].split('\n') != source['lines']:
                continue
            for interval in cue['renderRanges']:
                lo = max(source['startFrame'], interval['startFrame'] - start)
                hi = min(source['endFrame'], interval['endFrame'] - start)
                if hi - lo >= 8:
                    candidates.append((lo, hi, source['lines']))
    if not candidates:
        raise ValueError('no sufficiently long equal-text interval for style comparison')
    lo, hi, lines = max(candidates, key=lambda c: (c[1] - c[0], -c[0]))
    margin = min(2, (hi - lo) // 8)
    first, last = lo + margin, hi - margin - 1
    frames = sorted({first + (last - first) * i // 4 for i in range(5)})
    return {'lines': lines, 'startFrame': lo, 'endFrame': hi, 'frames': frames}


def mask_metrics(mask, width, height, y_offset=0):
    if len(mask) != width * height:
        raise ValueError('caption mask dimensions mismatch')
    points = [i for i, value in enumerate(mask) if value >= 128]
    if len(points) < 16:
        raise ValueError('white caption core not found; profile may not apply')
    xs, ys = [p % width for p in points], [p // width for p in points]
    left, top, right, bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    if left == 0 or top == 0 or right == width or bottom == height:
        raise ValueError('caption mask touches the band edge; inspect clipping or background contamination')
    return {'bbox': {'left': left, 'top': top + y_offset, 'right': right, 'bottom': bottom + y_offset},
            'width': right - left, 'height': bottom - top, 'whiteCorePixels': len(points),
            'fillRatio': len(points) / ((right - left) * (bottom - top))}


def crop_mask(mask, width, metrics, y_offset):
    box = metrics['bbox']
    x, y = box['left'], box['top'] - y_offset
    return bytes(mask[(y + row) * width + x + col] for row in range(metrics['height']) for col in range(metrics['width']))


def normalize_mask(mask, width, height, target_width, target_height):
    return bytes(mask[min(height - 1, int((y + .5) * height / target_height)) * width
                      + min(width - 1, int((x + .5) * width / target_width))]
                 for y in range(target_height) for x in range(target_width))


def _pgm(path, width, height, data):
    path.write_bytes(f'P5\n{width} {height}\n255\n'.encode() + data)


def _white_core(path, frames, width, y, height, work, name, check):
    selection = '+'.join(f'eq(n\\,{frame})' for frame in frames)
    check()
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path), '-vf',
        f'select={selection},crop={width}:{height}:0:{y},format=gray', '-fps_mode', 'vfr', '-frames:v', str(len(frames)),
        '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], check=True, capture_output=True, timeout=60, env=renderer_env(work)).stdout
    check()
    size = width * height
    if len(raw) != len(frames) * size:
        raise ValueError('style probe sampled frame count mismatch')
    samples = [raw[i * size:(i + 1) * size] for i in range(len(frames))]
    # Require brightness/darkness to persist across all sampled frames.
    bright = bytes(255 if min(values) >= 200 else 0 for values in zip(*samples))
    dark = bytes(255 if max(values) <= 100 else 0 for values in zip(*samples))
    bright_path, dark_path = work / f'{name}-bright.pgm', work / f'{name}-dark.pgm'
    _pgm(bright_path, width, height, bright)
    _pgm(dark_path, width, height, dark)
    mask = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(bright_path), '-i', str(dark_path),
        '-filter_complex', '[1:v]' + ','.join(['dilation'] * 8) + '[d];[0:v][d]blend=all_mode=multiply[out]',
        '-map', '[out]', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
        check=True, capture_output=True, timeout=60, env=renderer_env(work)).stdout
    check()
    mask_path = work / f'{name}-mask.pgm'
    _pgm(mask_path, width, height, mask)
    return mask, mask_metrics(mask, width, height, y)


def probe_white_caption_style(source, candidate, work, *, frames, region, source_sha256, candidate_sha256, check):
    """The host must bind equal text/frame/source evidence before calling.

    Only stable white glyph fill near persistent dark edges is measured. Colored,
    animated or moving text and stable background markings may invalidate it.
    Measurements never certify exact fonts, outer strokes, or an automatic fix.
    """
    if (not isinstance(frames, list) or not 3 <= len(frames) <= 8
            or any(type(f) is not int or not 0 <= f < 150 for f in frames) or frames != sorted(set(frames))):
        raise ValueError('style probe requires 3-8 unique ordered frames within five seconds')
    if (not isinstance(region, dict) or set(region) != {'top', 'bottom'}
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in region.values())
            or not 0 <= region['top'] < region['bottom'] <= 1):
        raise ValueError('invalid style probe band')
    check()
    if work.is_symlink():
        raise ValueError('style probe workspace cannot be a symlink')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(p.is_symlink() for p in work.iterdir()):
        raise ValueError('style probe workspace contains a symlink')
    sources = ((source, source_sha256), (candidate, candidate_sha256))
    for path, digest in sources:
        if path.is_symlink() or file_hash(path) != digest:
            raise ValueError('style probe media changed')
    videos = [_video(_probe(p, work)) for p, _ in sources]
    width, full_height = videos[0]['width'], videos[0]['height']
    if any((v['width'], v['height'], v['avg_frame_rate']) != (width, full_height, '30/1') for v in videos):
        raise ValueError('style probe needs matching geometry and normalized 30fps inputs')
    top, bottom = 2 * math.floor(region['top'] * full_height / 2), 2 * math.ceil(region['bottom'] * full_height / 2)
    height = bottom - top
    if not 0 < width * height <= 1024 * 1024:
        raise ValueError('style probe band exceeds the local pixel budget')
    sm, source_metrics = _white_core(source, frames, width, top, height, work, 'source', check)
    cm, candidate_metrics = _white_core(candidate, frames, width, top, height, work, 'candidate', check)
    sg = crop_mask(sm, width, source_metrics, top)
    cg = crop_mask(cm, width, candidate_metrics, top)
    sw, sh = source_metrics['width'], source_metrics['height']
    fitted = normalize_mask(cg, candidate_metrics['width'], candidate_metrics['height'], sw, sh)
    intersection = sum(a >= 128 and b >= 128 for a, b in zip(sg, fitted))
    union = sum(a >= 128 or b >= 128 for a, b in zip(sg, fitted))
    _pgm(work / 'normalized.pgm', sw, sh * 2 + 12, sg + bytes(sw * 12) + fitted)
    for name in ('source-mask', 'candidate-mask', 'normalized'):
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(work / f'{name}.pgm'),
            '-frames:v', '1', str(work / f'{name}.png')], check=True, capture_output=True, timeout=60, env=renderer_env(work))
    check()
    if any(file_hash(path) != digest for path, digest in sources):
        raise ValueError('style probe media changed during measurement')
    return {'schema': 'aios.caption-white-core-probe.v1', 'sourceSha256': source_sha256,
        'candidateSha256': candidate_sha256, 'frames': frames, 'region': region,
        'method': {'stableBrightMinimum': 200, 'stableDarkMaximum': 100, 'darkDilationPixels': 8},
        'source': source_metrics, 'candidate': candidate_metrics, 'normalizedWhiteCoreIoU': intersection / union,
        'maskSha256': {n: file_hash(work / f'{n}.png') for n in ('source-mask', 'candidate-mask', 'normalized')},
        'fontIdentity': 'unverified', 'outerStrokeMatch': 'unverified',
        'autoCorrectionApplied': False, 'deliveryApproved': False}
