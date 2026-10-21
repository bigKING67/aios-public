"""Resolve coarse presenter claims contradicted by several physical detail shots."""
import copy
import json

from . import framework_event_observations as observations
from .segment_suggestion_provider import run_media

MAX_CHECKS = 3
MAX_INPUT_MS = 180000


def reconcile_units(events, ask):
    """Bind a re-observed local ID only through an adjacent source witness.

    A new namespace prevents accidental ID reuse; it is not positive evidence
    of a new recording. Never cross an insert or copy the coarse parent's ID
    without checking the actual boundary pictures.
    """
    result = [dict(e) for e in events]
    checked = set()
    for i, event in enumerate(result):
        parent = event.get('source_parent_unit')
        unit = event.get('unit')
        if not parent or not unit or unit == parent or unit in checked or event['kind'] != 'presenter':
            continue
        group = [i]
        while group[-1]+1 < len(result):
            j = group[-1]+1
            if (result[j]['unit'] != unit or result[j]['kind'] not in ('presenter','own_detail')
                    or result[j-1]['end_ms'] != result[j]['start_ms']):
                break
            group.append(j)
        lo, hi = group[0], group[-1]
        anchors = [j for j in (lo-1,hi+1) if 0 <= j < len(result)
            and result[j]['kind']=='presenter' and result[j]['unit']==parent
            and not result[j].get('needs_ownership') and
            (result[j]['end_ms']==result[lo]['start_ms'] or result[hi]['end_ms']==result[j]['start_ms'])]
        if not anchors:
            continue
        anchor = result[anchors[0]]
        faces = [result[j] for j in group if result[j]['kind']=='presenter']
        points = sorted([(anchor['start_ms']+anchor['end_ms'])//2,
            faces[0]['start_ms']+min(700,(faces[0]['end_ms']-faces[0]['start_ms'])//3),
            faces[-1]['end_ms']-min(700,(faces[-1]['end_ms']-faces[-1]['start_ms'])//3)])
        proof = ask(points)
        checked.add(unit)
        if (proof.get('same_outer_person') is True
                and all(k in ('presenter','own_detail') for k in proof.get('kinds',[]))
                and len(proof.get('kinds',[]))==3
                and all(proof.get(k) in ('same_review','own_detail') for k in ('left_to_middle','middle_to_right'))):
            for j in group:
                result[j].update(unit=parent, source_unit_binding='adjacent_source_pictures')
    return result


def schema():
    value = observations.schema()
    value['properties']['events']['items']['properties']['action']['enum'].append(observations.DETAIL_ACTION)
    return value


def targets(original, refined):
    result = []
    for event in original:
        if event.get('action') != 'talking_demo' or event['end_ms']-event['start_ms'] < 10000:
            continue
        details = [e for e in refined if event['start_ms'] <= e['start_ms'] and e['end_ms'] <= event['end_ms']
                   and e.get('source_observed_kind') == 'own_detail' and e['end_ms']-e['start_ms'] >= 3000]
        # One application close-up is compatible with a presenter. Repeated
        # substantial detail shots contradict a single unbroken talking event
        # and deserve a focused observation before inheriting its identity.
        if len(details) >= 2:
            result.append((event, details))
    return result


def repair(original, refined, source, cuts, folder, env, tick, request, align, state):
    selected = targets(original, refined)
    if not selected:
        return original, False
    replacements = {}
    for event, details in selected:
        a,b = event['start_ms'],event['end_ms']
        key = (a,b)
        if key in state.setdefault('cache', {}):
            replacements[key] = copy.deepcopy(state['cache'][key])
            continue
        if state.get('calls',0) >= MAX_CHECKS or state.get('input_ms',0)+b-a > MAX_INPUT_MS:
            raise ValueError('Source role observation budget exceeded; no partial publication')
        work = folder/f'source-roles-{a}-{b}'
        work.mkdir(parents=True,exist_ok=True)
        clip = work/'clip.mp4'
        command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(a/1000),'-i',str(source),
                 '-t',str((b-a)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast',
                 '-crf','25','-c:a','aac',str(clip)]
        if run_media(command,env,tick,300,poll_seconds=.2):
            raise ValueError('Source role clip extraction failed')
        times=[a+min(500,(b-a)//4),*[(e['start_ms']+e['end_ms'])//2 for e in details[:6]],b-500]
        images=[]
        for i,at in enumerate(times):
            image=work/f'{i}.jpg'
            command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(at/1000),'-i',str(source),
                     '-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
            if run_media(command,env,tick,60,poll_seconds=.1):
                raise ValueError('Source role frame extraction failed')
            images.append(image)
        prompt=(observations.PROMPT+'\n此前粗观察把本段当成单个主讲人一直讲解，但物理切点中的多张图显示细节画面。'
            '请重新观察完整本段，逐个实际画面替换列出events，不能沿用粗观察的人物或动作。'
            '假睫毛模型、仅手与刷头、局部眼妆画面不能因前面有人讲解就当成此人持续出镜。'
            '只见眼部时，不要猜测看不见的衣服、布景或人物身份；相同产品/持续旁白不能证明同一来源。'
            '这里补充action=application_detail：只见局部眼部/嘴唇等刷涂动作，无法核对主讲人身份；'
            '此时visible=person、person可为空。personal_application仅用于能确定实际出镜主讲人的自身演示。'
            '也不能因近景就直接认定外来素材，应保留实际取用、上妆与同人前后对比证据。'
            f'附图依次来自本段秒数{[(t-a)/1000 for t in times]}，用于核对真实主体；视频用于判断动作和切换。'
            f'完整覆盖0至{(b-a)/1000:.3f}秒，不判业务类别。')
        state['calls']=state.get('calls',0)+1
        state['input_ms']=state.get('input_ms',0)+b-a
        response=request(prompt,schema(),proxy=clip,boards=images,fps=2,thinking='disabled')
        (work/'evidence.json').write_text(json.dumps(dict(start_ms=a,end_ms=b,image_times_ms=times,
            payload=response.payload,usage=response.usage,responseId=response.response_id),ensure_ascii=False))
        decoded=observations.decode(response.payload)
        for item in decoded['events']:
            for field in ('unit','person','review_unit'):
                if item.get(field):
                    item[field]=f'source_{a}_{b}:{item[field]}'
        checked=align(decoded,a,b,cuts)
        for item in checked:
            item['observed_kind']=item['kind']
            item['source_role_reobserved']=True
            item['source_parent_unit']=event['unit']
        state['cache'][key]=copy.deepcopy(checked)
        replacements[key]=checked
    output=[]
    for event in original:
        output.extend(replacements.get((event['start_ms'],event['end_ms']),[event]))
    return output, True
