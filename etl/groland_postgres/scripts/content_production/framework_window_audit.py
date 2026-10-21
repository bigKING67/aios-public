"""Local Lite video windows plus frame-level continuity checks for v16.

The whole-film proposal supplies context. Local observations can split its
people and restore missed demonstrations, without using a sample ID or answer.
"""
import json
import math

from . import framework_event_observations as observations
from . import framework_continuity as continuity
from . import framework_face_presence as presence
from . import framework_review_ownership as ownership
from .segment_shot_hints import refine_command, parse_scored_cuts, MAX_LOG_BYTES, SNAP_THRESHOLD
from .segment_suggestion_provider import run_media, SuggestionError

WINDOW_PROMPT = observations.PROMPT
TRIAD_PROMPT = '''这是按时间顺序排列的3张真实视频画面。逐张核对主体衣服及环境，忽略所有明星姓名/推荐角标和画中画小头像。
先在appearance中按图片顺序简述每张图的主体衣服、环境（看不见就写不可见），在kinds中依次记录presenter/own_detail/independent_insert/other，再判断左到中、中到右的素材关系。
same_review=同一次演示；own_detail=自己的皮肤近景、操作或前后对比；different_person=换人；separate_recording=衣服、环境等不同且无同一次测试联系的不同拍摄素材；independent_insert=独立产品广告、成分宣传、无关片场/影视插入；uncertain=不能确定。
不要因同一个产品或同一张脸说素材连续，也不要因为皮肤近景、妆前妆后或滤镜就说换人。每图均须检查，不要用第一张描述代替后面的图片。'''
TRIAD_PROMPT += '''\n另填same_outer_person（左右主体是否同一个人）和middle_owner（中间素材属于left/right/both/neither/unknown）。
只有具体衣着/环境匹配或明确本人的皮肤近景对比才能确认所属，不能仅凭相同产品或画面相邻判断。中间若是独立精修成分广告、不同布景产品大片、无关片场化妆则neither。手部镜头的衣袖款式与人物服装明显不符、拍摄环境也不同，不能仅因相同产品认定同源。'''
TRIAD_PROMPT += '''\n产品特写须区分实际测评操作与独立布景的外观摆拍。实际取粉、划粉、涂抹等操作可属于own_detail；独立布景中只展示包装、开合盒盖、旋转产品的摆拍属于independent_insert。没有归属证据填unknown，不要把无法确认直接说成另一个人。'''
RELATIONS = ['same_review', 'own_detail', 'different_person', 'separate_recording', 'independent_insert', 'uncertain']
MAX_WINDOWS = 12
MAX_TRIADS = 48
MAX_CONTEXT_CHECKS = 12
MAX_CONTEXT_VIDEO_MS = 240000
MAX_COMPLETION_REPAIRS = 3
MAX_WINDOW_REPAIRS = 2
CONTEXT_PROMPT = '\n补充原片视频作为上下文，仍只回答所附3张图按顺序的关系。主讲人仍在同一环境连续出镜，仅叠加成分图标/字幕/小产品贴图，不是独立插片，仍为presenter；整幅画面被独立广告替换才中断。产品取用/开盖讲解与独立布景包装摆拍按视频动作区分，不凭一张手持产品图猜来源。'
REVIEW_CONTEXT_PROMPT = ('\n持妆测评可在同一测试过程中换场景、换衣服或跨白天/晚上；'
                        '需结合视频中的上妆、测试、展示结果的具体流程判断，'
                        '不能仅因衣服/环境变化拆成无关联素材，也不能仅因同一个人合并无关拍摄。')


def event_schema():
    return observations.schema()


def triad_schema():
    fields = {'appearance': {'type': 'array', 'items': {'type': 'string'}},
              'kinds': {'type': 'array', 'items': {'type': 'string', 'enum': ['presenter', 'own_detail', 'independent_insert', 'other']}},
              'same_outer_person': {'type': 'boolean'},
              'middle_owner': {'type': 'string', 'enum': ['left', 'right', 'both', 'neither', 'unknown']},
              'left_to_middle': {'type': 'string', 'enum': RELATIONS},
              'middle_to_right': {'type': 'string', 'enum': RELATIONS}}
    return {'type': 'object', 'additionalProperties': False, 'required': list(fields), 'properties': fields}


def triad_repair_schema():
    """A separate field per image prevents a multi-role array from shifting indices."""
    fields = dict(triad_schema()['properties'])
    appearance, kind = fields.pop('appearance')['items'], fields.pop('kinds')['items']
    for i in range(1, 4):
        fields[f'appearance{i}'], fields[f'kind{i}'] = appearance, kind
    return {'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}


def windows(segments, duration_ms):
    ranges = []
    for s in segments:
        a, b = s['start_ms'], s['end_ms']
        if not (s['label_key'] == 'mixed_voiceover' and b - a >= 9000 or
                s['label_key'] == 'live_demo'):
            continue
        # Chunk after merging the complete eligible range. Limiting this merge
        # to 45s restarted the 36s grid at every proposal boundary, repeatedly
        # buying observations of the same 12s context on long reviews.
        if ranges and a - ranges[-1][1] <= 500:
            ranges[-1] = (ranges[-1][0], b)
        else:
            ranges.append((a, b))
    result = []
    for a, b in ranges:
        # 12s context on either side keeps a ~10s review spanning a window edge
        # visible in full. Only each disjoint core is allowed to change labels.
        for start in range(a, b, 36000):
            end = min(b, start + 36000)
            result.append(dict(start=max(0, start - 12000), end=min(duration_ms, end + 12000),
                               core_start=start, core_end=end))
    if len(result) > MAX_WINDOWS:
        raise ValueError('Continuity window budget exceeded; no partial publication')
    return result


def read_cuts(source, start, end, work, env, tick):
    path = work / 'cuts.log'
    try:
        with path.open('wb') as stream:
            code = run_media(refine_command(source, start, end - start, .02), env, tick, 300,
                             stderr=stream, poll_seconds=.2)
        if code or path.stat().st_size > MAX_LOG_BYTES:
            raise ValueError('Continuity cut detection failed')
        return parse_scored_cuts(path.read_text(errors='replace'), start)
    finally:
        path.unlink(missing_ok=True)


def align_events(payload, start, end, cuts):
    values = payload.get('events') if isinstance(payload, dict) else None
    if not isinstance(values, list) or not values or len(values) > 100:
        raise ValueError('Missing local continuity events')
    events = []
    for v in values:
        if not isinstance(v, dict) or not {'start', 'end', 'unit', 'kind', 'appearance'} <= set(v):
            raise ValueError('Invalid local event')
        a, b = v['start'], v['end']
        if (any(isinstance(t, bool) or not isinstance(t, (int, float)) or not math.isfinite(t) for t in (a, b))
                or not 0 <= a < b or b * 1000 > end - start + 1000
                or v['kind'] not in {'presenter', 'own_detail', 'independent_insert', 'other'}
                or not isinstance(v['unit'], str) or not isinstance(v['appearance'], str)
                or v['kind'] == 'presenter' and not v['unit'] and b - a > 5):
            raise ValueError('Invalid local event evidence')
        a, b = start + round(a * 1000), min(end, start + round(b * 1000))
        if events and not -200 <= a - events[-1]['end_ms'] <= 1000:
            raise ValueError('Local event coverage has a gap/overlap')
        pending = not v['unit'] and v['kind'] in {'presenter','own_detail'}
        unit = v['unit']
        if pending:
            unit = f'__pending_{start}_{len(events)}'
            while any(isinstance(e, dict) and e.get('unit') == unit for e in values):
                unit += '_'
        events.append(dict(start_ms=a, end_ms=b, unit=unit, kind=v['kind'], appearance=v['appearance'],
                           needs_ownership=pending or v.get('subject_conflict', False),
                           **{k: v[k] for k in ('visible','person','action','review_unit','subject_conflict') if k in v}))
    if events[0]['start_ms'] - start > 1000 or end - events[-1]['end_ms'] > 1000:
        raise ValueError('Local events do not cover the window')
    events[0]['start_ms'], events[-1]['end_ms'] = start, end
    coarse_edges = [(left['end_ms'] + right['start_ms']) // 2
                    for left, right in zip(events, events[1:])]
    def belongs_to_edge(i, at):
        return ((i == 0 or 2*at > coarse_edges[i-1] + coarse_edges[i]) and
                (i+1 == len(coarse_edges) or 2*at <= coarse_edges[i] + coarse_edges[i+1]))
    options = [[(t,score) for t,score in cuts if abs(t-boundary) <= 800
                and events[i]['start_ms'] < t < events[i+1]['end_ms']]
               for i,boundary in enumerate(coarse_edges)]
    preferred = [max(pool,key=lambda c:(c[1],-abs(c[0]-coarse_edges[i])))[0] if pool else None
                 for i,pool in enumerate(options)]
    partitioned = set()
    for at in set(preferred)-{None}:
        contenders = [i for i,value in enumerate(preferred) if value == at]
        # Reallocate only a contested cut with a strong physical alternative
        # for every affected edge. An empty region cannot justify moving an
        # actual transition back onto an unobserved coarse timestamp.
        if len(contenders) > 1 and all(any(score >= SNAP_THRESHOLD and belongs_to_edge(i,t)
                for t,score in options[i]) for i in contenders):
            partitioned.update(contenders)
    for i, (left, right) in enumerate(zip(events, events[1:])):
        boundary = coarse_edges[i]
        candidates = [(t, score) for t, score in cuts if abs(t - boundary) <= 800
                      and left['start_ms'] < t < right['end_ms']
                      and (i not in partitioned or belongs_to_edge(i,t))]
        # Reserve a source cut for its nearest observed edge before comparing
        # strengths. A preceding coarse edge must not steal the next source's
        # entry and force that next edge onto weaker face/body motion.
        cut = max(candidates, key=lambda c: (c[1], -abs(c[0] - boundary)))[0] if candidates else boundary
        left['end_ms'] = right['start_ms'] = cut
    if any(e['start_ms'] >= e['end_ms'] for e in events):
        raise ValueError('Aligned events overlap or collapse')
    return events


def needs_video_context(proof):
    """A bounded source-video check for valid but unresolved/contradictory facts."""
    if not isinstance(proof, dict) or len(proof.get('kinds', [])) != 3:
        return False
    relations = [proof.get(k) for k in ('left_to_middle','middle_to_right')]
    return ('uncertain' in relations or
        any(relation=='separate_recording' and
            all(kind in ('presenter','own_detail') for kind in proof['kinds'][i:i+2])
            for i,relation in enumerate(relations)) or
        proof.get('same_outer_person') is True and any(r in ('different_person','separate_recording') for r in relations) or
        proof.get('middle_owner') == 'unknown' and proof['kinds'][1] == 'own_detail' or any(
        relation in ('same_review','own_detail') and
        any(k in ('presenter','own_detail') for k in proof['kinds'][i:i + 2]) and
        any(k in ('independent_insert','other') for k in proof['kinds'][i:i + 2])
        for i,relation in enumerate(relations)))


def refine_event(event, relations, times, cuts, serial, event_edges=()):
    if (not isinstance(relations, dict) or not isinstance(relations.get('appearance'), list)
            or len(relations['appearance']) != 3
            or not isinstance(relations.get('kinds'), list) or len(relations['kinds']) != 3
            or any(k not in {'presenter', 'own_detail', 'independent_insert', 'other'} for k in relations['kinds'])
            or any(not isinstance(v, str) for v in relations['appearance'])
            or any(relations.get(k) not in RELATIONS for k in ('left_to_middle', 'middle_to_right'))):
        raise ValueError('Invalid local triad evidence')
    parts, previous = [], event['start_ms']
    for index, key in enumerate(('left_to_middle', 'middle_to_right')):
        relation = relations[key]
        if relation in {'same_review', 'own_detail'}:
            continue
        if relation == 'uncertain':
            raise ValueError('Unresolved local recording transition')
        candidates = [(t, score) for t, score in cuts if times[index] < t < times[index + 1]]
        if not candidates:
            raise ValueError('Observed recording change lacks a source cut')
        # A source scene score measures pixel change, not a person change.
        # Prefer an observed event boundary within the confirmed transition;
        # otherwise a large jump cut of the old person can steal several seconds.
        boundaries = [t for t in event_edges if times[index] < t < times[index + 1]]
        if len(boundaries) > 1:
            raise ValueError('Observed recording transition has multiple candidate events')
        cut = boundaries[0] if boundaries else max(candidates, key=lambda c: c[1])[0]
        parts.append(dict(event, start_ms=previous, end_ms=cut, unit=f'{event["unit"]}_split{serial}_{len(parts)}'))
        previous = cut
    if not parts:
        if any(k in {'independent_insert', 'other'} for k in relations['kinds']):
            raise ValueError('Triad continuity contradicts its insert evidence')
        return [event]
    parts.append(dict(event, start_ms=previous, unit=f'{event["unit"]}_split{serial}_{len(parts)}'))
    for part in parts:
        kinds = [kind for t, kind in zip(times, relations['kinds']) if part['start_ms'] <= t < part['end_ms']]
        if any(k in {'independent_insert', 'other'} for k in kinds):
            part.update(kind='independent_insert', unit='')
    return parts


def event_facts(events, duration_ms=None, *, core=None):
    for i, event in enumerate(events):
        if not event.get('needs_ownership'):
            continue
        # Ownership can be irrelevant to the label, but uncertainty is never
        # itself evidence for montage. Bound the *entire* connected interval
        # between observed inserts: even assigning every shot to one reviewer
        # must remain below the smallest qualifying duration. Window edges,
        # unknown scenes and missing coverage cannot establish this bound.
        left = right = i
        while left and events[left - 1]['kind'] in ('presenter', 'own_detail'):
            left -= 1
        while right + 1 < len(events) and events[right + 1]['kind'] in ('presenter', 'own_detail'):
            right += 1
        block = events[left:right + 1]
        context = events[max(0, left - 1):right + 2]
        bounded = ((block[0]['start_ms'] == 0 or
                    left > 0 and events[left - 1]['kind'] == 'independent_insert')
                   and (block[-1]['end_ms'] == duration_ms or
                        right + 1 < len(events) and events[right + 1]['kind'] == 'independent_insert')
                   and all(a['end_ms'] == b['start_ms'] for a, b in zip(context, context[1:])))
        upper_ms = block[-1]['end_ms'] - block[0]['start_ms']
        if (bounded and core is not None and
                (block[-1]['end_ms'] <= core[0] or block[0]['start_ms'] >= core[1])):
            # Overlap supplies context, not publication authority. A fully
            # insert-bounded block outside this core cannot change its labels;
            # its owning window must still resolve it before final publication.
            event['ownership_deferred_outside_core'] = True
            continue
        if not bounded or upper_ms >= 9000:
            raise ValueError('Unresolved local recording unit')
        event['ownership_irrelevant_below_ms'] = upper_ms
    frames, facts = [], []
    for i, event in enumerate(events):
        kind = event['kind']
        role = kind if kind != 'other' else 'unknown'
        unit = event['unit'] if kind in {'presenter', 'own_detail'} else ''
        frames.append(dict(index=i, start_ms=event['start_ms'], end_ms=event['end_ms'],
                           allow_tolerance=event.get('allow_tolerance', True)))
        # A verified person/recording split supersedes the window's coarse ID.
        # Keeping its old P1 on both pieces would falsely mark a new complete
        # demonstration as a returning interrupted fragment.
        visible = kind == 'presenter' or event.get('visible') == 'person' and bool(event.get('person'))
        person = unit if unit and visible else ''
        facts.append(dict(i=i, p=person, u=unit, r=role,
                          l='matching_setting' if kind == 'own_detail' else 'face' if kind == 'presenter' else 'none'))
    return frames, {'shots': facts}


def visible_presenters(events, source, folder, env, tick):
    """A face-positive hint repairs a full-face scene mislabeled as hands/detail.

    This is the existing local detector, not identity recognition. A miss never
    demotes a presenter. Unit grouping still needs the separate Lite review.
    """
    result = [dict(e) for e in events]
    for event in result:
        event['observed_kind'] = event['kind']
    selected = [i for i, e in enumerate(result) if e['kind'] == 'own_detail' and 'action' not in e]
    if not selected:
        return result
    work = folder / 'detail-faces'
    work.mkdir(exist_ok=True)
    frames = []
    for i in selected:
        event = result[i]
        at = (event['start_ms'] + event['end_ms']) // 2
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(at / 1000), '-i', str(source),
                   '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '2', str(work / f'{i}.jpg')]
        if run_media(command, env, tick, 60, poll_seconds=.1):
            raise ValueError('Detail face evidence extraction failed')
        frames.append(dict(index=i, source_ms=at))
    presence.annotate(frames, work)
    for frame in frames:
        if frame['face_boxes']:
            result[frame['index']]['kind'] = 'presenter'
    (work / 'presence.json').write_text(json.dumps(frames))
    return result


def repair_links(events, ask):
    """Resolve local ownership before calculating a concatenated unit's duration."""
    result = [dict(e) for e in events]
    for i in range(1, len(result) - 1):
        middle = result[i]
        left_index = next((j for j in range(i - 1, -1, -1) if result[j]['kind'] == 'presenter'), None)
        right_index = next((j for j in range(i + 1, len(result)) if result[j]['kind'] == 'presenter'), None)
        if left_index is None or right_index is None:
            continue
        left, right = result[left_index], result[right_index]
        sandwich = (left_index == i - 1 and right_index == i + 1
                    and left['unit'] == right['unit'] and middle['unit'] != left['unit']
                    and middle['end_ms'] - middle['start_ms'] <= 5000)
        # An observer can give a product packshot the same unit as both faces.
        # That repeated ID is the claim being checked, not proof of ownership.
        ownership = middle['kind'] == 'own_detail'
        if not sandwich and not ownership:
            continue
        times = [(e['start_ms'] + e['end_ms']) // 2 for e in (left, middle, right)]
        proof = ask(times)
        owner = proof.get('middle_owner')
        if owner not in {'left', 'right', 'both', 'neither', 'unknown'} or type(proof.get('same_outer_person')) is not bool:
            raise ValueError('Missing local ownership evidence')
        if owner == 'unknown':
            raise ValueError('Unresolved ownership of a detail/comparison')
        if owner == 'neither' or proof['kinds'][1] in {'independent_insert', 'other'}:
            if proof['kinds'][1] == 'presenter':
                middle.update(kind='presenter', unit=f'isolated_{i}')
            elif middle['kind'] != 'presenter' or proof['kinds'][1] in {'independent_insert', 'other'}:
                middle.update(kind='independent_insert', unit='')
            continue
        if owner == 'both' and not proof['same_outer_person']:
            raise ValueError('Detail cannot belong to two different presenters')
        middle.update(unit=left['unit'] if owner in {'left', 'both'} else right['unit'])
        if owner == 'both':
            middle['kind'] = 'own_detail'
            # Merge only the adjacent observed return, never every occurrence
            # of a reused ID elsewhere in the window across an intervening ad.
            old_unit = right['unit']
            for j in range(right_index, len(result)):
                if result[j]['unit'] != old_unit or result[j]['kind'] not in {'presenter', 'own_detail'}:
                    break
                result[j]['unit'] = left['unit']
    return result


def review_groups(events):
    groups = []
    for event in events:
        if (groups and event['unit'] and groups[-1][-1]['unit'] == event['unit']
                and groups[-1][-1]['end_ms'] == event['start_ms']):
            groups[-1].append(event)
        else:
            groups.append([event])
    return groups


def repair_review_prefix(events, ask, verified_edges):
    """Resolve a same-person opening miscast as an external scene at film start.

    The middle-shot ownership pass has no left anchor here. Only contradictory
    same-person/same-review observations trigger a source-frame check; products
    and unrelated opening clips keep their independent boundaries.
    """
    result = [dict(e) for e in events]
    if len(result) < 2:
        return result
    first, following = result[:2]
    if not (first['start_ms'] == 0 and first['end_ms'] == following['start_ms']
            and first['kind'] == 'independent_insert' and first.get('action') == 'external_scene'
            and first.get('visible') == 'person' and first.get('person')
            and first.get('person') == following.get('person')
            and first.get('review_unit') and first.get('review_unit') == following.get('review_unit')
            and following['kind'] == 'presenter' and following['unit']):
        return result
    a, b = following['start_ms'], following['end_ms']
    proof = ask([(first['start_ms'] + first['end_ms']) // 2,
                 a + (b - a) // 3, a + (b - a) * 2 // 3])
    if (proof.get('same_outer_person') is True
            and all(k in ('presenter', 'own_detail') for k in proof['kinds'])
            and all(proof[k] in ('same_review', 'own_detail')
                    for k in ('left_to_middle', 'middle_to_right'))):
        first.update(kind=proof['kinds'][0], unit=following['unit'], needs_ownership=False,
                     ownership_basis='verified_same_review_prefix')
        verified_edges.add(following['start_ms'])
    return result


def recover_presenters(events, ask):
    """A local face-detector miss cannot prove that a long scene only shows hands."""
    result = [dict(e) for e in events]
    for event in result:
        a, b = event['start_ms'], event['end_ms']
        filmed_scene = (event.get('action') == 'external_scene' and event.get('visible') == 'person'
                        and event.get('person') and b - a >= 9000)
        if filmed_scene:
            proof = ask([a + 700, (a + b) // 2, b - 700])
            if (all(k in ('presenter','own_detail') for k in proof['kinds'])
                    and 'presenter' in proof['kinds']
                    and all(proof[k] in ('same_review','own_detail')
                            for k in ('left_to_middle','middle_to_right'))):
                event.update(kind='presenter', unit=json.dumps(['person', event['person']]),
                             scene_basis='continuous_filmed_person')
            continue
        if event['kind'] != 'own_detail' or b - a < 9000 or event.get('needs_ownership') or 'action' in event:
            continue
        proof = ask([a + 700, (a + b) // 2, b - 700])
        if proof['kinds'] == ['presenter'] * 3:
            event['kind'] = 'presenter'
    return result


def reveal_source_inserts(events, ask, cuts, verified_edges=None, source_cache=None, context_ask=None,
                          *, resolve_unanchored=False):
    """Inspect short physical shots that the event observer did not list.

    Scene changes only choose observation times. Their visual roles, never
    their pixel score, decide whether to break a continuous review.
    """
    result = []
    # Reuse only the same complete physical shot / adjacent shot pair in this
    # film. Window-local P1/U1 values and clipped intervals are never cache keys.
    cache = source_cache if source_cache is not None else {}
    cached_roles = cache.setdefault('roles', {})
    cached_links = cache.setdefault('links', {})
    context_links = cache.setdefault('review_context_links', set())
    context_roles = cache.setdefault('review_context_roles', set())

    def has_anchor(index, step):
        for j in range(index + step, len(events) if step > 0 else -1, step):
            if events[j]['kind'] == 'presenter':
                return True
            if events[j]['kind'] != 'own_detail':
                break
        return False

    for serial, event in enumerate(events):
        a, b = event['start_ms'], event['end_ms']
        selected = []
        for at, score in sorted(cuts, key=lambda v: -v[1]):
            if score >= .2 and a + 250 < at < b - 250 and all(abs(at - t) > 250 for t in selected):
                selected.append(at)
        edges = [a, *sorted(selected), b]
        if (event['kind'] not in ('presenter','own_detail') or len(edges) == 2
                or not any(y - x <= 5000 for x,y in zip(edges, edges[1:]))):
            result.append(event)
            continue
        pieces = [dict(event, start_ms=x, end_ms=y) for x,y in zip(edges,edges[1:])]
        roles, splits, needs_context = {}, set(), False

        def reconcile(left, right, *, separate_person=False):
            # `other` is an unclassified view, not affirmative insert evidence.
            # A concrete contextual observation may resolve it; real inserts
            # still conflict with claimed presenter continuity.
            if left=='other':
                return right
            if right=='other':
                return left
            if left == right:
                return left
            if {left, right} <= {'presenter','own_detail'}:
                # Face application can be called presenter in one view and
                # own_detail in another. Both support the same review role;
                # do not erase an already observed application presenter.
                return event['kind']
            if {left, right} <= {'independent_insert','other'}:
                return 'independent_insert'
            if (separate_person and {left,right}=={'own_detail','independent_insert'}
                    and event.get('visible')=='person'
                    and event.get('action') in ('skin_comparison','wear_result')):
                # A person's skin close-up is a detail of that person, but an
                # insert relative to the next person. Both observations agree
                # on the physical source break; keep that break and its own
                # subject instead of treating relative roles as contradictory.
                cache['relative_detail_roles']=cache.get('relative_detail_roles',0)+1
                return 'own_detail'
            raise ValueError(f'Conflicting source-shot observations: {left} vs {right}; source event {a}-{b}')

        for i in range(0, len(pieces) - 1, 2):
            chosen = pieces[i:i + 3]
            shot_keys = [(e['start_ms'],e['end_ms']) for e in chosen]
            link_keys = list(zip(shot_keys,shot_keys[1:]))
            times = [(e['start_ms'] + e['end_ms']) // 2 for e in chosen]
            if len(times) == 2:
                times.append((times[-1] + chosen[-1]['end_ms']) // 2)
            missing_anchors = not (has_anchor(serial, -1) and has_anchor(serial, 1))
            contextual_repair = (resolve_unanchored and missing_anchors
                and event.get('action') in ('skin_comparison','wear_result','hand_operation')
                and any(cached_links.get(key) in ('different_person','separate_recording')
                        and key not in context_links for key in link_keys))
            if (all(key in cached_roles for key in shot_keys)
                    and all(key in cached_links for key in link_keys) and not contextual_repair):
                kinds = [cached_roles[key] for key in shot_keys]
                relations = [cached_links[key] for key in link_keys]
                cache['reused'] = cache.get('reused',0) + 1
            else:
                proof = ask(times)
                contextual = bool(proof.get('_video_context'))
                new_context_keys = set(link_keys) - context_links if contextual else set()
                if contextual:
                    context_links.update(link_keys)
                if (context_ask is not None
                        and (serial == len(events) - 1 or resolve_unanchored and missing_anchors)
                        and event.get('action') in ('skin_comparison', 'wear_result', 'hand_operation')
                        and any(proof[k] in ('different_person', 'separate_recording')
                                for k in ('left_to_middle', 'middle_to_right'))):
                    # An insert can remove an operation's context anchor just
                    # like a window edge. Resolve the disputed physical joins
                    # with video flow before measuring; static clothes alone
                    # cannot either merge or split a wear-test operation.
                    proof = context_ask(times)
                    contextual = True
                    new_context_keys = set(link_keys) - context_links
                    context_links.update(link_keys)
                kinds = list(proof['kinds'][:len(chosen)])
                if len(chosen) == 2:
                    kinds[1] = reconcile(kinds[1], proof['kinds'][2])
                relations = [proof[key] for key in ('left_to_middle','middle_to_right')[:len(chosen)-1]]
                conflict_keys = {key for key, relation in zip(link_keys, relations)
                    if key in cached_links and cached_links[key] != relation
                    and not {cached_links[key], relation} <= {'same_review','own_detail'}
                    and not {cached_links[key], relation} <= {'different_person','separate_recording'}
                    and key not in new_context_keys}
                role_conflicts = {key for key, kind in zip(shot_keys, kinds)
                    if key in cached_roles and (cached_roles[key] in ('presenter','own_detail')) !=
                        (kind in ('presenter','own_detail'))}
                unresolved = (conflict_keys - context_links) | (role_conflicts - context_roles)
                if unresolved and context_ask is not None and not contextual:
                    # A static view can lose the action/overlay context. One
                    # source-video observation arbitrates this exact physical
                    # pair; never select the answer by its business label.
                    proof = context_ask(times)
                    contextual = True
                    kinds = list(proof['kinds'][:len(chosen)])
                    if len(chosen) == 2:
                        kinds[1] = reconcile(kinds[1], proof['kinds'][2])
                    relations = [proof[key] for key in ('left_to_middle','middle_to_right')[:len(chosen)-1]]
                    new_context_keys.update(set(link_keys)-context_links)
                    context_links.update(link_keys)
                    cache['conflict_repairs'] = cache.get('conflict_repairs',0)+1
                elif conflict_keys and not new_context_keys:
                    # Previously resolved video flow outranks a subsequent
                    # weaker static interpretation of the same source pair.
                    relations = [cached_links[key] if key in context_links else relation
                                 for key, relation in zip(link_keys, relations)]
                for offset, (key,kind) in enumerate(zip(shot_keys,kinds)):
                    if contextual and key not in context_roles:
                        cached_roles[key] = kind
                    elif key in context_roles and not contextual:
                        kind = cached_roles[key]
                    else:
                        separate_person=any(relation in ('different_person','separate_recording')
                            for pair,relation in zip(link_keys,relations) if key in pair)
                        kind = reconcile(cached_roles[key],kind,separate_person=separate_person) if key in cached_roles else kind
                        cached_roles[key] = kind
                    kinds[offset] = kind
                if contextual:
                    context_roles.update(shot_keys)
                for key,relation in zip(link_keys,relations):
                    if key in cached_links and cached_links[key] != relation and key not in new_context_keys:
                        if {cached_links[key],relation} <= {'same_review','own_detail'}:
                            relation = 'own_detail'
                        elif {cached_links[key],relation} <= {'different_person','separate_recording'}:
                            relation = 'separate_recording'
                        else:
                            raise ValueError('Conflicting source-shot relationship')
                    cached_links[key] = relation
            for offset, kind in enumerate(kinds):
                if i + offset in roles:
                    kind = cached_roles[shot_keys[offset]] if shot_keys[offset] in context_roles else reconcile(roles[i + offset], kind)
                roles[i + offset] = kind
            for offset, relation in enumerate(relations):
                if relation == 'uncertain':
                    raise ValueError('Unresolved source-shot relationship')
                if relation in ('different_person','separate_recording'):
                    if (event.get('action') in ('skin_comparison','wear_result','hand_operation')
                            and link_keys[offset] not in context_links):
                        needs_context = True
                    else:
                        splits.add(i + offset + 1)
                if (verified_edges is not None and relation in ('same_review','own_detail')
                        and all(k in ('presenter','own_detail') for k in kinds[offset:offset + 2])):
                    verified_edges.add(chosen[offset + 1]['start_ms'])
        for i, part in enumerate(pieces):
            kind = roles[i]
            if (kind in ('presenter','own_detail') and event['kind'] in ('presenter','own_detail')
                    and (event.get('action') in ('skin_comparison','wear_result','hand_operation')
                         or event.get('visible') == 'person' and event.get('person')
                         and event.get('action') in ('talking_demo','personal_application'))):
                # A static application/skin view is compatible with a visible
                # presenter. It cannot erase the video's observed presenter
                # and let the next person's operation anchor absorb this one.
                part['source_observed_kind'] = kind
                kind = event['kind']
            part.update(kind=kind, observed_kind=kind, source_cut_checked=True)
            if kind in ('independent_insert','other'):
                part.update(unit='', action='other')
            else:
                if needs_context:
                    part['needs_ownership'] = True
                if splits and any(j <= i for j in splits):
                    part['unit'] = f'{event["unit"]}_source{serial}_{sum(j <= i for j in splits)}'
            result.append(part)
    return result


def refine_group(group, ask, cuts, serial, verified_edges=(), *, context_ask=None):
    """Check each observed join instead of locating several changes from 3 images."""
    internal = []
    for i, event in enumerate(group):
        a, b = event['start_ms'], event['end_ms']
        if b - a < 9000:
            internal.append(event)
            continue
        times = [a + 700, (a + b) // 2, b - 700]
        internal.extend(refine_event(event, ask(times), times, cuts, f'{serial}_{i}'))
    output = []
    for n, adjacent in enumerate(review_groups(internal)):
        if len(adjacent) == 1:
            output.extend(adjacent)
            continue
        splits, barriers = set(), []
        for i in range(0, len(adjacent) - 1, 2):
            chosen = adjacent[i:i + 3]
            edges = [e['start_ms'] for e in chosen[1:]]
            if all(t in verified_edges for t in edges):
                continue
            times = [(e['start_ms'] + e['end_ms']) // 2 for e in chosen]
            if len(times) == 2:
                # The third point checks the latter part of the second event.
                times.append((times[-1] + chosen[-1]['end_ms']) // 2)
            combined = dict(chosen[0], end_ms=chosen[-1]['end_ms'], kind='presenter')
            proof = dict(ask(times))
            proof['kinds'] = list(proof['kinds'])
            conflicts = [j+1 for j,(event,kind) in enumerate(zip(chosen,proof['kinds']))
                         if event.get('source_cut_checked') and event.get('source_observed_kind') == 'presenter'
                         and event['kind'] == 'presenter' and kind in ('independent_insert','other')]
            if conflicts and not proof.get('_video_context'):
                if context_ask is None:
                    raise ValueError('Conflicting source role needs bound video context')
                proof = dict(context_ask(times, conflicts))
                proof['kinds'] = list(proof['kinds'])
            for j, edge in enumerate(edges):
                if edge in verified_edges:
                    proof[('left_to_middle', 'middle_to_right')[j]] = 'own_detail'
                    proof['kinds'][j:j + 2] = [e['kind'] for e in chosen[j:j + 2]]
            parts = refine_event(combined, proof, times, cuts, f'{serial}_{n}_{i}', edges)
            splits.update(p['start_ms'] for p in parts[1:])
            barriers.extend((p['start_ms'], p['end_ms']) for p in parts if not p['unit'])
        serial_edges = sorted(splits)
        for original in adjacent:
            a, b = original['start_ms'], original['end_ms']
            edges = [a, *[t for t in serial_edges if a < t < b], b]
            for start, end in zip(edges, edges[1:]):
                part = dict(original, start_ms=start, end_ms=end)
                if any(x <= start and y >= end for x,y in barriers):
                    part.update(unit='', kind='independent_insert')
                elif splits:
                    part['unit'] = f'{original["unit"]}_join{serial}_{n}_{sum(t <= start for t in serial_edges)}'
                output.append(part)
    return output


def overlay(segments, patches, duration_ms):
    edges = sorted({0, duration_ms, *[v for s in segments for v in (s['start_ms'], s['end_ms'])],
                    *[v for p in patches for v in (p['start_ms'], p['end_ms'])]})
    output = []
    # A core window owns its explicit independent-review boundary. Overlapping
    # context witnesses from a neighboring window must not union across it.
    review_boundaries = sorted({p['start_ms'] for p in patches if p.get('preserve_start')})
    for a, b in zip(edges, edges[1:]):
        value = next((p for p in patches if p['start_ms'] <= a and p['end_ms'] >= b), None)
        if value is None:
            value = next((dict(s, witness=(s['start_ms'], s['end_ms']), minimum=10001)
                          for s in segments if s['start_ms'] <= a and s['end_ms'] >= b), None)
        if value is None:
            # Proposal's subsecond rounding gaps are handled by normal snapping.
            continue
        item = dict(value, start_ms=a, end_ms=b)
        if item['label_key'] == 'live_demo' and review_boundaries:
            lo = max([item['witness'][0], *[t for t in review_boundaries if t <= a]])
            hi = min([item['witness'][1], *[t for t in review_boundaries if t >= b]])
            item['witness'] = (lo, hi)
        prior = output[-1] if output else None
        common_review = (prior and min(prior['witness'][1], item['witness'][1]) >
                         max(prior['witness'][0], item['witness'][0]))
        if (prior and prior['end_ms'] == a and prior['label_key'] == item['label_key']
                and (item['label_key'] != 'live_demo' or common_review)):
            prior['end_ms'] = b
            prior['witness'] = (min(prior['witness'][0], item['witness'][0]), max(prior['witness'][1], item['witness'][1]))
            prior['minimum'] = min(prior['minimum'], item['minimum'])
        else:
            output.append(item)
    return output


def verify(segments, source, duration_ms, work, env, tick, request):
    planned = windows(segments, duration_ms)
    # A three-minute film cannot share the same coverage budget as a one-minute
    # clip. Keep a bounded duration allowance, never skip evidence to fit it.
    triad_limit = min(MAX_TRIADS, max(24, 16 * math.ceil(duration_ms / 60000)))
    patches, receipts, triads = [], [], 0
    triad_cache, ownership_cache, source_cache = {}, {}, {}
    triad_images, contextual_cache = {}, {}
    source_role_state = {}
    ownership_ms = ownership_checks = 0
    context_checks = context_ms = 0
    context_limit = MAX_CONTEXT_CHECKS
    completion_repairs = window_repairs = 0
    for i, window in enumerate(planned):
        folder = work / f'window-{i}'
        folder.mkdir(parents=True, exist_ok=True)
        a, b = window['start'], window['end']
        clip = folder / 'clip.mp4'
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(a / 1000), '-i', str(source),
                   '-t', str((b - a) / 1000), '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'fast',
                   '-crf', '25', '-c:a', 'aac', str(clip)]
        if run_media(command, env, tick, 300, poll_seconds=.2):
            raise ValueError('Local window extraction failed')
        cuts = read_cuts(source, a, b, folder, env, tick)
        def observe_window(prompt):
            nonlocal completion_repairs
            try:
                return request(prompt, event_schema(), proxy=clip, fps=2, thinking='enabled', reasoning_effort='medium')
            except SuggestionError as error:
                if error.code != 'provider_incomplete' or completion_repairs >= MAX_COMPLETION_REPAIRS:
                    raise
                # The provider returned an exhausted reasoning budget, not a
                # network error. Re-observe once without reasoning; all normal
                # schema/source/continuity checks and billed usage still apply.
                completion_repairs += 1
                return request(prompt, event_schema(), proxy=clip, fps=2, thinking='disabled')
        result = observe_window(WINDOW_PROMPT)
        attempts = []
        for attempt in range(2):
            attempts.append(dict(payload=result.payload, responseId=result.response_id, usage=result.usage))
            (folder / 'local-events.json').write_text(json.dumps(dict(
                attempts[-1], start=a, end=b, attempts=attempts), ensure_ascii=False))
            try:
                events = align_events(observations.decode(result.payload), a, b, cuts)
                break
            except ValueError as error:
                if attempt or window_repairs >= MAX_WINDOW_REPAIRS:
                    raise
                window_repairs += 1
                # Invalid intervals are not stretched, discarded or filled by
                # the evaluator. Re-observe the same clip once and validate it
                # with the same contract; retain both paid responses.
                prompt = (WINDOW_PROMPT + '\n重新核对本视频全部镜头，上一观察未通过结构/时间校验：' + str(error) +
                    f'。覆盖0到{(b-a)/1000:.3f}秒；每个事件必须start<end，边界使用小数秒，'
                    '短插片也必须有真实非零区间，不能用相同的整数开始/结束，也不能略去镜头。')
                result = observe_window(prompt)
        events = visible_presenters(events, source, folder, env, tick)

        def with_video_context(times, images=None, *, review_flow=False, recording_transition=False,
                               source_conflicts=()):
            nonlocal context_checks, context_ms
            key = (a, b, review_flow, recording_transition, tuple(source_conflicts), *times)
            if key in contextual_cache:
                return contextual_cache[key]
            ca, cb = (a,b) if review_flow else (max(a,min(times)-5000),min(b,max(times)+5000))
            if context_checks >= context_limit or context_ms + cb - ca > MAX_CONTEXT_VIDEO_MS:
                raise ValueError('Local context repair budget exceeded; no partial publication')
            context_checks += 1
            context_ms += cb - ca
            context_video = clip
            if (ca,cb)!=(a,b):
                context_video = folder/f'context-{context_checks}.mp4'
                cmd = ['ffmpeg','-nostdin','-v','error','-y','-ss',str(ca/1000),'-i',str(source),
                       '-t',str((cb-ca)/1000),'-vf','scale=-2:480','-c:v','libx264','-preset','fast',
                       '-crf','25','-c:a','aac',str(context_video)]
                if run_media(cmd,env,tick,300,poll_seconds=.2):
                    raise ValueError('Focused context extraction failed')
            evidence_path = folder/f'context-{context_checks}.json'
            evidence = dict(start_ms=ca,end_ms=cb,review_flow=review_flow,image_times_ms=times,
                            source_role_conflicts=list(source_conflicts))
            evidence_path.write_text(json.dumps(evidence))
            stamps = ', '.join(f'{(t - ca) / 1000:.3f}' for t in times)
            from . import framework_context_observations as context_observations
            conflict_prompt = (('\n图片位置'+json.dumps(source_conflicts)+
                '的同一源镜头先前直接观察为presenter，本次邻接观察却写成插入素材。请结合视频重新核对实际画面角色与左右换源关系。'
                '另一位独立出镜讲解/演示的人仍可为presenter，人物或拍摄来源变化写在different_person/separate_recording关系中；'
                '不能仅因来自另一素材就抹去其主讲人画面。若视频确证为外来插片，仍保留并在appearance记录实际内容。')
                if source_conflicts else '')
            response = request(TRIAD_PROMPT + CONTEXT_PROMPT + context_observations.GUIDANCE + (REVIEW_CONTEXT_PROMPT if review_flow or recording_transition else '') +
                               f'\n三张图对应本段视频内的秒数：{stamps}。' + conflict_prompt,
                               context_observations.schema(triad_schema()), proxy=context_video,
                               boards=images if images is not None else triad_images[tuple(times)], fps=1,
                               thinking='enabled', reasoning_effort='low')
            evidence.update(payload=response.payload,responseId=response.response_id,usage=response.usage)
            evidence_path.write_text(json.dumps(evidence,ensure_ascii=False))
            relation = context_observations.normalize(response.payload)
            contextual_cache[key] = relation
            return relation

        def ask(times):
            nonlocal triads, context_checks, context_ms, completion_repairs
            key = tuple(times)
            if key in triad_cache:
                return triad_cache[key]
            if triads >= triad_limit:
                raise ValueError('Local visual recheck budget exceeded; no partial publication')
            images = []
            for j, at in enumerate(times):
                image = folder / f'triad-{triads}-{j}.jpg'
                cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(at / 1000), '-i', str(source),
                       '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '2', str(image)]
                if run_media(cmd, env, tick, 60, poll_seconds=.1):
                    raise ValueError('Local visual recheck extraction failed')
                images.append(image)
            triad_images[key] = images
            repaired = False
            try:
                relation = request(TRIAD_PROMPT, triad_schema(), boards=images,
                                   thinking='enabled', reasoning_effort='low').payload
            except SuggestionError as error:
                if error.code != 'provider_incomplete' or completion_repairs >= MAX_COMPLETION_REPAIRS:
                    raise
                # The first attempt is already accounted by the request
                # wrapper. Recover only incomplete structured output, once,
                # with the same Lite and exact evidence without reasoning.
                completion_repairs += 1
                repaired = True
                relation = request(TRIAD_PROMPT, triad_schema(), boards=images,
                                   thinking='disabled').payload
            if (not isinstance(relation, dict) or not isinstance(relation.get('kinds'), list)
                    or len(relation['kinds']) != 3):
                if repaired or completion_repairs >= MAX_COMPLETION_REPAIRS:
                    raise ValueError('Missing triad roles')
                completion_repairs += 1
                fixed = request(TRIAD_PROMPT + '\n三张图分别填写appearance1/kind1、appearance2/kind2、appearance3/kind3。'
                                '每张仅一个kind；人物上脸/自身近景可选own_detail，不能为同一图片输出多个角色。',
                                triad_repair_schema(), boards=images, thinking='disabled').payload
                if not isinstance(fixed, dict) or set(fixed) != set(triad_repair_schema()['properties']):
                    raise ValueError('Invalid repaired triad roles')
                relation = {k:v for k,v in fixed.items() if k in triad_schema()['properties']}
                relation.update(appearance=[fixed[f'appearance{i}'] for i in range(1,4)],
                                kinds=[fixed[f'kind{i}'] for i in range(1,4)])
            if needs_video_context(relation):
                recording_transition = any(relation.get(k)=='separate_recording' for k in ('left_to_middle','middle_to_right'))
                relation = dict(with_video_context(times, images, recording_transition=recording_transition), _video_context=True)
            triad_cache[key] = relation
            triads += 1
            return relation

        def inspect(left, middle, right):
            nonlocal ownership_ms, ownership_checks

            def cache_key(event):
                return (left['start_ms'], left['end_ms'], event['start_ms'], event['end_ms'],
                        right['start_ms'], right['end_ms'], bool(left.get('full_presenter_context')))

            key = cache_key(middle)
            if key not in ownership_cache:
                cost_ms = right['end_ms'] - left['start_ms']
                ownership.check_budget(ownership_checks, ownership_ms, cost_ms)
                candidates = [e for e in events if left['end_ms'] <= e['start_ms']
                              and e['end_ms'] <= right['start_ms'] and cache_key(e) not in ownership_cache
                              and (e['kind'] in ('own_detail','independent_insert') or cache_key(e) == key)]
                candidates = sorted(candidates, key=lambda e: abs(e['start_ms'] - middle['start_ms']))[:8]
                candidates.sort(key=lambda e: e['start_ms'])
                ownership_ms += cost_ms
                proofs = ownership.observe_many(source, left, candidates, right,
                    work / f'ownership-{ownership_checks}', env, tick, request)
                ownership_checks += 1
                for index, (event, proof) in enumerate(zip(candidates, proofs)):
                    if (proof['middle_visible'] != 'uncertain' or proof['middle_function'] != 'uncertain'
                            or proof['outer_relation'] != 'same_review'
                            or left['unit'] != right['unit'] or not left['unit']
                            or left['end_ms'] != event['start_ms'] or event['end_ms'] != right['start_ms']):
                        continue
                    # A blurred hand/lens transition is not an observed insert.
                    # Recheck the immediate motion once, retaining the original
                    # wider flow/demonstration facts and accounting its input.
                    focus_left = dict(left, start_ms=max(left['start_ms'],left['end_ms']-2000))
                    focus_right = dict(right, end_ms=min(right['end_ms'],right['start_ms']+2000))
                    focus_ms = focus_right['end_ms'] - focus_left['start_ms']
                    ownership.check_budget(ownership_checks, ownership_ms, focus_ms)
                    ownership_ms += focus_ms
                    focused = ownership.observe_many(source, focus_left, [event], focus_right,
                        work / f'ownership-{ownership_checks}', env, tick, request)[0]
                    ownership_checks += 1
                    if (focused['middle_visible'] == 'uncertain' or focused['middle_function'] == 'uncertain'
                            or focused['outer_relation'] != 'same_review'):
                        raise ValueError('Unresolved review operation after focused observation')
                    proofs[index] = dict(proof, **{k:focused[k] for k in
                        ('middle_visible','middle_action','middle_function','middle_owner')})
                ownership_cache.update((cache_key(e), proof) for e,proof in zip(candidates,proofs))
            return ownership_cache[key]

        base_events = recover_presenters(events, ask)
        for relation_attempt in range(2):
            source_edges = set()
            events = reveal_source_inserts(base_events, ask, cuts, source_edges, source_cache,
                lambda times: with_video_context(times, review_flow=True),
                resolve_unanchored=bool(relation_attempt))
            if not relation_attempt:
                from . import framework_source_roles
                base_events, changed = framework_source_roles.repair(base_events,events,source,cuts,folder,
                    env,tick,request,align_events,source_role_state)
                if changed:
                    base_events = framework_source_roles.reconcile_units(base_events, ask)
                    source_edges = set()
                    events = reveal_source_inserts(base_events,ask,cuts,source_edges,source_cache,
                        lambda times:with_video_context(times,review_flow=True))
            linked, verified_edges = ownership.repair(events, inspect, presenter_observer=ask)
            verified_edges.update(source_edges)
            if relation_attempt:
                from . import framework_edge_ownership
                def observe_edge(times):
                    images=[]
                    for n, at in enumerate(times):
                        image=folder/f'edge-{at}-{n}.jpg'
                        command=['ffmpeg','-nostdin','-v','error','-y','-ss',str(at/1000),
                            '-i',str(source),'-frames:v','1','-vf','scale=-2:640','-q:v','2',str(image)]
                        if run_media(command, env, tick, 60, poll_seconds=.1):
                            raise ValueError('Edge operation source frame failed')
                        images.append(image)
                    return with_video_context(times, images, review_flow=True)
                linked = framework_edge_ownership.repair(linked, observe_edge, verified_edges)
            (folder/'candidate-events.json').write_text(json.dumps(linked,ensure_ascii=False))
            linked = repair_review_prefix(linked, ask, verified_edges)
            refined = []
            for serial, group in enumerate(review_groups(linked)):
                start, end = group[0]['start_ms'], group[-1]['end_ms']
                if end - start < 9000 or not any(e['kind'] == 'presenter' for e in group):
                    refined.extend(group)
                    continue
                refined.extend(refine_group(group, ask, cuts, serial, verified_edges,
                    context_ask=lambda times, conflicts: with_video_context(times, source_conflicts=conflicts)))
            try:
                (folder/'refined-events.json').write_text(json.dumps(refined,ensure_ascii=False))
                frames, facts = event_facts(refined, duration_ms, core=(window['core_start'], window['core_end']))
                break
            except ValueError as error:
                if relation_attempt or str(error) != 'Unresolved local recording unit':
                    raise
                # Retry only missing operation ownership, never a conflicting
                # observation or a completed classification. Existing exact
                # frame/operation evidence is reused; new video flow checks
                # remain inside the same per-film context budget.
        from . import framework_review_graphics
        refined = framework_review_graphics.repair(refined,source,folder/'review-graphics',env,tick,request)
        frames,facts = event_facts(refined,duration_ms,core=(window['core_start'],window['core_end']))
        frames[0]['clipped'] = a > 0
        frames[-1]['clipped'] = b < duration_ms
        _, receipt = continuity.apply({'segments': []}, frames, facts, duration_ms)
        spans, receipt['labelExtensions'] = continuity.label_spans(
            receipt['runs'], [e for e in refined if (e.get('outro_unit') or e.get('intro_unit'))
                             and e['kind'] == 'independent_insert'])
        for span_index, s in enumerate(spans):
            start, end = max(window['core_start'], s['start_ms']), min(window['core_end'], s['end_ms'])
            if start >= end:
                continue
            patches.append(dict(start_ms=start, end_ms=end, label_key=s['label_key'], confidence=.9,
                                reason='局部原片与衣着场景复核', same_person=False,
                                witness=s['witness'], minimum=s['minimum'],
                                preserve_start=bool(span_index and start == s['start_ms'] and
                                    spans[span_index-1]['end_ms'] == start and
                                    s['label_key'] == spans[span_index-1]['label_key'] == 'live_demo' and
                                    s['witness'] != spans[span_index-1]['witness'])))
        record = dict(window, events=refined, measured=receipt)
        (folder / 'evidence.json').write_text(json.dumps(record, ensure_ascii=False))
        receipts.append(record)
    from . import framework_overlap_repair
    provisional=overlay(segments,patches,duration_ms)
    core_starts={w['core_start'] for w in receipts}
    truncated=[s['witness'] for i,s in enumerate(provisional) if i
               and s['label_key']=='live_demo' and provisional[i-1]['label_key']=='mixed_voiceover'
               and s['start_ms'] in core_starts and s['end_ms']-s['start_ms']<s['minimum']
               and s['witness'][0]<s['start_ms'] and s['witness'][1]-s['witness'][0]>=s['minimum']]
    # Also resolve a short operation immediately before an already qualified
    # review when two windows assign that exact operation to different hosts.
    qualified_starts={s['start_ms'] for s in provisional
                      if s['label_key']=='live_demo' and s['end_ms']-s['start_ms']>=s['minimum']}
    directions=framework_overlap_repair.direction_conflicts(receipts) if truncated or qualified_starts else []
    directions=[(a,b) for a,b in directions if any(min(b,hi)>max(a,lo) for lo,hi in truncated)
                or b-a<=500 and b in qualified_starts]
    receipts, owner_conflicts = framework_overlap_repair.verify(
        receipts, source, work/'owner-direction', env, tick, request,
        targets=directions)
    receipts, fragment_repairs = framework_overlap_repair.verify(
        receipts, source, work/'fragmented-operations', env, tick, request,
        targets=framework_overlap_repair.fragmented_operations(receipts), subdivide=True)
    if owner_conflicts or fragment_repairs:
        # Resolve ownership before core clipping. Otherwise a fully observed
        # review can be truncated at an arbitrary processing-window seam.
        patches = []
        for window in receipts:
            frames,facts = event_facts(window['events'],duration_ms,
                                      core=(window['core_start'],window['core_end']))
            frames[0]['clipped'],frames[-1]['clipped']=window['start']>0,window['end']<duration_ms
            _,measured=continuity.apply({'segments':[]},frames,facts,duration_ms)
            spans,measured['labelExtensions']=continuity.label_spans(measured['runs'],
                [e for e in window['events'] if e['kind']=='independent_insert'
                 and (e.get('outro_unit') or e.get('intro_unit'))])
            window['measured']=measured
            for i,s in enumerate(spans):
                start,end=max(window['core_start'],s['start_ms']),min(window['core_end'],s['end_ms'])
                if start>=end: continue
                patches.append(dict(start_ms=start,end_ms=end,label_key=s['label_key'],confidence=.9,
                    reason='局部原片与衣着场景复核',same_person=False,witness=s['witness'],minimum=s['minimum'],
                    preserve_start=bool(i and start==s['start_ms'] and spans[i-1]['end_ms']==start
                        and s['label_key']==spans[i-1]['label_key']=='live_demo'
                        and s['witness']!=spans[i-1]['witness'])))
    from .framework_context_coverage import fill, qualified_core_prefixes
    restored_prefixes = qualified_core_prefixes(patches,receipts)
    patches = restored_prefixes + patches
    context_patches = fill(segments, planned, receipts)
    patches.extend(context_patches)
    result = overlay(segments, patches, duration_ms)
    claims = [dict(start_ms=s['witness'][0], end_ms=s['witness'][1], minimum=s['minimum'])
              for s in result if s['label_key'] == 'live_demo']
    payload = {'segments': [dict(start_sec=s['start_ms'] / 1000, end_sec=s['end_ms'] / 1000,
                                label_key=s['label_key'], reason=s.get('reason', ''), confidence=s.get('confidence', .9),
                                same_person_as_previous=False) for s in result]}
    return payload, dict(policy='framework-local-window-v2', windows=receipts, triads=triads,
                         contextCoverage=context_patches,
                         triadLimit=triad_limit,
                         completionRepairs=completion_repairs, ownerDirectionRepairs=owner_conflicts,
                         fragmentOwnershipRepairs=fragment_repairs, repairedCorePrefixes=restored_prefixes,
                         windowRepairs=window_repairs,
                         sourceProofReuses=source_cache.get('reused',0),
                         ownershipChecks=ownership_checks, ownershipTargets=len(ownership_cache), ownershipVideoMs=ownership_ms,
                         contextChecks=context_checks, contextLimit=context_limit, contextVideoMs=context_ms, liveClaims=claims)


def finalize(segments, receipt):
    from . import framework_review_membership, framework_isolated_attachment, framework_review_partition
    result, corrections = [], 0
    for segment in segments:
        s = dict(segment)
        if s['label_key'] == 'live_demo':
            supported = any(min(s['end_ms'], c['end_ms']) - max(s['start_ms'], c['start_ms']) >= c['minimum']
                            for c in receipt['liveClaims'])
            supported = supported or framework_review_membership.supports(s, segments, receipt)
            supported = supported or framework_isolated_attachment.supports(s, segments, receipt)
            supported = supported or framework_review_partition.supports(s, receipt)
            if not supported:
                s['label_key'] = 'mixed_voiceover'
                corrections += 1
        if result and s['label_key'] == result[-1]['label_key'] == 'mixed_voiceover' and s['start_ms'] == result[-1]['end_ms']:
            result[-1]['end_ms'] = s['end_ms']
        else:
            result.append(s)
    return result, corrections
