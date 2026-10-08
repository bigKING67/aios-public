"""Source-aligned high-resolution caption bands, without OCR or font guessing."""
import math
import subprocess

from .caption_quality import document_digest
from .edit_document import resolve_caption_display
from .execution import file_hash, renderer_env

LIMIT = 3
MAX_IMAGE_BYTES = 2 * 1024 * 1024


def sample_plan(request, document):
    """Prefer longest visible caption intervals; retain exact half-open frame time."""
    start, end = (request['timeline'][k] for k in ('startFrame', 'endFrame'))
    original = {c['id']: c for c in document['captions']}
    intervals = []
    for cue in resolve_caption_display(document):
        source = original[cue['id']]
        if source.get('stylePreset') != 'source-style-v1':
            continue
        for visible in cue['renderRanges']:
            lo, hi = max(start, visible['startFrame']), min(end, visible['endFrame'])
            if lo >= hi:
                continue
            # This is a generous band around the requested style position, NOT
            # detected text geometry. Missing text in this band is uncertainty.
            style = source['style']
            radius = max(.14, 3 * style['fontHeight'] + 2 * style['strokeWidth'])
            top, bottom = max(0, style['centerY'] - radius), min(1, style['centerY'] + radius)
            height = document['canvas']['height']
            y, lower = 2 * math.floor(top * height / 2), 2 * math.ceil(bottom * height / 2)
            frame = lo + (hi - lo - 1) // 2
            intervals.append({'captionId': cue['id'], 'frame': frame, 'relativeFrame': frame - start,
                'startFrame': lo - start, 'endFrame': hi - start, 'expectedText': cue['text'],
                'cropY': y, 'cropHeight': lower - y})
    chosen = sorted(intervals, key=lambda c: (-(c['endFrame'] - c['startFrame']), c['frame'], c['captionId']))[:LIMIT]
    return {'schema': 'aios.caption-visual-evidence.v1', 'documentSha256': document_digest(document),
        'requestSha256': document_digest(request), 'sampleLimit': LIMIT, 'eligibleIntervals': len(intervals),
        'geometryBasis': 'requested_style_band_not_detected_text',
        'canvas': {k: document['canvas'][k] for k in ('width', 'height')},
        'panels': ['top: original narration picture', 'bottom: final candidate'],
        'samples': sorted(chosen, key=lambda c: (c['frame'], c['captionId']))}


def prepare_caption_evidence(request, document, work, check):
    """Uses the exact 30-fps excerpts already prepared for the four-panel video.

    Never infers a font or writes captions. Letterboxes source to the frozen
    canvas before cropping, without independently resizing either caption band.
    Static samples cannot establish complete temporal or font identity coverage.
    """
    plan = sample_plan(request, document)
    if not plan['samples']:
        return plan, []
    paths = [work / 'narration.mp4', work / 'final.mp4']
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError('caption evidence requires prepared comparison excerpts')
    plan['sourceExcerptSha256'], plan['renderExcerptSha256'] = (file_hash(p) for p in paths)
    width, height = (document['canvas'][k] for k in ('width', 'height'))
    images = []
    for index, sample in enumerate(plan['samples']):
        frame, y, h = (sample[k] for k in ('relativeFrame', 'cropY', 'cropHeight'))
        filters = []
        for panel in range(2):
            filters.append(f'[{panel}:v]select=eq(n\\,{frame}),'
                f'scale={width}:{height}:force_original_aspect_ratio=decrease,'
                f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,'
                f'crop={width}:{h}:0:{y}[p{panel}]')
        filters.append('[p0][p1]vstack=inputs=2[out]')
        target = work / f'caption-detail-{index}.png'
        check()
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(paths[0]), '-i', str(paths[1]),
            '-filter_complex', ';'.join(filters), '-map', '[out]', '-frames:v', '1', str(target)],
            check=True, capture_output=True, timeout=60, env=renderer_env(work))
        check()
        if not target.is_file() or not 0 < target.stat().st_size <= MAX_IMAGE_BYTES:
            raise ValueError('caption detail image exceeds input budget')
        sample['imageSha256'] = file_hash(target)
        images.append(target)
    return plan, images
