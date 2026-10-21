"""Check a verified offer's short continuation inside a longer montage block."""
import json

from .framework_window_audit import read_cuts
from .segment_suggestion_provider import run_media

POLICY = 'framework-offer-tail-v1'
MAX_TAIL_MS = 12000


def strong_cuts(values, start):
    # One transition can trigger several adjacent detector frames. Retain one
    # observed strongest frame per 250 ms cluster, never invent an average cut.
    groups = []
    for t, score in sorted(values):
        if score < .12 or not start+200 < t <= start+MAX_TAIL_MS:
            continue
        if groups and t-groups[-1][-1][0] < 250:
            groups[-1].append((t,score))
        else:
            groups.append([(t,score)])
    return [max(group,key=lambda item:item[1])[0] for group in groups]


def plan(segments, promotion, windows):
    verified = {p['index'] for p in promotion.get('payload', {}).get('items', [])
                if p['role'] == 'independent_offer'}
    result = []
    for i, (left, right) in enumerate(zip(segments, segments[1:])):
        if (i not in verified or left['label_key'] != 'promotion'
                or right['label_key'] != 'mixed_voiceover' or left['end_ms'] != right['start_ms']
                or right['end_ms']-right['start_ms'] <= MAX_TAIL_MS):
            continue
        start = right['start_ms']
        if not any(e.get('action') in ('packaging_display', 'hand_operation')
                   and e.get('visible') in ('hands', 'product')
                   and min(e['end_ms'], start+MAX_TAIL_MS) > max(e['start_ms'], start)
                   for w in windows for e in w['events']):
            continue
        result.append(dict(index=i+1, start_ms=start, end_ms=right['end_ms'],
                           context_start_ms=max(left['start_ms'], start-20000)))
    if len(result) > 2:
        raise ValueError('Offer tail budget exceeded')
    return result


def schema():
    fields = dict(index={'type':'integer'},
                  role={'type':'string','enum':['same_offer','other_content','uncertain']},
                  words={'type':'string'}, evidence={'type':'string'})
    return dict(type='object', additionalProperties=False, required=['items'], properties={
        'items':dict(type='array', items=dict(type='object', additionalProperties=False,
                                           required=list(fields), properties=fields))})


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    a = target['start_ms']
    end = min(target['end_ms'], a+MAX_TAIL_MS+3000)
    # Only strong actual source cuts may become new boundaries. The fixed
    # observation limit is never used as a generated cut.
    cuts = strong_cuts(read_cuts(source, a, end, work, env, tick), a)
    edges = sorted(set([a, *cuts]))
    intervals = [dict(start_ms=lo, end_ms=hi) for lo, hi in zip(edges, edges[1:])]
    proof = dict(target, intervals=intervals, payload=None)
    if not intervals:
        return proof
    if len(intervals) > 16:
        raise ValueError('Offer tail source interval budget exceeded')
    clip = work/'context.mp4'
    start = target['context_start_ms']
    command = ['ffmpeg','-nostdin','-v','error','-y','-ss',str(start/1000),'-i',str(source),
               '-t',str((end-start)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast',
               '-crf','26','-c:a','aac',str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('Offer tail source extraction failed')
    prompt = ('核对本片开头已展开的购买活动在随后画面中的延续范围。图片从礼盒换为人物上妆，'
        '不必然意味着购买机制结束；但不能把后续所有产品展示都归入机制。'
        '逐项先记录本区间真实台词words，再判断same_offer=仍在说明开头同一次活动的价格、'
        '买赠、数量、购买利益或具体收尾，例如折算使用成本和所购数量可用多久；'
        'other_content=已经转为独立功效推荐、使用演示、个人测评或其他活动；'
        'uncertain=无法判断。仅出现同款产品、上妆动作、普通催促或位置相邻不够。'
        '不得用邻段台词冒充本段；不输出新时间。只判断给定源片区间，每个index返回一次。'
        f'\n开头活动参考在本裁片0–{(a-start)/1000:.3f}秒。目标区间为本裁片秒数：'+
        json.dumps([dict(index=i,start=(v['start_ms']-start)/1000,end=(v['end_ms']-start)/1000)
                    for i,v in enumerate(intervals)]))
    response = request(prompt, schema(), proxy=clip, fps=2, thinking='enabled', reasoning_effort='low')
    proof.update(payload=response.payload, responseId=response.response_id, usage=response.usage)
    (work/'evidence.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2))
    return proof


def extension(target, proof):
    if any(proof.get(k) != v for k,v in target.items()):
        raise ValueError('Offer tail bound to wrong source')
    intervals = proof['intervals']
    if not intervals:
        return target['start_ms'], False
    if (intervals[0]['start_ms'] != target['start_ms']
            or intervals[-1]['end_ms'] > min(target['end_ms'], target['start_ms']+MAX_TAIL_MS)
            or any(v['start_ms'] >= v['end_ms'] for v in intervals)
            or any(a['end_ms'] != b['start_ms'] for a,b in zip(intervals,intervals[1:]))):
        raise ValueError('Invalid offer tail intervals')
    rows = (proof.get('payload') or {}).get('items')
    if (not isinstance(rows,list) or len(rows) != len(intervals)
            or any(not isinstance(v,dict) or set(v) != {'index','role','words','evidence'}
                   or type(v['index'])is not int for v in rows)
            or {v['index'] for v in rows} != set(range(len(intervals)))):
        raise ValueError('Incomplete offer tail evidence')
    for v in rows:
        if (v['role'] not in ('same_offer','other_content','uncertain')
                or not isinstance(v['words'],str) or not isinstance(v['evidence'],str)
                or not v['evidence'].strip() or v['role']=='same_offer' and not v['words'].strip()):
            raise ValueError('Invalid offer tail evidence')
    end, unresolved = target['start_ms'], False
    for v in sorted(rows,key=lambda v:v['index']):
        if v['role'] != 'same_offer':
            unresolved = v['role'] == 'uncertain'
            break
        end = intervals[v['index']]['end_ms']
    return end, unresolved


def verify(segments, source, work, env, tick, request, *, promotion, windows):
    targets = plan(segments, promotion, windows)
    proofs = [observe(source,t,work/str(i),env,tick,request) for i,t in enumerate(targets)]
    replacements, corrections, unresolved = {}, [], []
    for t,p in zip(targets,proofs):
        end, unknown = extension(t,p)
        if unknown:
            unresolved.append(dict(start_ms=t['start_ms'],end_ms=p['intervals'][-1]['end_ms']))
        if end > t['start_ms']:
            s = segments[t['index']]
            replacements[t['index']] = [dict(s,end_ms=end,label_key='promotion',
                reason='原片逐镜头核对：前一购买活动的利益说明延续'), dict(s,start_ms=end)]
            corrections.append(dict(start_ms=t['start_ms'],end_ms=end))
    output = [part for i,s in enumerate(segments) for part in replacements.get(i,[s])]
    return output, dict(policy=POLICY,targets=targets,observations=proofs,
                        corrections=corrections,unresolved=unresolved)
