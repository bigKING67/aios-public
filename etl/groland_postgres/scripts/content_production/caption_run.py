"""Bounded host orchestration over existing authenticated Run/project APIs.

The caller supplies api(method, relative_path, json_body=None), enforces its
execution policy, and retains the returned receipt. No credentials, media
downloads, second queue, polling loop or implicit request retries live here.
"""
import copy
from fractions import Fraction
from uuid import UUID

from .caption_quality import document_digest
from .derived_assets import document_bindings
from .source_treatment_captions import restore_narration_captions


def _id(value):
    return str(UUID(str(value)))


def _waiting(detail):
    run = detail['run']
    if run['status'] != 'waiting' or not run.get('projectId') or not detail.get('plan'):
        raise ValueError('caption automation requires a waiting Run with a frozen project')
    return run


def _produce(api, path, detail, document):
    run = _waiting(detail)
    revised = api('POST', f'{path}/plan-revisions', {
        'expectedVersion': run['version'], 'expectedPlanRevision': run['planRevision'], 'document': document})
    # A conflict or unknown POST outcome propagates. The host must reread state,
    # not blindly replay either write or enqueue another render.
    produced = api('POST', f'{path}/produce', {
        'expectedVersion': revised['run']['version'],
        'expectedPlanRevision': revised['run']['planRevision'],
        'expectedProjectRevision': run['projectRevision']})
    return produced


def restore_run_captions(api, run_id, *, reference_project_id, reference_revision):
    """Copy one explicitly selected, owned reference, then queue one render.

    Missing references/styles are gaps, never a request to invent typography.
    Project metadata is compiled without reading source bytes; the ordinary
    Worker still validates and downloads those exact frozen objects.
    """
    path = f'runs/{_id(run_id)}'
    if type(reference_revision) is not int or reference_revision < 1:
        raise ValueError('positive frozen reference revision required')
    detail = api('GET', path)
    run = _waiting(detail)
    project = api('GET', f"projects/{_id(run['projectId'])}")['project']
    reference = api('GET', f'projects/{_id(reference_project_id)}')['project']
    if project['revision'] != run['projectRevision'] or reference['revision'] != reference_revision:
        raise ValueError('caption target or reference revision changed')
    target, prior = project['snapshot'], reference['snapshot']
    font = target.get('renderBinding', {}).get('captionFont')
    if not target.get('derivedAssets') or not font or font != prior.get('renderBinding', {}).get('captionFont'):
        raise ValueError('treated target and matching frozen caption font required')
    if prior['editDocument'].get('captionDisplayPolicy') != 'source-hold-v1':
        raise ValueError('reference caption display policy is not supported by the Run plan')
    def metadata(snapshot):
        # compile_document validates identities/ranges, but does not open paths.
        bindings = document_bindings(snapshot)
        paths = {f"{a['assetId']}-{a['sha256'][:16]}": a['objectKey'] for a in snapshot['assets']}
        paths.update({a['assetVersionId']: a['objectKey'] for a in snapshot.get('derivedAssets', [])})
        return bindings, paths
    restored, receipt = restore_narration_captions(
        target['editDocument'], *metadata(target), prior['editDocument'], *metadata(prior))
    source = next(a for a in target['assets'] if a['assetId'] == run['request']['narrationAssetId'])
    version = f"{source['assetId']}-{source['sha256'][:16]}"
    cues = []
    for cue in restored['captions']:
        anchor = cue['anchor']
        if anchor['clipId'] != 'narration' or anchor['assetVersionId'] != version:
            raise ValueError('reference is not anchored to the Run narration')
        times = [Fraction(anchor[k]['num'] * 1000, anchor[k]['den']) for k in ('sourceStart', 'sourceEnd')]
        if any(t.denominator != 1 for t in times):
            raise ValueError('Run captions require exact millisecond times; no rounding allowed')
        cues.append({'id': cue['id'], 'text': cue['text'], 'style': copy.deepcopy(cue['style']),
                     'startMs': int(times[0]), 'endMs': int(times[1])})
    plan = copy.deepcopy(detail['plan']['document'])
    plan['narrationCaptions'] = {'assetId': source['assetId'], 'sourceSha256': source['sha256'], 'cues': cues}
    produced = _produce(api, path, detail, plan)
    receipt.update(referenceProjectId=_id(reference_project_id), referenceRevision=reference_revision,
                   targetProjectRevision=run['projectRevision'], planSha256=document_digest(plan),
                   queuedProjectRevision=produced['run']['projectRevision'], jobId=produced['run']['renderJobId'])
    return {'detail': produced, 'restoration': receipt}


def adopt_run_caption_candidate(api, run_id):
    """Adopt at most one server-verified line candidate; never a delivery approval."""
    path = f'runs/{_id(run_id)}'
    detail = api('GET', path)
    run = _waiting(detail)
    candidate = api('GET', f'{path}/result').get('captionCandidate')
    if not candidate:
        return {'status': 'no_candidate', 'deliveryApproved': False}
    if any(candidate[k] != run[v] for k, v in (
            ('expectedVersion', 'version'), ('expectedPlanRevision', 'planRevision'),
            ('expectedProjectRevision', 'projectRevision'))):
        raise ValueError('caption candidate no longer matches the Run')
    if candidate['status'] != 'inspection_pending' or candidate['deliveryApproved'] is not False:
        raise ValueError('unsupported candidate status')
    produced = _produce(api, path, detail, candidate['planDocument'])
    return {'status': 'queued', 'detail': produced, 'deliveryApproved': False,
            'candidateDocumentSha256': candidate['documentSha256']}
