"""Observe complete near-threshold demos instead of rejecting them by rounding.

Eight seconds is a review-candidate floor, never automatic qualification. Both
ends of an approximately ten-second annotation may be rounded. Qualification
requires a complete, uninterrupted source unit and positive observation, then
the ordinary editorial audit. No gold timestamps or labels enter this module.
"""
import json

from .segment_suggestion_provider import run_media

POLICY = 'framework-short-review-v3'
MAX_TARGETS = 4
PROMPT = '''核对指定T的原片演示是否自成一个完整的个人演示步骤。此处不判实拍/混剪，不猜秒数，不用角标或姓名。只核对真实画面和前后内容。
三张图分别来自T前部、中部、后部；视频含T及左右邻接内容。完整演示可来自长素材节选，不要求自我介绍、完整实验或固定流程。需要看到同一人亲自操作/演示，以及该步骤的效果、反馈或自然收尾；仅持产品说一句推荐、只有静态脸部画面、动作做到一半就切断，不能凭连续出镜认定完整。
先记录visible_person、action_flow、ending_evidence和neighbor_relation。neighbor_relation只记录左右可见的人物、动作与来源切换事实，不判整个广告是否为多来源组合。若T含产品广告插入、切换不同人、离开后返回，不得把前后拼起来当连续段落。
status=complete_demonstration仅表示T内部同一连续来源有实际个人演示及可核对的完整步骤；partial_excerpt表示该动作不完整；interrupted_source表示T内部有独立插入或换人；无法核对选uncertain。此处只确认演示事实，不决定最终框架归属：前后多个独立演示、同产品、后接街采或活动，都不能改变T内部实际完成了什么；后续另有专门的前后组合判断，不能在本题替代。'''


def schema():
    fields = {k: {'type': 'string'} for k in
              ('visible_person', 'action_flow', 'ending_evidence', 'neighbor_relation')}
    fields.update(status={'type': 'string', 'enum':
                         ['complete_demonstration', 'partial_excerpt', 'interrupted_source', 'uncertain']},
                  continuous_person={'type': 'boolean'}, personal_demonstration={'type': 'boolean'})
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def separate_person_neighbor(window, run, target_people):
    """An observed foreign person is a source switch, not the target returning.

    This only permits a bounded demonstration check. Product inserts, unknown
    ownership, partial neighbor coverage and returning people remain barriers.
    """
    # Insert runs deliberately have no continuous-unit people. Use the
    # source events' visible person IDs, within this same window, instead.
    if run.get('ambiguous') or run.get('clipped'):
        return False
    a,b = run['start_ms'],run['end_ms']
    events = [e for e in window['events'] if min(e['end_ms'],b)>max(e['start_ms'],a)]
    return bool(events and events[0]['start_ms'] == a and events[-1]['end_ms'] == b
                and all(x['end_ms'] == y['start_ms'] for x,y in zip(events,events[1:]))
                and len({e.get('person') for e in events}) == 1
                and all(e['kind'] in ('presenter','independent_insert') and e.get('visible') == 'person'
                        and e.get('person') and e['person'] not in target_people and not e.get('needs_ownership')
                        and not e.get('subject_conflict') for e in events))


def complete_source(window, a, b):
    runs = window['measured']['runs']
    run = next((r for r in runs if r['start_ms'] == a and r['end_ms'] == b), None)
    if (not run or not run['unit'] or len(run['people']) != 1 or run['clipped']
            or not run['allow_tolerance'] or run.get('ambiguous')):
        return False
    if any(r is not run and r['unit'] and (r['unit'] == run['unit'] or
           set(r['people']) & set(run['people'])) for r in runs):
        return False
    events = [e for e in window['events'] if min(e['end_ms'],b)>max(e['start_ms'],a)]
    target_people = {e.get('person') for e in events}
    if any(not r['unit'] and (r['end_ms'] == a or r['start_ms'] == b)
           and not separate_person_neighbor(window,r,target_people) for r in runs):
        return False
    return bool(events and events[0]['start_ms'] == a and events[-1]['end_ms'] == b
                and all(x['end_ms'] == y['start_ms'] for x,y in zip(events,events[1:]))
                and all(e['kind'] in ('presenter', 'own_detail') and e.get('visible') == 'person'
                        and e.get('person') and not e.get('needs_ownership')
                        and not e.get('subject_conflict') for e in events)
                and len({e['person'] for e in events}) == 1)


def plan(segments, windows, duration_ms):
    candidates = sorted({(r['start_ms'],r['end_ms']) for w in windows for r in w['measured']['runs']
                         if 8000 <= r['end_ms']-r['start_ms'] <= 10000 and not r['qualifies']})
    targets = []
    for a,b in candidates:
        covering = [w for w in windows if w['start'] <= a and w['end'] >= b]
        segments_inside = [s for s in segments if min(s['end_ms'],b)>max(s['start_ms'],a)]
        if (not covering or not all(complete_source(w,a,b) for w in covering)
                or not segments_inside or segments_inside[0]['start_ms'] > a
                or segments_inside[-1]['end_ms'] < b
                or any(s['label_key'] != 'mixed_voiceover' for s in segments_inside)
                or any(x['end_ms'] != y['start_ms'] for x,y in zip(segments_inside,segments_inside[1:]))):
            continue
        targets.append(dict(start_ms=a, end_ms=b, context_start_ms=max(0,a-15000),
                            context_end_ms=min(duration_ms,b+15000)))
    if len(targets) > MAX_TARGETS:
        raise ValueError('Short review evidence budget exceeded')
    return targets


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    start, end = target['context_start_ms']/1000, target['context_end_ms']/1000
    a,b = target['start_ms']/1000, target['end_ms']/1000
    clip = work/'clip.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(start), '-i', str(source),
               '-t', str(end-start), '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'fast',
               '-crf', '26', '-c:a', 'aac', str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('Short review context extraction failed')
    times, images = [a+(b-a)*part for part in (.1,.5,.9)], []
    for i,at in enumerate(times):
        image = work/f'frame-{i}.jpg'
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(at), '-i', str(source),
                   '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '2', str(image)]
        if run_media(command, env, tick, 60, poll_seconds=.1):
            raise ValueError('Short review image extraction failed')
        images.append(image)
    prompt = PROMPT + f'\n裁片内T={a-start:.3f}–{b-start:.3f}秒，附图时刻：' + json.dumps([round(t-start,3) for t in times])
    response = request(prompt, schema(), proxy=clip, boards=images, fps=2,
                       thinking='enabled', reasoning_effort='low')
    proof = dict(target, payload=response.payload, usage=response.usage, responseId=response.response_id,
                 imageTimesMs=[round(t*1000) for t in times])
    (work/'evidence.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
    return proof


def apply(segments, claims, targets, observations):
    if len(targets) != len(observations):
        raise ValueError('Incomplete short review evidence')
    output, witnesses, corrections = [dict(s) for s in segments], [dict(c) for c in claims], []
    fields = schema()['properties']
    for target, observation in zip(targets, observations):
        proof = observation.get('payload')
        if (any(observation.get(k) != v for k,v in target.items()) or not isinstance(proof,dict)
                or set(proof) != set(fields)
                or any(not isinstance(proof[k],str) or not proof[k].strip() for k in fields if fields[k]['type']=='string')
                or any(type(proof[k]) is not bool for k in fields if fields[k]['type']=='boolean')
                or proof['status'] not in fields['status']['enum']):
            raise ValueError('Invalid or unbound short review evidence')
        if not (proof['status']=='complete_demonstration' and proof['continuous_person'] and proof['personal_demonstration']):
            continue
        a,b = target['start_ms'],target['end_ms']
        revised = []
        for segment in output:
            x,y = max(a,segment['start_ms']),min(b,segment['end_ms'])
            if x >= y:
                revised.append(segment)
                continue
            if segment['label_key'] != 'mixed_voiceover':
                raise ValueError('Stale short review target')
            if segment['start_ms'] < x:
                revised.append(dict(segment,end_ms=x))
            revised.append(dict(segment,start_ms=x,end_ms=y,label_key='live_demo',reason='独立完整短演示原片复核'))
            if y < segment['end_ms']:
                revised.append(dict(segment,start_ms=y))
        output = revised
        witnesses.append(dict(start_ms=a,end_ms=b,minimum=b-a,qualification=POLICY))
        corrections.append(dict(target, status=proof['status']))
    return output,witnesses,corrections


def verify(segments, source, duration_ms, work, env, tick, request, *, claims, windows):
    targets = plan(segments,windows,duration_ms)
    observed = [observe(source,t,work/str(i),env,tick,request) for i,t in enumerate(targets)]
    output,witnesses,corrections = apply(segments,claims,targets,observed)
    return output,witnesses,dict(policy=POLICY,targets=targets,observations=observed,corrections=corrections,
                                unresolved=[p for p in observed if p['payload']['status']=='uncertain'])
