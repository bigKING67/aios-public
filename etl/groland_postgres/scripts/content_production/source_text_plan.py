"""Pre-freeze text handling advice from source-bound observations, never erasure authority.

The host validates the edit and supplies authorized analysis/probe records. Model
absence is not a clean-source certificate; subtitle streams do not exclude burns.
"""
from fractions import Fraction

from marketing_content_assets.visible_text_contract import validate
from .caption_quality import document_digest
from .source_text_compatibility import assess_source_text


def plan_source_text(document, records):
    assets = {a['assetVersionId']: a['sha256'] for a in document['assets']}
    indexed = {}
    for record in records:
        version = record['assetVersionId']
        if version not in assets or record['sourceSha256'] != assets[version] or version in indexed:
            raise ValueError('text plan requires unique matching frozen source records')
        validate(record['visibleText'])
        streams = record.get('subtitleStreams', [])
        if not isinstance(streams, list) or any(not isinstance(s, dict) or set(s) != {'index', 'codec'}
                or type(s['index']) is not int or s['index'] < 0 or not isinstance(s['codec'], str)
                or not s['codec'] for s in streams) or len({s['index'] for s in streams}) != len(streams):
            raise ValueError('invalid probed subtitle streams')
        indexed[version] = record
    routes = []
    for route in assess_source_text(document)['routes']:
        record = indexed.get(route['assetVersionId'])
        lo, hi = (Fraction(route[k]['num'], route[k]['den']) * 1000 for k in ('sourceStart', 'sourceEnd'))
        observations = [] if record is None else [o for o in record['visibleText']['observations']
            if o['start_ms'] < hi and o['end_ms'] > lo]
        roles = sorted({o['role'] for o in observations})
        retained = route['action'] == 'preserve_original'
        steps = ['retain_source_pixels'] if retained else []
        if record and record.get('subtitleStreams'):
            steps.append('inspect_and_retime_separate_subtitle_track')
        if 'dialogue_subtitle' in roles:
            if not retained:
                steps.extend(['prefer_clean_alternative', 'assess_burned_caption_conflict'])
        if 'promotion' in roles:
            steps.append('check_promotion_against_current_business_facts')
        if any(r in roles for r in ('packaging', 'brand_mark')):
            steps.append('protect_product_and_brand_text')
        if any(r in roles for r in ('other', 'unknown')):
            steps.append('classify_unresolved_visible_text')
        if not retained:
            # Existing analysis is partial/unknown; no empty result grants clean status.
            steps.append('verify_remaining_source_text_scope')
        else:
            steps.append('check_retained_text_business_validity')
        routes.append({**route, 'observedRoles': roles,
            'textPresence': 'observed' if observations else 'unverified',
            'analysisCoverage': record['visibleText']['coverage'] if record else 'missing',
            'analysisEvidence': record.get('analysisEvidence') if record else None,
            'subtitleStreams': record.get('subtitleStreams', []) if record else [],
            'nextSteps': steps, 'preserveStyleRequired': True,
            'fallback': 'retain_original_or_reselect_source', 'textFreeVerified': False})
    return {'schema': 'aios.source-text-plan.v1', 'documentSha256': document_digest(document),
        'evidenceSha256': document_digest(records), 'routes': routes,
        'status': 'planning_only', 'externalCalls': 0, 'erasureAuthorized': False, 'deliveryApproved': False}


def prepare_source_text_plan(prepared, records, work, check):
    """Read-only local host entry: validate media and probe real subtitle streams.

    Analysis records must be loaded from the host's authorized source-bound cache;
    their hashes bind provenance but do not certify model accuracy or full coverage.
    """
    import copy
    from pathlib import Path
    from .edit_document import compile_document
    from .execution import file_hash
    from .source_treatment_media import _probe

    document, media = prepared['document'], prepared['media']
    compile_document(document, prepared['bindings'], media, 'Source text planning')
    # Validate analysis identities before probing and preserve caller-owned records.
    plan_source_text(document, records)
    indexed = {r['assetVersionId']: copy.deepcopy(r) for r in records}
    for asset in document['assets']:
        check()
        version = asset['assetVersionId']
        path = Path(media[version])
        if path.is_symlink() or file_hash(path) != asset['sha256']:
            raise ValueError('text planning media differs from frozen source')
        streams = _probe(path, work)['streams']
        record = indexed.setdefault(version, {'assetVersionId': version, 'sourceSha256': asset['sha256'],
            'visibleText': {'coverage': 'unknown', 'observations': []}})
        record['subtitleStreams'] = [{'index': s['index'], 'codec': s.get('codec_name', 'unknown')}
                                      for s in streams if s['codec_type'] == 'subtitle']
        check()
        if file_hash(path) != asset['sha256']:
            raise ValueError('text planning source changed during probe')
    return plan_source_text(document, list(indexed.values()))
