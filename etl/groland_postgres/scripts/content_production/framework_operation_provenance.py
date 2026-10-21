"""Check a comparison's physical source separately from its marketing function."""
import json

PROMPT = '''图片依次为左侧出镜人、若干目标镜头、右侧出镜人。仅比较实际主体的可见特征，不识别姓名，不用字幕/角标/同款产品推断来源。
皮肤问题、眼妆对比虽然在叙事上说明产品作用，也可能取自另一个人。逐个目标先记录可核对的眼睛/眉型/妆容/发饰/衣着/环境特征，再分别回答目标与左右锚点是否为同一个实际人物，单独核对人物身份，不判断是否同一拍摄场次。脸部近景无需出现完整脸，但不能只因都是一只眼睛就说相同。不同妆容可为同人前后效果，只有可见的面部结构等证据明确表明不是同一个人才填no，不能因换衣服/发带/耳饰/环境/光线而填no；看不清或仅功能相似填uncertain。yes需要具体的可见对应，不从“介绍产品—演示效果”的语义推断。'''


def schema():
    fields = {'index': {'type':'integer'}, 'target_image_position': {'type':'integer'},
              'target_face_extent': {'type':'string','enum':['full_face','partial_face','unseen']}, 'evidence': {'type':'string'},
              'left_person_match': {'type':'string', 'enum':['yes','no','uncertain']},
              'right_person_match': {'type':'string', 'enum':['yes','no','uncertain']}}
    return {'type':'object','additionalProperties':False,'required':['left_anchor','right_anchor','observations'],
            'properties':{'left_anchor':{'type':'string'},'right_anchor':{'type':'string'},
                'observations':{'type':'array','items':{'type':'object','additionalProperties':False,
                'required':list(fields),'properties':fields}}}}


def check(proofs, images, work, request, *, source_events=None):
    def face_possible(index, proof):
        event = source_events[index] if source_events is not None else {}
        return (proof['middle_visible']=='person' or event.get('source_role_reobserved') and
                (event.get('action')=='application_detail' or event.get('visible')=='unknown'))
    selected = [i for i,p in enumerate(proofs) if face_possible(i,p)
        and p['middle_function'] in ('skin_comparison','wear_result','product_operation') and p['middle_owner'] in ('left','right','both')]
    if not selected:
        return proofs
    positions={i:n+2 for n,i in enumerate(selected)}
    prompt=(PROMPT+'\n必须按附图位置定位：第1张只作为左锚点，不能填入目标的evidence；'
        f'第{len(selected)+2}张只作为右锚点。目标映射：'+json.dumps(positions,ensure_ascii=False)+
        '。映射的key为返回index，value为实际附图位置（从1开始计数）。例如index=0不是第1张，'
        '第2张才可能是目标。先看目标图，再对照左右；evidence只描述目标的可见衣着/妆容/环境，最多80字。'
        '逐项返回正确的target_image_position，不能把左侧锚点的描述冒充目标。'
        '另填target_face_extent：从额头/发际到下巴及两侧轮廓完整可见为full_face；只有眼鼻嘴局部或脸部轮廓被裁切为partial_face；不见脸为unseen。'
        '肤质差、强光、浓妆、特写透视本身不能证明换人。发夹换成发箍也不能证明是另一个人。'
        f'先分别写left_anchor（第1张）和right_anchor（第{len(selected)+2}张）的实际发型、耳饰、衣领、环境与脸部特征，'
        '两者各最多80字。right_person_match必须对照最后一张，不能对照相邻目标图或把目标自己的特征当作右锚点。'
        '目标与锚点只有相同产品、同样的上妆动作或相似女性妆容，不足以填yes。')
    response = request(prompt,schema(),boards=[images[0],*[images[i+1]for i in selected],images[-1]],thinking='disabled')
    (work/'provenance.json').write_text(json.dumps(dict(payload=response.payload,usage=response.usage,
        responseId=response.response_id,indices=selected),ensure_ascii=False))
    values=response.payload.get('observations') if isinstance(response.payload,dict) else None
    if (any(not isinstance(response.payload.get(k),str) or not response.payload[k].strip()
            for k in ('left_anchor','right_anchor')) or
        not isinstance(values,list) or len(values)!=len(selected) or
        any(not isinstance(v,dict) or set(v)!={'index','target_image_position','target_face_extent','evidence','left_person_match','right_person_match'} for v in values) or
        any(type(v['index'])is not int or type(v['target_image_position'])is not int for v in values) or
        {v['target_image_position']for v in values}!=set(positions.values())):
        raise ValueError('Incomplete operation provenance evidence')
    result=[dict(p)for p in proofs]
    for v in values:
        # Source picture positions are the attachment identity. The model's
        # local ordinal may restart at zero for a sparse subset; never use it
        # to attach observations to the wrong event. Require a full bijection.
        index=next(i for i,position in positions.items()if position==v['target_image_position'])
        if v['target_face_extent']not in ('full_face','partial_face','unseen'):
            raise ValueError('Invalid provenance face visibility')
        if any(v[k]not in ('yes','no','uncertain')for k in ('left_person_match','right_person_match')) or not isinstance(v['evidence'],str) or not v['evidence'].strip():
            raise ValueError('Invalid operation provenance evidence')
        # A semantic fit cannot override independently visible different people.
        # Inconclusive pictures do not fabricate a new source boundary.
        if v['target_face_extent'] in ('full_face','partial_face'):
            result[index]['middle_visible']='person'
        if v['left_person_match']==v['right_person_match']=='uncertain':
            result[index]['physical_source_unresolved']=True
        if v['target_face_extent']!='unseen' and v['left_person_match']==v['right_person_match']=='no':
            result[index].update(middle_owner='neither',physical_source_different=True)
    return result
