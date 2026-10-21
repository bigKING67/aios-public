"""Attach a source-isolated quote without manufacturing continuous duration.

Existing interview and independently qualified demonstration boundaries are
immutable anchors. The observer reports source relations, not new categories.
"""
import json

from .framework_review_membership import supported_core

POLICY = 'framework-isolated-attachment-v1'
PROMPT = '''只核对指定A/T/B的来源关系，不重新划整片框架，不给实拍/混剪类别或左右归属。
A与B是上游已分别核验的主体单元，T是夹在中间的短段。本题不允许因为采访里多个人轮换，就将已划定采访单元重新解释成一般素材混剪；但必须核对T是否真正参与这次采访。
逐项观察：
1. T是否只有一个独立人物的产品推荐？one_quote=yes仅限一位人物的一段推荐；产品广告、多个人物、多个独立来源、无法确认均不能答yes。记录target_evidence中的具体人物、动作和台词。
2. 完整观看指定演示单元D，T的人物/素材是否在D内出现过？live_source_relation=new_source表示与D的所有演示人物/素材不同；returning_source表示是D中出现过的人物或素材的返回，不能仅看D最后一人；看不清选uncertain。给出source_evidence的时间依据。
3. 核对采访单元I与T：interview_relation=separate_source要求T不是I中的受访者/提问应答或同一次采访的延续；participant表示参与同一次采访；uncertain表示证据不足。看具体现场与采访关系，不以室内/室外、明星身份、角标、水印单独判断。写出interview_evidence。
不要把同产品、相邻位置当成同源；不要因为人物不同就把短段的上层归属判断为混剪。只给事实，不能确定就保留uncertain。'''


def schema():
    fields = {k: {'type': 'string'} for k in ('target_evidence', 'source_evidence', 'interview_evidence')}
    for key, values in {
        'one_quote': ['yes', 'no', 'uncertain'],
        'live_source_relation': ['new_source', 'returning_source', 'uncertain'],
        'interview_relation': ['separate_source', 'participant', 'uncertain'],
    }.items():
        fields[key] = {'type': 'string', 'enum': values}
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def plan(segments, claims):
    targets = []
    for i in range(1, len(segments)-1):
        left, target, right = segments[i-1:i+2]
        if (target['label_key'] != 'mixed_voiceover'
                or not 500 <= target['end_ms']-target['start_ms'] < 10000
                or left['end_ms'] != target['start_ms'] or target['end_ms'] != right['start_ms']
                or {left['label_key'], right['label_key']} != {'live_demo', 'street_interview'}):
            continue
        live, interview = (left, right) if left['label_key'] == 'live_demo' else (right, left)
        if not supported_core(live, claims) or interview['end_ms']-interview['start_ms'] < 10000:
            continue
        targets.append(dict(index=i, start_ms=target['start_ms'], end_ms=target['end_ms'],
            live_start_ms=live['start_ms'], live_end_ms=live['end_ms'],
            interview_start_ms=interview['start_ms'], interview_end_ms=interview['end_ms']))
    if len(targets) > 4:
        raise ValueError('Isolated attachment evidence budget exceeded')
    return targets


def validate(proof):
    fields = schema()['properties']
    if (not isinstance(proof, dict) or set(proof) != set(fields)
            or any(not isinstance(v, str) or not v.strip() for v in proof.values())
            or any(proof[k] not in f['enum'] for k, f in fields.items() if 'enum' in f)):
        raise ValueError('Invalid isolated attachment evidence')


def accepted(proof):
    validate(proof)
    return (proof['one_quote'] == 'yes' and proof['live_source_relation'] == 'new_source'
            and proof['interview_relation'] == 'separate_source')


def question(target):
    return PROMPT + '\n原片秒数：' + json.dumps({
        'T': [target['start_ms']/1000, target['end_ms']/1000],
        'D': [target['live_start_ms']/1000, target['live_end_ms']/1000],
        'I': [target['interview_start_ms']/1000, target['interview_end_ms']/1000]})


def verify(segments, proxy, work, request, *, claims):
    targets = plan(segments, claims)
    result, observations, corrections = [dict(s) for s in segments], [], []
    for target in targets:
        response = request(question(target), schema(), proxy=proxy, boards=[], fps=2,
                           thinking='enabled', reasoning_effort='medium')
        proof = response.payload
        validate(proof)
        observations.append(dict(target, payload=proof))
        if accepted(proof):
            result[target['index']].update(label_key='live_demo',
                reason='孤立推荐附属归属（不累计连续时长）：' + proof['target_evidence'])
            corrections.append(dict(target, payload=proof))
    receipt = dict(policy=POLICY, observations=observations, corrections=corrections)
    work.mkdir(parents=True, exist_ok=True)
    (work/'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    return result, receipt


def supports(segment, segments, receipt):
    for proof in receipt.get('isolatedAttachment', {}).get('corrections', []):
        if (segment['start_ms'] < proof['start_ms'] or segment['end_ms'] > proof['end_ms']
                or not accepted(proof['payload'])):
            continue
        # An attachment cannot qualify another attachment; only original claims
        # overlapping the original live anchor can witness its continued validity.
        if any(supported_core(dict(s, start_ms=max(s['start_ms'], proof['live_start_ms']),
                    end_ms=min(s['end_ms'], proof['live_end_ms'])), receipt['liveClaims'])
               for s in segments):
            return True
    return False


def verify_final(segments, proxy, work, tick, provider, deadline, account_usage, receipt):
    from .segment_suggestion_provider import SuggestionError, call_with_ticks

    def request(prompt, output_schema, **inputs):
        tick()
        try:
            response = call_with_ticks(lambda: provider.review(prompt, output_schema, **inputs), tick, deadline)
        except SuggestionError as error:
            error.usage = account_usage(error.usage)
            raise
        account_usage(response.usage)
        receipt['calls'] += 1
        receipt['responseIds'].append(response.response_id)
        return response

    result, receipt['isolatedAttachment'] = verify(segments, proxy, work, request,
                                                  claims=receipt['liveClaims'])
    # No later boundary/merge pass may erase the original physical cuts.
    return result
