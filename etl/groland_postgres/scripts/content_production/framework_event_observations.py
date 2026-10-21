"""Separate visible subjects, review operations and actual presenters before timing."""
import json

PROMPT = '逐镜头记录短视频的真实画面，不判实拍/混剪、不计算连续时长、不用角标/人名/明星身份决定归属。返回按顺序覆盖全片的events，start/end为本视频秒数。每个事件只能一个出镜主讲人/一套衣服/一个环境，真实切换另起事件。\n将“画面主体”和“在测评中做什么”分开观察，避免看见脸就漏掉皮肤对比、把手部镜头写成人出镜：\nvisible：person=能看见实际人物面部或身体；hands=只有手部/手臂；product=产品静物/动画；scene=其他场景；unknown=不确定。小头像角标不能让纯产品画面变成person。\naction：talking_demo=主讲人讲解/展示；personal_application=主讲人亲自上脸/身体使用；skin_comparison=卡粉/出油/妆前妆后皮肤近景对比；wear_result=本人跨场景持妆结果；hand_operation=只见手部取粉/涂抹/按压/纸巾或手臂试验；packaging_display=只展示/开合/旋转产品包装；ingredient_ad=独立精修成分/产品广告；external_scene=外部片场化妆/影视等插入；other=其他。visible=person与action=skin_comparison可以同时成立；没有露脸的手臂试验必须visible=hands、action=hand_operation。\nunit用U1/U2表示同一完整测评内容单元。介绍→手部验证性质→上脸效果有具体流程衔接，可属于同一unit；自己的皮肤近景/持妆结果不另起unit。两个主讲人各自重新开始演示必须不同unit，不能因同产品/同配音合并。独立包装摆拍、成分广告、外部片场必须另列事件，unit为空；前后同人回来不能抹除插入。\nappearance简短记录实际可见的衣着、耳饰、美甲、环境与动作，不能与visible/action矛盾。没有归属证据的unit可为空，不凭同款产品猜归属。\n另外person用P1/P2标记实际可见的出镜人物/装扮，与完整测评unit分开：同一unit可以包含介绍与演示的不同角色，但两位不同主讲人绝不能复用person。明显不同服装/装扮的拍摄先给不同person，不能因妆容相似或同一产品当同一人；纯手部/产品镜头person为空，不给看不见的人编身份。自己的皮肤对比/持妆结果即使外观变了，仍保留其内容action，不能当成新主讲人的完整独立演示。'
PROMPT += '\n原主讲人仍在同一环境连续出镜，仅叠加成分图标、字幕、角标或小产品贴图，不是独立广告，不另起素材。整幅画面被独立产品/成分广告替换才中断。'
VISIBLE = ('person','hands','product','scene','unknown')
ACTIONS = ('talking_demo','personal_application','skin_comparison','wear_result','hand_operation',
           'packaging_display','ingredient_ad','external_scene','other')
DETAIL_ACTION = 'application_detail'


def schema():
    fields = {name: {'type': 'string'} for name in ('unit','person','appearance')}
    fields.update(start={'type': 'number'}, end={'type': 'number'},
                  visible={'type': 'string','enum': list(VISIBLE)},
                  action={'type': 'string','enum': list(ACTIONS)})
    return {'type':'object','additionalProperties':False,'required':['events'],'properties': {
        'events': {'type':'array','items': {'type':'object','additionalProperties':False,
                                         'required':list(fields),'properties':fields}}}}


def decode(payload):
    values = payload.get('events') if isinstance(payload, dict) else None
    if not isinstance(values, list) or not values or len(values) > 100:
        raise ValueError('Missing local action observations')
    result = []
    for index, event in enumerate(values):
        if (not isinstance(event, dict) or set(event) != set(schema()['properties']['events']['items']['properties'])
                or event['visible'] not in VISIBLE or event['action'] not in (*ACTIONS,DETAIL_ACTION)
                or any(not isinstance(event[k], str) for k in ('unit','person','appearance'))):
            raise ValueError('Inconsistent local subject/action evidence')
        if event['action'] in ('talking_demo','personal_application') and (
                event['visible'] != 'person' or not event['person']):
            # Feed a concrete contradiction into the existing single bounded
            # re-observation. Do not guess an identity or silently relabel it.
            raise ValueError(f'Inconsistent local subject/action evidence at event {index}: '
                'talking_demo/personal_application requires a visible presenter and nonempty person. '
                '重新看该事件：单人出镜需填写实际person；只有确属多个独立来源的分屏拼贴才用external_scene，'
                '不能把多个来源拼贴当成一个主讲人，也不能仅因人物ID缺失就改判插入。')
        if event['action'] == 'external_scene' and event['visible'] != 'person' and event['person']:
            # An insert without review anchors cannot resolve contradictory
            # subject fields in the later operation-ownership pass. Reuse the
            # existing single bounded window re-observation instead.
            raise ValueError(f'Inconsistent local subject/action evidence at event {index}: '
                'external_scene标为非人物画面却填写了person。重新核对可见主体：'
                '实际有人物面部或身体则visible=person；确实只有场景、产品或手部则person为空。'
                '只纠正可见事实，不猜归属，也不能据此改变独立素材的性质。')
        action = event['action']
        subject_conflict = event['visible'] != 'person' and bool(event['person'])
        person = event['person'] if event['visible'] == 'person' else ''
        kind = ('presenter' if action in ('talking_demo','personal_application') else
                'own_detail' if action in ('skin_comparison','wear_result','hand_operation',DETAIL_ACTION) else
                'independent_insert' if action in ('packaging_display','ingredient_ad','external_scene') else 'other')
        if (action in ('packaging_display','ingredient_ad') and event['visible'] == 'person'
                and event['person']):
            # The visible presenter holding packaging / receiving an overlay is
            # still on camera. Only a separately observed non-presenter insert
            # can interrupt that recording; same-person joins are verified later.
            kind = 'presenter'
        # A content unit is not an identity: two independent presenters must
        # stay distinct even when the model assigns their montage the same U1.
        unit = json.dumps(['person', person]) if kind == 'presenter' else ''
        result.append(dict(start=event['start'], end=event['end'], unit=unit, kind=kind,
                           appearance=event['appearance'], visible=event['visible'],
                           person=person, action=action, review_unit=event['unit'],
                           subject_conflict=subject_conflict))
    for i, event in enumerate(result):
        if event['kind'] != 'own_detail':
            continue
        anchors = [e for e in result if event['review_unit'] and e['kind'] == 'presenter'
                   and e['review_unit'] == event['review_unit']]
        matching = [e for e in anchors if event['person'] and e['person'] == event['person']]
        people = {e['unit'] for e in matching or anchors}
        # This is a provisional observation, never permission to bridge a cut.
        # Interior operations still require the contextual ownership verifier.
        event['unit'] = next(iter(people)) if len(people) == 1 else json.dumps(['detail',i])
    return {'events': result}
