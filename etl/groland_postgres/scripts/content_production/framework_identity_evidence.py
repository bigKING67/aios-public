"""Resolve an AV identity conflict with exact source pictures, not speaker names."""
import json
from .segment_suggestion_provider import run_media

PROMPT = ('三张原片画面依次为A主讲人、B主讲人前段、B主讲人后段。只核对可见面部是否同一人，'
    '不要说姓名，不听声音，不用字幕、明星角标、服装相似或画中画头像推断身份。'
    '分别描述每张大画面人物的可见脸部特征，再回答：b_same_person是第二与第三张同一人吗；'
    'a_matches_b是第一张与B同一人吗。只有清楚可核对的面部才填yes/no，否则uncertain。')


def schema():
    fields={k:{'type':'string'} for k in ('appearance_a','appearance_b1','appearance_b2','evidence')}
    fields.update({k:{'type':'string','enum':['yes','no','uncertain']} for k in ('a_matches_b','b_same_person')})
    return {'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}


def validate(proof):
    fields=schema()['properties']
    if (not isinstance(proof,dict) or set(proof)!=set(fields) or
        any(not isinstance(v,str) or not v.strip() for v in proof.values()) or
        any(proof[k] not in f['enum'] for k,f in fields.items() if 'enum'in f)):
        raise ValueError('Invalid source identity evidence')
    return proof


def observe(source,item,folder,env,tick,request):
    reference=item['speaker_reference']
    if not reference:
        raise ValueError('Identity check lacks source reference')
    a,b=item['start_ms'],item['end_ms']
    times=[(reference['start_ms']+reference['end_ms'])//2,a+min(1000,(b-a)//3),b-min(1000,(b-a)//3)]
    folder.mkdir(parents=True,exist_ok=True);images=[]
    for index,at in enumerate(times):
        image=folder/f'{index}.jpg'
        cmd=['ffmpeg','-nostdin','-v','error','-y','-ss',str(at/1000),'-i',str(source),
             '-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
        if run_media(cmd,env,tick,60,poll_seconds=.1):
            raise ValueError('Identity source frame extraction failed')
        images.append(image)
    result=request(PROMPT,schema(),boards=images,thinking='enabled',reasoning_effort='low')
    (folder/'evidence.json').write_text(json.dumps(dict(image_times_ms=times,payload=result.payload,
        responseId=result.response_id,usage=result.usage),ensure_ascii=False))
    return validate(result.payload)
