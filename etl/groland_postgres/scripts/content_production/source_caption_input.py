"""Host-only preplanning source context; never a saved or executable edit."""
from fractions import Fraction
import copy
import re

from .caption_quality import document_digest
from .source_caption_reference import observe_source_captions


def source_context(frozen_sources, asset_version_id, start_frame, frames):
    """Caller supplies permission-checked frozen sources, not client-owned metadata."""
    if (type(start_frame) is not int or start_frame < 0 or type(frames) is not int
            or not 1 <= frames <= 150):
        raise ValueError('source observation requires a bounded 30fps range')
    matches = [a for a in frozen_sources if a.get('assetVersionId') == asset_version_id]
    if len(matches) != 1:
        raise ValueError('source observation requires one frozen asset version')
    asset = matches[0]
    if (not isinstance(asset.get('sha256'), str) or not re.fullmatch('[0-9a-f]{64}', asset['sha256'])
            or type(asset.get('durationMs')) is not int or asset['durationMs'] <= 0
            or (start_frame + frames) * 1000 > asset['durationMs'] * 30):
        raise ValueError('source observation exceeds frozen media or has invalid identity')
    mapping = {}
    for key, value in [('sourceStart', Fraction(start_frame, 30)), ('sourceEnd', Fraction(start_frame + frames, 30))]:
        mapping[key] = {'num': value.numerator, 'den': value.denominator}
    # A dedicated observation context, not an audio clip or fictitious edit project.
    context = {'schema': 'aios.source-caption-context.v1', 'canvas': {'fps': {'num': 30, 'den': 1}},
        'asset': {k: copy.deepcopy(asset[k]) for k in ('assetVersionId', 'sha256', 'durationMs')},
        'sourceMap': mapping, 'frozenSourcesSha256': document_digest(frozen_sources)}
    request = {'frames': frames, 'timeline': {'startFrame': 0, 'endFrame': frames}}
    return request, context


def observe_asset_caption_range(frozen_sources, asset_version_id, start_frame, frames, media, work, *,
                                model, call_model, check):
    check()
    request, context = source_context(frozen_sources, asset_version_id, start_frame, frames)
    return observe_source_captions(request, context, media, work, model=model, call_model=call_model, check=check)


def preflight_source_captions(frozen_sources, asset_version_id, start_frame, frames, media, work, *,
                             required_frames, region, model, max_calls, call_model, check):
    """Bounded host operation; queues/adoption remain the caller's responsibility."""
    import fcntl
    import json
    import os
    from .source_caption_groups import match_source_caption_groups
    from .source_caption_coverage import complete_source_caption_coverage
    from .source_treatment import _write
    if (type(max_calls) is not int or not 3 <= max_calls <= 7
            or type(required_frames) is not int or not 1 <= required_frames <= frames or frames < 2):
        raise ValueError('preflight requires explicit 3-7 call budget and fitting duration')
    if (not isinstance(region, dict) or set(region) != {'top', 'bottom'}
            or any(type(v) not in (int, float) or not 0 <= v <= 1 for v in region.values())
            or not 0 < region['bottom'] - region['top'] <= .25):
        raise ValueError('preflight requires a valid caption band')
    check()
    request, context = source_context(frozen_sources, asset_version_id, start_frame, frames)
    identity = {'context': context, 'request': request, 'requiredFrames': required_frames,
                'region': region, 'model': model, 'maxCalls': max_calls}
    if work.is_symlink():
        raise ValueError('preflight workspace cannot be a symlink')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    if work.stat().st_uid != os.geteuid() or work.stat().st_mode & 0o777 != 0o700:
        raise ValueError('preflight workspace must be private')
    lock = os.open(work / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(p.is_symlink() for p in work.iterdir()):
            raise ValueError('preflight workspace contains a symlink')
        frozen = work / 'request.json'
        if frozen.exists() and json.loads(frozen.read_text()) != identity:
            raise ValueError('preflight source, range, model or budget changed')
        _write(frozen, identity)
        coarse = observe_source_captions(request, context, media, work / 'coarse',
            model=model, call_model=call_model, check=check)
        if coarse['status'] != 'observed':
            return {'status': 'needs_inspection', 'candidates': [], 'deliveryApproved': False}
        interval = (0, min(30, frames - 1))
        groups = match_source_caption_groups(request, context, media, work / 'coarse', work / 'groups',
            region=region, model=model, call_model=call_model, check=check, continuous_interval=interval)
        if groups['reference']['status'] != 'observed':
            return {'status': 'needs_inspection', 'candidates': [], 'deliveryApproved': False}
        coverage = complete_source_caption_coverage(request, context, media, work / 'coarse', work / 'groups',
            work / 'coverage', region=region, model=model, call_limit=max_calls - 2,
            call_model=call_model, check=check, continuous_interval=interval)
        check()
        candidates = [copy.deepcopy(w) for w in coverage['selectionIntervals']
                      if w['lines'] and w['frameCount'] >= required_frames]
        result = {'schema': 'aios.source-caption-preflight.v1', 'requestSha256': document_digest(identity),
            'sourceBinding': coverage['sourceBinding'], 'coverageSha256': document_digest(coverage),
            'callsReserved': 2 + coverage['callsReserved'], 'maxCalls': max_calls,
            'requiredFrames': required_frames, 'candidates': candidates,
            'coverageStatus': coverage['status'], 'unresolvedFrames': coverage['unresolvedFrames'],
            'status': 'candidates_observed' if candidates else 'needs_inspection',
            'executableEditAllowed': False, 'deliveryApproved': False}
        _write(work / 'result.json', result)
        return result
    finally:
        os.close(lock)
