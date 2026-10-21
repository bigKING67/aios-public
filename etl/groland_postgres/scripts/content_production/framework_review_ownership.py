"""Observe review operations separately from physical presenter identity (Lite only)."""
import json

from .segment_suggestion_provider import run_media

MAX_CHECKS = 32
MAX_VIDEO_MS = 360000
FUNCTIONS = ['wear_result', 'skin_comparison', 'product_operation', 'packaging_display', 'ingredient_ad',
             'external_makeup_scene', 'presenter', 'uncertain']
PROMPT='''核对局部视频中的一个指定镜头，不判断实拍/混剪，不计算时长，不用角标或明星身份。
先写middle_visible（person=主讲人物面部/身体仍为实际主体；hands=仅手臂/手；product=产品或动画；scene=其他场景；uncertain=无法确定），角标头像不算person。再写middle_action：指定时间处的画面实际展示什么/做了什么。middle_function：皮肤问题/妆前妆后近景=skin_comparison；手部按压、取粉、涂抹、纸巾/手臂试验=product_operation；仅开合盒盖、旋开管身、拿出刷头或展示外壳/刷头形态，尚未进行实际取用涂抹试验=packaging_display；成分标识/动画/精修产品大片=ingredient_ad；另一个拍摄现场由化妆师为演员补妆=external_makeup_scene；主讲人独立演示=presenter；同一测评内户外/换场景展示持妆效果=wear_result。持妆结果是否属于本人的测试根据前后流程核对，不因换衣服/环境直接判neither；无关联的其他人物镜头仍是独立素材。
手指或粉扑实际接触粉体、按压、涂抹、纸巾/手臂试验，即使叠加工艺或成分文字也属于product_operation，不能被文字改判ingredient_ad；独立动画/精修布景宣传才是ingredient_ad。
仅把刷头放在手掌上方展示大小/结构，未接触皮肤、未涂抹或做性能试验，属于packaging_display，不是product_operation。其他时刻之后出现刷涂动作不能替代当前目标时刻的观察。
再写left_flow和right_flow：目标镜头前后的人分别从什么环节开始，到什么环节结束。左右主讲人各自从皮肤问题开始并各自上脸、展示效果，是independent_reviews。前人只介绍产品，中间手部验证性质，后人承接上脸演示，属于same_review，不能因换衣服/环境拆掉这种完整测评。自己的皮肤近景也是测评步骤，不是新主讲人。
middle_owner反映这个操作/对比属于左边、右边、双方承接还是独立素材。皮肤对比或手部操作必须结合视频动作判断，不能因无人物正脸就一律neither。独立包装摆拍、成分广告、外部片场补妆必须neither，前后同人或持续配音不改变这点。'''
PROMPT += '\n最后分别记录left_demonstrates/right_demonstrates：目标镜头前后各自对应的主讲人，是否在这段视频中亲自把粉扑/产品用到自己脸上或身体上？只手持产品讲解、皮肤静态近景或无主讲人的手部操作都不算。判断两个人各自的完整出镜过程，不能把右侧人的上脸操作算到左侧人。'


def schema():
    fields = {name: {'type': 'string'} for name in ('middle_action', 'left_flow', 'right_flow')}
    fields.update(middle_visible={'type':'string','enum':['person','hands','product','scene','uncertain']},
                  middle_function={'type': 'string', 'enum': FUNCTIONS},
                  middle_owner={'type': 'string', 'enum': ['left', 'right', 'both', 'neither', 'uncertain']},
                  outer_relation={'type': 'string', 'enum': ['same_review', 'independent_reviews', 'uncertain']},
                  left_demonstrates={'type': 'boolean'}, right_demonstrates={'type': 'boolean'})
    return {'type': 'object', 'additionalProperties': False, 'required': list(fields), 'properties': fields}


def batch_schema():
    item = schema()
    item['properties']['index'] = {'type': 'integer'}
    item['required'].append('index')
    return {'type':'object','additionalProperties':False,'required':['observations'],
            'properties': {'observations': {'type':'array','items':item}}}


def decode_batch(payload, count):
    values = payload.get('observations') if isinstance(payload, dict) else None
    if (not isinstance(values,list) or len(values) != count or
            any(not isinstance(v,dict) or type(v.get('index')) is not int for v in values) or
            {v['index'] for v in values} != set(range(count))):
        raise ValueError('Incomplete or duplicate operation targets')
    indexed = {}
    for value in values:
        proof = {k:v for k,v in value.items() if k != 'index'}
        validate(proof, resolved=False)
        indexed[value['index']] = proof
    return [indexed[i] for i in range(count)]


def observe_many(source, left, middles, right, work, env, tick, request):
    if not 1 <= len(middles) <= 8:
        raise ValueError('Invalid operation batch size')
    a, b = left['start_ms'], right['end_ms']
    targets = [(m['start_ms'] + m['end_ms']) / 2 - a for m in middles]
    work.mkdir(parents=True, exist_ok=True)
    clip = work / 'clip.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(a / 1000), '-i', str(source),
               '-t', str((b - a) / 1000), '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'fast',
               '-crf', '25', '-c:a', 'aac', str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('Review operation extraction failed')
    image_times = [(left['start_ms'] + left['end_ms']) // 2,
                   *[round(t + a) for t in targets], (right['start_ms'] + right['end_ms']) // 2]
    images = []
    for i, at in enumerate(image_times):
        image = work / f'evidence-{i}.jpg'
        cmd = ['ffmpeg','-nostdin','-v','error','-y','-ss',str(at / 1000),'-i',str(source),
               '-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
        if run_media(cmd, env, tick, 60, poll_seconds=.1):
            raise ValueError('Review target image extraction failed')
        images.append(image)
    prompt = PROMPT + (f'\n左侧主讲人锚点：0.000–{(left["end_ms"] - a) / 1000:.3f}秒；'
                      f'右侧主讲人锚点：{(right["start_ms"] - a) / 1000:.3f}–{(b - a) / 1000:.3f}秒。'
                      'left/right仅指这两个锚点主讲人，不把中间近景临时当成右主讲人；分别核对各自主讲人范围内的上脸动作。'
                      '主讲人仍连续出镜时叠加成分图标/字幕，不算独立插片。')
    prompt += ('\n附图顺序：左侧主讲人锚点、按index顺序的各目标原片画面、右侧主讲人锚点。'
               '每个目标的可见主体和静态内容以对应原片图为准，视频用于判断具体动作与前后流程；不能看错到相邻时刻。')
    if left.get('full_presenter_context'):
        prompt += ('\n此前只看相邻短镜头，可能把不同来源误连；本次已包含两侧完整的连续出镜。'
            '前人只推荐、后人上脸，并不自动属于同一测评。前一位完成自己的推荐，后一个人重新介绍、'
            '开始自己的一套使用演示，也可为independent_reviews，即使前人没有上脸。'
            'same_review须指出这些步骤如何共同推进同一次测试，也可为同一人的本次测评继续；'
            '不能仅凭同一产品、功能承接或持续旁白。')
    if len(middles) == 1:
        prompt += f'\n本段视频内目标镜头时间：{targets[0] / 1000:.3f}秒。只核对该时刻，不能改为其他操作镜头。'
    else:
        prompt += ('\n一次核对多个指定镜头，分别填写observations。每项保留index，禁止用一个时刻的观察覆盖另一个。目标秒数：' +
                   json.dumps([dict(index=i, at=round(at/1000,3)) for i,at in enumerate(targets)]))
    result = request(prompt, schema() if len(middles) == 1 else batch_schema(), proxy=clip, boards=images, fps=3, thinking='disabled')
    proofs = [result.payload] if len(middles) == 1 else decode_batch(result.payload, len(middles))
    record = dict(start_ms=a, end_ms=b, targets_ms=[t + a for t in targets], image_times_ms=image_times, payload=result.payload,
                  usage=result.usage, responseId=result.response_id)
    if left.get('full_presenter_context'):
        record['full_presenter_context'] = True
    (work / 'evidence.json').write_text(json.dumps(record, ensure_ascii=False))
    from . import framework_operation_provenance
    proofs=framework_operation_provenance.check(proofs,images,work,request,source_events=middles)
    from . import framework_detail_source
    return framework_detail_source.check(proofs,middles,images,clip,work,request)


def validate(proof, *, resolved=True):
    if (not isinstance(proof, dict) or set(proof)-{'physical_source_different','physical_source_unresolved'} != set(schema()['properties'])
            or any(not isinstance(proof[k], str) for k in ('middle_action','left_flow','right_flow'))
            or proof['middle_visible'] not in ('person','hands','product','scene','uncertain')
            or proof['middle_function'] not in FUNCTIONS
            or proof['middle_owner'] not in ('left','right','both','neither','uncertain')
            or proof['outer_relation'] not in ('same_review','independent_reviews','uncertain')
            or any(type(proof[k]) is not bool for k in ('left_demonstrates','right_demonstrates'))):
        raise ValueError('Invalid review operation observation')
    if any(k in proof and type(proof[k])is not bool for k in ('physical_source_different','physical_source_unresolved')):
        raise ValueError('Invalid physical source observation')
    if resolved and (proof['middle_owner'] == 'uncertain' or
                     proof['middle_function'] == 'uncertain' and proof['middle_owner'] != 'neither'):
        raise ValueError('Unresolved review operation ownership')


def repair(events, ask, *, presenter_observer=None):
    result, joins, deferred, checked_edges = [dict(e) for e in events], set(), [], set()

    def anchor(index, step):
        for j in range(index + step, len(result) if step > 0 else -1, step):
            if result[j]['kind'] == 'presenter':
                return j
            if result[j]['kind'] not in ('own_detail',):
                return None
        return None

    def full_presenter(index):
        selected = result[index]
        first = last = index
        def same_source(event):
            return (event['kind'] == 'presenter' and event['unit'] == selected['unit']
                    and not event.get('needs_ownership') and
                    (not event.get('person') or not selected.get('person')
                     or event['person'] == selected['person']))
        while first and same_source(result[first-1]) and result[first-1]['end_ms'] == result[first]['start_ms']:
            first -= 1
        while last+1 < len(result) and same_source(result[last+1]) and result[last]['end_ms'] == result[last+1]['start_ms']:
            last += 1
        return dict(selected,start_ms=result[first]['start_ms'],end_ms=result[last]['end_ms'],full_presenter_context=True)

    def prior_review_extent(li,ri,projected=None):
        left = result[li]
        start,end = left['start_ms'],left['end_ms']
        review_unit = left.get('review_unit')
        def belongs(event):
            return (event['kind'] in ('presenter','own_detail') and
                    (event['unit'] == left['unit'] or event['kind'] == 'own_detail'
                     and review_unit and event.get('review_unit') == review_unit))
        for previous in reversed(result[:li]):
            if previous['end_ms'] != start or not belongs(previous):
                break
            start = previous['start_ms']
        # Resolve the whole operation gap, including provisional own steps.
        # They can prevent an unsafe join but cannot qualify a published run
        # until their individual ownership observations also pass.
        for j in range(li+1,ri):
            following = projected[1] if projected and projected[0] == j else result[j]
            if following['start_ms'] != end or not belongs(following):
                break
            end = following['end_ms']
        return start,end

    # Resolve possible insert barriers first. An operation misobserved as a
    # packshot must not hide the adjacent skin/hand steps from their anchors.
    order = sorted(range(1, len(result) - 1), key=lambda i: result[i]['kind'] != 'independent_insert')
    for i in order:
        middle = result[i]
        # A long scene with a locally detected face belongs to presenter
        # continuity verification, not a single midpoint operation classifier.
        if middle['kind'] == 'presenter' and middle['end_ms'] - middle['start_ms'] >= 9000:
            continue
        li, ri = anchor(i, -1), anchor(i, 1)
        if li is None or ri is None:
            continue
        left, right = result[li], result[ri]
        sandwich = (li == i - 1 and ri == i + 1 and left['unit'] == right['unit']
                    and middle['unit'] != left['unit'] and middle['end_ms'] - middle['start_ms'] <= 5000)
        detail = middle.get('observed_kind', middle['kind']) in ('own_detail','independent_insert')
        short_comparison = (middle['kind'] == 'presenter' and 'action' not in middle
                            and middle['end_ms'] - middle['start_ms'] < 3000
                            and result[i - 1]['kind'] == 'own_detail' and result[i + 1]['kind'] == 'own_detail')
        if not (detail or sandwich or short_comparison or middle.get('needs_ownership')):
            continue
        proof = ask(left, middle, right)
        validate(proof)
        if (left['unit'] != right['unit'] and proof['middle_function'] == 'product_operation'
                and proof['outer_relation'] == 'same_review' and not proof['left_demonstrates']
                and proof['right_demonstrates'] and proof['middle_visible'] in ('hands','product')
                and proof['middle_owner'] in ('left','right','both')):
            whole_left,whole_right = full_presenter(li),full_presenter(ri)
            projected = dict(middle,kind='own_detail',
                             unit=right['unit'] if proof['middle_owner']=='right' else left['unit'])
            prior_start,prior_end = prior_review_extent(li,ri,(i,projected))
            if (prior_end-prior_start < 9000 and
                    (whole_left['start_ms'] != left['start_ms'] or whole_right['end_ms'] != right['end_ms'])):
                proof = ask(whole_left,middle,whole_right)
                validate(proof)
                middle['ownership_context_rechecked'] = [whole_left['start_ms'],whole_left['end_ms'],
                                                         whole_right['start_ms'],whole_right['end_ms']]
        middle['needs_ownership'] = False
        if proof.get('physical_source_unresolved'):
            middle['allow_tolerance']=False
        if proof.get('physical_source_different'):
            middle['ownership_basis']='source_evidence_proves_different_recording'
        function, owner = proof['middle_function'], proof['middle_owner']
        middle['observed_function'] = function
        # Functional review steps and the physical identity of a close-up are
        # separate facts. Two observations must agree on the comparison's role
        # and flow; a missing physical owner alone cannot turn it into an ad.
        if (not proof.get('physical_source_different') and owner == 'neither' and function in ('skin_comparison','wear_result')
                and proof['outer_relation'] == 'same_review' and left['unit'] == right['unit']
                and middle.get('action') == function and middle.get('review_unit')
                and middle['review_unit'] == left.get('review_unit') == right.get('review_unit')):
            owner = 'both'
            middle['ownership_basis'] = 'observed_comparison_in_same_review'
        visible_host = proof['middle_visible'] == 'person' and owner not in ('neither','uncertain')
        # A packaging outro may belong to the final framework block while
        # remaining a hard break in its continuous-duration evidence. The
        # duration policy must first qualify the preceding core independently.
        if (function == 'packaging_display' and not visible_host
                and proof['outer_relation'] == 'same_review'
                and proof['left_demonstrates'] and not proof['right_demonstrates']
                and left['unit'] and left['unit'] == right['unit']
                and li == i - 1 and ri == i + 1):
            middle['outro_unit'] = left['unit']
        if (function == 'packaging_display' and not visible_host
                and proof['outer_relation'] == 'same_review' and not proof['left_demonstrates']
                and left['unit'] and left['unit'] == right['unit'] and li == i-1 and ri == i+1):
            middle['intro_unit'] = left['unit']
        if (function == 'external_makeup_scene' or owner == 'neither' or
                function in ('packaging_display','ingredient_ad') and not visible_host):
            middle.update(kind='independent_insert', unit='')
            continue
        if function == 'presenter':
            if proof['middle_visible'] != 'person':
                raise ValueError('Presenter correction lacks visible person evidence')
            corrected_detail = middle['kind'] != 'presenter' and not middle.get('person')
            middle['visible'] = 'person'
            if not middle['unit']:
                # A corrected role establishes a visible presenter here, not
                # their identity relative to either neighbor. Keep a distinct
                # recording unit; subsequent frame checks may connect it.
                middle['unit'] = f'observed_presenter_{middle["start_ms"]}_{middle["end_ms"]}'
                middle['ownership_basis'] = 'visible_presenter_separate_unit'
            if corrected_detail and presenter_observer is not None:
                # A function correction proves a visible presenter, not their
                # identity. Bind an anonymous detail ID only after comparing
                # the actual returning face with a neighboring source anchor.
                neighbors = (right,left) if owner == 'right' else (left,right)
                for neighbor in neighbors:
                    times = sorted([(neighbor['start_ms']+neighbor['end_ms'])//2,
                        (middle['start_ms']+middle['end_ms'])//2,
                        middle['end_ms']-min(150,(middle['end_ms']-middle['start_ms'])//4)])
                    identity = presenter_observer(times)
                    if (identity.get('same_outer_person') is True
                            and len(identity.get('kinds',[])) == 3
                            and all(k in ('presenter','own_detail') for k in identity['kinds'])
                            and all(identity.get(k) in ('same_review','own_detail')
                                    for k in ('left_to_middle','middle_to_right'))):
                        middle.update(unit=neighbor['unit'],
                                      ownership_basis='source_presenter_identity',
                                      presenter_identity_images_ms=times)
                        if neighbor.get('person'):
                            middle['person'] = neighbor['person']
                        break
            # The local observer may have recorded an outdoor wear-test result
            # as this presenter's own detail. A verified return can preserve it
            # without merging independently identified presenters.
            if (middle.get('observed_kind') == 'own_detail' and left['unit'] == middle['unit'] == right['unit']
                    and proof['outer_relation'] == 'same_review' and owner != 'neither'):
                for j in (i, i + 1):
                    if result[j - 1]['unit'] == result[j]['unit']:
                        joins.add(result[j]['start_ms'])
            middle.update(kind='presenter')
            continue
        independent = (left['unit'] != right['unit'] and proof['left_demonstrates']
                       and proof['right_demonstrates'])
        if (independent and owner == 'right' and function in ('skin_comparison','wear_result')
                and 'person' in middle and not middle['person']):
            # An unidentified comparison cannot establish that the next
            # independently demonstrated presenter has already begun. Keep the
            # current review's step until a visible presenter boundary.
            owner = 'left'
        middle.update(kind='own_detail', unit=right['unit'] if owner == 'right' else left['unit'])
        left_start,left_end = prior_review_extent(li,ri)
        # A complete preceding presenter remains complete even when the hand
        # operation belongs to the next presenter. Requiring that new operation
        # to belong to the left erased the existing core and merged two reviews.
        prior_complete_unit = left_end - left_start >= 9000
        if prior_complete_unit and left['unit'] != right['unit']:
            middle['prior_review_extent_ms'] = [left_start, left_end]
        # A skin comparison is one review's own step; an operation may join
        # complementary roles, but never two independently demonstrated reviews.
        shared = proof['outer_relation'] == 'same_review' and (
            function in ('skin_comparison','wear_result') and left['unit'] == right['unit'] or
            function == 'product_operation' and (
                left['unit'] == right['unit'] and owner == 'both' or
                not proof['left_demonstrates'] and proof['right_demonstrates'] and not prior_complete_unit
                and proof['middle_visible'] in ('hands','product')))
        if shared and left['unit'] != right['unit']:
            # Inserts are inspected first so they cannot hide later anchors.
            # Earlier own details may still be unresolved at this point. A
            # short nearest anchor is not proof that its whole review is short;
            # decide a cross-presenter join only after every detail is checked.
            deferred.append((li,i,ri))
        if (function == 'product_operation' and middle['unit'] == left['unit']
                and not proof['left_demonstrates'] and not shared):
            left['allow_tolerance'] = middle['allow_tolerance'] = False
        # Only explicitly checked adjacent steps may bypass a static-frame
        # identity comparison. Never bridge an intervening independent insert.
        checked_edges.update((i,i+1))
    for li,i,ri in deferred:
        left,middle,right = result[li],result[i],result[ri]
        if left['unit'] == right['unit']:
            continue
        start,end = prior_review_extent(li,ri)
        if end-start >= 9000:
            middle['prior_review_extent_ms'] = [start,end]
            left['allow_tolerance'] = middle['allow_tolerance'] = False
            continue
        # Another observed barrier or unowned step vetoes the pending link.
        block = result[li:ri+1]
        if (any(e['kind'] not in ('presenter','own_detail') or e.get('needs_ownership') for e in block)
                or any(x['end_ms'] != y['start_ms'] for x,y in zip(block,block[1:]))):
            continue
        old = right['unit']
        for j in range(ri,len(result)):
            if result[j]['unit'] != old or result[j]['kind'] not in ('presenter','own_detail'):
                break
            result[j]['unit'] = left['unit']
        middle['unit'] = left['unit']
    for j in checked_edges:
        if (result[j-1]['unit'] and result[j-1]['unit'] == result[j]['unit']
                and result[j-1]['kind'] in ('presenter','own_detail')
                and result[j]['kind'] in ('presenter','own_detail')
                and result[j-1]['end_ms'] == result[j]['start_ms']):
            joins.add(result[j]['start_ms'])
    return result, joins


def check_budget(calls, used_ms, next_ms):
    """Preflight the actual additional video input before buying a request."""
    if next_ms <= 0 or calls >= MAX_CHECKS or used_ms + next_ms > MAX_VIDEO_MS:
        raise ValueError('Review operation budget exceeded; no partial publication')
