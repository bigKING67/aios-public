"""Source-bound, one-call visual review of a restored treatment candidate.

This produces observations and follow-up actions, never delivery permission.
The host owns reference provenance, authorization, model budget and Run adoption.
"""
import copy
import fcntl
import json
import os
from pathlib import Path
import stat

from .caption_quality import document_digest
from .caption_visual_evidence import prepare_caption_evidence
from .edit_document import compile_document
from .execution import file_hash
from .source_treatment import _write
from .source_treatment_captions import restore_narration_captions, _audio

from .treatment_visual_input import VERSION, KINDS, VERDICTS, comparison_video, review_messages


def load_treatment_candidate(operation: Path):
    """Read the host-private operation; distrust stale or changed media/receipts."""
    if operation.is_symlink() or any(p.is_symlink() for p in operation.iterdir()):
        raise ValueError('treatment inspection cannot follow operation symlinks')
    load = lambda name: json.loads((operation / name).read_text())
    state, request, document = load('state.json'), load('request.json'), load('candidate.json')
    bindings, media = load('bindings.json'), load('media.json')
    if (state.get('stage') != 'candidate_ready' or state.get('requestSha256') != document_digest(request)
            or state.get('candidateSha256') != document_digest(document)
            or state.get('inspection', {}).get('status') != 'passed'
            or state.get('inspection', {}).get('frames') != request['frames']):
        raise ValueError('treatment inspection requires the exact technically checked candidate')
    for name, digest in (('input.mp4', state['input']['sha256']), ('output.mp4', state['inspection']['sha256'])):
        if file_hash(operation / name) != digest:
            raise ValueError('treatment media changed after technical inspection')
    compile_document(document, bindings, media, 'Treatment inspection preflight')
    clip = next(c for c in document['clips'] if c['id'] == request['clipId'])
    asset = next(a for a in document['assets'] if a['ref'] == clip['assetRef'])
    if (clip['timeline'] != request['timeline'] or asset['sha256'] != state['inspection']['sha256']
            or Path(media[asset['assetVersionId']]).resolve() != (operation / 'output.mp4').resolve()):
        raise ValueError('treated picture does not match the checked operation')
    for asset in document['assets']:
        path = Path(media[asset['assetVersionId']])
        if path.is_symlink() or file_hash(path) != asset['sha256']:
            raise ValueError('frozen inspection source changed')
    return state, request, document, bindings, media


def prepare_review_candidate(operation, reference, reference_bindings, reference_media, *, check):
    """Reuse verified erasure bytes; changing captions never submits erasure again."""
    check()
    _, _, base, bindings, media = load_treatment_candidate(operation)
    document, receipt = restore_narration_captions(base, bindings, media, reference,
                                                   reference_bindings, reference_media)
    # Reference files are host-owned. Check the narration bytes, not just its label.
    _, source = _audio(reference)
    path = Path(reference_media[source['assetVersionId']])
    if path.is_symlink() or file_hash(path) != source['sha256']:
        raise ValueError('caption reference narration media changed')
    check()
    work = operation / ('caption-restoration-' + document_digest(receipt))
    if work.is_symlink():
        raise ValueError('caption restoration directory cannot be a symlink')
    work.mkdir(mode=0o700, exist_ok=True)
    lock = os.open(work / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(p.is_symlink() for p in work.iterdir()):
            raise ValueError('caption restoration workspace contains a symlink')
        for name, value in (('candidate.json', document), ('restoration.json', receipt),
                            ('bindings.json', bindings), ('media.json', media)):
            path = work / name
            if path.exists() and json.loads(path.read_text()) != value:
                raise ValueError('caption restoration artifact changed')
            _write(path, value)
    finally:
        os.close(lock)
    return {'document': document, 'restoration': receipt, 'bindings': bindings,
            'media': media, 'workDir': str(work.resolve()), 'deliveryApproved': False}


def validate_review(response, frames):
    if not isinstance(response, dict) or set(response) != {'checks'} or not isinstance(response['checks'], list):
        raise ValueError('invalid treatment review response')
    if len(response['checks']) != len(KINDS):
        raise ValueError('incomplete treatment review coverage')
    seen = set()
    for item in response['checks']:
        if not isinstance(item, dict) or set(item) != {'kind', 'verdict', 'startFrame', 'endFrame', 'observation'}:
            raise ValueError('invalid treatment review finding')
        kind = item['kind']
        if not isinstance(kind, str) or kind not in KINDS or kind in seen or item['verdict'] not in VERDICTS:
            raise ValueError('unknown or repeated treatment review dimension')
        seen.add(kind)
        start, end = item['startFrame'], item['endFrame']
        if type(start) is not int or type(end) is not int or not 0 <= start < end <= frames:
            raise ValueError('treatment review evidence outside the supplied clip')
        text = item['observation']
        if not isinstance(text, str) or not text.strip() or len(text) > 500 or any(ord(c) < 32 for c in text):
            raise ValueError('invalid treatment review observation')
    return copy.deepcopy(response['checks'])


def _outcome(checks):
    issues = [c['kind'] for c in checks if c['verdict'] == 'issue_observed']
    uncertain = [c['kind'] for c in checks if c['verdict'] == 'uncertain']
    actions = []
    if any(k in issues for k in KINDS[:3]): actions.append('repair_or_replace_picture')
    if any(k in issues for k in ('caption_readability', 'caption_style')): actions.append('revise_subtitles')
    if 'visual_alignment' in issues: actions.append('inspect_alignment')  # May be subtitle grouping, not wrong footage.
    if uncertain: actions.append('inspect_uncertainty')
    return {'status': 'issues_found' if issues else 'inconclusive' if uncertain else 'no_issues_reported',
            'nextActions': actions or ['await_product_quality_evidence']}


def _comparison(operation, request, document, media, video, work, check):
    return comparison_video(operation / 'input.mp4', operation / 'output.mp4',
                            request, document, media, video, work, check)


def review_treatment_render(operation, prepared, video, render_receipt, work, *, model, call_model, check):
    """One model call per work directory, reserved durably before dispatch.

    A single 2x2 comparison video contains before/after erasure (top) and original
    narration/final render (bottom). Sampled video cannot prove every-frame
    temporal quality, exact font identity, product facts or ownership rights.
    """
    check()
    state, request, base, bindings, media = load_treatment_candidate(operation)
    document, restoration = prepared['document'], prepared['restoration']
    compile_document(document, bindings, media, 'Restored treatment review')
    unchanged = copy.deepcopy(document)
    for key in ('captions', 'captionDisplayPolicy', 'revision'):
        if key in base: unchanged[key] = copy.deepcopy(base[key])
        else: unchanged.pop(key, None)
    if (unchanged != base or document['revision'] != base['revision'] + 1
            or restoration.get('baseDocumentSha256') != document_digest(base)
            or restoration.get('documentSha256') != document_digest(document)):
        raise ValueError('restored candidate differs from the checked treatment')
    digest = file_hash(video)
    if (video.is_symlink() or render_receipt.get('edit_document', {}).get('sha256') != document_digest(document)
            or render_receipt.get('host_inspection', {}).get('status') != 'passed'
            or render_receipt.get('host_inspection', {}).get('sha256') != digest
            or render_receipt.get('output', {}).get('sha256') != digest):
        raise ValueError('review video is not the inspected render of this candidate')
    if not isinstance(model, str) or not model.strip() or len(model) > 128:
        raise ValueError('treatment review model is required')
    identity = {'documentSha256': document_digest(document), 'videoSha256': digest,
                'restorationSha256': document_digest(restoration), 'requestSha256': state['requestSha256'],
                'outputSha256': state['inspection']['sha256'], 'model': model, 'promptVersion': VERSION}
    if work.is_symlink(): raise ValueError('review directory cannot be a symlink')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = work.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('review directory must be private and owned by the worker')
    lock = os.open(work / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(p.is_symlink() for p in work.iterdir()): raise ValueError('review workspace contains a symlink')
        receipt_path = work / 'review.json'
        if receipt_path.exists():
            saved = json.loads(receipt_path.read_text())
            if saved['identity'] != identity: raise ValueError('review belongs to a different render or source')
            if (saved.get('schema') != 'aios.source-text-visual-review.v1' or saved.get('deliveryApproved') is not False
                    or saved.get('callsReserved') != 1 or saved.get('callLimit') != 1
                    or saved.get('comparisonSha256') != file_hash(work / 'comparison.mp4')):
                raise ValueError('stored treatment review binding changed')
            if saved.get('captionEvidenceSha256') != document_digest(saved.get('captionEvidence')):
                raise ValueError('stored caption visual evidence changed')
            for index, sample in enumerate(saved['captionEvidence']['samples']):
                if sample['imageSha256'] != file_hash(work / f'caption-detail-{index}.png'):
                    raise ValueError('stored caption detail image changed')
            if saved['status'] not in ('reserved', 'failed', 'invalid_response'):
                response = json.loads((work / 'model-response.json').read_text())
                if saved['responseSha256'] != document_digest(response) or saved['checks'] != validate_review(response, request['frames']):
                    raise ValueError('stored treatment review changed')
                if any(saved.get(k) != v for k, v in _outcome(saved['checks']).items()):
                    raise ValueError('stored treatment review decision changed')
            return saved
        comparison = _comparison(operation, request, document, media, video, work, check)
        evidence, images = prepare_caption_evidence(request, document, work, check)
        messages, metadata = review_messages(request, document, comparison,
                                             caption_evidence=evidence, detail_images=images)
        saved = {'schema': 'aios.source-text-visual-review.v1', 'identity': identity, 'status': 'reserved',
                 'comparisonSha256': file_hash(comparison), 'inputSha256': document_digest(messages),
                 'callsReserved': 1, 'callLimit': 1, 'samplingFps': 2, 'deliveryApproved': False,
                 'captionEvidence': evidence, 'captionEvidenceSha256': document_digest(evidence)}
        check()
        _write(work / 'input-metadata.json', metadata)
        _write(receipt_path, saved)
        try:
            response = call_model(messages)
            _write(work / 'model-response.json', response)  # Preserve evidence before validating.
            check()
        except Exception as error:
            _write(receipt_path, {**saved, 'status': 'failed', 'errorType': type(error).__name__})
            raise
        try:
            checks = validate_review(response, request['frames'])
        except ValueError:
            _write(receipt_path, {**saved, 'status': 'invalid_response'})
            raise
        result = {**saved, 'responseSha256': document_digest(response), 'checks': checks,
                  **_outcome(checks),
                  'exactFontIdentity': 'unverified', 'fullTemporalQuality': 'unverified', 'productFacts': 'unverified'}
        _write(receipt_path, result)
        return result
    finally:
        os.close(lock)
