"""Source-bound refinement of changed sample gaps, not a complete subtitle track."""
import copy
import json
import math
import shutil
import subprocess

from .caption_quality import document_digest
from .execution import file_hash, renderer_env
from .source_caption_reference import (SCHEMA as OBSERVATION_SCHEMA, MAX_BYTES,
    observe_source_captions, _observe_source_captions)
from .source_treatment_media import _probe, _video

VERSION = 'source-caption-boundary-observation-v1'
SCHEMA = copy.deepcopy(OBSERVATION_SCHEMA)
SCHEMA['properties']['samples']['maxItems'] = 32


def boundary_plan(reference, region):
    """Keep all frames in <=2 changed gaps; never silently truncate coverage."""
    if reference.get('status') != 'observed':
        raise ValueError('caption boundary refinement needs completed source observations')
    if (not isinstance(region, dict) or set(region) != {'top', 'bottom'}
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in region.values())
            or not 0 <= region['top'] < region['bottom'] <= 1
            or region['bottom'] - region['top'] > .25):
        raise ValueError('caption boundary band must be explicit and at most one quarter height')
    windows, uncertain = [], []
    observations = reference['observations']
    for before, after in zip(observations, observations[1:]):
        lo, hi = before['frame'], after['frame']
        if not 0 < hi - lo <= 15:
            raise ValueError('caption boundary gap exceeds dense input budget')
        if 'uncertain' in (before['visibility'], after['visibility']):
            uncertain.append({'startFrame': lo, 'endFrameInclusive': hi})
        elif (before['visibility'], before['lines']) != (after['visibility'], after['lines']):
            windows.append({'startFrame': lo, 'endFrameInclusive': hi,
                            'before': before, 'after': after})
    if not 1 <= len(windows) <= 2:
        raise ValueError('caption boundary refinement requires one or two changed gaps')
    frames = sorted({f for w in windows for f in range(w['startFrame'], w['endFrameInclusive'] + 1)})
    return {'schema': 'aios.source-caption-boundary-plan.v1', 'referenceSha256': document_digest(reference),
        'region': region, 'windows': windows, 'frames': frames, 'uncertainGaps': uncertain,
        'fullTemporalCoverage': False}


def summarize_boundaries(plan, observations):
    """Report observed adjacent-frame transitions; preserve gaps and anchor conflicts."""
    if [o['frame'] for o in observations] != plan['frames']:
        raise ValueError('caption boundary observations lack exact planned frame coverage')
    by_frame = {o['frame']: o for o in observations}
    windows = []
    for window in plan['windows']:
        lo, hi = window['startFrame'], window['endFrameInclusive']
        keys = lambda o: (o['visibility'], o['lines'])
        conflict = keys(by_frame[lo]) != keys(window['before']) or keys(by_frame[hi]) != keys(window['after'])
        unclear = [f for f in range(lo, hi + 1) if by_frame[f]['visibility'] == 'uncertain']
        transitions = []
        for f in range(lo + 1, hi + 1):
            before, after = by_frame[f - 1], by_frame[f]
            if 'uncertain' not in (before['visibility'], after['visibility']) and keys(before) != keys(after):
                transitions.append({'beforeFrame': f - 1, 'afterFrame': f,
                                    'fromLines': before['lines'], 'toLines': after['lines']})
        windows.append({'startFrame': lo, 'endFrameInclusive': hi, 'anchorConflict': conflict,
            'uncertainFrames': unclear, 'observedTransitions': transitions,
            'status': 'needs_inspection' if conflict or unclear else 'locally_observed'})
    return {'windows': windows, 'unresolvedSampleGaps': plan['uncertainGaps'],
            'fullTemporalCoverage': False, 'subtitleTrackReady': False, 'deliveryApproved': False}


def load_boundary_context(request, document, media, reference_work, region, check, *, planner=boundary_plan):
    """Revalidate the coarse reference offline before any dense observation."""
    def never_call(_):
        raise ValueError('caption boundary refinement cannot recreate a missing source observation')
    check()
    if reference_work.is_symlink() or (reference_work / 'reference.json').is_symlink():
        raise ValueError('caption boundary parent cannot be a symlink')
    previous = json.loads((reference_work / 'reference.json').read_text())
    reference = observe_source_captions(request, document, media, reference_work,
        model=previous['identity']['model'], call_model=never_call, check=check)
    plan = planner(reference, region)
    original = json.loads((reference_work / 'input.json').read_text())

    return plan, original


def prepare_boundary_images(reference_work, original, plan, directory, tick):
    region = plan['region']
    excerpt = reference_work / 'source.mp4'
    tick()
    if excerpt.is_symlink() or file_hash(excerpt) != original['excerptSha256']:
        raise ValueError('caption boundary source excerpt changed')
    target = directory / 'source.mp4'
    shutil.copyfile(excerpt, target)
    if file_hash(target) != original['excerptSha256']:
        raise ValueError('caption boundary source copy changed')
    video = _video(_probe(target, directory))
    height = video['height']
    top = 2 * math.floor(region['top'] * height / 2)
    bottom = 2 * math.ceil(region['bottom'] * height / 2)
    select = '+'.join(f'eq(n\\,{frame})' for frame in plan['frames'])
    filters = f"select={select},crop=iw:{bottom - top}:0:{top},scale=w='min(iw,1080)':h=-2"
    tick()
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-i', str(target), '-vf', filters,
        '-fps_mode', 'vfr', '-frames:v', str(len(plan['frames'])), '-q:v', '2', '-start_number', '0',
        str(directory / 'source-%d.jpg')], check=True, capture_output=True, timeout=60, env=renderer_env(directory))
    tick()
    images, samples = [], []
    for index, frame in enumerate(plan['frames']):
        image = directory / f'source-{index}.jpg'
        if image.is_symlink() or not image.is_file() or not 0 < image.stat().st_size <= 2 * 1024 * 1024:
            raise ValueError('caption boundary image missing or exceeds budget')
        samples.append({'frame': frame, 'imageSha256': file_hash(image)})
        images.append(image)
    if sum(p.stat().st_size for p in images) > MAX_BYTES:
        raise ValueError('caption boundary images exceed request budget')
    return {**original, 'schema': 'aios.source-caption-boundary-input.v1', 'samples': samples,
            'planSha256': document_digest(plan), 'geometryBasis': 'host_selected_band_not_detected_text',
            'crop': {'y': top, 'height': bottom - top, 'sourceWidth': video['width'], 'sourceHeight': height}}, images


def refine_source_captions(request, document, media, reference_work, work, *, region, model, call_model, check):
    """One bounded call, with the previous source observation revalidated offline."""
    plan, original = load_boundary_context(request, document, media, reference_work, region, check)

    def prepare(_request, _document, _media, directory, tick):
        return prepare_boundary_images(reference_work, original, plan, directory, tick)

    receipt = _observe_source_captions(request, document, media, work, model=model, call_model=call_model,
        check=check, prepare=prepare, version=VERSION, extra_identity={'boundaryPlanSha256': document_digest(plan)})
    return {'reference': receipt, 'plan': plan,
            'boundaries': summarize_boundaries(plan, receipt['observations']) if receipt['status'] == 'observed' else None}
