"""Cost-bounded Lite verification: editorial context + measured source continuity."""
import json
import re

from .framework_segment_evidence import classify
from .framework_shot_evidence import continuous_runs
from .framework_face_presence import reconcile

POLICY = 'framework-shot-evidence-v1'
ROLE_CODES = ('presenter','own_comparison','hands_product','product_ad',
              'borrowed_recommendation','interview','promotion','unknown')
LINK_CODES = ('same_person_visible','matching_clothing_or_setting','none')
OBSERVER_PROMPT = '''每张拼图有多个编号画面，#N对应i=N。只记录逐格可见事实，不判实拍/混剪，不计时。每个i恰好一次。
每条只输出i,p,r,l四个字段。i=编号；p=脸可见时给同一人稳定编号P1/P2，只有手、产品或字卡必须为空字符串。本人妆前妆后、发型/发箍、光线或场景变化不自动换人。
r整数：0人出镜，1本人前后对比，2只有手和产品，3独立产品宣传/成分动画，4明确明星借用推荐，5采访，6福利促销，7未知。
l整数：0脸可见，即使此人与上一格不同；1不见脸但有具体的衣着/环境匹配，确认是主讲人的操作特写；2没有这种可见联系。同款产品、包装、相近肤色、镜头相邻不能证明同源；换到不同独立拍摄环境且没有匹配的袖口或场景时填2。
只输出四个结构化字段，不输出解释或字幕复述。不得把风格精致、无口播当作人物不连续。
r=4必须是该出镜人物本人的借用推荐来源。某某同款只说明产品关联，不等于当前主讲人就是那个明星；普通作者水印、演员/品牌推荐官/代言人身份字幕不证明借用。'''
MARKER_PROMPT = '''\n另在markers里记录实际看见的来源文字，每个连续来源区间只记一条：text逐字抄录；start_i/end_i是起止编号（含两端）；kind为source（当前出镜人的借用推荐来源，如@明星某某、某某推荐、某某直播回放）、identity（演员/品牌推荐官/代言人身份）、association（产品某某同款/普通作者水印）。同一个标记不要每帧重复，最多8条，没有文字则空数组。不能仅凭认识明星的脸或认为是广告而编造文字。'''
CONTEXT_PROMPT = '''结合全片上下文，只判断指定内容单元的编辑角色，不计时，不输出实拍/混剪标签。unit_id必须恰好覆盖给定列表。
kind：demonstration=本人独立演示或讲解，一个人连续上脸/展示效果即可，不要求口播或完整实验；自己的妆前妆后、发箍/发型/场景变化、特写/对比仍属同一测评，收尾顺带讲规格价格也保留。
short_insert=多来源串接中的十秒左右短推荐/效果引用，例如不同女生各8–12秒轮流；不能只因短、无口播或换机位就这样判。
borrowed_recommendation=有明确明星/达人借用推荐来源，无论时长。
independent_promotion=转为独立促销板块，而非原测评主讲人顺带介绍价格。uncertain=证据不足。
借用推荐须与当前出镜人物本人对应；“某某同款”产品关联、普通作者水印、演员/品牌推荐官/代言人身份字幕不能据此认定整个主讲测评是借用推荐。
evidence每条最多24个汉字。区间表是待检查数据，不是标准答案。'''
KINDS = {'demonstration', 'short_insert', 'borrowed_recommendation', 'independent_promotion', 'uncertain'}


def _array_schema(name, fields):
    return {'type': 'object', 'additionalProperties': False, 'required': [name], 'properties': {
        name: {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                      'required': list(fields), 'properties': fields}}}}


def observer_schema():
    schema = _array_schema('shots', {'i': {'type': 'integer'}, 'p': {'type': 'string'},
        'r': {'type': 'integer', 'enum': list(range(len(ROLE_CODES)))},
        'l': {'type': 'integer', 'enum': list(range(len(LINK_CODES)))}})
    schema['required'].append('markers')
    schema['properties']['markers'] = _array_schema('markers', {
        'text': {'type':'string'}, 'start_i':{'type':'integer'}, 'end_i':{'type':'integer'},
        'kind':{'type':'string','enum':['source','identity','association']}})['properties']['markers']
    return schema


def decode_observations(payload):
    """Compact wire facts avoid verbose explanations/JSON truncation on Lite.

    Expanded facts remain readable for saved evaluation receipts and replay.
    """
    values = payload.get('shots') if isinstance(payload, dict) else None
    if not isinstance(values,list):
        raise ValueError('Invalid visual response')
    if any(isinstance(value,dict) and 'i' in value for value in values) and 'markers' not in payload:
        raise ValueError('Missing source marker observations')
    result = []
    for value in values:
        if not isinstance(value,dict):
            raise ValueError('Invalid visual fact')
        if 'index' in value:
            if not {'visible_person_id','role','visible_link'} <= set(value):
                raise ValueError('Incomplete visual fact')
            result.append(value)
            continue
        if (set(value) != {'i','p','r','l'} or type(value['r']) is not int or type(value['l']) is not int
                or not 0 <= value['r'] < len(ROLE_CODES) or not 0 <= value['l'] < len(LINK_CODES)):
            raise ValueError('Invalid compact visual fact')
        result.append(dict(index=value['i'],visible_person_id=value['p'],
                           role=ROLE_CODES[value['r']],visible_link=LINK_CODES[value['l']]))
    return {'shots':result,'markers':payload.get('markers',[])}


def borrowed_frames(frames, observations):
    """A model's celebrity guess is not source evidence; bind actual quoted text."""
    markers = observations.get('markers')
    if not isinstance(markers,list) or len(markers) > 8:
        raise ValueError('Invalid source marker evidence')
    indices, borrowed = {f['index'] for f in frames}, set()
    for marker in markers:
        if not isinstance(marker,dict):
            raise ValueError('Invalid source marker')
        a,b,kind,text = (marker.get(k) for k in ('start_i','end_i','kind','text'))
        if (type(a) is not int or type(b) is not int or a not in indices or b not in indices or a > b
                or kind not in {'source','identity','association'} or not isinstance(text,str) or not text.strip()):
            raise ValueError('Invalid source marker scope')
        # These words describe a role or product association, even if a model
        # mistakenly calls the caption a source. They do not identify footage.
        identity = any(word in text for word in ('推荐官','代言人','品牌大使','实力派演员','同款'))
        explicit_recommendation = bool(re.fullmatch(r'.{1,16}(?:推荐|小技巧)', text.strip()))
        attribution = ('@' in text or '直播回放' in text or explicit_recommendation)
        # Literal recommendation wording has priority over a contradictory
        # "identity" enum supplied by the same model.
        if (kind == 'source' or explicit_recommendation) and attribution and not identity:
            borrowed.update(i for i in indices if a <= i <= b)
    return borrowed


def context_schema():
    return _array_schema('units', {'unit_id': {'type': 'integer'},
        'kind': {'type': 'string', 'enum': sorted(KINDS)}, 'evidence': {'type': 'string'}})


def plan(payload, label_keys, duration_ms):
    # Preserve the proposal's intent through provisional source demotions.
    # A later source audit may disprove a falsely copied "same product" marker.
    proposals = payload.get('segments') if isinstance(payload,dict) else None
    if not isinstance(proposals,list) or any(not isinstance(item,dict) for item in proposals):
        raise ValueError('Invalid framework proposal')
    annotated = {'segments':[dict(item,_proposed_live=item.get('label_key') == 'live_demo')
                             for item in proposals]}
    normalized, corrections = classify(annotated, label_keys, duration_ms)
    items, selected, context, ranges = normalized['segments'], [], [], []
    proposed_live = {index for index,item in enumerate(items) if item.pop('_proposed_live')}
    for index, item in enumerate(items):
        start, end = round(item['start_sec'] * 1000), min(round(item['end_sec'] * 1000), duration_ms)
        tail = (index == len(items) - 1 and index > 0 and item['label_key'] == 'promotion'
                and item['same_person_as_previous'] and items[index - 1]['visual_kind'] == 'single_presenter')
        unverified_montage = (item['label_key'] in {'mixed_voiceover','live_demo'}
                              and item['visual_kind'] in ('montage', 'borrowed_endorsement')
                              and end - start > 10000)
        if item['visual_kind'] != 'single_presenter' and not tail and not unverified_montage:
            continue
        selected.append(index)
        # A short anchor verifies the last presenter's identity across a price wrap-up.
        ranges.append((max(0, start - 2000) if tail else max(0,start - 250), min(duration_ms,end + 250)))
        if end - start <= 13000 or item['label_key'] != 'live_demo' or item['endorsement_marker'].strip():
            context.append({'unit_id': index, 'start_sec': item['start_sec'], 'end_sec': item['end_sec']})
    return {'items': items, 'selected': selected, 'context': context, 'ranges': ranges,
            'proposedLive': proposed_live,
            'preAuditCorrections': corrections}


def observation_prompt(frames):
    positive = [f['index'] for f in frames if f.get('face_boxes')]
    return (OBSERVER_PROMPT + MARKER_PROMPT + '\n本地检测发现较大人脸的index（仍需逐图核对；未列出不代表无人脸）：'
            + json.dumps(positive) + '\n必须输出全部i：' + ','.join(str(f['index']) for f in frames))


def context_prompt(context):
    return CONTEXT_PROMPT + '\n待核对单元：' + json.dumps(context, ensure_ascii=False)


def _context_map(plan, payload):
    values = payload.get('units') if isinstance(payload, dict) else None
    expected = {unit['unit_id'] for unit in plan['context']}
    if not isinstance(values, list) or len(values) != len(expected):
        raise ValueError('Editorial context coverage is incomplete')
    result = {}
    for value in values:
        if not isinstance(value, dict):
            raise ValueError('Invalid editorial context')
        index, kind, reason = value.get('unit_id'), value.get('kind'), value.get('evidence')
        if (isinstance(index, bool) or not isinstance(index, int) or index not in expected or index in result
                or kind not in KINDS or not isinstance(reason, str) or not reason.strip()):
            raise ValueError('Invalid or duplicate editorial context')
        result[index] = value
    return result


def apply(plan, frames, observations, context_payload):
    """Apply one complete audit atomically. No labels are inferred from reason text."""
    # Validate every frame, including anchors, before changing any candidate.
    # Validate structure before local reconciliation; contradictory hand/face
    # claims are handled below, while coverage remains strict.
    decoded = decode_observations(observations)
    source_indices = borrowed_frames(frames,decoded)
    observations, face_corrections = reconcile(frames, decoded)
    all_evidence = continuous_runs(frames, observations)
    contexts, items, receipts = _context_map(plan, context_payload), [dict(s) for s in plan['items']], []
    measurements, wrapups, qualified = {}, set(), set()
    for index in plan['selected']:
        item = items[index]
        start, end = round(item['start_sec'] * 1000), round(item['end_sec'] * 1000)
        selected = [dict(f, start_ms=max(start, f['start_ms']), end_ms=min(end, f['end_ms']))
                    for f in frames if f['start_ms'] < end and f['end_ms'] > start]
        ids = {f['index'] for f in selected}
        facts = {'shots': [o for o in observations['shots'] if o['index'] in ids]}
        result = continuous_runs(selected, facts)
        measurements[index] = result
        context = contexts.get(index, {}).get('kind')
        before = item['label_key']
        duration = end - start
        surrounded = (0 < index < len(items) - 1 and
                      plan['items'][index - 1]['label_key'] == 'mixed_voiceover' and
                      plan['items'][index + 1]['label_key'] == 'mixed_voiceover')
        # Business short-montage rule, not a replacement for the >10s demo test:
        # an 8–12s quote enclosed by montage stays in that montage. There is no
        # duration-only demotion for an isolated, qualified closing presenter.
        short_context = ((8000 <= duration <= 12000 and surrounded) or
                         (context == 'short_insert' and duration <= 13000 and index < len(items) - 1))
        borrowed_ids = source_indices & ids
        grouped_source = {}
        for frame in selected:
            grouped_source.setdefault((frame['start_ms'],frame['end_ms']),set()).add(frame['index'])
        # A transient headline on one of a long shot's representative frames
        # cannot attribute the entire shot to borrowed footage.
        borrowed_intervals = {span for span, indices in grouped_source.items() if indices <= borrowed_ids}
        borrowed = sum(b - a for a,b in borrowed_intervals) > duration / 2
        longest = result['longest']
        prior = measurements.get(index - 1)
        # A qualified review can end with its presenter's price explanation.
        # It does not need a second >10s core. Require a face track crossing the
        # boundary, a single matching person and a majority of visible footage.
        # Product-only cards and new-host sales chapters cannot use this rule.
        people = {r['person'] for r in result['runs']}
        face_ms = sum(r['end_ms'] - r['start_ms'] for r in result['runs'])
        person_coverage = {person: sum(run['end_ms'] - run['start_ms'] for run in result['runs']
                                      if run['person'] == person) for person in people}
        # Content-unit ownership may cover separate parts of one review. This
        # sum never replaces the independently measured continuous >10s core.
        single_source = max(person_coverage.values(), default=0) >= duration * .9
        core_person = longest['person'] if longest else None
        owned_runs = [run for run in result['runs'] if run['person'] == core_person]
        illustrated_unit = (item['visual_kind'] == 'single_presenter' and context == 'demonstration'
            and owned_runs and owned_runs[0]['start_ms'] - start <= 250
            and end - owned_runs[-1]['end_ms'] <= 250
            and all(right['start_ms'] - left['end_ms'] <= 13000
                    for left,right in zip(owned_runs,owned_runs[1:])))
        cleared_proposal = (index in plan['proposedLive'] and context == 'demonstration')
        continuation_role = ((before == 'promotion' and item['same_person_as_previous']) or
                             (before == 'mixed_voiceover' and context in {'demonstration','short_insert'}) or
                             (before == 'live_demo' and item['same_person_as_previous']))
        continuation = (continuation_role and prior and index - 1 in qualified and index > 0
                        and items[index - 1]['label_key'] == 'live_demo'
                        and 0 <= start - round(items[index - 1]['end_sec'] * 1000) <= 250
                        and len(people) == 1 and face_ms > duration / 2
                        and any(r['person'] in people and r['start_ms'] < start < r['end_ms']
                                for r in all_evidence['runs']))
        # A rounded proposal boundary can contain <=250ms of the next host.
        # That sliver is not the returning speaker of this content unit.
        returned = next((run for run in reversed(result['runs'])
                         if run['end_ms'] - run['start_ms'] > 1000
                         and end - run['end_ms'] <= 250), None)
        illustrated_return = (before == 'mixed_voiceover' and context == 'short_insert'
            and prior and index - 1 in qualified and returned and prior['longest']
            and returned['person'] == prior['longest']['person'] and not borrowed_ids
            and 0 < returned['start_ms'] - start <= 13000
            and end - returned['start_ms'] <= 13000 and duration <= 26000
            and 0 <= start - round(items[index - 1]['end_sec'] * 1000) <= 250)
        if (continuation or illustrated_return) and not borrowed:
            item['label_key'], item['visual_kind'] = 'live_demo', 'single_presenter'
            wrapups.add(index)
        elif before not in {'mixed_voiceover','live_demo'}:
            # Seeing one presenter for >10s does not turn a sales chapter or
            # interview into a review. Only the proven wrap-up case above can
            # attach a promotion to an adjacent qualified demonstration.
            pass
        elif (before == 'mixed_voiceover' and context == 'independent_promotion'
              and index == len(items) - 1 and index > 0 and not result['qualifies_duration']):
            item['label_key'], item['visual_kind'] = 'promotion', 'other'
        elif borrowed or short_context or not result['qualifies_duration']:
            if item['visual_kind'] == 'single_presenter':
                item['label_key'], item['visual_kind'] = 'mixed_voiceover', 'montage'
        elif item['visual_kind'] in ('single_presenter', 'montage', 'borrowed_endorsement'):
            # A coarse montage can contain a qualified shot without being one
            # demonstration as a whole. Context alone cannot relabel all its
            # unrelated people/product footage from that one duration witness.
            if before == 'live_demo' or single_source or illustrated_unit or cleared_proposal:
                item['label_key'], item['visual_kind'] = 'live_demo', 'single_presenter'
        if item['label_key'] == 'live_demo' and longest:
            if not borrowed:
                # The independent source check can disprove an unscoped
                # "celebrity same product" overlay from the proposal.
                item['endorsement_marker'] = ''
            item['continuous_start_sec'], item['continuous_end_sec'] = longest['start_ms'] / 1000, longest['end_ms'] / 1000
            qualified.add(index)
        if item['label_key'] != before:
            item['reason'] = f"切点与画面复核：最长同人连续{result['longest_ms'] / 1000:.3f}秒；来源上下文{context or 'observed'}"
        receipts.append({'unit': index, 'before': before, 'after': item['label_key'],
                         'longestMs': result['longest_ms'], 'context': context,
                         'barrierIntervals': [[s['start_ms'], s['end_ms']] for s in result['barriers']]})
    # A qualified review may briefly illustrate its explanation, then return
    # to its presenter. Restore that CONTENT unit without counting the insert
    # in the qualifying duration. This is different from combining two short
    # presenters that never had an independently qualified review beforehand.
    for index in range(1, len(items) - 1):
        left, insert, right = items[index - 1:index + 2]
        before, after = measurements.get(index - 1), measurements.get(index + 1)
        if not before or not after or index - 1 not in qualified:
            continue
        a, b = before['longest'], after['longest']
        if (a and b and a['person'] == b['person']
                and left['label_key'] == 'live_demo'
                and plan['items'][index]['visual_kind'] == 'montage'
                and not insert['endorsement_marker'].strip()
                and contexts.get(index, {}).get('kind') == 'short_insert'
                and contexts.get(index + 1, {}).get('kind') in {'short_insert', 'demonstration'}
                and 0 < insert['end_sec'] - insert['start_sec'] <= 13
                and 0 < right['end_sec'] - right['start_sec'] <= 13
                and 0 <= insert['start_sec'] - left['end_sec'] <= .25
                and 0 <= right['start_sec'] - insert['end_sec'] <= .25):
            for position in (index, index + 1):
                items[position]['label_key'] = 'live_demo'
                wrapups.add(position)
                qualified.add(position)
    # Reunite an unnecessarily split long review only with matching visible
    # presenter evidence on both sides; different faces retain their boundary.
    for index in range(1, len(items)):
        if index in wrapups or index - 1 in wrapups:
            continue
        if index not in measurements or index - 1 not in measurements:
            continue
        left, right = measurements[index - 1]['longest'], measurements[index]['longest']
        durations = [(s['end_sec'] - s['start_sec']) * 1000 for s in (items[index - 1], items[index])]
        if (left and right and left['person'] != right['person'] and
                all(8000 <= length <= 13000 for length in durations) and
                items[index - 1]['end_sec'] == items[index]['start_sec']):
            for short in (items[index - 1], items[index]):
                short['label_key'], short['visual_kind'] = 'mixed_voiceover', 'montage'
                short['reason'] = '不同人物各约8–12秒的短展示串接，不能累计为独立实拍'
        if (left and right and left['person'] == right['person'] and
                items[index - 1]['label_key'] == items[index]['label_key'] == 'live_demo' and
                items[index - 1]['end_sec'] == items[index]['start_sec']):
            items[index]['same_person_as_previous'] = True
    for receipt in receipts:
        receipt['after'] = items[receipt['unit']]['label_key']
        receipt['samePresenterWrapup'] = receipt['unit'] in wrapups
    # Extend the qualified content unit, retaining its actually measured core;
    # never fabricate continuous duration across the ending product inserts.
    for index in sorted(wrapups, reverse=True):
        items[index - 1]['end_sec'] = items[index]['end_sec']
        items.pop(index)
    return {'segments': items}, {'policy': POLICY, 'frames': len(frames), 'units': receipts,
                                'sourceMarkers': decoded['markers'],
                                'faceReconciliation': face_corrections,
                                'preAuditCorrections': plan['preAuditCorrections']}
