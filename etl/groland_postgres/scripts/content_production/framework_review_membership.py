"""Restore an owned review's editorial parts without pooling continuous time.

Only an independently measured, still-live core can anchor this optional audit.
The source footage and six bound frames establish ownership; labels, names and
reference answers never enter the observation. Source boundaries stay intact.
"""
import json
import math

from .segment_suggestion_provider import run_media

POLICY = 'framework-review-membership-v6'
MAX_TARGETS = 4
MAX_CONTEXT_MS = 180000
MAX_TOTAL_MS = 360000
PROMPT = '''核对目标T是否属于参考A同一完整个人测评内容单元。此处不判断实拍/混剪，不计算或累计时长，不识别姓名，不用角标，不给切点。只看本题指定目标，不用锚点或其他时刻的画面代替目标。
图片1-3是A三个时刻的实际画面，4-6是T三个时刻的实际画面，顺序已固定。请先分别描述anchor_visible和target_visible中真实可见的人物衣着、环境及动作，不能凭时间记忆看错人物。视频用于核对完整流程及中间内容；单张图不能证明全段。
完整个人测评可含同一人的剧情开场、妆前妆后、换装/换场景持妆、自己的产品实验和本人收尾。广告口播引用的其他人物/独立广告/其他人的体验，不能因为同产品同配音就算本人测评。
source_relation须说明目标内容与A的具体来源关系；flow_relation须说明目标是本次引入/操作/测试/反馈/收尾，还是另起推荐或活动。continuing_review必须有属于A这次测评的具体证据；separate_content为独立推荐、无关人物或外来演示、另起活动；无法核对选uncertain。不得仅凭提供了A就合并，也不得仅因换衣、产品近景、价格就拆开。evidence记录可回看核对的事实。'''
RETURN_PROMPT = '''核对A、短插入T、返回B的内容组织，不判断实拍/混剪，不计算或累计时长，不用角标或姓名。
图片1-3是A，4-6是T，7-9是B的真实原片画面。先分别描述三者的人物、场景与动作。视频用于核对A到T再到B的完整过程，不能在T结束处提前判断A的测评结束。
outer_relation核对A与B是否同一主讲人的本次测评继续。insert_role核对T是该测评具体论点的局部说明，还是另一个独立推荐/广告。其他人的肤质问题近景可以是主讲测评中具体问题的说明，但必须指出被说明的具体问题、前后论述如何继续；不能只因同产品、同配音、同一个人返回就合并。独立推荐、独立包装/成分广告仍是独立素材。
仅在A和B属于同一测评、T确实是本次论点的局部说明时，relationship=continuing_review；独立素材选separate_content；证据不足选uncertain。只改变内容单元归属，不声称T与A为同一物理人物，不把中间插入的时间当成连续时长。
产品特写也要区分：若A明确提出本次测评要验证的具体成分/性质，T展示这一点，B立即返回并实际开展对应测试，可是测评中的说明步骤；若T自成推荐、另起卖点或活动，仅前后同产品/同配音，仍是独立素材。两侧连续核心均已分别核实，不能借这个归属判断把被插断的短段凑时长。'''


SOURCE_PROMPT = '''\n目标范围内的原片观察还发现了独立包装/成分展示镜头。需要单独核对来源，不得用“同一产品、同一配音、引出后续测评”推翻物理来源证据。
source_link=observed_test_connection仅用于视频实际展示了该镜头与主讲人本次测试的连接，例如同一操作动作的接续、可对应的现场器材和操作状态、明确记录的本人换场测试。必须在test_connection_evidence中写出具体可见连接及时间。
只有同产品、文案衔接、持续配音或推荐主题相同，source_link=editorial_only；这些只能证明剪辑上有关联，不能证明是本人的测评步骤。看不清或证据冲突填uncertain。不能根据角标、名人身份或手部泛泛相似来认定来源。'''

SLATE_PROMPT = '''\nT是原片最开头不足半秒的产品画面。请重点核对图片4-6的真实内容，不能因视频抽帧漏掉它而假设没有片头。
source_link=opening_identity_slate仅用于：T只展示A实际使用的同一产品的静态身份卡（产品名、品牌、备案说明），没有另起功效论述、成分广告、价格福利、人物推荐或操作序列；A随后完整开展自己的独立演示。必须写出T的可见文字、产品与A中实物的具体对应，不能只说同主题。
这样的身份卡可以作为完整演示的附属片头，relationship=continuing_review；这是编辑归属，不证明T和A同次拍摄，不累计T的连续时长。T若自成广告或产品无法对应，仍选separate_content，source_link=editorial_only；不清楚填uncertain。'''


def schema(returning=False, source_check=False, opening_slate=False):
    fields = {k: {'type': 'string'} for k in
              ('anchor_visible', 'target_visible', 'source_relation', 'flow_relation', 'evidence')}
    fields['relationship'] = {'type': 'string', 'enum': ['continuing_review', 'separate_content', 'uncertain']}
    if returning:
        fields.update(return_visible={'type': 'string'},
                      outer_relation={'type': 'string', 'enum': ['same_review', 'different_review', 'uncertain']},
                      insert_role={'type': 'string', 'enum': ['local_illustration', 'independent_content', 'uncertain']})
    if source_check:
        fields.update(source_link={'type': 'string', 'enum': ['observed_test_connection', 'editorial_only', 'uncertain']},
                      test_connection_evidence={'type': 'string'})
        if opening_slate:
            fields['source_link']['enum'].append('opening_identity_slate')
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def supported_core(segment, claims):
    return segment['label_key'] == 'live_demo' and any(
        min(segment['end_ms'], c['end_ms']) - max(segment['start_ms'], c['start_ms']) >= c['minimum']
        and c['minimum'] > 10000 for c in claims)


def plan(segments, claims, windows=()):
    targets = []
    for i, anchor in enumerate(segments):
        if not supported_core(anchor, claims):
            continue
        # The initial short scene can be this review's own narrative setup.
        # A longer independent opening is never absorbed by its position.
        if (i == 1 and segments[0]['label_key'] == 'mixed_voiceover'
                and segments[0]['start_ms'] == 0 and 0 < segments[0]['end_ms'] < 9000
                and segments[0]['end_ms'] == anchor['start_ms']):
            targets.append(dict(indices=[0], start_ms=0, end_ms=segments[0]['end_ms'],
                                anchor_start_ms=anchor['start_ms'], anchor_end_ms=anchor['end_ms']))
        end = i + 1
        while (end < len(segments) and segments[end]['label_key'] in ('mixed_voiceover', 'promotion')
               and segments[end-1]['end_ms'] == segments[end]['start_ms']):
            end += 1
        if end == i + 1:
            continue
        targets.append(dict(indices=list(range(i+1, end)), start_ms=segments[i+1]['start_ms'],
                            end_ms=segments[end-1]['end_ms'], anchor_start_ms=anchor['start_ms'],
                            anchor_end_ms=anchor['end_ms']))
        target = targets[-1]
        # A short skin illustration between independently qualified cores can
        # require the return scene. Source-local IDs are never compared across
        # windows, and both duration witnesses remain separate.
        if (end < len(segments) and end == i+2 and target['end_ms']-target['start_ms'] <= 2000
                and segments[i+1]['label_key'] == 'mixed_voiceover'
                and supported_core(segments[end], claims)
                and segments[end]['start_ms'] == target['end_ms']
                and same_review_return(target, windows)):
            target.update(return_start_ms=segments[end]['start_ms'], return_end_ms=segments[end]['end_ms'])
    for target in targets:
        relevant = [e for w in windows for e in w['events']
            if min(e['end_ms'], target['end_ms']) > max(e['start_ms'], target['start_ms'])]
        barriers = sorted({(e['start_ms'], e['end_ms'], e['action']) for e in relevant
            if e['kind'] == 'independent_insert' and e.get('action') in ('packaging_display', 'ingredient_ad')})
        cursor = target['start_ms']
        for a,b,_ in barriers:
            if a > cursor:
                break
            cursor = max(cursor,b)
        # Inspect a standalone product insert, not an entire review containing
        # some product shots. A real presenter/operation within T changes the
        # question. A bounded A/T/B illustration has its own positive test.
        if (relevant and cursor >= target['end_ms'] and 'return_start_ms' not in target
                and all(e['kind'] == 'independent_insert'
                        and e.get('action') in ('packaging_display','ingredient_ad') for e in relevant)):
            target['source_barriers'] = [dict(start_ms=a, end_ms=b, action=action) for a,b,action in barriers]
            if (target['start_ms'] == 0 and target['end_ms'] < 500
                    and all(e.get('action') == 'packaging_display' for e in relevant)):
                target['opening_slate'] = True
    # Subsecond fragments enter only the explicit product-identity-card audit;
    # unknown roles, people and ingredient advertisements keep their boundaries.
    targets = [t for t in targets if t['start_ms'] != 0 or t['end_ms'] >= 500 or t.get('opening_slate')]
    spans = [max(p.get('return_end_ms', p['end_ms']), p['anchor_end_ms']) - min(p['start_ms'], p['anchor_start_ms']) for p in targets]
    if (len(targets) > MAX_TARGETS or any(n > MAX_CONTEXT_MS for n in spans)
            or sum(spans) > MAX_TOTAL_MS):
        raise ValueError('Review membership evidence budget exceeded')
    return targets


def same_review_return(target, windows):
    a, b = target['start_ms'], target['end_ms']
    for window in windows:
        runs = window['measured']['runs']
        for left, middle, right in zip(runs, runs[1:], runs[2:]):
            if not (middle['start_ms'] == a and middle['end_ms'] == b
                    and left['end_ms'] == a and right['start_ms'] == b
                    and left['unit'] and left['unit'] == right['unit']
                    and left['end_ms']-left['start_ms'] > 10000
                    and right['end_ms']-right['start_ms'] > 10000):
                continue
            events = [e for e in window['events'] if min(e['end_ms'],b)>max(e['start_ms'],a)]
            if (events and events[0]['start_ms'] == a and events[-1]['end_ms'] == b
                    and all(not e.get('needs_ownership') and (
                        e['kind'] == 'own_detail' and e.get('action') == 'skin_comparison' and e.get('visible') == 'person'
                        or e['kind'] == 'independent_insert' and e.get('action') in ('packaging_display','ingredient_ad')
                           and e.get('visible') in ('product','hands')) for e in events)):
                return True
    return False


def opening_frame_times(source, end_seconds, env, tick):
    """Bind a subsecond card to decoded frames, not a seek that rounds past T."""
    from .local_media_budget import media_slot
    from .shot_catalog import run

    # Packet interval termination can leave B-frames buffered in the decoder.
    # Decode a little beyond T, then admit only source PTS strictly within T.
    command = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-read_intervals',
               f'0%{end_seconds+1:.6f}', '-show_frames', '-show_entries',
               'frame=best_effort_timestamp_time', '-of', 'json', str(source)]
    with media_slot(command, tick, 60) as bounded:
        frames = json.loads(run(bounded, timeout=60, env=env)).get('frames', [])
    times = sorted({float(f['best_effort_timestamp_time']) for f in frames
                    if 'best_effort_timestamp_time' in f})
    times = [t for t in times if math.isfinite(t) and 0 <= t < end_seconds-1e-6]
    if not times:
        raise ValueError('Opening identity card has no bound source frames')
    return [times[0], times[len(times)//2], times[-1]]


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    anchor = [target['anchor_start_ms']/1000, target['anchor_end_ms']/1000]
    extent = [target['start_ms']/1000, target['end_ms']/1000]
    returning = 'return_start_ms' in target
    source_check = bool(target.get('source_barriers'))
    opening_slate = bool(target.get('opening_slate'))
    scopes = [anchor, extent]
    if returning:
        scopes.append([target['return_start_ms']/1000, target['return_end_ms']/1000])
    start, end = min(s[0] for s in scopes), max(s[1] for s in scopes)
    clip = work/'clip.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(start), '-i', str(source),
               '-t', str(end-start), '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'fast',
               '-crf', '26', '-c:a', 'aac', str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('Review membership context extraction failed')
    times = [a+(b-a)*part for a,b in scopes for part in (.15, .5, .85)]
    if opening_slate:
        times[3:6] = opening_frame_times(source, extent[1], env, tick)
    images = []
    for i, at in enumerate(times):
        image = work/f'frame-{i}.jpg'
        # Input seek chooses the next decoded frame; an epsilon before the
        # exact PTS avoids its decimal representation selecting the next frame.
        seek = max(0, at-.001) if opening_slate and 3 <= i < 6 else at
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(seek), '-i', str(source),
                   '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '2', str(image)]
        if run_media(command, env, tick, 60, poll_seconds=.1):
            raise ValueError('Review membership frame extraction failed')
        images.append(image)
    prompt = ((RETURN_PROMPT if returning else PROMPT) + f'\n本裁片时间：A={anchor[0]-start:.3f}–{anchor[1]-start:.3f}秒，'
              f'T={extent[0]-start:.3f}–{extent[1]-start:.3f}秒。图片对应裁片时间：' +
              json.dumps([round(t-start, 3) for t in times]))
    if returning:
        prompt += f'\nB={scopes[2][0]-start:.3f}–{scopes[2][1]-start:.3f}秒。'
    if source_check:
        prompt += (SLATE_PROMPT if opening_slate else SOURCE_PROMPT) + '\n需核对的裁片时间范围：' + json.dumps([
            dict(start=round(e['start_ms']/1000-start,3), end=round(e['end_ms']/1000-start,3))
            for e in target['source_barriers']])
    response = request(prompt, schema(returning, source_check, opening_slate), proxy=clip, boards=images, fps=2,
                       thinking='enabled', reasoning_effort='low')
    receipt = dict(target, imageTimesMs=[round(t*1000) for t in times], payload=response.payload,
                   usage=response.usage, responseId=response.response_id)
    (work/'evidence.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    validate(response.payload, returning, source_check, opening_slate)
    return receipt


def validate(proof, returning=False, source_check=False, opening_slate=False):
    fields = schema(returning, source_check, opening_slate)['properties']
    if (not isinstance(proof, dict) or set(proof) != set(fields)
            or any(not isinstance(v, str) or not v.strip() for v in proof.values())
            or any(proof[k] not in field['enum'] for k,field in fields.items() if 'enum' in field)):
        raise ValueError('Invalid review membership evidence')


def apply(segments, targets, observations):
    if len(targets) != len(observations):
        raise ValueError('Incomplete review membership evidence')
    result, corrections = [dict(s) for s in segments], []
    for target, observation in zip(targets, observations):
        proof = observation['payload']
        returning = 'return_start_ms' in target
        source_check = bool(target.get('source_barriers'))
        opening_slate = bool(target.get('opening_slate'))
        validate(proof, returning, source_check, opening_slate)
        if any(observation.get(k) != v for k,v in target.items()):
            raise ValueError('Review membership observation bound to wrong target')
        selected = [segments[i] for i in target['indices']]
        if (not selected or selected[0]['start_ms'] != target['start_ms']
                or selected[-1]['end_ms'] != target['end_ms']
                or any(s['label_key'] not in ('mixed_voiceover', 'promotion') for s in selected)
                or any(a['end_ms'] != b['start_ms'] for a,b in zip(selected, selected[1:]))):
            raise ValueError('Stale review membership target')
        if proof['relationship'] != 'continuing_review':
            continue
        accepted_links = ('observed_test_connection', 'opening_identity_slate') if opening_slate else ('observed_test_connection',)
        if source_check and proof['source_link'] not in accepted_links:
            continue
        if returning and (proof['outer_relation'] != 'same_review' or proof['insert_role'] != 'local_illustration'):
            continue
        for i in target['indices']:
            result[i].update(label_key='live_demo', reason='完整测评归属核验：' + proof['evidence'])
        corrections.append(dict(target, relationship=proof['relationship']))
    return result, corrections


def covers_calibrated_target(segment, proof, windows):
    """Preserve ownership only to an already observed same-shot source edge."""
    from .segment_shot_hints import SNAP_BEFORE_MS, SNAP_AFTER_MS

    a,b = segment['start_ms'],segment['end_ms']
    start,end = proof['start_ms'],proof['end_ms']
    if min(b,end) <= max(a,start) or start-a > SNAP_BEFORE_MS or b-end > SNAP_AFTER_MS:
        return False
    added = ([(a,start,True)] if a < start else []) + ([(end,b,False)] if b > end else [])
    for left,right,before in added:
        covering = [w for w in windows if w['start'] <= left and w['end'] >= right]
        if not covering:
            return False
        for window in covering:
            events = [e for e in window['events'] if e['start_ms'] <= left and e['end_ms'] >= right]
            if len(events) != 1:
                return False
            event = events[0]
            if (event['kind'] not in ('presenter','own_detail') or not event.get('unit')
                    or event.get('needs_ownership') or event.get('subject_conflict')
                    or before and not (event['start_ms'] == left and event['end_ms'] > right)
                    or not before and not (event['start_ms'] < left and event['end_ms'] == right)):
                return False
    return True


def supports(segment, segments, receipt):
    """Membership never becomes a new continuous-duration witness."""
    for proof in receipt.get('reviewMembership', {}).get('corrections', []):
        if (proof.get('relationship') != 'continuing_review'
                or not covers_calibrated_target(segment,proof,receipt.get('windows',[]))):
            continue
        # After final snapping, the independently qualified core must still be
        # present as live content. Restored parts cannot qualify one another.
        anchors = [('anchor_start_ms', 'anchor_end_ms')]
        if 'return_start_ms' in proof:
            anchors.append(('return_start_ms', 'return_end_ms'))
        if all(any(supported_core(dict(s, start_ms=max(s['start_ms'], proof[a]),
                       end_ms=min(s['end_ms'], proof[b])), receipt['liveClaims']) for s in segments)
               for a,b in anchors):
            return True
    return False


def verify(segments, source, work, env, tick, request, *, claims, windows=()):
    targets = plan(segments, claims, windows)
    observed = [observe(source, target, work/str(i), env, tick, request) for i,target in enumerate(targets)]
    result, corrections = apply(segments, targets, observed)
    return result, dict(policy=POLICY, targets=targets, observations=observed, corrections=corrections,
                        unresolved=[p for p in observed if p['payload']['relationship'] == 'uncertain'
                                    or p['payload'].get('source_link') == 'uncertain'])
