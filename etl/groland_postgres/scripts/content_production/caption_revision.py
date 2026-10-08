"""Bounded local model revision; unaffected cues stay frozen and regressions roll back."""
import copy
import hashlib
import json
import re

from .semantic_captions import (
    CaptionProviderError, prepare_words, speech_context, text_groups_to_boundaries, ground_boundaries,
    add_context_warnings, plan_semantic_captions, CONTEXT_EVALUATION_VERSION,
)


def revise_captions(result, original, *, call_model, model, clip_id, asset_version_id,
                    source_start_ms, source_end_ms, asr_origin_ms=0, protected_terms=(), max_calls=3, output_mode="text", display_document=None):
    if type(max_calls) is not int or not 0 <= max_calls <= 8:
        raise ValueError('revision budget must be 0..8 calls')
    if output_mode not in ('text','boundaries') or (output_mode == 'boundaries' and asr_origin_ms != 0):
        raise ValueError('invalid revision output mode or ASR origin')
    words = prepare_words(result, source_start_ms, source_end_ms, asr_origin_ms)
    if output_mode == 'boundaries':
        protected_terms = tuple(dict.fromkeys((*protected_terms,*re.findall(r'[A-Za-z][A-Za-z0-9]*',''.join(w['text'] for w in words)))))
    context = speech_context(result, words, asr_origin_ms)
    cues = original['captions']
    if display_document is not None:
        if display_document.get('captionDisplayPolicy') != 'source-hold-v1' or display_document.get('captions') != cues:
            raise ValueError('display document must match the frozen caption plan')
    def evaluate(plan):
        if display_document is None:
            return plan
        from .caption_quality import assess_rendered_captions
        candidate = copy.deepcopy(display_document)
        candidate['captions'] = plan['captions']
        assessment = assess_rendered_captions(candidate)
        plan['warnings'] = [w for w in plan['warnings'] if w['reason'] != 'reading_duration_requires_review'] + assessment['warnings']
        plan['displayAssessment'] = assessment
        return plan
    answer = text_groups_to_boundaries(words, {'groups': [{'lines': c['text'].split('\n')} for c in cues]})
    baseline = ground_boundaries(words, answer, clip_id, asset_version_id, protected_terms)
    styled = False
    for supplied, grounded in zip(cues, baseline['captions']):
        from .edit_document import _caption_style
        style = _caption_style(supplied)
        if style is not None:
            styled = True
            grounded['stylePreset'] = 'source-style-v1'
            grounded['style'] = style
        if supplied != grounded:
            raise ValueError('caption source binding or timing changed')
    add_context_warnings(baseline, answer, context['punctuationHints'])
    evaluate(baseline)
    warnings_before = len(baseline['warnings'])
    if styled:
        # Regrouping changes cue identity and can cross source-style boundaries.
        # Keep grounded groups intact; independent line-only review may still
        # revise text layout while retaining every non-text field.
        baseline['provenance'] = copy.deepcopy(original.get('provenance', {}))
        baseline['revision'] = {'model': model, 'outputMode': output_mode, 'maxCalls': max_calls,
            'attempts': [], 'contextEvaluationVersion': CONTEXT_EVALUATION_VERSION,
            'evaluationScope': 'whole-document-display-v1' if display_document is not None else 'whole-source',
            'hostLineLayout': [], 'boundarySearch': None, 'candidateWindows': 0, 'appliedWindows': 0,
            'warningsBefore': warnings_before, 'warningsAfter': warnings_before,
            'styleBoundariesFrozen': True}
        return baseline
    # A deterministic layout pass can remove unnecessary line breaks without
    # changing cue boundaries or spending a model call. Keep it only if better.
    from .caption_boundary_layout import fit_boundaries
    compact, layout_repairs = fit_boundaries(words, answer, set(),
        [h['afterWord'] for h in context['punctuationHints']])
    fitted = ground_boundaries(words, compact, clip_id, asset_version_id, protected_terms)
    add_context_warnings(fitted, compact, context['punctuationHints'])
    evaluate(fitted)
    if len(fitted['warnings']) < warnings_before and {w['reason'] for w in fitted['warnings']} <= {w['reason'] for w in baseline['warnings']}:
        baseline, cues = fitted, fitted['captions']
    else:
        layout_repairs = []
    flagged = {w['captionId'] for w in baseline['warnings']}
    windows = []
    for i, cue in enumerate(cues):
        if cue['id'] not in flagged:
            continue
        lo, hi = max(0, i-1), min(len(cues), i+2)
        if windows and lo <= windows[-1][1]:
            windows[-1][1] = hi
        else:
            windows.append([lo, hi])
    output = copy.deepcopy(baseline)
    output['captions'] = copy.deepcopy(cues)
    events, replacements = [], []
    for lo, hi in windows[:max_calls]:
        old = cues[lo:hi]
        old_ids = {c['id'] for c in old}
        old_warnings = [w for w in baseline['warnings'] if w['captionId'] in old_ids]
        start = old[0]['anchor']['sourceStart']['num']
        end = old[-1]['anchor']['sourceEnd']['num']
        event = {'startMs': start, 'endMs': end, 'warningsBefore': len(old_warnings)}
        def revision_call(messages):
            messages = copy.deepcopy(messages)
            messages[0]['content'] += '\n本次是局部修订。修复所给问题，保留原文。上下文只供参考，不加入输出。'
            payload = json.loads(messages[1]['content'])
            payload['previousGroups'] = [c['text'] for c in old]
            payload['issues'] = sorted({w['reason'] for w in old_warnings})
            if display_document is not None:
                payload['displayPolicy'] = {'name':'source-hold-v1','fps':30,'maxHoldFrames':9,
                    'minimumFrames':18,'framesPerCharacter':3,
                    'currentDisplayCues':output['displayAssessment']['displayCues']}
                messages[0]['content'] += ('字幕实际显示可在源结束后延长最多9帧，但不能覆盖下一字幕或跨新画面切点。'
                    '按最终可用显示时长考虑相邻分组；品牌与产品名可组合，不必沿用旧分组。时间由宿主计算，禁止输出时间。')
            messages[1]['content'] = json.dumps(payload, ensure_ascii=False)
            event['requestSha256'] = hashlib.sha256(messages[1]['content'].encode()).hexdigest()
            return call_model(messages)
        try:
            from .indexed_captions import plan_indexed_captions
            planner = plan_indexed_captions if output_mode == 'boundaries' else plan_semantic_captions
            options = {} if output_mode == 'boundaries' else {'asr_origin_ms':asr_origin_ms}
            proposal = planner(result, call_model=revision_call, model=model,
                clip_id=clip_id, asset_version_id=asset_version_id, source_start_ms=start, source_end_ms=end,
                protected_terms=protected_terms, **options)
        except CaptionProviderError as error:
            event.update(status='transport_failed', reason=str(error))
            events.append(event)
            break
        except ValueError as error:
            event.update(status='rejected_contract', reason=str(error))
            events.append(event)
            continue
        except Exception:
            # Retain the original and stop further paid calls on transport faults.
            event.update(status='transport_failed')
            events.append(event)
            break
        event['candidateProvenance'] = proposal['provenance']
        # Compare the entire edit, including unchanged neighbours. A local
        # window end must never masquerade as the end of the actual speech.
        current = output['captions']
        left = next(i for i,c in enumerate(current) if c['id'] == old[0]['id'])
        right = left + len(old)
        trial_cues = current[:left] + proposal['captions'] + current[right:]
        trial_answer = text_groups_to_boundaries(words, {'groups':[{'lines':c['text'].split('\n')} for c in trial_cues]})
        trial = ground_boundaries(words, trial_answer, clip_id, asset_version_id, protected_terms)
        add_context_warnings(trial, trial_answer, context['punctuationHints'])
        evaluate(trial)
        event['warningsTotalBefore'] = len(output['warnings'])
        proposal['warnings'] = trial['warnings']
        event['warningsAfter'] = len(proposal['warnings'])
        before_types = {w['reason'] for w in output['warnings']}
        after_types = {w['reason'] for w in proposal['warnings']}
        if len(proposal['warnings']) < len(output['warnings']) and after_types <= before_types:
            replacements.append((lo, hi, proposal))
            output = trial
            event['status'] = 'accepted'
        else:
            event['status'] = 'retained_original'
        events.append(event)
    boundary_search = None
    if display_document is not None:
        from .caption_boundary_search import repair_reading_boundaries
        output, boundary_search = repair_reading_boundaries(words, output, context['punctuationHints'],
            protected_terms, clip_id, asset_version_id, evaluate)
    # Revalidate whole output, including continuity across revised/frozen boundaries.
    final_answer = text_groups_to_boundaries(words, {'groups': [{'lines': c['text'].split('\n')} for c in output['captions']]})
    validated = ground_boundaries(words, final_answer, clip_id, asset_version_id, protected_terms)
    add_context_warnings(validated, final_answer, context['punctuationHints'])
    evaluate(validated)
    output['warnings'] = validated['warnings']
    if 'displayAssessment' in validated:
        output['displayAssessment'] = validated['displayAssessment']
    output['provenance'] = copy.deepcopy(original.get('provenance', {}))
    output['revision'] = {'model': model, 'outputMode':output_mode, 'maxCalls': max_calls, 'attempts': events,
                          'contextEvaluationVersion': CONTEXT_EVALUATION_VERSION,
                          'evaluationScope': 'whole-document-display-v1' if display_document is not None else 'whole-source',
                          'hostLineLayout': layout_repairs,
                          'boundarySearch': boundary_search,
                          'candidateWindows': len(windows), 'appliedWindows': len(replacements),
                          'warningsBefore': warnings_before, 'warningsAfter': len(output['warnings'])}
    return output
