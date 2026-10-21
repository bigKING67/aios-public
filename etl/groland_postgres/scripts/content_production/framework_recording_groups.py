"""Check internal foreign recordings before accepting time pooled across short shots.

Only a positive, bound observation of a separate internal recording can cut a
claim. Different clothing alone, unknown provenance, and boundary excerpts do
not create a barrier. Source timestamps and all original media remain intact.
"""
import json
import re

from . import framework_composition as composition
from .segment_suggestion_provider import run_media

POLICY = 'framework-recording-groups-v2'
MAX_GROUPS = 4
MAX_EVENTS = 12
MAX_TOTAL_MS = 120000
PROMPT = '根据实际图片和视频，核对每个指定画面的物理拍摄来源。不是判实拍/混剪，不计算时长，不使用角标、人名、字幕格式或同款产品决定来源。\n图片为同一裁片按时间顺序的原图。逐张写image_position从1开始，分别描述appearance。不同的实际拍摄用不同recording_id R1/R2，相同拍摄复用；这是拍摄来源编号，不是人的身份编号。同一个人在不同服装场景拍摄可为不同recording_id，但不能仅因为裁近脸部、手部操作、灯光变化、图形叠加，就把同一次拍摄拆开。physical_evidence填写对应画面的可见依据。\n另写own_review_link：视频实际展示它与本裁片主讲人的个人测评步骤/持妆测试之间的联系则observed；仅连贯讲产品功能或同一旁白，不足以证明它来自本人的同一次测评；无这种联系填absent，无法核对填uncertain。不同人也可以分工完成一次演示，但需要具体操作承接而不是都在介绍同产品。自己的近景妆前妆后、换装持妆和自我反馈有具体证据时仍是observed。flow_evidence必须说明实际看到了什么联系或缺少什么，不能用“介绍—操作—效果”的抽象顺序代替。\n每张分别返回，不可遗漏，不给新时间边界。图片对应裁片秒数：'


def schema():
    fields = {k: {'type': 'string'} for k in ('appearance', 'physical_evidence', 'flow_evidence')}
    fields.update(image_position={'type': 'integer'}, recording_id={'type': 'string'},
                  own_review_link={'type': 'string', 'enum': ['observed', 'absent', 'uncertain']})
    return dict(type='object', additionalProperties=False, required=['observations'], properties={
        'observations': dict(type='array', items=dict(type='object', additionalProperties=False,
                            required=list(fields), properties=fields))})


def unresolved_application_source(event):
    # The coarse presenter observation survived a source frame observing an
    # application detail. It still lacks evidence tying that face to the host.
    # Skin comparisons and wear tests have their own provenance contract; a
    # different recording alone cannot overturn those established review steps.
    return (event['kind']=='presenter' and event.get('source_observed_kind')=='own_detail'
            and event.get('action') in ('personal_application','application_detail'))


def plan(segments, windows, claims):
    targets = []
    for segment in segments:
        a, b = segment['start_ms'], segment['end_ms']
        if (segment['label_key'] != 'live_demo' or b-a < 10001
                or not any(c['minimum'] > 10000 and min(b,c['end_ms'])-max(a,c['start_ms']) >= c['minimum'] for c in claims)
                or composition.review_bridge(segment, windows)):
            continue
        for window in windows:
            if window['start'] > a or window['end'] < b:
                continue
            events = []
            for original in window['events']:
                lo, hi = max(a,original['start_ms']), min(b,original['end_ms'])
                if hi <= lo:
                    continue
                e = dict(original, start_ms=lo, end_ms=hi)
                if (events and events[-1]['appearance'] == e['appearance']
                        and events[-1].get('action') == e.get('action')
                        and events[-1]['unit'] == e['unit']
                        and events[-1].get('source_observed_kind') == e.get('source_observed_kind')
                        and events[-1]['kind'] in ('presenter','own_detail')
                        and e['kind'] in ('presenter','own_detail')
                        and events[-1]['end_ms'] == lo):
                    events[-1]['end_ms'] = hi
                else:
                    events.append(e)
            if (not 3 <= len(events) <= MAX_EVENTS or events[0]['start_ms'] != a or events[-1]['end_ms'] != b
                    or any(x['end_ms'] != y['start_ms'] for x,y in zip(events,events[1:]))
                    or any(e['kind'] not in ('presenter','own_detail') or e['end_ms']-e['start_ms'] >= 9000 for e in events)
                    or not any(unresolved_application_source(e) for e in events)
                    or not any(e['kind']=='own_detail' for e in events)
                    or not any(e.get('action')=='talking_demo' for e in events)):
                continue
            targets.append(dict(start_ms=a,end_ms=b,events=events))
            break
    if len(targets) > MAX_GROUPS or sum(t['end_ms']-t['start_ms'] for t in targets) > MAX_TOTAL_MS:
        raise ValueError('Recording group evidence budget exceeded')
    return targets


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True,exist_ok=True)
    a,b = target['start_ms'],target['end_ms']
    clip = work/'clip.mp4'
    command = ['ffmpeg','-nostdin','-v','error','-y','-ss',str(a/1000),'-i',str(source),
        '-t',str((b-a)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast','-crf','26','-c:a','aac',str(clip)]
    if run_media(command,env,tick,300,poll_seconds=.2):
        raise ValueError('Recording group source extraction failed')
    times = [(e['start_ms']+e['end_ms'])/2000 for e in target['events']]
    images = []
    for i,at in enumerate(times):
        image = work/f'{i}.jpg'
        command = ['ffmpeg','-nostdin','-v','error','-y','-ss',str(at),'-i',str(source),
            '-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
        if run_media(command,env,tick,60,poll_seconds=.1):
            raise ValueError('Recording group source image extraction failed')
        images.append(image)
    response = request(PROMPT+json.dumps([round(t-a/1000,3)for t in times]),schema(),
                       proxy=clip,boards=images,fps=2,thinking='enabled',reasoning_effort='low')
    proof = dict(target, imageTimesMs=[round(t*1000)for t in times], payload=response.payload,
                 usage=response.usage,responseId=response.response_id)
    (work/'evidence.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
    return proof


def barriers(target, proof):
    if any(proof.get(k) != v for k,v in target.items()):
        raise ValueError('Recording evidence bound to wrong source')
    rows = proof.get('payload',{}).get('observations')
    fields = schema()['properties']['observations']['items']['properties']
    if (not isinstance(rows,list) or len(rows) != len(target['events'])
            or any(not isinstance(v,dict) or set(v) != set(fields) or type(v['image_position'])is not int for v in rows)
            or {v['image_position']for v in rows} != set(range(1,len(rows)+1))):
        raise ValueError('Incomplete recording source observations')
    rows = sorted(rows,key=lambda v:v['image_position'])
    for v in rows:
        if (any(not isinstance(v[k],str) or not v[k].strip() for k in fields if k!='image_position')
                or v['own_review_link'] not in ('observed','absent','uncertain')):
            raise ValueError('Invalid recording source observation')
    result = []
    for i,row in enumerate(rows[1:-1],1):
        neighbors = (rows[i-1],row,rows[i+1])
        if (unresolved_application_source(target['events'][i]) and row['own_review_link']=='absent' and
                all(re.fullmatch(r'R[1-9][0-9]*',v['recording_id']) for v in neighbors) and
                all(row['recording_id'] != other['recording_id'] for other in (rows[i-1],rows[i+1]))):
            event = target['events'][i]
            result.append(dict(start_ms=event['start_ms'],end_ms=event['end_ms'],
                               evidence=row['physical_evidence'],flowEvidence=row['flow_evidence']))
    return result


def split_claims(claims, cuts):
    result = [dict(c) for c in claims]
    for cut in cuts:
        next_claims = []
        for c in result:
            a,b = max(c['start_ms'],cut['start_ms']),min(c['end_ms'],cut['end_ms'])
            if a >= b:
                next_claims.append(c)
            else:
                if c['start_ms'] < a:
                    next_claims.append(dict(c,end_ms=a))
                if b < c['end_ms']:
                    next_claims.append(dict(c,start_ms=b))
        result = next_claims
    return result


def verify(segments, source, work, env, tick, request, *, claims, windows):
    targets = plan(segments,windows,claims)
    proofs = [observe(source,t,work/str(i),env,tick,request)for i,t in enumerate(targets)]
    cuts = [cut for t,p in zip(targets,proofs)for cut in barriers(t,p)]
    if not cuts:
        return segments,claims,dict(policy=POLICY,targets=targets,observations=proofs,barriers=[])
    revised = split_claims(claims,cuts)
    # Reuse the normal eligibility gate: an observation cannot invent timing,
    # and a short return cannot borrow the pre-insert part of the old claim.
    from .framework_window_audit import finalize
    output = []
    for s in segments:
        edges = sorted({s['start_ms'],s['end_ms'],*[v for c in cuts for v in (c['start_ms'],c['end_ms'])
                         if s['start_ms'] < v < s['end_ms']]})
        reason = ('原片来源核验发现独立上妆插入，按切断后的区间分别计算连续时长'
                  if s['label_key']=='live_demo' and any(min(s['end_ms'],c['end_ms'])>max(s['start_ms'],c['start_ms']) for c in cuts)
                  else s['reason'])
        output.extend(dict(s,start_ms=a,end_ms=b,reason=reason)for a,b in zip(edges,edges[1:]))
    output,demotions = finalize(output,dict(liveClaims=revised))
    return output,revised,dict(policy=POLICY,targets=targets,observations=proofs,barriers=cuts,
                               durationCorrections=demotions)
