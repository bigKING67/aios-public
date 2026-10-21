"""Verify an offer link when its alleged introduction contains multiple sources."""
import json

from .segment_suggestion_provider import run_media

POLICY = 'framework-offer-intro-v1'
PROMPT = '''核对真实相邻的A和B是否属于同一个具体购买活动。不要识别姓名，不用角标，不重新给切点。
前序观察认为A可能是B的活动引导；这只是待核实线索。A内出现多个不同录制的出镜内容，需要重新核对来源与购买利益的实际衔接。
先分别写出A、B真实可听到的台词与可见动作。same_offer_introduction=例如A的旧价格/优惠悬念由B直接接续说明，或A明确引用B正在展开的同一次具体活动，二者确实共同完成购买规则或利益；多个人物本身不妨碍成立。
separate_recommendation= A是多个来源的独立推荐/催买素材组合，B另起本次活动说明；两段都说买、便宜、福利、同产品或导向同一个直播间，不足以证明同一次具体活动。也不能仅因A有优惠词就归入B。
价格字卡可以是同一活动的引导，不能因不是主播画面就排除；多个素材也可能共同说明同一活动。必须说明真实衔接依据，不能只复述选项。证据不足填uncertain。'''


def schema():
    fields = {k: {'type': 'string'} for k in ('a_content', 'b_content', 'link_evidence')}
    fields['relationship'] = {'type': 'string', 'enum': ['same_offer_introduction', 'separate_recommendation', 'uncertain']}
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def validate(value):
    if (not isinstance(value, dict) or set(value) != set(schema()['properties'])
            or any(not isinstance(v, str) or not v.strip() for v in value.values())
            or value['relationship'] not in schema()['properties']['relationship']['enum']
            or value['relationship'] == 'uncertain'):
        raise ValueError('Unresolved multi-source offer introduction')


def plan(segments, payload, windows):
    observed = {v['index']: v for v in payload['items']}
    targets = []
    for i, item in observed.items():
        link = item['linked_index']
        if (item['role'] != 'dependent_offer_content' or link != i+1
                or observed.get(link, {}).get('role') != 'independent_offer'
                or segments[i]['label_key'] != 'mixed_voiceover'
                or segments[i]['end_ms'] != segments[link]['start_ms']):
            continue
        a, b = segments[i]['start_ms'], segments[i]['end_ms']
        distinct = any(len({e.get('person') for e in w['events']
                           if e['kind'] == 'presenter' and e.get('person')
                           and min(e['end_ms'], b) > max(e['start_ms'], a)}) >= 2
                       for w in windows if w['start'] <= a and w['end'] >= b)
        if distinct:
            targets.append(dict(index=i, linked_index=link, start_ms=a,
                                split_ms=b, end_ms=segments[link]['end_ms']))
    if len(targets) > 4 or sum(t['end_ms']-t['start_ms'] for t in targets) > 120000:
        raise ValueError('Offer introduction context budget exceeded')
    return targets


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    a, b = target['start_ms'], target['end_ms']
    clip = work/'clip.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(a/1000), '-i', str(source),
               '-t', str((b-a)/1000), '-vf', 'scale=-2:480', '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '26', '-c:a', 'aac', str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('Offer introduction extraction failed')
    prompt = PROMPT + '\n本裁片分界秒数：' + json.dumps([0, (target['split_ms']-a)/1000, (b-a)/1000])
    response = request(prompt, schema(), proxy=clip, fps=2, thinking='enabled', reasoning_effort='low')
    observation = dict(target, payload=response.payload, usage=response.usage, responseId=response.response_id)
    (work/'evidence.json').write_text(json.dumps(observation, ensure_ascii=False, indent=2))
    validate(response.payload)
    return observation


def apply(classified, targets, observations):
    if len(targets) != len(observations):
        raise ValueError('Incomplete offer introduction evidence')
    result, corrections = [dict(s) for s in classified], []
    for target, observation in zip(targets, observations):
        if any(observation.get(k) != v for k, v in target.items()):
            raise ValueError('Offer introduction evidence bound to wrong target')
        i, link = target['index'], target['linked_index']
        if (not 0 <= i < link < len(result) or link != i+1
                or result[i]['start_ms'] != target['start_ms'] or result[i]['end_ms'] != target['split_ms']
                or result[link]['start_ms'] != target['split_ms'] or result[link]['end_ms'] != target['end_ms']
                or result[i]['label_key'] != 'promotion' or result[link]['label_key'] != 'promotion'):
            raise ValueError('Stale offer introduction target')
        proof = observation['payload']
        validate(proof)
        if proof['relationship'] == 'separate_recommendation':
            result[i].update(label_key='mixed_voiceover', reason='活动前独立推荐素材核验：'+proof['link_evidence'])
            corrections.append(dict(target, rule='separate_recommendation_before_offer'))
    return result, corrections


def verify(original, classified, payload, windows, source, work, env, tick, request):
    targets = plan(original, payload, windows)
    observations = [observe(source, t, work/str(i), env, tick, request) for i, t in enumerate(targets)]
    result, corrections = apply(classified, targets, observations)
    return result, dict(policy=POLICY, targets=targets, observations=observations, corrections=corrections)
