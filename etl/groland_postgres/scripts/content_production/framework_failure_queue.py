"""Create reproducible repair work items without feeding gold into inference."""
import json


def write_queue(output, report, rows):
    indexed = {r['film']: r for r in rows}
    queue = []
    for metric in report['films']:
        errors = metric.get('exactErrors', metric['errors'])
        if not metric['failures'] and not errors and not metric.get('auxiliaryWarnings'):
            continue
        film = metric['film']
        row = indexed.get(film, {})
        work = output/film
        calls_path = work/'calls.json'
        calls = json.loads(calls_path.read_text()) if calls_path.is_file() else []
        worker_error = metric['workerError'] or ''
        code = row.get('code')
        provider_failure = code in ('provider_incomplete','provider_error','provider_http_error') or any(
            term in worker_error for term in ('HTTP ', 'ConnectionError', '模型调用失败', 'provider unavailable'))
        incomplete=bool(row.get('error') or 'incomplete_worker' in metric['failures'])
        differences = [e for e in errors if e.get('resolvedByAdjudications')]
        timing_differences = [e for e in errors if e.get('withinAnnotationTolerance')]
        extent_differences = [e for e in errors if e.get('outsideSourceVideo')]
        actionable = [e for e in errors if not e.get('resolvedByAdjudications')
                      and not e.get('withinAnnotationTolerance') and not e.get('outsideSourceVideo')]
        category = ('missing_worker_result' if not row and incomplete else
                    'runtime_or_provider' if provider_failure else
                    'budget_exhausted' if 'budget' in worker_error.lower() else
                    'evidence_contract' if row.get('error') else
                    'classification_or_boundary' if actionable else
                    'auxiliary_evidence' if metric.get('auxiliaryWarnings') else
                    'annotation_timing' if timing_differences else
                    'annotation_beyond_video' if extent_differences else 'adjudicated_reference_difference')
        evidence = sorted(str(p.relative_to(output)) for p in (work/'framework-audit').rglob('*.json'))
        priority=0 if incomplete else 1 if metric['failures'] else 2
        spans=actionable if not incomplete else []
        queue.append(dict(film=film, category=category, status='needs_diagnosis', priority=priority,
            adoptionBlocking=bool(metric['failures'] or actionable or metric.get('auxiliaryWarnings')),
            errorSeconds=round(sum(e['end']-e['start']for e in spans), 6),
            source=row.get('sourceFile', metric['source']), sourceSha256=row.get('sourceSha256'),
            workerError=worker_error, failedChecks=metric['failures'],
            errorSpans=spans, referenceDifferences=differences,
            annotationTimingDifferences=timing_differences,
            sourceExtentDifferences=extent_differences,
            auxiliaryWarnings=metric.get('auxiliaryWarnings', []), failureLocation=row.get('failureLocation', []),
            assertions=[c for c in report['assertions'] if c['film']==film and not c['passed']],
            run=str((work/'run.json').relative_to(output)), evidence=evidence,
            lastRequestHash=calls[-1].get('requestHash') if calls else None,
            failedRequests=[dict(index=i, requestHash=c.get('requestHash'), code=c.get('code'),
                                 error=c.get('error')) for i,c in enumerate(calls) if c.get('error')],
            diagnosticOnly=True, requiredChecks=['original_media', 'stage_before_and_after',
                'minimal_causal_change', 'focused_regression', 'fixed_full_corpus_and_guards']))
    queue.sort(key=lambda item:(item['priority'],-item['errorSeconds'],item['film']))
    policy=report.get('referenceCalibration',{}).get('id','original-reference')
    artifact = dict(schema='framework-repair-queue-v1', items=queue,referencePolicy=policy,
        originalReferenceDiagnostics='report.json:originalEvaluation' if 'originalEvaluation' in report else None,
        rules=['Do not change gold to make a candidate pass.',
            'The frozen corpus is for scoring and diagnosis only, never inference input.',
            'A stage hint is not a proven root cause.',
            'Reuse identical recorded requests; keep failures and paid usage.',
            'Never adopt or deploy from a scoped or incomplete run.'])
    (output/'repair-queue.json').write_text(json.dumps(artifact,ensure_ascii=False,indent=2))
    lines=['# 框架修复工作单','',
        '先核对原片和阶段证据，再写可证伪的原因；修改通用逻辑后跑问题样片、保护样片及同版本全量。',
        '门槛通过后的残余差异仍列入队列；业务标注差异须留证据，不能直接改答案。','',
        '已被最新明确裁定覆盖的原答案差异单列 referenceDifferences；原答案评分和全部门禁仍保留，不据此反向修改正确结果。','',
        '局部类别转场按时间顺序一一匹配，且整段差异由容差内边界偏移解释时，单列 annotationTimingDifferences；不跨插段或漏段豁免，不移动预测切点。','',
        '| 优先级 | 样片 | 问题类型 | 已产出错误秒数 | 门禁阻断 | 运行证据 |',
        '|---|---|---|---:|---|---|']
    if 'referenceCalibration' in report:
        lines[2:2]=['当前工作单按已审核的校准参考验收；原业务整秒差异完整保存在 '
                    'report.json 的 originalEvaluation，不反向修正已核实的源切点。','']
    for item in queue:
        lines.append(f"| {item['priority']} | {item['film']} | {item['category']} | {item['errorSeconds']} | "
                     f"{'是' if item['adoptionBlocking'] else '否'} | [run]({item['run']}) |")
    lines+=['','具体错误窗口、失败请求、因果栈位置、原片 SHA 和阶段证据见 [repair-queue.json](repair-queue.json)。',
        '0=处理未完成，1=准确率/退化/裁定未通过，2=门禁已通过但仍有原答案差异或辅助证据分歧。',
        '本工作单只提供诊断任务；没有自动修改代码、采用候选或部署。']
    (output/'repair-brief.md').write_text('\n'.join(lines)+'\n')
    return artifact
