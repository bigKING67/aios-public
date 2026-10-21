"""Check the scope of offer blocks, without inferring labels from their position."""
import json

POLICY = 'framework-promotion-v5'
MAX_TARGETS = 16
ROLES = ('independent_offer', 'dependent_offer_content', 'recommendation_material', 'own_review', 'uncertain')
PROMPT = '''核对指定区间在整片中的购买机制归属，只回答内容证据，不重新切分时间。
independent_offer：独立展开购买条件/价格/买赠/活动利益，形成购买机制板块。
dependent_offer_content：本段不独立展开购买条件，只为另一购买机制做引导/价格铺垫或引用那一活动。linked_index 指向被引用的独立机制，程序再按实际相邻关系确定是否归入机制；不能跨其他内容板块延长机制。
recommendation_material：推荐/功效/使用展示段落中的产品、人物或引用素材；顺带提到直播间、购买或福利不等于独立机制。必须核对真实画面，不把产品堆叠猜成赠品阵列，不把普通文字猜成周年活动。
own_review：原测评主讲人自己测评过程中的介绍或收尾。
uncertain：无法核实。片中/片尾、时长、角标和画面是否有人都不能单独决定角色。片中也能有独立机制。逐项给出可见内容/台词事实；不要把邻段证据冒充目标证据。
dependent_offer_content 必须用 linked_index 指向本次目标中另一实际独立的购买机制（不能指向自己）；其他角色 linked_index=-1。'''


def plan(segments, windows=()):
    selected = {i for i, s in enumerate(segments) if s['label_key'] == 'promotion'}
    for i in tuple(selected):
        for j in (i-1, i+1):
            if (0 <= j < len(segments) and segments[j]['label_key'] == 'mixed_voiceover'
                    and segments[j]['end_ms']-segments[j]['start_ms'] <= 12000
                    and min(segments[i]['end_ms'], segments[j]['end_ms']) ==
                        max(segments[i]['start_ms'], segments[j]['start_ms'])):
                selected.add(j)
    if not selected:
        # The first pass can omit offers entirely. Observed packaging chooses
        # a question, never a label; position, stacking and price alone are not
        # promotion authority. Existing offer/neighbor requests remain exact.
        for i, segment in enumerate(segments):
            if segment['label_key'] != 'mixed_voiceover':
                continue
            if any(e.get('action') == 'packaging_display' and e['kind'] == 'independent_insert'
                   and min(e['end_ms'],segment['end_ms']) > max(e['start_ms'],segment['start_ms'])
                   for w in windows for e in w['events']):
                selected.add(i)
    if len(selected) > MAX_TARGETS:
        raise ValueError('Promotion audit target budget exceeded')
    return [dict(index=i, start_ms=segments[i]['start_ms'], end_ms=segments[i]['end_ms'])
            for i in sorted(selected)]


def schema():
    fields = {'index': {'type': 'integer'}, 'role': {'type': 'string', 'enum': list(ROLES)},
              'linked_index': {'type': 'integer'}, 'evidence': {'type': 'string'}}
    return {'type': 'object', 'additionalProperties': False, 'required': ['items'],
            'properties': {'items': {'type': 'array', 'items': {'type': 'object',
                'additionalProperties': False, 'required': list(fields), 'properties': fields}}}}


def apply(segments, targets, payload):
    items = payload.get('items', [])
    expected = {t['index'] for t in targets}
    if (len(items) != len(expected) or any(type(s.get('index')) is not int for s in items)
            or {s['index'] for s in items} != expected):
        raise ValueError('Incomplete promotion evidence')
    observed = {s['index']: s for s in items}
    output, corrections = [dict(s) for s in segments], []
    for i, evidence in observed.items():
        role, link = evidence.get('role'), evidence.get('linked_index')
        if role not in ROLES or role == 'uncertain' or not evidence.get('evidence', '').strip():
            raise ValueError('Unresolved promotion ownership')
        if type(link) is not int or (role != 'dependent_offer_content' and link != -1):
            raise ValueError('Invalid promotion link')
        if role == 'dependent_offer_content':
            if link == i or observed.get(link, {}).get('role') != 'independent_offer':
                raise ValueError('Dependent promotion lacks a verified offer')
        before = segments[i]['label_key']
        adjacent = (role == 'dependent_offer_content' and abs(link-i) == 1 and
                    min(segments[i]['end_ms'], segments[link]['end_ms']) ==
                    max(segments[i]['start_ms'], segments[link]['start_ms']))
        after = ('promotion' if role == 'independent_offer' or adjacent else
                 'mixed_voiceover' if role == 'dependent_offer_content' else
                 'mixed_voiceover' if role == 'recommendation_material' else before)
        if before != after:
            output[i].update(label_key=after, reason='购买机制归属核验：' + evidence['evidence'])
            corrections.append(dict(index=i, before=before, after=after, role=role))
    return output, corrections


def verify(segments, proxy, work, request, *, windows=(), source=None, env=None, tick=None):
    targets = plan(segments, windows)
    receipt = dict(policy=POLICY, targets=targets, corrections=[])
    if not targets:
        return segments, receipt
    work.mkdir(parents=True, exist_ok=True)
    # No proposed labels, source filenames or reference annotations in this request.
    prompt = PROMPT + '\n目标（原片秒）：' + json.dumps([
        dict(index=t['index'], start=t['start_ms']/1000, end=t['end_ms']/1000) for t in targets])
    result = request(prompt, schema(), proxy=proxy, fps=1, thinking='enabled', reasoning_effort='low')
    receipt.update(payload=result.payload, responseId=result.response_id, usage=result.usage)
    (work/'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    output, receipt['corrections'] = apply(segments, targets, result.payload)
    from . import framework_offer_intro
    if framework_offer_intro.plan(segments, result.payload, windows):
        if source is None or env is None or tick is None:
            raise ValueError('Multi-source offer introduction requires original source')
        output, receipt['offerIntroduction'] = framework_offer_intro.verify(
            segments, output, result.payload, windows, source, work/'offer-introduction', env, tick, request)
        restored = {p['index'] for p in receipt['offerIntroduction']['corrections']}
        receipt['corrections'] = [p for p in receipt['corrections'] if p['index'] not in restored]
    from . import framework_offer_bridge
    groups = framework_offer_bridge.plan(segments, result.payload)
    if groups:
        if source is None or env is None or tick is None:
            raise ValueError('Enclosed offer context requires original source')
        output, receipt['enclosedOffers'] = framework_offer_bridge.verify(
            segments,output,result.payload,source,work,env,tick,request)
    (work/'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    return output, receipt
