"""Separate authored excerpts from borrowed visuals inside a pooled review.

Operation-level cooperation is not proof that all images are the host's own
recording. Audit only resolved cross-person bridges, with existing source cuts.
An explicit original-speech excerpt is editorial evidence, never a duration
claim; borrowed parts and short closing returns cannot inherit that evidence.
"""
import json

from . import framework_composition as composition
from .framework_recording_groups import split_claims
from .segment_suggestion_provider import run_media

POLICY = 'framework-review-partition-v1'
MAX_TARGETS = 3
MAX_EVENTS = 8
MAX_TOTAL_MS = 120000
PROMPT = '''核对本裁片里不同画面来源的组织关系。此前局部观察仅凭“前人介绍—手部操作—后人上脸”将它们关联；这不证明所有画面都是本人的同一次测评，也不预设它们一定是混剪。不要识别明星、按角标定类、计算时长或生成新切点。
图片按给定events顺序，各自绑定一个实际原片区间。逐项描述appearance和source_evidence，结合视频核对人物、实际环境、操作接续和口播。只有同款产品、持续旁白、功能承接，或者主讲人以小窗覆盖另一人物，都不足以证明共同完成本人测试；画中画的主讲人不能冒充底层演示者。
group=single_review：有具体证据确认同一人的本人测试、换装持妆/操作细节，或共同参与者实际完成同一次测试；换场本身不否定这一点。group=assembled_recommendation：另一个人的推荐/独立拍摄或演示被选入本次口播，按剪辑顺序推进卖点；uncertain为证据不足。
每个来源区间的role：review_origin=裁片开头主讲人自己的原声个人推荐/演示节选，内容本身可辨且以该人的实际出镜开始，不要求自我介绍或长实验；own_step=有具体证据属于本次本人测试的步骤；borrowed_support=被引入的其他独立来源画面；origin_return=借用画面后回到主讲人完成同一口播的简短收尾，未另起独立内容；uncertain=不清楚。不能把所有同产品画面都填own_step。
own_speech=observed仅在当前区间可核对画面主讲人的本人产品讲话；背景旁白、仅因第一人称文案或同一声线不足以证明，未涉及填not_applicable，无法确认填uncertain。review_origin必须有该证据；不能因为来源片段短就否定真实原声节选。origin_return仍属于前面借用画面组成的推荐单元，不能反向将它们变成本人操作。按index完整返回，不输出时间或业务标签。'''


def schema():
    fields = {k:dict(type='string') for k in ('appearance','source_evidence')}
    fields.update(index=dict(type='integer'),
        role=dict(type='string',enum=['review_origin','own_step','borrowed_support','origin_return','uncertain']),
        own_speech=dict(type='string',enum=['observed','not_applicable','uncertain']))
    return dict(type='object',additionalProperties=False,required=['group','evidence','observations'],properties=dict(
        group=dict(type='string',enum=['single_review','assembled_recommendation','uncertain']),
        evidence=dict(type='string'),observations=dict(type='array',items=dict(type='object',
            additionalProperties=False,required=list(fields),properties=fields))))


def plan(segments, windows):
    targets=[]
    for i,segment in enumerate(segments):
        if segment['label_key']!='live_demo' or not composition.review_bridge(segment,windows):
            continue
        a,b=segment['start_ms'],segment['end_ms']
        last=i
        if i+1<len(segments):
            following=segments[i+1]
            if (following['label_key'] in ('live_demo','mixed_voiceover') and following['start_ms']==b
                    and following['end_ms']-b<=5000):
                b=following['end_ms'];last=i+1
        for window in windows:
            if window['start']>a or window['end']<b:
                continue
            events=[dict(e,start_ms=max(a,e['start_ms']),end_ms=min(b,e['end_ms']))
                    for e in window['events'] if min(b,e['end_ms'])>max(a,e['start_ms'])]
            if (not 3<=len(events)<=MAX_EVENTS or events[0]['start_ms']!=a or events[-1]['end_ms']!=b
                    or any(x['end_ms']!=y['start_ms'] for x,y in zip(events,events[1:]))
                    or any(e.get('needs_ownership') is not False for e in events)):
                continue
            targets.append(dict(index=i,last_index=last,start_ms=a,end_ms=b,events=events))
            break
    if (len(targets)>MAX_TARGETS or sum(t['end_ms']-t['start_ms'] for t in targets)>MAX_TOTAL_MS
            or any(x['last_index']>=y['index'] for x,y in zip(targets,targets[1:]))):
        raise ValueError('Review partition evidence budget or overlap exceeded')
    return targets


def observe(source,target,work,env,tick,request):
    work.mkdir(parents=True,exist_ok=True)
    a,b=target['start_ms'],target['end_ms'];clip=work/'clip.mp4'
    command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(a/1000),'-i',str(source),
        '-t',str((b-a)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast','-crf','26','-c:a','aac',str(clip)]
    if run_media(command,env,tick,300,poll_seconds=.2):
        raise ValueError('Review partition clip extraction failed')
    images=[];times=[]
    for i,event in enumerate(target['events']):
        at=(event['start_ms']+event['end_ms'])/2000;times.append(round(at*1000))
        image=work/f'{i}.jpg'
        command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(at),'-i',str(source),
            '-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
        if run_media(command,env,tick,60,poll_seconds=.1):
            raise ValueError('Review partition source image extraction failed')
        images.append(image)
    prompt=PROMPT+'\n裁片固定区间：'+json.dumps([dict(index=i,start=(e['start_ms']-a)/1000,
        end=(e['end_ms']-a)/1000) for i,e in enumerate(target['events'])],ensure_ascii=False)
    response=request(prompt,schema(),proxy=clip,boards=images,fps=3,thinking='enabled',reasoning_effort='low')
    proof=dict(target,payload=response.payload,imageTimesMs=times,usage=response.usage,responseId=response.response_id)
    (work/'evidence.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
    return proof


def validate(target,proof):
    if any(proof.get(k)!=v for k,v in target.items()):
        raise ValueError('Review partition bound to wrong source')
    payload=proof.get('payload',{});rows=payload.get('observations')
    if (set(payload)!=set(schema()['properties']) or payload.get('group') not in ('single_review','assembled_recommendation')
            or not isinstance(payload.get('evidence'),str) or not payload['evidence'].strip()
            or not isinstance(rows,list) or len(rows)!=len(target['events'])
            or any(not isinstance(r,dict) or type(r.get('index'))is not int for r in rows)
            or {r['index']for r in rows}!=set(range(len(rows)))):
        raise ValueError('Incomplete or uncertain review partition')
    fields=schema()['properties']['observations']['items']['properties']
    for r in rows:
        if (set(r)!=set(fields) or any(not isinstance(r[k],str) or not r[k].strip() for k in fields if k!='index')
                or r['role'] not in fields['role']['enum'] or r['role']=='uncertain'
                or r['own_speech'] not in fields['own_speech']['enum']):
            raise ValueError('Invalid review partition observation')
        if r['role']=='review_origin' and r['own_speech']!='observed':
            raise ValueError('Review excerpt lacks observed original speech')
    rows=sorted(rows,key=lambda r:r['index'])
    borrowed=[i for i,r in enumerate(rows) if r['role']=='borrowed_support']
    if (payload['group']=='single_review' and borrowed
            or payload['group']=='assembled_recommendation' and not borrowed):
        raise ValueError('Contradictory review partition sources')
    return rows


def apply(segments,claims,targets,proofs):
    if len(targets)!=len(proofs):
        raise ValueError('Incomplete review partition evidence')
    replacements={};retained=[];corrections=[];cuts=[]
    for target,proof in zip(targets,proofs):
        rows=validate(target,proof)
        lo,hi=target['index'],target['last_index']
        if (not 0<=lo<=hi<len(segments) or segments[lo]['start_ms']!=target['start_ms']
                or segments[hi]['end_ms']!=target['end_ms'] or segments[lo]['label_key']!='live_demo'):
            raise ValueError('Stale review partition target')
        if proof['payload']['group']=='single_review':
            continue
        borrowed=next(i for i,r in enumerate(rows) if r['role']=='borrowed_support')
        parts=[]
        for i,(event,row) in enumerate(zip(target['events'],rows)):
            own_prefix=(rows[0]['role']=='review_origin' and i<borrowed
                        and row['role'] in ('review_origin','own_step'))
            part=dict(segments[lo],start_ms=event['start_ms'],end_ms=event['end_ms'],
                label_key='live_demo' if own_prefix else 'mixed_voiceover',
                reason='原片来源逐段核验：'+row['source_evidence'])
            if parts and part['label_key']==parts[-1]['label_key'] and parts[-1]['end_ms']==part['start_ms']:
                parts[-1]['end_ms']=part['end_ms']
            else: parts.append(part)
        retained.extend(dict(start_ms=p['start_ms'],end_ms=p['end_ms'],basis='observed_original_review_excerpt')
                        for p in parts if p['label_key']=='live_demo')
        replacements[lo]=(hi,parts);cuts.append(dict(start_ms=target['start_ms'],end_ms=target['end_ms']))
        corrections.append(dict(start_ms=target['start_ms'],end_ms=target['end_ms'],rule='borrowed_visual_partition'))
    result=[];i=0
    while i<len(segments):
        if i in replacements:
            hi,parts=replacements[i];result.extend(parts);i=hi+1
        else: result.append(dict(segments[i]));i+=1
    return result,split_claims(claims,cuts),dict(policy=POLICY,targets=targets,observations=proofs,
        corrections=corrections,retainedExcerpts=retained)


def supports(segment,receipt):
    return segment['label_key']=='live_demo' and any(
        segment['start_ms']==p['start_ms'] and segment['end_ms']==p['end_ms']
        for p in receipt.get('reviewPartition',{}).get('retainedExcerpts',[]))


def verify(segments,source,work,env,tick,request,*,claims,windows):
    targets=plan(segments,windows)
    proofs=[observe(source,t,work/str(i),env,tick,request)for i,t in enumerate(targets)]
    return apply(segments,claims,targets,proofs)
