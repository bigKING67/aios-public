"""Distinguish a separate application recording from a presenter's own detail."""
import json


def check(proofs, events, images, proxy, work, request):
    selected=[i for i,e in enumerate(events or []) if e.get('source_role_reobserved')
        and (e.get('action')=='application_detail' or e.get('visible')=='unknown')
        and proofs[i].get('physical_source_unresolved') and proofs[i]['middle_visible']=='person']
    if not selected:
        return proofs
    fields={k:{'type':'string'}for k in ('anchor_appearance','target_appearance','continuation_evidence')}
    fields.update(index={'type':'integer','enum':list(range(len(selected)))},recording_relation={'type':'string',
        'enum':['matching_recording','distinct_recording','uncertain']},
        same_test_observed={'type':'boolean'})
    schema={'type':'object','additionalProperties':False,'required':['observations'],
        'properties':{'observations':{'type':'array','items':{'type':'object','additionalProperties':False,
            'required':list(fields),'properties':fields}}}}
    prompt=('核对主讲人和局部上妆画面的拍摄联系，不识别姓名，不判实拍/混剪，不要求猜测是谁。'
        '附图顺序：左主讲人、各目标细节、右主讲人；视频提供这些画面的实际前后过程。'
        '先分别记录主讲人与目标眼部/面部实际妆容、装饰和拍摄方式。'
        'recording_relation只问目标与左右主讲人的当前演示是否是同一拍摄：可见特征吻合填matching_recording；'
        '可见妆容/装饰/布景等明确不相容、属于另一段拍摄填distinct_recording；看不清填uncertain。'
        '不能因都是睫毛刷涂、同一产品或同一配音就认为同次拍摄。'
        '另独立判断same_test_observed：视频是否实际展示了主讲人自己的换妆/测试过程，'
        '能把不同外观明确连接为本人的前后步骤？必须有可见流程证据；仅“介绍—操作—效果”语义顺序不够。'
        '不同拍摄也可能属于自己的完整测试；该情况按实际证据填true，不能只因换装就否认。'
        '\nindex从0开始，不能填图片位置。各局部index对应附图位置（从1开始）：'+
        json.dumps({n:n+2 for n in range(len(selected))}))
    response=request(prompt,schema,proxy=proxy,boards=[images[0],*[images[i+1]for i in selected],images[-1]],
                     fps=2,thinking='disabled')
    (work/'detail-source.json').write_text(json.dumps(dict(payload=response.payload,usage=response.usage,
        responseId=response.response_id,indices=selected),ensure_ascii=False))
    values=response.payload.get('observations')if isinstance(response.payload,dict)else None
    if (not isinstance(values,list) or len(values)!=len(selected) or
        any(not isinstance(v,dict)or set(v)!=set(fields)or type(v['index'])is not int for v in values)or
        {v['index']for v in values}!=set(range(len(selected)))):
        raise ValueError('Incomplete detail recording evidence')
    output=[dict(p)for p in proofs]
    for v in values:
        if (v['recording_relation']not in ('matching_recording','distinct_recording','uncertain')or
            type(v['same_test_observed'])is not bool or any(not isinstance(v[k],str)or not v[k].strip()
            for k in ('anchor_appearance','target_appearance','continuation_evidence'))):
            raise ValueError('Invalid detail recording evidence')
        if v['recording_relation']=='distinct_recording' and not v['same_test_observed']:
            output[selected[v['index']]].update(middle_owner='neither',physical_source_different=True)
    return output
