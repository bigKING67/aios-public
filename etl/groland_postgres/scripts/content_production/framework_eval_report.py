"""Gold-only diagnostics and adoption gates. Never imported by the classifier."""
import json
import math

from .framework_evaluation import _timeline, compare
from .framework_annotation_alignment import alignment, timing_only_difference
from .framework_eval_extent import outside_video


def error_spans(reference, prediction):
    duration = round(reference[-1][1])
    expected, actual = _timeline(reference, duration), _timeline(prediction, duration)
    spans = []
    for second, (want, got) in enumerate(zip(expected, actual)):
        if want is None or want == got:
            continue
        if spans and spans[-1]['end'] == second and (spans[-1]['expected'], spans[-1]['actual']) == (want, got):
            spans[-1]['end'] += 1
        else:
            spans.append(dict(start=second, end=second+1, expected=want, actual=got))
    return spans


def exact_error_spans(reference, prediction):
    """Continuous-time comparison; rounding must not hide a few wrong frames."""
    edges = sorted({t for rows in (reference, prediction) for a, b, _ in rows for t in (a, b)})
    spans = []
    for a, b in zip(edges, edges[1:]):
        want = next((label for start, end, label in reference if start <= a and end >= b), None)
        got = next((label for start, end, label in prediction if start <= a and end >= b), None)
        if want is None or want == got:
            continue
        if spans and spans[-1]['end'] == a and (spans[-1]['expected'], spans[-1]['actual']) == (want, got):
            spans[-1]['end'] = b
        else:
            spans.append(dict(start=a, end=b, expected=want, actual=got))
    return spans


def _cost_totals():
    return dict(newCalls=0, failedCalls=0, unknownUsageCalls=0, inputTokens=0, outputTokens=0,
        knownAudioTokens=0, missingAudioBreakdownCalls=0, knownReasoningTokens=0,
        missingReasoningBreakdownCalls=0, knownCachedInputTokens=0, missingCacheBreakdownCalls=0,
        providerSeconds=0, timedCalls=0, missingTimingCalls=0)


def _add_cost(result, call):
    result['newCalls'] += 1
    result['failedCalls'] += bool(call.get('error'))
    usage = call.get('usage') or {}
    result['unknownUsageCalls'] += not bool(usage)
    result['inputTokens'] += usage.get('input_tokens', 0)
    result['outputTokens'] += usage.get('output_tokens', 0)
    detail = usage.get('input_tokens_details', {})
    output = usage.get('output_tokens_details', {})
    for key, fields, provider_key, missing in (
            ('knownAudioTokens', detail, 'audio_tokens', 'missingAudioBreakdownCalls'),
            ('knownCachedInputTokens', detail, 'cached_tokens', 'missingCacheBreakdownCalls'),
            ('knownReasoningTokens', output, 'reasoning_tokens', 'missingReasoningBreakdownCalls')):
        result[key] += fields.get(provider_key, 0)
        result[missing] += provider_key not in fields
    seconds = call.get('providerSeconds')
    if isinstance(seconds, (int, float)) and not isinstance(seconds, bool) and math.isfinite(seconds) and seconds >= 0:
        result['providerSeconds'] += seconds
        result['timedCalls'] += 1
    else:
        result['missingTimingCalls'] += 1


def ledger(calls):
    result, groups = dict(_cost_totals(), replayedCalls=0), {}
    for call in calls:
        if call.get('reused'):
            result['replayedCalls'] += 1
            continue
        _add_cost(result, call)
        profile = call.get('requestProfile', {})
        # Old tapes still support token profiling, but have no measured latency.
        fields = tuple(profile.get('schemaFields', sorted(call.get('payload', {}))))
        key = (call.get('api', 'unknown'), fields, profile.get('thinking'), profile.get('reasoningEffort'))
        if key not in groups:
            groups[key] = dict(_cost_totals(), api=key[0], schemaFields=list(fields),
                              thinking=key[2], reasoningEffort=key[3])
        _add_cost(groups[key], call)
    result['providerSeconds'] = round(result['providerSeconds'], 6)
    result['byRequestSchema'] = list(groups.values())
    # Tokens are auditable; missing modality breakdown is not zero audio cost.
    result['currencyCost'] = None
    result['costNote'] = 'Use provider billing for currency; missing usage or audio breakdown is unknown, not free.'
    return result


def resolved_reference_difference(error, assertions):
    """Keep original-gold scoring, but do not repair against a newer adjudication."""
    matches = [c for c in assertions if c['label'] == error['actual'] and c['label'] != error['expected']
               and min(c['end'], error['end']) > max(c['start'], error['start'])]
    cursor = error['start']
    for c in sorted(matches, key=lambda c:c['start']):
        if c['start'] > cursor:
            return []
        cursor = max(cursor, c['end'])
    return [c['id'] for c in matches] if cursor >= error['end'] else []


def adjudicated_reference(reference, cases):
    """Overlay explicit owner decisions for a parallel score; keep gold intact."""
    end=reference[-1][1]
    edges=sorted({0,end,*[t for a,b,_ in reference for t in (a,b)],
                  *[max(0,min(end,c[k])) for c in cases for k in ('start','end')]})
    result=[]
    for a,b in zip(edges,edges[1:]):
        labels={c['label'] for c in cases if c['start']<=a and c['end']>=b}
        if len(labels)>1:
            raise ValueError('Conflicting active owner adjudications')
        label=next(iter(labels)) if labels else next((v for x,y,v in reference if x<=a and y>=b),None)
        if label is None: continue
        if result and result[-1][1]==a and result[-1][2]==label: result[-1][1]=b
        else: result.append([a,b,label])
    return result


def report(corpus, baseline, rows, scope):
    original=_evaluate(corpus,baseline,rows,scope)
    if 'acceptancePolicy' not in corpus:
        return original
    from .framework_reference_calibration import calibrated_corpus
    calibrated,receipt=calibrated_corpus(corpus,adjudicated_reference)
    result=_evaluate(calibrated,baseline,rows,scope)
    result.update(referenceCalibration=receipt,originalEvaluation=original)
    return result


def _evaluate(corpus, baseline, rows, scope):
    truth = {f: corpus['films'][f]['segments'] for f in scope}
    if len(scope) != len(set(scope)) or not set(scope) <= set(corpus['films']):
        raise ValueError('Invalid fixed evaluation scope')
    base = {r['film']: r for r in baseline}
    if len(base) != len(baseline) or not set(scope) <= set(base):
        raise ValueError('Baseline scope is incomplete or duplicated')
    # Failed/missing cases count as zero; never disappear from the denominator.
    indexed = {r['film']: r for r in rows}
    if len(indexed) != len(rows) or set(indexed)-set(scope):
        raise ValueError('Duplicate or unexpected candidate film')
    candidates = [indexed.get(f, dict(film=f, error='missing_result')) for f in scope]
    comparison = compare(truth, [dict(film=f, pred=base[f].get('pred', [])) for f in scope],
                         [dict(film=r['film'], pred=r.get('pred', [])) for r in candidates],
                         **corpus['gates'])
    reviewed_truth={f:adjudicated_reference(truth[f],[c for c in corpus['assertions'] if c['film']==f]) for f in scope}
    reviewed=compare(reviewed_truth,[dict(film=f,pred=base[f].get('pred',[])) for f in scope],
                     [dict(film=r['film'],pred=r.get('pred',[])) for r in candidates],**corpus['gates'])
    names = {v['key']: v['name'] for v in corpus['labels']}
    diagnostics, assertions = [], []
    for row, metric in zip(candidates, comparison['films']):
        f = row['film']
        failures = list(metric['failures'])
        if row.get('error') or not row.get('pred'):
            failures.append('incomplete_worker')
        if row.get('sourceSha256') != corpus['films'][f]['sourceSha256']:
            failures.append('source_mismatch')
        raw = [(s['start_sec'], s['end_sec'], names.get(s['label_key'], s['label_key']))
               for s in row.get('raw', [])]
        try:
            initial_errors = error_spans(truth[f], raw)
        except ValueError:
            initial_errors = []
        errors = error_spans(truth[f], row.get('pred', []))
        exact_errors = exact_error_spans(truth[f], row.get('pred', []))
        timing = alignment(truth[f], row.get('pred', []), corpus.get('annotationTiming'))
        cases = [c for c in corpus['assertions'] if c['film'] == f]
        regressions = [c for c in corpus.get('regressionCases', []) if c['film'] == f]
        for e in [*errors, *exact_errors]:
            same = any(s['start'] <= e['start'] and s['end'] >= e['end'] and
                       s['actual'] == e['actual'] for s in initial_errors)
            e['stageHint'] = ('initial_proposal_survived' if same else 'introduced_or_shifted_after_proposal')
            e['evidenceWindow'] = [max(0, e['start']-5), min(truth[f][-1][1], e['end']+5)]
            resolved = resolved_reference_difference(e, cases)
            if resolved:
                e['resolvedByAdjudications'] = resolved
        # Keep exact disagreement visible, but approximate business seconds are
        # not a frame-accurate ground truth. Only matched transitions qualify.
        for e in exact_errors:
            if timing_only_difference(e, timing):
                e['withinAnnotationTolerance'] = True
            if (row.get('sourceSha256') == corpus['films'][f]['sourceSha256']
                    and outside_video(e, truth[f], row,
                        corpus.get('annotationTiming', {}).get('boundaryToleranceSeconds', 0))):
                e['outsideSourceVideo'] = True
        for c in [*cases, *regressions]:
            matched = sum(max(0, min(b, c['end'])-max(a, c['start'])) for a,b,label in row.get('pred', [])
                          if label == c['label'])
            boundary = c.get('person_boundary')
            terminal = c.get('terminal_boundary')
            source_boundary = c.get('source_boundary')
            # Independently reviewed source onsets are millisecond references,
            # not approximate business seconds or a person-only split. Both
            # adjoining labels and their shared boundary must be preserved.
            source_ok = source_boundary is None or any(
                abs(left[1]-source_boundary) <= .001 and
                abs(right[0]-source_boundary) <= .001 and
                left[2] == c['source_before_label'] and right[2] == c['source_after_label']
                for left, right in zip(row.get('pred', []), row.get('pred', [])[1:]))
            # A terminal guard can cover only one frame, shorter than 50ms.
            # Its endpoint and label coverage both need millisecond precision.
            span_tolerance = .001 if source_boundary is not None or terminal is not None else .05
            ok = (matched >= c['end']-c['start']-span_tolerance and source_ok and
                  (boundary is None or any(abs(a-boundary) <= .05 for a,_,_ in row.get('pred', []))) and
                  (terminal is None or bool(row.get('pred')) and abs(row['pred'][-1][1]-terminal) <= .001))
            kind = 'regression' if c in regressions else 'adjudication'
            assertions.append(dict(c, kind=kind, passed=ok, coverage=matched/(c['end']-c['start'])))
            if not ok:
                failures.append(('regression_case:' if kind == 'regression' else 'adjudicated_case:') + c['id'])
        verification = row.get('publication', {}).get('summary', {}).get('frameworkVerification', {})
        auxiliary = list(verification.get('editorial', {}).get('audioConflicts', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='review_membership_unresolved')
                         for p in verification.get('reviewMembership', {}).get('unresolved', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='short_review_unresolved')
                         for p in verification.get('shortReviews', {}).get('unresolved', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='short_review_av_unresolved')
                         for p in verification.get('shortReviewAV', {}).get('unresolved', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='narrator_return_unresolved')
                         for p in verification.get('narratorReturn', {}).get('unresolved', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='offer_tail_unresolved')
                         for p in verification.get('offerTail', {}).get('unresolved', []))
        auxiliary.extend(dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
                              resolution='av_composition_unresolved')
                         for p in verification.get('avComposition', {}).get('unresolved', []))
        diagnostics.append(dict(metric, failures=failures, errors=errors, exactErrors=exact_errors,
            annotationAlignment=timing,
            toleratedBoundaryDifferences=sum(bool(e.get('withinAnnotationTolerance')) for e in exact_errors),
            sourceExtentDifferences=sum(bool(e.get('outsideSourceVideo')) for e in exact_errors),
            unresolvedDifferences=sum(not e.get('resolvedByAdjudications') and
                                      not e.get('withinAnnotationTolerance') and
                                      not e.get('outsideSourceVideo') for e in exact_errors),
            auxiliaryWarnings=auxiliary,
            workerError=row.get('cause') or row.get('message') or row.get('error'),
            source=corpus['films'][f]['file'], evidenceDirectory=f + '/framework-audit',
            nextAction='Read raw, calls, and source evidence at error spans; change one causal rule; rerun controls and full corpus.'))
    full = set(scope) == set(corpus['films'])
    guards = []
    for guard in corpus.get('guardBaselines', []):
        covered = [r for r in guard['rows'] if r['film'] in scope]
        if not covered:
            continue
        keys = {r['film'] for r in covered}
        measured = compare({f:truth[f] for f in scope if f in keys}, covered,
            [dict(film=r['film'], pred=r.get('pred', [])) for r in candidates if r['film'] in keys],
            **corpus['gates'])
        guards.append(dict(name=guard['name'], comparison=measured))
        for metric in measured['films']:
            if 'regression' in metric['failures']:
                next(d for d in diagnostics if d['film'] == metric['film'])['failures'].append(
                    'guard_regression:' + guard['name'])
    reviewed_guards=[]
    for guard in corpus.get('guardBaselines',[]):
        covered=[r for r in guard['rows'] if r['film'] in scope]
        keys={r['film'] for r in covered}
        if not keys: continue
        measured=compare({f:reviewed_truth[f] for f in scope if f in keys},covered,
            [dict(film=r['film'],pred=r.get('pred',[])) for r in candidates if r['film'] in keys],**corpus['gates'])
        reviewed_guards.append(dict(name=guard['name'],comparison=measured))
        for metric in measured['films']:
            if 'regression' in metric['failures']:
                next(d for d in reviewed['films'] if d['film']==metric['film'])['failures'].append(
                    'guard_regression:'+guard['name'])
    for metric in reviewed['films']:
        original=next(d for d in diagnostics if d['film']==metric['film'])
        metric['failures'].extend(f for f in original['failures']
            if f not in ('below_minimum','regression') and not f.startswith('guard_regression:'))
    scoped_pass = all(not d['failures'] for d in diagnostics)
    unresolved = sum(d['unresolvedDifferences'] + len(d['auxiliaryWarnings']) for d in diagnostics)
    # A 90% regression floor is not closure. Tolerance only covers equivalent
    # transitions; tiny real insertions and unexamined differences stay open.
    complete = full and scoped_pass and unresolved == 0
    return dict(schema='framework-eval-report-v1', scopedPassed=scoped_pass,
        regressionPassed=full and scoped_pass, adoptionPassed=complete, repairComplete=complete,
        unresolvedItems=unresolved, fullCorpus=full, evaluated=len(scope), corpusSize=len(corpus['films']),
        annotationTiming=corpus.get('annotationTiming', dict(id='exact-reference', boundaryToleranceSeconds=0)),
        toleratedBoundaryDifferences=sum(d['toleratedBoundaryDifferences'] for d in diagnostics),
        sourceExtentDifferences=sum(d['sourceExtentDifferences'] for d in diagnostics),
        candidateMean=comparison['candidate_mean'], baselineMean=comparison['baseline_mean'],
        adjudicatedEvaluation=dict(policy='explicit-owner-overlay-v1',candidateMean=reviewed['candidate_mean'],
            baselineMean=reviewed['baseline_mean'],scopedPassed=all(not f['failures'] for f in reviewed['films']),
            films=reviewed['films'],guardBaselines=reviewed_guards,
            note='Parallel owner-adjudicated score; original gold, raw scores and strict adoption gates remain unchanged.'),
        films=diagnostics, assertions=assertions, guardBaselines=guards,
        limitation='Historical development regression corpus; exact replay tests algorithm changes, not fresh-model stability or unseen generalization.')


def write_report(output, corpus, baseline, rows, scope, calls):
    result = report(corpus, baseline, rows, scope)
    result['usage'] = ledger(calls)
    manifest = output/'manifest.json'
    metadata = json.loads(manifest.read_text()) if manifest.is_file() else {}
    result['mediaMode'] = metadata.get('mediaMode', 'fresh media')
    invalid = ('code_changed_during_run' if metadata.get('codeChangedDuringRun') else
               'evaluation_interrupted' if metadata.get('interruptedBy') else None)
    if invalid:
        result.update(adoptionPassed=False, scopedPassed=False, regressionPassed=False,
                      repairComplete=False, invalidReason=invalid)
        if 'originalEvaluation' in result:
            result['originalEvaluation'].update(adoptionPassed=False,scopedPassed=False,
                regressionPassed=False,repairComplete=False,invalidReason=invalid)
    (output/'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    lines = ['# 框架评测', '', f"采用门禁：{'PASS' if result['adoptionPassed'] else 'FAIL'}；范围 {len(scope)}/{len(corpus['films'])}。",
             f"基础回归门槛：{'PASS' if result['regressionPassed'] else 'FAIL'}；尚未闭合差异/辅助分歧：{result['unresolvedItems']} 项。",
             f"逐片等权均值：{result['baselineMean']:.2%} → {result['candidateMean']:.2%}。", '',
             f"原整秒逐秒分数保留；边界容差 ±{result['annotationTiming']['boundaryToleranceSeconds']} 秒，"
             f"{result['toleratedBoundaryDifferences']} 处同类转场偏移单列为标注时间差。容差不证明原片切点精度。", '',
             '| 样片 | 基线 | 候选 | 变化 | 未通过项 |', '|---|---:|---:|---:|---|']
    for d in result['films']:
        lines.append(f"| {d['film']} | {d['baseline']:.2%} | {d['candidate']:.2%} | {d['delta']:+.2%} | {', '.join(d['failures']) or '通过'} |")
    if 'referenceCalibration' in result:
        original=result['originalEvaluation'];calibration=result['referenceCalibration']
        lines += ['',f"当前采用校准历史回归基准 `{calibration['id']}`：有效用户裁定及"
                  f"{calibration['sourceCorrectionCount']} 处已审核源切点。上表为校准后的分数及门禁。",
                  f"原业务整秒均值 {original['candidateMean']:.2%}，原标门禁 "
                  f"{'PASS' if original['adoptionPassed'] else 'FAIL'}、原标未闭合 {original['unresolvedItems']} 项，"
                  '完整保存在 report.json 的 originalEvaluation；仅作历史诊断，不阻断已核实的校准结果。',
                  '原业务时间轴保持不变；逐片门槛、固定历史基线、精确源/人物切点、来源完整性和缺陷保护继续验收。',
                  '本次 PASS 仅指已校准历史回归；多轮全新推理稳定性与独立未见样片仍待验证，不授予部署资格。']
    else:
        reviewed=result['adjudicatedEvaluation']
        lines += ['',f"另列明确裁定后的逐片等权均值：{reviewed['candidateMean']:.2%}；"
                  f"同门槛范围检查：{'PASS' if reviewed['scopedPassed'] else 'FAIL'}。原标分数及严格采用状态不替换。",
                  '裁定后检查仍包含相同的逐片门槛、历史基线退化、来源完整性、裁定及缺陷保护；不是删去错误秒数。']
    warnings = sum(len(d.get('auxiliaryWarnings', [])) for d in result['films'])
    if invalid:
        lines += ['', '运行无采用资格：' + invalid + '。']
    if metadata.get('mediaCacheRoots'):
        lines += ['', '本轮使用经离线重建认证的固定媒体；变化请求仍重新生成并留档。'
                  '这验证同一分类代码的完整流程，不代表本轮重新编码了所有媒体或完成新的盲测。']
    lines += ['', f'辅助证据分歧：{warnings} 处，保留在修复队列；其中声音不确定不作为外来旁白的已证事实。',
              f"另有 {result['sourceExtentDifferences']} 处业务整秒尾点超出原片视频末帧，单列 sourceExtentDifferences；原分数不变，真实缺帧不豁免。",
              '逐秒差异、裁定边界、阶段线索和原片窗口见 report.json。阶段线索不是未经核验的根因结论。',
              '本集合已用于开发，不是盲测；回放不是新模型稳定性验证。新增和失败调用均见 calls.json；缺失用量不按零费用处理。']
    (output/'report.md').write_text('\n'.join(lines)+'\n')
    from .framework_failure_queue import write_queue
    write_queue(output, result, rows)
    return result
