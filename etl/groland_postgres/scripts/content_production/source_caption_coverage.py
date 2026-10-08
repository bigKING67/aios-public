"""Bounded completion of a source caption frame grid, never delivery approval."""
import copy
import fcntl
import json
import os
from fractions import Fraction

from .caption_quality import document_digest
from .source_caption_reference import _observe_source_captions
from .source_caption_boundaries import prepare_boundary_images
from .source_caption_groups import (UNKNOWN, group_messages, validate_groups, match_source_caption_groups)
from .source_treatment import _write

VERSION = 'source-caption-scope-coverage-v1'


def coverage_plan(group_result, coarse, frames, call_limit):
    if type(call_limit) is not int or not 1 <= call_limit <= 5:
        raise ValueError('source coverage requires an explicit call limit from 1 to 5')
    if type(frames) is not int or not 1 <= frames <= 150:
        raise ValueError('source coverage requires a bounded 30fps source interval')
    if group_result['reference']['status'] != 'observed':
        raise ValueError('source coverage requires completed group observations')
    plan = group_result['plan']
    if document_digest(coarse) != plan['referenceSha256']:
        raise ValueError('source coverage coarse reference changed')
    ids = {tuple(g['lines']): g['id'] for g in plan['groups']}
    seeds, conflicts = {}, []
    for observation in coarse['observations']:
        group_id = 'absent' if observation['visibility'] == 'absent' else ids.get(tuple(observation['lines']))
        if observation['visibility'] != 'uncertain' and group_id is not None:
            seeds[observation['frame']] = {'frame': observation['frame'], 'groupId': group_id, 'origin': 'coarse'}
    for observation in group_result['reference']['observations']:
        frame, group_id = observation['frame'], observation['groupId']
        if frame in seeds and seeds[frame]['groupId'] != group_id:
            conflicts.append({'frame': frame, 'coarseGroupId': seeds[frame]['groupId'], 'matchedGroupId': group_id})
            group_id = 'uncertain'
        seeds[frame] = {'frame': frame, 'groupId': group_id, 'origin': 'group_match'}
    if any(type(f) is not int or not 0 <= f < frames for f in seeds):
        raise ValueError('source coverage observations exceed requested scope')
    anchors = sorted({g['anchorFrame'] for g in plan['groups']})
    capacity = 32 - len(anchors)
    missing = [f for f in range(frames) if f not in seeds]
    pages = []
    for offset in range(0, len(missing), capacity):
        target = missing[offset:offset + capacity]
        pages.append({'index': len(pages), 'targetFrames': target, 'frames': sorted(set(target + anchors))})
    if len(pages) > call_limit:
        raise ValueError('source coverage pages exceed the authorized call limit')
    return {'schema': 'aios.source-caption-coverage-plan.v1', 'frames': frames, 'callLimit': call_limit,
        'groupReferenceSha256': document_digest({k: group_result[k] for k in ('reference', 'plan', 'boundaries')}), 'coarseReferenceSha256': document_digest(coarse),
        'groups': copy.deepcopy(plan['groups']), 'region': copy.deepcopy(plan['region']),
        'seedObservations': sorted(seeds.values(), key=lambda o: o['frame']), 'seedConflicts': conflicts, 'pages': pages}


def summarize_coverage(plan, page_receipts):
    by_frame = {o['frame']: o['groupId'] for o in plan['seedObservations']}
    conflicts = copy.deepcopy(plan['seedConflicts'])
    anchor_ids = {g['anchorFrame']: g['id'] for g in plan['groups']}
    used = 0
    for page, receipt in zip(plan['pages'], page_receipts):
        used += receipt['callsReserved']
        if receipt['status'] != 'observed':
            break
        items = receipt['observations']
        if [o['frame'] for o in items] != page['frames']:
            raise ValueError('source coverage page frame mismatch')
        values = {o['frame']: o['groupId'] for o in items}
        wrong_anchors = [f for f, group_id in anchor_ids.items() if values[f] != group_id]
        if wrong_anchors:
            conflicts.append({'page': page['index'], 'anchorFrames': wrong_anchors})
        for f in page['targetFrames']:
            by_frame[f] = 'uncertain' if wrong_anchors else values[f]
    missing = [f for f in range(plan['frames']) if f not in by_frame]
    unresolved = sorted(f for f, group_id in by_frame.items() if group_id in UNKNOWN)
    complete = not missing
    resolved = complete and not unresolved and not conflicts
    intervals = []
    # Unknown frames split local candidates; conflicts or missing pages still block.
    if complete and not conflicts:
        text = {g['id']: g['lines'] for g in plan['groups']}
        text['absent'] = []
        for frame in range(plan['frames']):
            group_id = by_frame[frame]
            if group_id not in text:
                continue
            if intervals and intervals[-1]['groupId'] == group_id and intervals[-1]['endFrame'] == frame:
                intervals[-1]['endFrame'] = frame + 1
            else:
                intervals.append({'startFrame': frame, 'endFrame': frame + 1,
                                  'groupId': group_id, 'lines': text[group_id]})
    return {'status': 'scope_observed' if resolved else 'needs_inspection' if complete else 'partial',
        'frames': plan['frames'], 'observedFrameCount': len(by_frame), 'missingFrames': missing,
        'unresolvedFrames': unresolved, 'conflicts': conflicts, 'callsReserved': used, 'callLimit': plan['callLimit'],
        'frameCoverageComplete': complete, 'allGroupsResolved': resolved, 'scopeIntervals': intervals if resolved else [],
        'selectionIntervals': copy.deepcopy(intervals),
        'scopeEdgesAreCueBoundaries': False, 'exactFontIdentity': 'unverified',
        'subtitleTrackReady': False, 'deliveryApproved': False}


def complete_source_caption_coverage(request, document, media, reference_work, group_work, work, *,
                                      region, model, call_limit, call_model, check, continuous_interval=None):
    """Only missing frames are queried; each durable page can be dispatched once."""
    def never_call(_):
        raise ValueError('source coverage cannot recreate missing group observations')
    check()
    if not isinstance(model, str) or not model.strip() or len(model) > 128:
        raise ValueError('source coverage model required')
    if group_work.is_symlink() or (group_work / 'reference.json').is_symlink():
        raise ValueError('source coverage parent cannot be a symlink')
    parent = json.loads((group_work / 'reference.json').read_text())
    group_result = match_source_caption_groups(request, document, media, reference_work, group_work,
        region=region, model=parent['identity']['model'], call_model=never_call, check=check,
        continuous_interval=continuous_interval)
    coarse = json.loads((reference_work / 'reference.json').read_text())
    original = json.loads((reference_work / 'input.json').read_text())
    plan = coverage_plan(group_result, coarse, request['frames'], call_limit)
    plan['model'] = model
    if work.is_symlink():
        raise ValueError('source coverage workspace cannot be a symlink')
    work.mkdir(mode=0o700, parents=True, exist_ok=True)
    if work.stat().st_uid != os.geteuid() or work.stat().st_mode & 0o777 != 0o700:
        raise ValueError('source coverage workspace must be private')
    lock = os.open(work / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(p.is_symlink() for p in work.iterdir()):
            raise ValueError('source coverage workspace contains a symlink')
        plan_path = work / 'plan.json'
        if plan_path.exists() and json.loads(plan_path.read_text()) != plan:
            raise ValueError('source coverage identity or call budget changed')
        _write(plan_path, plan)
        receipts = []
        for page in plan['pages']:
            check()
            page_plan = copy.deepcopy(group_result['plan'])
            page_plan['frames'] = page['frames']
            for group in page_plan['groups']:
                group['sampleIndex'] = page['frames'].index(group['anchorFrame'])
            def prepare(_request, _document, _media, directory, tick):
                evidence, images = prepare_boundary_images(reference_work, original, page_plan, directory, tick)
                return {**evidence, 'schema': 'aios.source-caption-group-input.v1', 'groups': page_plan['groups']}, images
            receipt = _observe_source_captions(request, document, media, work / f"page-{page['index']}",
                model=model, call_model=call_model, check=check, prepare=prepare, version=VERSION,
                extra_identity={'coveragePlanSha256': document_digest(plan), 'pageIndex': page['index']},
                messages_builder=group_messages, response_validator=validate_groups,
                receipt_schema='aios.source-caption-coverage-page.v1')
            receipts.append(receipt)
            if receipt['status'] != 'observed':
                break  # A reserved/failed page is never resent or skipped to spend later pages.
        report = {**summarize_coverage(plan, receipts), 'schema': 'aios.source-caption-coverage.v1',
                  'planSha256': document_digest(plan), 'pageReceiptSha256': [document_digest(r) for r in receipts]}
        # Derived report fields never enter the frozen request/page identity.
        report['sourceBinding'] = {k: copy.deepcopy(original[k]) for k in
            ('assetVersionId', 'sourceSha256', 'documentSha256', 'requestSha256', 'sourceMap', 'fps')}
        report['executableEditAllowed'] = False
        offset = Fraction(original['sourceMap']['sourceStart']['num'], original['sourceMap']['sourceStart']['den'])
        limit = Fraction(original['sourceMap']['sourceEnd']['num'], original['sourceMap']['sourceEnd']['den'])
        for interval in report['scopeIntervals'] + report['selectionIntervals']:
            lo, hi = (offset + Fraction(interval[k], original['fps']) for k in ('startFrame', 'endFrame'))
            if not offset <= lo < hi <= limit:
                raise ValueError('caption coverage interval exceeds bound source')
            interval['frameCount'] = interval['endFrame'] - interval['startFrame']
            interval['sourceMap'] = {key: {'num': value.numerator, 'den': value.denominator}
                for key, value in [('sourceStart', lo), ('sourceEnd', hi)]}
        _write(work / 'coverage.json', report)
        return report
    finally:
        os.close(lock)
