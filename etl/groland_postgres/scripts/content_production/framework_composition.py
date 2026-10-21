"""Conservative composition review before the opt-in v17 speaker audit.

Source continuity qualifies a review candidate, not its editorial independence.
Topology selects questions; only a separate observation can change the label.
No sample identifiers, reference answers or model-generated cut points are used.
"""
import json
import math

from .segment_suggestion_provider import run_media, max_proxy_bytes

POLICY = 'framework-composition-v21'
MAX_QUESTIONS = 12
MAX_TRAILING_EXCERPT_MS = 12000
MAX_VIDEO_MS = 360000
MAX_CONTEXT_BYTES = 160000
CRITERIA = {
    'independent_review': '个人演示或讲解自成段落，可来自长素材节选，不要求自我介绍或完整实验。',
    'own_review_step': '属于某个完整测评的操作、对比、持妆展示或角色分工。',
    'assembled_support': '作为多来源推荐段落中被选取的一块素材，与前后共同完成一个推荐或效果展示单元，单块可以超过10秒、含本人声音与完整操作。',
    'uncertain': '无法从画面及全片上下文确定上述归属，关键证据不足或冲突。',
}
PROMPT = '''请先看完整视频的内容组织，再逐项判断指定区间属于哪个内容单元。不要识别明星姓名，不用角标判断来源，不做口型或声纹推断。也不要重新猜给定区间的切点和时长。
区分两层：底层人物/拍摄连续，不一定意味着上层内容单元独立。多来源推荐单元会选取不同人的推荐、上脸、产品画面来共同完成一个推荐段落，其中某个素材可以超过10秒、也可以包含本人声音和完整操作。独立实拍单元则是某个人的演示或讲解本身作为一个段落展开；它可以接在另一人的实拍后面，也可以来自更长素材的节选，没有正式介绍或完整实验不妨碍独立成立。自己的产品操作/皮肤对比/持妆反馈可归入自身单元。
不能因整条视频是广告、有人换场、推荐同产品或多人依次出镜就把全片都判成一个多来源单元。请判断局部区间在全片真实叙事结构中的角色，并记录其与左右内容的具体组合或独立关系。'''
HOST_GUIDANCE = ('\n本目标已观察为纯出镜讲解。另核对它是否是混剪口播中主讲人出镜的部分：'
    '若主讲人的讲解和其他独立来源画面交替，共同推进同一段口播推荐，不能只将插入画面判混剪、'
    '把主讲人每次连续出镜另判独立实拍。自成段落的个人测评仍保留，不能因片头片尾有混剪而吞掉。')
HOST_CRITERIA = {**CRITERIA, 'assembled_support':
    '属于多来源画面共同完成的口播推荐或效果展示段落，包括其中主讲人的出镜讲解和插入的演示素材；单块可以超过10秒、含本人声音与完整操作。'}


def review_bridge(segment, windows):
    """Reuse a resolved multi-role operation flow within one ID namespace."""
    a, b = segment['start_ms'], segment['end_ms']
    for wi, window in enumerate(windows):
        if window['start'] > a or window['end'] < b:
            continue
        events = [e for e in window['events'] if min(e['end_ms'], b) > max(e['start_ms'], a)]
        if (not events or events[0]['start_ms'] > a or events[-1]['end_ms'] < b
                or any(x['end_ms'] != y['start_ms'] for x, y in zip(events, events[1:]))):
            continue
        units = {e['unit'] for e in events}
        if (len(units) != 1 or not next(iter(units))
                or any(e.get('needs_ownership') is not False
                       or e['kind'] not in ('presenter', 'own_detail') for e in events)):
            continue
        for left, middle, right in zip(events, events[1:], events[2:]):
            if (left['kind'] == right['kind'] == 'presenter'
                    and left.get('person') and right.get('person')
                    and left['person'] != right['person']
                    and middle['kind'] == 'own_detail' and middle.get('action') == 'hand_operation'):
                return dict(window_index=wi, unit=left['unit'],
                            operation_start_ms=middle['start_ms'], operation_end_ms=middle['end_ms'])
    return None


def narration_only(segment, windows):
    a,b=segment['start_ms'],segment['end_ms']
    observed=[[e for e in w['events'] if min(e['end_ms'],b)>max(e['start_ms'],a)]
              for w in windows if w['start']<=a and w['end']>=b]
    return bool(observed) and all(events and events[0]['start_ms']<=a and events[-1]['end_ms']>=b
        and all(x['end_ms']==y['start_ms'] for x,y in zip(events,events[1:]))
        and all(e['kind']=='presenter' and e.get('action')=='talking_demo' for e in events) for events in observed)


def recurring_presenter(segment, windows):
    a,b=segment['start_ms'],segment['end_ms']
    for window in windows:
        if window['start']>a or window['end']<b:
            continue
        events=window['events']
        inside=[e for e in events if min(e['end_ms'],b)>max(e['start_ms'],a)]
        people={e.get('person') for e in inside if e['kind']=='presenter'}
        if len(people)!=1 or not next(iter(people)):
            continue
        person=next(iter(people))
        for i,e in enumerate(events):
            if (e['kind']!='independent_insert' or e.get('intro_unit') or e.get('outro_unit')
                    or not (e['start_ms']==b or e['end_ms']==a)):
                continue
            returns=[v for v in (events[i+1:] if e['start_ms']>=b else events[:i])
                     if v['kind']=='presenter' and v.get('person')==person and not v.get('needs_ownership')]
            if returns:
                v=returns[0] if e['start_ms']>=b else returns[-1]
                return dict(insert=[e['start_ms']/1000,e['end_ms']/1000],
                            return_scene=[v['start_ms']/1000,v['end_ms']/1000])
    return None


def followup_groups(segments, windows):
    """Ask about supplementary groups after a longer completed demonstration.

    Neither adjacent reviews nor their relative durations decide a label.
    Require a real source insert and a bounded group before requesting context.
    """
    result={}
    for start in range(2,len(segments)-1):
        if (segments[start]['label_key']!='live_demo' or
                segments[start-1]['label_key']!='mixed_voiceover' or
                segments[start-2]['label_key']!='live_demo'):
            continue
        end=start
        while end+1<len(segments) and segments[end+1]['label_key']=='live_demo':
            end+=1
        if end==start or end+1==len(segments) or segments[end+1]['label_key']!='mixed_voiceover':
            continue
        group=segments[start:end+1]
        before, gap = segments[start-2:start]
        ga,gb=group[0]['start_ms'],group[-1]['end_ms']
        if (before['end_ms']-before['start_ms']<=gb-ga or
                any(a['end_ms']!=b['start_ms'] for a,b in zip(segments[start-2:end+2],segments[start-1:end+2]))):
            continue
        insert=next((e for w in windows for e in w['events'] if e['kind']=='independent_insert'
            and not e.get('intro_unit') and not e.get('outro_unit') and
            gap['start_ms']<=e['start_ms']<e['end_ms']<=gap['end_ms']),None)
        if insert:
            witness=dict(preceding_continuous_unit=[before['start_ms']/1000,before['end_ms']/1000],
                independent_insert=[insert['start_ms']/1000,insert['end_ms']/1000],
                following_group=[ga/1000,gb/1000])
            result.update({i:witness for i in range(start,end+1)})
    # Only the brief trailing excerpts near the qualification threshold need
    # this contextual question. Relative length alone must not reopen every
    # shorter independent review after a long one. This selects observation,
    # never a category; the physical-duration rules remain unchanged.
    for i in range(1,len(segments)-1):
        before,target,after = segments[i-1:i+2]
        length = target['end_ms']-target['start_ms']
        if (before['label_key']==target['label_key']=='live_demo'
                and after['label_key']!='live_demo'
                and 9000 <= length <= MAX_TRAILING_EXCERPT_MS
                and before['end_ms']==target['start_ms'] and target['end_ms']==after['start_ms']
                and before['end_ms']-before['start_ms'] > 2*length):
            result[i]=dict(preceding_continuous_unit=[before['start_ms']/1000,before['end_ms']/1000],
                           following_excerpt=[target['start_ms']/1000,target['end_ms']/1000])
    return result


def plan(segments, windows, duration_ms, short_reviews=()):
    targets, protected = [], []
    # A source positively recovered inside the existing 9–10s tolerance has
    # the same qualification as a source measured correctly the first time.
    # Only the additional 8–9s exceptions cannot protect adjacent reviews.
    short = {(p['start_ms'],p['end_ms']) for p in short_reviews if p['end_ms']-p['start_ms'] < 9000}
    groups = followup_groups(segments, windows)
    for i, segment in enumerate(segments):
        if segment['label_key'] != 'live_demo':
            continue
        left = segments[i-1] if i else None
        right = segments[i+1] if i+1 < len(segments) else None
        item = dict(index=i, start_ms=segment['start_ms'], end_ms=segment['end_ms'])
        # A proposal rounded to 106.9s can sit 67ms after the measured cut at
        # 106.833s. This is still a neighbouring content question, not a reason
        # to skip the entire audit. Do not pool the gap into continuous time.
        gaps = ([segment['start_ms']-left['end_ms']] if left else []) + (
                [right['start_ms']-segment['end_ms']] if right else [])
        if any(gap < 0 or gap > 500 for gap in gaps):
            raise ValueError('Composition candidate has an uncovered neighbouring interval')
        recurrence = recurring_presenter(segment, windows)
        talking = narration_only(segment, windows)
        near_threshold = (segment['start_ms'],segment['end_ms']) in short
        if near_threshold:
            # Direct close observation proved actual application, so a coarse
            # window's "talking_demo" must not select the pure-host question.
            talking = False
        if (not near_threshold and any(s and s['label_key'] == 'live_demo'
                and (s['start_ms'],s['end_ms']) not in short for s in (left, right))
                and not recurrence and i not in groups):
            protected.append(dict(item, reason='adjacent_measured_reviews'))
            continue
        bridge = review_bridge(segment, windows)
        if bridge:
            protected.append(dict(item, reason='resolved_review_operation', evidence=bridge))
            continue
        if (any(s and s['label_key']=='mixed_voiceover' and (
                0 <= segment['start_ms']-s['end_ms'] <= 500 or
                0 <= s['start_ms']-segment['end_ms'] <= 500) for s in (left,right)) or i in groups or near_threshold):
            # Do not propagate a pure host's role onto an application/review.
            # Only complete, agreeing observations support this narrower question.
            targets.append(dict(item, narration_only=talking, **({'source_recurrence':recurrence} if recurrence else {}),
                **({'source_group':groups[i]} if i in groups else {})))
    if targets and (len(targets) > MAX_QUESTIONS or duration_ms > MAX_VIDEO_MS):
        raise ValueError('Composition observation budget exceeded; no partial publication')
    return targets, protected


def questions(targets):
    return {f'q{i}': dict(type='choice', criteria=HOST_CRITERIA if p['narration_only'] else CRITERIA,
        instructions=PROMPT + (HOST_GUIDANCE if p['narration_only'] else '') +
        (('\n同一局部观察中，目标主讲人在独立插片后又出现：'+json.dumps(p['source_recurrence'],ensure_ascii=False)+
          '。这只触发核对其是否与插入来源共同完成推荐，不能仅因出现插片判混剪。') if p.get('source_recurrence') else '') +
        (('\n局部组织线索：'+json.dumps(p['source_group'],ensure_ascii=False)+
          ('。较长演示结束后，经独立插片进入这些相邻素材。请核对后续各自是否另起独立测评，或共同作为多来源推荐补充；位置与长短关系本身不能定类。' if 'independent_insert' in p['source_group'] else '。请核对较长演示之后的素材是否另起独立测评，或作为多来源推荐补充；位置与长短关系本身不能定类。')) if p.get('source_group') else '') +
        f'\n本题仅判断原片{p["start_ms"]/1000:.3f}–{p["end_ms"]/1000:.3f}秒目标区间的内容归属。'
        '参考全片结构，但不能用相邻区间内容冒充目标内容。不输出或修改切点。')
        for i, p in enumerate(targets)}


def source_context(windows):
    """Carry the measured observations forward without the proposed labels."""
    observations = [dict(window_index=i, start_sec=w['start']/1000, end_sec=w['end']/1000,
        events=[dict(start_sec=e['start_ms']/1000, end_sec=e['end_ms']/1000,
                     visible=e.get('visible'), person=e.get('person'), unit=e['unit'],
                     role=e['kind'], action=e.get('action'), appearance=e.get('appearance', ''))
                for e in w['events']]) for i, w in enumerate(windows)]
    context = ('以下为同一原片前序核验得到的画面观察和源时间，辅助定位，不是业务分类答案。'
               '角色presenter/own_detail/independent_insert只描述素材，不等同于实拍/混剪。'
               'unit只表示拍摄或操作流程连续，不证明在成片中是独立段落。'
               '各window的person和unit编号是局部命名空间，不可跨window比较编号；窗口之间可能重叠。'
               '原片时间不变，仍需结合完整视频判断目标与前后内容的组合关系。\n' +
               json.dumps(observations, ensure_ascii=False, separators=(',', ':')))
    if len(context.encode()) > MAX_CONTEXT_BYTES:
        raise ValueError('Composition source observation budget exceeded')
    return context


def labels(answers, count, *, allow_unresolved=False):
    if not isinstance(answers, dict) or set(answers) != {f'q{i}' for i in range(count)}:
        raise ValueError('Incomplete composition answers')
    result = []
    for i in range(count):
        value = answers[f'q{i}']
        if (not isinstance(value, dict) or value.get('type') != 'choice'
                or value.get('choice') not in CRITERIA):
            raise ValueError('Invalid composition choice')
        probabilities, confidence = value.get('probabilities'), value.get('confidence')
        number = lambda v: type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1
        if (not isinstance(probabilities, dict) or set(probabilities) != set(CRITERIA)
                or not all(number(v) for v in probabilities.values()) or not number(confidence)
                or abs(sum(probabilities.values())-1) > .0001
                or probabilities[value['choice']] + 1e-8 < max(probabilities.values())):
            raise ValueError('Invalid composition probabilities')
        # Two review roles map to one business label. Avoid splitting that vote.
        live = probabilities['independent_review'] + probabilities['own_review_step']
        mixed = probabilities['assembled_support']
        if value['choice'] == 'uncertain' or max(live, mixed) <= .5:
            if allow_unresolved:
                result.append(None)
                continue
            raise ValueError('Unresolved composition ownership')
        result.append('mixed_voiceover' if mixed > live else 'live_demo')
    return result


def apply(segments, targets, answers, *, clarified=None):
    decisions = labels(answers, len(targets), allow_unresolved=clarified is not None)
    for index,label in (clarified or {}).items():
        if type(index)is not int or not 0<=index<len(targets) or label not in ('live_demo','mixed_voiceover'):
            raise ValueError('Invalid composition clarification target')
        decisions[index]=label
    if any(v is None for v in decisions):
        raise ValueError('Unresolved composition ownership')
    result, corrections = [dict(s) for s in segments], []
    for target, label in zip(targets, decisions):
        index = target['index']
        segment = result[index]
        if (segment['label_key'] != 'live_demo' or segment['start_ms'] != target['start_ms']
                or segment['end_ms'] != target['end_ms']):
            raise ValueError('Stale composition target')
        if label == 'mixed_voiceover':
            segment.update(label_key=label, reason='前后组合归属：独立计时的素材属于多来源推荐单元')
            corrections.append(dict(target, rule='neighboring_composition'))
    # Keep every source/person boundary through the following audio audit.
    # Normal finalization may coalesce adjacent mixed labels, never live reviews.
    return result, corrections


def clarify(answers, targets, proxy, request, *, context=None, required=()):
    """Close decisions request observable context, never a threshold-only label."""
    decisions=labels(answers, len(targets), allow_unresolved=True)
    selected = [i for i,value in enumerate(decisions) if i in required or value is None or
        max(answers[f'q{i}']['probabilities']['assembled_support'],
            answers[f'q{i}']['probabilities']['independent_review']+
            answers[f'q{i}']['probabilities']['own_review_step']) < .8]
    if not selected:
        return {}, None
    if request is None:
        raise ValueError('Ambiguous composition needs contextual evidence')
    fields = {k:{'type':'string'} for k in ('target_action','left_relation','right_relation','evidence')}
    fields.update(index={'type':'integer'},role={'type':'string','enum':list(CRITERIA)})
    schema = {'type':'object','additionalProperties':False,'required':['observations'],
        'properties':{'observations':{'type':'array','items':{'type':'object','additionalProperties':False,
            'required':list(fields),'properties':fields}}}}
    prompt = (PROMPT+'\n逐项先描述目标实际动作，再说明目标与左侧、右侧分别有什么具体联系。'
        '连续的个人上妆、试用、对比、反馈可以自成测评段落，即使夹在混剪中间。'
        'assembled_support须说明具体承接哪段推荐、引用或统一展示；仅同产品、同字幕样式、多人依次出镜不够。'
        '不是要求完整流程，没有正式开头结尾也不等于拼接素材。判断依据须在本视频可核对，不能只复述选项。'
        '\n选项定义：'+json.dumps(CRITERIA,ensure_ascii=False)+'\n待核对目标：'+json.dumps([
            dict(index=i,start_sec=targets[i]['start_ms']/1000,end_sec=targets[i]['end_ms']/1000)
            for i in selected],ensure_ascii=False))
    if context is not None:
        prompt += '\n' + context
    response = request(prompt,schema,proxy=proxy,fps=2,thinking='enabled',reasoning_effort='low')
    values = response.payload.get('observations') if isinstance(response.payload,dict) else None
    if (not isinstance(values,list) or len(values)!=len(selected) or
            any(not isinstance(v,dict) or set(v)!=set(fields) or type(v['index'])is not int for v in values)
            or {v['index'] for v in values}!=set(selected)):
        raise ValueError('Incomplete composition clarification')
    decisions={}
    for v in values:
        if v['role'] not in CRITERIA or v['role']=='uncertain' or any(
                not isinstance(v[k],str) or not v[k].strip() for k in fields if k not in ('index','role')):
            raise ValueError('Unresolved composition clarification')
        decisions[v['index']]='mixed_voiceover' if v['role']=='assembled_support' else 'live_demo'
    return decisions,dict(payload=response.payload,usage=response.usage,responseId=response.response_id)


def verify(segments, source, duration_ms, work, env, tick, decide, *, windows, request=None, short_reviews=()):
    targets, protected = plan(segments, windows, duration_ms, short_reviews)
    receipt = dict(policy=POLICY, targets=targets, protected=protected, corrections=[], settled=[p for p in protected if p['reason']=='resolved_review_operation'])
    if not targets:
        return segments, receipt
    work.mkdir(parents=True, exist_ok=True)
    proxy = work / 'context.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source),
               '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=-2:480', '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '26', '-c:a', 'aac', '-b:a', '64k', str(proxy)]
    if run_media(command, env, tick, 900) or proxy.stat().st_size > max_proxy_bytes():
        raise ValueError('Composition context media failed or exceeded byte budget')
    context = source_context(windows)
    if short_reviews:
        context += ('\n以下为绑定目标近景与前后视频的更细粒度直接观察，仅提供事实，仍须判断局部归属。'
            '完整演示不自动等于独立单元；同产品、同字幕、多人依次出镜也不自动等于同一单元。\n'+
            json.dumps([dict(start_sec=p['start_ms']/1000,end_sec=p['end_ms']/1000,
                observations={k:p['payload'][k] for k in
                    ('visible_person','action_flow','ending_evidence','neighbor_relation')})
                for p in short_reviews],ensure_ascii=False))
    (work / 'source-context.txt').write_text(context)
    response = decide(questions(targets), proxy=proxy, fps=2, context=context)
    receipt.update(answers=response.payload, usage=response.usage, responseId=response.response_id)
    # Save the returned evidence before validation, including rejected answers.
    (work / 'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False))
    short = {(p['start_ms'],p['end_ms']) for p in short_reviews}
    tentative = labels(response.payload, len(targets), allow_unresolved=True)
    required = [i for i,t in enumerate(targets) if (t['start_ms'],t['end_ms']) in short
                or t.get('source_recurrence') and not t['narration_only']
                and round(t['source_recurrence']['insert'][0]*1000) == t['end_ms']
                and tentative[i] == 'mixed_voiceover']
    # A packaging close followed by the reviewer can be the review's own
    # ending. Before demoting an actual review followed by such a return,
    # require concrete relation evidence as for a near-threshold exception.
    # A return before the target is not this closing sequence. This selects a
    # bounded observation, never a label or permission to pool source time.
    clarified, receipt['clarification'] = clarify(response.payload, targets, proxy, request,
                                                   context=context, required=required)
    result, receipt['corrections'] = apply(segments, targets, response.payload, clarified=clarified)
    for position, label in clarified.items():
        index = targets[position]['index']
        if label == 'live_demo':
            result[index] = dict(segments[index])
            receipt['corrections'] = [c for c in receipt['corrections'] if c['index']!=index]
    corrected = {p['index'] for p in receipt['corrections']}
    # No composition correction still leaves a live candidate for the
    # independent opening/speaker audit. It is not positive proof that those
    # separate questions have already been answered.
    receipt['settled'] = [p for p in protected if p['reason']=='resolved_review_operation'] + [dict(p, reason='observed_composition')
                                      for p in targets if p['index'] in corrected]
    (work / 'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False))
    return result, receipt
