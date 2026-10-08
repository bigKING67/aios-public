"""One resumable source-text operation, not a scheduler or a delivery authority.

The owning host supplies authorized immutable bindings, explicit erase regions,
and a check() which revalidates intent/lease/budget before external side effects.
The renderer never calls this module. It only renders subsequently frozen edits.
"""
import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import stat

from .edit_document import compile_document
from .execution import file_hash
from .mediakit_erasure import MediaKitErasure, _task_id
from .source_text_compatibility import assess_source_text
from .source_treatment_media import inspect_excerpt, prepare_excerpt


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def _write(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def treatment_request(document, bindings, media, clip_id, regions, mode='Subtitle'):
    """Host-selected regions are explicit treatment input, not inferred OCR truth."""
    if 'captionRepair' in document:
        raise ValueError('freeze the caption repair before starting source treatment')
    compile_document(document, bindings, media, 'source text treatment')
    clip = next((c for c in document['clips'] if c['id'] == clip_id), None)
    routes = [r for r in assess_source_text(document)['routes'] if r['clipId'] == clip_id]
    if not clip or not routes or any(r['action'] != 'inspect_source_text' for r in routes):
        raise ValueError('only an entirely incompatible picture slot can enter source treatment')
    if any(c['anchor'].get('clipId') == clip_id for c in document['captions']):
        raise ValueError('picture-anchored captions require an explicit remapping before treatment')
    frames = clip['timeline']['endFrame'] - clip['timeline']['startFrame']
    if not 1 <= frames <= 300:
        raise ValueError('source treatment is limited to a ten-second slot per operation')
    if mode not in ('Subtitle', 'Text') or not isinstance(regions, list) or not 1 <= len(regions) <= 20:
        raise ValueError('source treatment requires an explicit mode and 1–20 regions')
    keys = {'top_left_x', 'top_left_y', 'bottom_right_x', 'bottom_right_y'}
    for region in regions:
        if not isinstance(region, dict) or region.keys() != keys:
            raise ValueError('source treatment requires named normalized region corners')
        if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in region.values()):
            raise ValueError('source treatment region is outside the source raster')
        if region['top_left_x'] >= region['bottom_right_x'] or region['top_left_y'] >= region['bottom_right_y']:
            raise ValueError('source treatment region is empty')
        # MediaKit Subtitle mode intersects explicit boxes with the lower half.
        if mode == 'Subtitle' and region['top_left_y'] < .5:
            raise ValueError('Subtitle mode cannot erase a region above the lower half')
    source = next(a for a in document['assets'] if a['ref'] == clip['assetRef'])
    return {'schema': 'aios.source-text-treatment.v1', 'documentSha256': _digest(document),
            'projectId': document['projectId'], 'revision': document['revision'], 'clipId': clip_id,
            'source': copy.deepcopy(source), 'sourceMap': copy.deepcopy(clip['sourceMap'][0]),
            'timeline': copy.deepcopy(clip['timeline']), 'frames': frames,
            'parameters': {'mode': mode, 'model_version': 'v5', 'output_encode_mode': 'Quality',
                           'erase_ratio_location': copy.deepcopy(regions)}}


def _candidate(document, bindings, media, request, output, inspection):
    """Refill a technically checked candidate without modifying its parent edit."""
    candidate = copy.deepcopy(document)
    digest = inspection['sha256']
    ref = 'treated_' + _digest(request)[:24]
    version = 'treated-' + digest[:48]
    if any(a['ref'] == ref or a['assetVersionId'] == version for a in candidate['assets']):
        raise ValueError('treatment output conflicts with an existing frozen asset')
    candidate['revision'] += 1
    candidate['assets'].append({'ref': ref, 'assetVersionId': version, 'sha256': digest})
    clip = next(c for c in candidate['clips'] if c['id'] == request['clipId'])
    clip['assetRef'] = ref
    clip['sourceMap'] = [{'startFrame': 0, 'endFrame': request['frames'],
                          'sourceStart': {'num': 0, 'den': 30},
                          'sourceEnd': {'num': request['frames'], 'den': 30}}]
    used = {c['assetRef'] for c in candidate['clips']}
    candidate['assets'] = [a for a in candidate['assets'] if a['ref'] in used]
    # Absence of new captions must never bypass cross-source text/quality review.
    candidate['captionOverlayPolicy'] = 'preserve-source-picture-v1'
    new_bindings = {**bindings, version: {'sha256': digest, 'durationMs': math.ceil(request['frames'] * 1000 / 30)}}
    new_media = {**media, version: str(output.resolve())}
    compile_document(candidate, new_bindings, new_media, 'source text candidate')
    return candidate, new_bindings, new_media


def advance_treatment(root: Path, document: dict, bindings: dict, media: dict, clip_id: str,
                      regions: list, *, provider=None, check, mode='Subtitle') -> dict:
    """Prepare with provider=None; otherwise submit once OR query once per call.

    root belongs to the owning run, not a global render scratch directory. Keep
    it until the remote task/output is reconciled. No automatic paid resubmit,
    automatic quality approval, catalog registration, or frozen-run mutation.
    """
    check()
    request = treatment_request(document, bindings, media, clip_id, regions, mode)
    request_hash = _digest(request)
    work = root / ('source-text-' + request_hash)
    if root.is_symlink() or work.is_symlink():
        raise ValueError('treatment workspace cannot be a symlink')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = work.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('treatment workspace must be private and owned by the worker')
    lock = os.open(work / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(p.is_symlink() for p in work.iterdir()):
            raise ValueError('treatment workspace contains a symlink')
        request_path, state_path = work / 'request.json', work / 'state.json'
        if request_path.exists() and json.loads(request_path.read_text()) != request:
            raise ValueError('treatment request changed')
        if not request_path.exists():
            _write(request_path, request)
        state = json.loads(state_path.read_text()) if state_path.exists() else None
        if state and state.get('requestSha256') != request_hash:
            raise ValueError('treatment state belongs to a different request')
        source = Path(media[request['source']['assetVersionId']])
        if source.is_symlink() or not source.is_file() or file_hash(source) != request['source']['sha256']:
            raise ValueError('treatment source changed since the frozen edit')

        def save(stage, **values):
            nonlocal state
            state = {**(state or {}), 'schema': 'aios.source-text-operation.v1',
                     'requestSha256': request_hash, 'stage': stage, 'deliveryApproved': False, **values}
            _write(state_path, state)
            return {**state, 'workDir': str(work.resolve())}

        excerpt, output = work / 'input.mp4', work / 'output.mp4'
        if state is None:
            report = prepare_excerpt(source, request, excerpt, check, lock)
            save('prepared', input=report)
        if file_hash(excerpt) != state['input']['sha256']:
            raise ValueError('treatment excerpt changed')
        if state['stage'] in ('submitting', 'submission_unknown', 'provider_failed', 'technical_rejected'):
            return {**state, 'workDir': str(work.resolve())}
        if state['stage'] == 'prepared':
            if provider is None:
                return {**state, 'workDir': str(work.resolve())}
            check()
            # Persist before any upload/POST. A crash or lost response cannot spend again.
            save('submitting')
            try:
                task_id = _task_id(provider.submit(excerpt, request['parameters'], check))
            except Exception:
                save('submission_unknown')
                raise
            return save('submitted', taskId=task_id, billing='unverified')
        if state['stage'] not in ('submitted', 'candidate_ready'):
            raise ValueError('unknown treatment operation stage')
        if state['stage'] == 'submitted':
            if provider is None:
                return {**state, 'workDir': str(work.resolve())}
            check()
            result = provider.query(state['taskId'])
            if result['status'] in ('failed', 'cancelled'):
                return save('provider_failed', providerStatus=result['status'])
            if result['status'] in ('pending', 'queued', 'running'):
                return save('submitted', providerStatus=result['status'])
            if result['status'] != 'completed':
                raise ValueError('unsupported treatment provider status')
            # Only reuse a complete local download, never a interrupted .part file.
            if not output.exists():
                partial = work / 'output.part.mp4'
                partial.unlink(missing_ok=True)
                check()
                provider.download(result, partial, check)
                with partial.open('rb') as stream:
                    os.fsync(stream.fileno())
                partial.replace(output)
            expected = {k: state['input'][k] for k in ('width', 'height')}
            try:
                inspection = inspect_excerpt(output, expected, request['frames'], check, lock)
                if inspection['sha256'] == state['input']['sha256']:
                    raise ValueError('provider returned unchanged input')
            except ValueError:
                save('technical_rejected')
                raise
        else:
            inspection = state['inspection']
            if not output.is_file() or file_hash(output) != inspection['sha256']:
                raise ValueError('treatment output changed after technical inspection')
        check()
        candidate, new_bindings, new_media = _candidate(document, bindings, media, request, output, inspection)
        _write(work / 'candidate.json', candidate)
        _write(work / 'bindings.json', new_bindings)
        _write(work / 'media.json', {k: str(v) for k, v in new_media.items()})
        return save('candidate_ready', inspection=inspection, candidateSha256=_digest(candidate),
                    quality='inspection_required', sourceTextRouting=assess_source_text(candidate))
    finally:
        os.close(lock)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'advance'))
    for name in ('root', 'document', 'bindings', 'media', 'regions'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--clip-id', required=True)
    parser.add_argument('--mode', choices=('Subtitle', 'Text'), default='Subtitle')
    args = parser.parse_args()
    load = lambda path: json.loads(path.read_text())
    provider = MediaKitErasure(os.environ.get('AIOS_MEDIAKIT_API_KEY')) if args.action == 'advance' else None
    result = advance_treatment(args.root, load(args.document), load(args.bindings), load(args.media),
                               args.clip_id, load(args.regions), provider=provider, check=lambda: None, mode=args.mode)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # No URLs, response bodies, user text, subprocess args or secrets in CLI errors.
        print(json.dumps({'error': type(exc).__name__, 'message': 'Treatment failed; inspect the local state receipt.'}))
        raise SystemExit(1) from None
