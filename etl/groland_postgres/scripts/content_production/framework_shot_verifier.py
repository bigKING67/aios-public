"""Run the optional source-bound Lite verification before publishing suggestions."""
import json

from . import framework_audit_media as media, framework_shot_audit as audit
from .execution import file_hash
from .framework_face_presence import reconcile
from .framework_shot_evidence import continuous_runs
from .segment_suggestion_provider import SuggestionError, call_with_ticks

MODEL = 'doubao-seed-2-1-lite-260915'


def validate_provider(provider):
    if provider.model != MODEL or not callable(getattr(provider, 'review', None)):
        raise ValueError('Source-bound framework verification requires doubao-seed-2.1-lite')
    if provider.request_settings().get('thinking') != 'enabled':
        raise ValueError('Verified framework proposal configuration requires thinking=enabled')


def verify(payload, source, proxy, duration_ms, label_keys, work, env, tick, provider,
           deadline_seconds, account_usage, *, continuity=False, editorial=False):
    """Every successful/incomplete call is accounted, including a failed second stage."""
    validate_provider(provider)
    if continuity:
        return verify_continuity(payload, source, duration_ms, label_keys, work, env, tick,
                                 provider, deadline_seconds, account_usage, editorial=editorial, proxy=proxy)
    planned = audit.plan(payload, label_keys, duration_ms)
    if not planned['selected']:
        return {'segments': planned['items']}, {'policy': audit.POLICY, 'frames': 0, 'calls': 0,
                                               'preAuditCorrections': planned['preAuditCorrections']}
    work.mkdir(parents=True, exist_ok=True)
    frames, boards = media.prepare(source, planned['ranges'], work, env, tick)
    responses = []
    (work / 'frames.json').write_text(json.dumps(frames, ensure_ascii=False))

    def request(prompt, schema, **inputs):
        tick()
        try:
            result = call_with_ticks(lambda: provider.review(prompt, schema, **inputs), tick, deadline_seconds)
        except SuggestionError as error:
            # Preserve first-stage + any earlier audit usage on provider errors.
            error.usage = account_usage(error.usage)
            raise
        account_usage(result.usage)
        responses.append(result.response_id)
        (work / f'response-{len(responses)}.json').write_text(json.dumps({
            'payload':result.payload,'usage':result.usage,'responseId':result.response_id},ensure_ascii=False))
        return result

    observed = request(audit.observation_prompt(frames), audit.observer_schema(), boards=boards)
    # Do not buy another context call for an incomplete visual response.
    decoded = audit.decode_observations(observed.payload)
    audit.borrowed_frames(frames, decoded)
    expected = {f['index'] for f in frames}
    observed_indices = [o['index'] for o in decoded['shots']]
    if (len(observed_indices) != len(frames) or any(type(i) is not int for i in observed_indices)
            or set(observed_indices) != expected):
        raise ValueError('Shot evidence coverage is incomplete or duplicated')
    repairs = []
    invalid = {o['index'] for o in decoded['shots']
               if o.get('role') == 'presenter' and o.get('visible_person_id') == ''}
    if invalid and len(invalid) <= 4:
        # One bounded repair of contradictory visual facts, never a new model
        # or an automatic rerun of the whole video. Include adjacent face anchors
        # so a repaired ID cannot silently refer to a different known person.
        selected = sorted({j for i in invalid for j in (i-1,i,i+1) if j in expected})
        old = {o['index']:o for o in decoded['shots']}
        anchors = {i:old[i]['visible_person_id'] for i in selected if i not in invalid
                   and i in old and old[i].get('visible_person_id')}
        prompt = (audit.OBSERVER_PROMPT + '\n这次只修复矛盾事实：声称人出镜却没有人物编号。'
                  '\n图片按此编号顺序提供：' + json.dumps(selected) +
                  '\n已确定的参考人物编号必须保留：' + json.dumps(anchors) +
                  '\n逐张重新核对；确实不见脸则改为正确的非人物角色，不猜人物。'
                  '未见过的人用R1/R2编号。返回这组全部i，markers填空数组。')
        fixed = request(prompt,audit.observer_schema(),boards=[work/f'{i}.jpg' for i in selected])
        corrected = audit.decode_observations(fixed.payload)
        relevant = [f for f in frames if f['index'] in selected]
        continuous_runs(relevant,reconcile(relevant,corrected)[0])
        indexed = {o['index']:o for o in corrected['shots']}
        if any(indexed[i]['visible_person_id'] != person for i,person in anchors.items()):
            raise ValueError('Visual repair changed a reference presenter')
        decoded['shots'] = [indexed[o['index']] if o['index'] in invalid else o for o in decoded['shots']]
        repairs = sorted(invalid)
    continuous_runs(frames, reconcile(frames, decoded)[0])
    context = {'units': []}
    if planned['context']:
        context = request(audit.context_prompt(planned['context']), audit.context_schema(), proxy=proxy).payload
    result, receipt = audit.apply(planned, frames, decoded, context)
    # Ephemeral job work contains reproducible evidence; no public URL or secret.
    (work / 'observations.json').write_text(json.dumps({'frames': frames, 'observations': decoded,
                                                       'context': context}, ensure_ascii=False))
    receipt.update(model=provider.model, calls=len(responses), responseIds=responses, factRepairIndices=repairs,
                   boardSha256=[file_hash(board) for board in boards],
                   settings={'thinking': 'disabled', 'temperature': 0, 'contextFps': .2,
                             'sceneThreshold': .12, 'maxFrames': media.MAX_FRAMES})
    return result, receipt


def verify_continuity(payload, source, duration_ms, label_keys, work, env, tick, provider,
                      deadline_seconds, account_usage, *, editorial=False, proxy=None):
    from . import framework_window_audit as windows
    from .segment_suggestion_contract import postprocess, PROMPT_V16
    segments, stats = postprocess(payload, duration_ms, label_keys, version=PROMPT_V16)
    if any(stats['dropped'][key] for key in ('invalid_range', 'unknown_label', 'overlap_consumed', 'over_limit')):
        raise ValueError('Invalid continuity proposal')
    work.mkdir(parents=True, exist_ok=True)
    calls = []

    def request(prompt, schema, **inputs):
        tick()
        try:
            result = call_with_ticks(lambda: provider.review(prompt, schema, **inputs), tick, deadline_seconds)
        except SuggestionError as error:
            error.usage = account_usage(error.usage)
            raise
        account_usage(result.usage)
        calls.append(result.response_id)
        (work / f'response-{len(calls)}.json').write_text(json.dumps({
            'payload': result.payload, 'usage': result.usage, 'responseId': result.response_id}, ensure_ascii=False))
        return result

    result, receipt = windows.verify(segments, source, duration_ms, work, env, tick, request)
    if editorial:
        from . import framework_editorial_audit, framework_composition
        checked, _ = postprocess(result, duration_ms, label_keys, version=PROMPT_V16)
        from . import framework_recording_groups
        checked, receipt['liveClaims'], receipt['recordingGroups'] = framework_recording_groups.verify(
            checked, source, work / 'recording-groups', env, tick, request,
            claims=receipt['liveClaims'], windows=receipt['windows'])
        from . import framework_short_review
        checked, receipt['liveClaims'], receipt['shortReviews'] = framework_short_review.verify(
            checked, source, duration_ms, work / 'short-reviews', env, tick, request,
            claims=receipt['liveClaims'], windows=receipt['windows'])

        def decide(questions, **inputs):
            tick()
            try:
                response = call_with_ticks(lambda: provider.decide(questions, **inputs), tick, deadline_seconds)
            except SuggestionError as error:
                error.usage = account_usage(error.usage)
                raise
            account_usage(response.usage)
            calls.append(response.response_id)
            (work / f'response-{len(calls)}.json').write_text(json.dumps({
                'api': 'systemone', 'questions': questions, 'payload': response.payload,
                'usage': response.usage, 'responseId': response.response_id}, ensure_ascii=False))
            return response

        # Editorial membership is independent of voice identity. Resolve it
        # before asking audio questions about the remaining live candidates.
        checked, receipt['composition'] = framework_composition.verify(
            checked, source, duration_ms, work / 'composition', env, tick, decide,
            windows=receipt['windows'], request=request, short_reviews=[p for p in receipt['shortReviews']['observations']
                if any(p['start_ms']==c['start_ms'] and p['end_ms']==c['end_ms']
                       for c in receipt['shortReviews']['corrections'])])
        checked, receipt['editorial'] = framework_editorial_audit.verify(
            checked, source, duration_ms, work / 'editorial', env, tick, request, windows=receipt['windows'],
            resolved=receipt['composition']['settled'])
        if receipt['shortReviews']['corrections']:
            # Resolve a short exception's actual narration before promotion
            # refinement changes its neighbors and hides the source question.
            from . import framework_av_composition
            checked, receipt['shortReviewAV'] = framework_av_composition.verify(
                checked, source, work / 'short-review-av', env, tick, request,
                editorial=receipt['editorial'], windows=receipt['windows'], claims=receipt['liveClaims'],
                short_reviews=receipt['shortReviews']['corrections'], only_short=True)
            if receipt['shortReviewAV']['corrections']:
                checked = framework_av_composition.coalesce_mixed(checked)
        from . import framework_promotion
        checked, receipt['promotion'] = framework_promotion.verify(
            checked, proxy or source, work / 'promotion', request, windows=receipt['windows'],
            source=source, env=env, tick=tick)
        from . import framework_offer_tail
        checked, receipt['offerTail'] = framework_offer_tail.verify(
            checked, source, work / 'offer-tail', env, tick, request,
            promotion=receipt['promotion'], windows=receipt['windows'])
        # Editorial corrections can leave a short fragment of a qualified
        # window. Apply the existing duration gate before selecting neighbors;
        # otherwise that unsupported live fragment hides the review's return.
        checked, receipt['preMembershipDurationCorrections'] = windows.finalize(checked, receipt)
        from . import framework_narrator_return
        checked, receipt['narratorReturn'] = framework_narrator_return.verify(
            checked, source, work / 'narrator-return', env, tick, request,
            editorial=receipt['editorial'], windows=receipt['windows'])
        from . import framework_av_composition
        checked, receipt['avComposition'] = framework_av_composition.verify(
            checked, source, work / 'av-composition', env, tick, request,
            editorial=receipt['editorial'], windows=receipt['windows'], claims=receipt['liveClaims'])
        from . import framework_review_membership
        checked, receipt['reviewMembership'] = framework_review_membership.verify(
            checked, source, work / 'review-membership', env, tick, request,
            claims=receipt['liveClaims'], windows=receipt['windows'])
        from . import framework_overlap_repair
        checked = framework_overlap_repair.reconcile(checked, receipt, source, duration_ms,
            work/'overlap-ownership', env, tick, request)
        from . import framework_review_partition
        checked, receipt['liveClaims'], receipt['reviewPartition'] = framework_review_partition.verify(
            checked, source, work/'review-partition', env, tick, request,
            claims=receipt['liveClaims'], windows=receipt['windows'])
        receipt['editorial'] = framework_narrator_return.resolve_editorial_conflicts(
            checked, receipt['editorial'], receipt['narratorReturn'])
        result = {'segments': [dict(start_sec=s['start_ms'] / 1000, end_sec=s['end_ms'] / 1000,
            label_key=s['label_key'], confidence=s['confidence'], reason=s['reason'],
            same_person_as_previous=False) for s in checked]}
    receipt.update(model=provider.model, calls=len(calls), responseIds=calls,
                   settings={'thinking': 'enabled', 'temperature': 0, 'windowFps': 2, 'windowReasoningEffort': 'medium',
                             'maxWindows': windows.MAX_WINDOWS, 'maxTriads': windows.MAX_TRIADS,
                             'triadReasoningEffort': 'low', 'maxContextChecks': windows.MAX_CONTEXT_CHECKS,
                             'contextFps': 1, 'contextReasoningEffort': 'low',
                             'ownershipThinking': 'disabled', 'ownershipFps': 3,
                             'maxOwnershipChecks': windows.ownership.MAX_CHECKS,
                             'maxOwnershipVideoMs': windows.ownership.MAX_VIDEO_MS})
    return result, receipt
