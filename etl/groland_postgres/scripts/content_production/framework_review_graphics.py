"""Recover observable presenter overlays and review title cards; keep time breaks."""
import json
from .segment_suggestion_provider import run_media


def repair(events, source, work, env, tick, request):
    result=[dict(e)for e in events]
    targets=[]
    for i,e in enumerate(events):
        if e['kind'] not in ('other','independent_insert') or e['end_ms']-e['start_ms']>3000 or not 0<i<len(events)-1:
            continue
        left,right=events[i-1:i+2:2]
        if not left.get('review_unit') and left['kind']=='own_detail' and i>=2 and e['start_ms']-left['start_ms']<=3000:
            left=events[i-2]
        # Same observed recording/review on both sides is a question selector,
        # never permission to join the duration across an unseen title/ad.
        if (left['kind'] not in ('presenter','own_detail') or right['kind'] not in ('presenter','own_detail') or
            not left.get('review_unit') or left['review_unit']!=right.get('review_unit')):
            continue
        def core_length(anchor,step):
            j=next(n for n,v in enumerate(events) if v is anchor)
            length=anchor['end_ms']-anchor['start_ms']
            for k in range(j+step,len(events) if step>0 else -1,step):
                previous=events[k-step];current=events[k]
                if (current['kind']not in ('presenter','own_detail') or current['unit']!=anchor['unit']
                    or (previous['end_ms']!=current['start_ms'] if step>0 else current['end_ms']!=previous['start_ms'])):break
                length+=current['end_ms']-current['start_ms']
            return length
        if max(core_length(left,-1),core_length(right,1))<=10000:
            continue
        targets.append((i,left,e,right))
    if len(targets)>6:
        raise ValueError('Review graphics observation budget exceeded')
    for i,left,e,right in targets:
        folder=work/str(i);folder.mkdir(parents=True,exist_ok=True)
        a=max(events[0]['start_ms'],e['start_ms']-5000);b=min(events[-1]['end_ms'],e['end_ms']+8000)
        clip=folder/'context.mp4'
        cmd=['ffmpeg','-nostdin','-v','error','-y','-ss',str(a/1000),'-i',str(source),'-t',str((b-a)/1000),
             '-vf','scale=-2:640','-c:v','libx264','-preset','fast','-crf','25','-c:a','aac',str(clip)]
        if run_media(cmd,env,tick,180,poll_seconds=.2):raise ValueError('Review graphics extraction failed')
        fields={'role':{'type':'string','enum':['presenter_overlay','review_title','independent_insert','ordinary_review_step','uncertain']},
                'graphic_overlay':{'type':'string','enum':['large_graphics','subtitle_only','none']},'same_review':{'type':'boolean'},'left_action':{'type':'string'},'right_action':{'type':'string'},'evidence':{'type':'string'}}
        schema={'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}
        prompt=('只核对指定目标画面：presenter_overlay=原主讲人实际画面仍在继续，只被叠加报告/成分图片遮挡，'
            '必须仍看到原场景/原人物或连贯动作，不能凭声音认定；review_title=纯文字测评章节或转场卡；'
            'independent_insert=独立产品广告/精修布景/其他人物素材；ordinary_review_step=普通人物/皮肤/操作镜头；uncertain=不清楚。'
            '另填graphic_overlay：large_graphics=独立图层的大面积报告/成分图覆盖；subtitle_only=只有字幕角标；none=没有图层。'
            '普通眼部/皮肤特写即使属于同一测评，也不是presenter_overlay，不能把皮肤细节或字幕当成大幅覆盖图。'
            'left_action和right_action分别描述目标之前与之后的人物具体在做什么。'
            'same_review判断目标前后的人物是否属于同一次实际测评流程，不是在问字卡期间有没有人出镜。'
            '本人先引入测试，出现章节字卡，接着在健身/户外/室内进行测试和展示结果可属于同一次测评；'
            '需要可核对的同一人物与流程证据，不从同产品或同旁白推断。'
            f'\n目标为本视频{(e["start_ms"]-a)/1000:.3f}–{(e["end_ms"]-a)/1000:.3f}秒。')
        response=request(prompt,schema,proxy=clip,fps=3,thinking='disabled')
        proof=response.payload
        (folder/'evidence.json').write_text(json.dumps(dict(start_ms=a,end_ms=b,target=[e['start_ms'],e['end_ms']],
            payload=proof,usage=response.usage,responseId=response.response_id),ensure_ascii=False))
        if (not isinstance(proof,dict) or set(proof)!=set(fields) or proof['role']not in fields['role']['enum']
            or proof['graphic_overlay']not in ('large_graphics','subtitle_only','none') or type(proof['same_review'])is not bool or not isinstance(proof['evidence'],str)or not proof['evidence'].strip()):
            raise ValueError('Invalid review graphics evidence')
        if proof['role']=='presenter_overlay' and proof['graphic_overlay']=='large_graphics' and proof['same_review'] and left['unit']==right['unit']:
            result[i].update(kind='own_detail',unit=right['unit'],needs_ownership=False,action='presenter_overlay',
                ownership_basis='visible_presenter_under_graphics')
        elif proof['role']=='review_title' and proof['same_review'] and left['unit']==right['unit']:
            result[i].update(kind='independent_insert',unit='',intro_unit=right['unit'],
                ownership_basis='own_review_title_without_duration_credit')
    return result
