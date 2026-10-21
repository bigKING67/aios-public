"""Verify a short illustration enclosed by one offer and its own closing call."""
import json

from .segment_suggestion_provider import run_media


def plan(segments, payload):
    evidence = {s['index']: s for s in payload['items']}
    groups = []
    for end, closing in evidence.items():
        start = closing['linked_index']
        if (closing['role'] != 'dependent_offer_content' or start != end-2
                or evidence.get(start, {}).get('role') != 'independent_offer'
                or evidence.get(start+1, {}).get('role') != 'recommendation_material'):
            continue
        opening, middle, last = segments[start:end+1]
        if (middle['label_key'] != 'mixed_voiceover'
                or middle['end_ms']-middle['start_ms'] > 12000
                or opening['end_ms'] != middle['start_ms'] or middle['end_ms'] != last['start_ms']):
            continue
        groups.append(dict(indices=[start,start+1,end],start_ms=opening['start_ms'],end_ms=last['end_ms'],
            boundaries_ms=[opening['end_ms'],middle['end_ms']]))
    if len(groups)>4 or sum(g['end_ms']-g['start_ms'] for g in groups)>120000:
        raise ValueError('Offer context budget exceeded')
    return groups


def apply(segments, group, proof):
    if (not isinstance(proof,dict) or set(proof)!={'relationship','evidence'}
            or proof['relationship'] not in ('one_offer','separate_content')
            or not isinstance(proof['evidence'],str) or not proof['evidence'].strip()):
        raise ValueError('Unresolved enclosed offer context')
    result=[dict(s) for s in segments]
    if proof['relationship']=='one_offer':
        for i in group['indices']:
            result[i].update(label_key='promotion',reason='同一购买活动的利益、展示与收尾：'+proof['evidence'])
    return result


def verify(original, classified, payload, source, work, env, tick, request):
    result, receipts = classified, []
    for number, group in enumerate(plan(original,payload)):
        folder=work/f'offer-context-{number}';folder.mkdir(parents=True,exist_ok=True)
        clip=folder/'clip.mp4';a,b=group['start_ms'],group['end_ms']
        command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(a/1000),'-i',str(source),
            '-t',str((b-a)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast','-crf','26','-c:a','aac',str(clip)]
        if run_media(command,env,tick,300,poll_seconds=.2):
            raise ValueError('Offer context extraction failed')
        split=[0,*[(t-a)/1000 for t in group['boundaries_ms']],(b-a)/1000]
        prompt=('本视频是原片中真实相邻的三段，分界为本视频秒数'+str(split)+'。'
            '请看三段实际内容与原音，核对购买活动的完整组织，不猜原片其他时间。'
            '第一段说明购买利益，第三段被前序观察认为是在催促这一活动；这两项是待核对的线索，不是答案。'
            '中间的使用/功效画面可能是同一活动中辅助说明到手产品，也可能是已经另起的独立推荐或测评。'
            'one_offer=三段确实共同完成同一次购买活动，中间只是其使用例证或利益说明，最后回到同一活动收尾；'
            'separate_content=中间另起独立内容板块或末段实际承接其他内容。不能因为两端有价格/催促就吞并中间。'
            '无法核实时填uncertain。evidence写实际台词、动作及承接依据，不用角标、姓名或位置代替事实。')
        schema={'type':'object','additionalProperties':False,'required':['relationship','evidence'],
            'properties':{'relationship':{'type':'string','enum':['one_offer','separate_content','uncertain']},
                          'evidence':{'type':'string'}}}
        response=request(prompt,schema,proxy=clip,fps=2,thinking='enabled',reasoning_effort='low')
        receipt=dict(group,payload=response.payload,usage=response.usage,responseId=response.response_id)
        (folder/'evidence.json').write_text(json.dumps(receipt,ensure_ascii=False))
        result=apply(result,group,response.payload)
        receipts.append(receipt)
    return result,receipts
