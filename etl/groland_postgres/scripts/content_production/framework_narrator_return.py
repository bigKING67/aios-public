"""Resolve a quotation inserted between two spans of an external narration.

The trigger is an unresolved, source-bound AV disagreement. Neither adjacent
reviews nor speaker identity alone changes a label. Two audio comparisons and
the actual editorial relationship must agree; source boundaries never change.
"""
import json

from . import framework_composition as composition
from . import framework_speaker_evidence as speaker
from .segment_suggestion_provider import run_media

POLICY = 'framework-narrator-return-v1'
MAX_GROUPS = 2
MAX_INPUT_MS = 180000
REFERENCE_MS = 8000
PROMPT = '''核对A/B/C三个相邻区间的真实组织关系，不识别姓名、不用角标，不修改边界。
A/C的独立音频检查已发现同一旁白，B含有与它不同的说话声；B也可能部分包含这位旁白的声音。具体比较见附后的原声观察。这只是声音事实，不是分类答案：个人测评也可以有自己的配音、采访或多人分工。
先描述A/B/C各自的画面、动作和实际原话，再核对：是旁白推荐中插入一段本人原声证言，随后返回该旁白并配另一录制画面（assembled_quote）；还是共同实施同一次个人测评（own_review）；或各自独立展开的相邻演示（independent_reviews）；证据不足填uncertain。
B来自长素材节选、包含本人原声或完整操作，既不能单独证明独立，也不能单独证明被引用。必须说明B与前后叙事的具体联系，不能仅因同产品、同人物、连贯营销功能、长短关系或多个片段相邻决定归类。完整测评的真实步骤、本人近景、持妆对比须保留。
b_is_speaking/c_is_speaking仅依据动态原音口型；own_review_flow指三段是否有实际同次操作、测试或角色分工衔接；external_narrator_return指是否有可核对的外部叙述重新接管，而非B自己的正常配音。evidence写具体依据，不复述选项。'''


def schema():
    fields = {k: {'type': 'string'} for k in ('a_content', 'b_content', 'c_content', 'evidence')}
    fields.update({k: {'type': 'string', 'enum': ['yes', 'no', 'uncertain']} for k in
                   ('b_is_speaking', 'c_is_speaking', 'own_review_flow', 'external_narrator_return')})
    fields['group_role'] = {'type': 'string', 'enum':
                            ['assembled_quote', 'own_review', 'independent_reviews', 'uncertain']}
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def validate(value):
    fields = schema()['properties']
    if (not isinstance(value, dict) or set(value) != set(fields)
            or any(not isinstance(v, str) or not v.strip() for v in value.values())
            or any(value[k] not in f['enum'] for k, f in fields.items() if 'enum' in f)):
        raise ValueError('Invalid narrator-return context evidence')
    return value


def plan(segments, editorial, windows):
    def full_observation(segment):
        return next((p for p in editorial.get('observations', [])
                     if (p['start_ms'], p['end_ms']) == (segment['start_ms'], segment['end_ms'])), None)

    targets = []
    for i in range(1, len(segments)-2):
        a, b, c, after = segments[i-1:i+3]
        if (a['label_key'] != 'mixed_voiceover' or b['label_key'] != 'live_demo'
                or c['label_key'] != 'live_demo' or after['label_key'] == 'live_demo'
                or any(x['end_ms'] != y['start_ms'] for x, y in zip((a, b, c), (b, c, after)))
                or a['end_ms']-a['start_ms'] < speaker.MIN_REFERENCE_MS
                or composition.review_bridge(b, windows) or composition.review_bridge(c, windows)):
            continue
        first, last = full_observation(b), full_observation(c)
        if not first or not last:
            continue
        p, q = first['proof'], last['proof']
        check = q.get('voice_check')
        if (p['b_person_is_speaking'] != 'yes' or q['a_person_is_speaking'] != 'yes'
                or q['b_person_is_speaking'] != 'no' or last.get('visual_link') != 'different_review'
                or not check or speaker.validate(check)['match'] != 'none'):
            continue
        targets.append(dict(indices=[i, i+1], ranges=[
            dict(start_ms=max(a['start_ms'], a['end_ms']-REFERENCE_MS), end_ms=a['end_ms']),
            dict(start_ms=b['start_ms'], end_ms=b['end_ms']),
            dict(start_ms=c['start_ms'], end_ms=c['end_ms'])]))
    if len(targets) > MAX_GROUPS or sum(t['ranges'][-1]['end_ms']-t['ranges'][0]['start_ms']
                                      for t in targets) > MAX_INPUT_MS:
        raise ValueError('Narrator-return evidence budget exceeded')
    return targets


def audio_pattern(checks):
    ac, ab = checks.get('a_c'), checks.get('a_b')
    if ac is None:
        return False
    speaker.validate(ac)
    if ac['match'] != 'all':
        return False
    if ab is None:
        raise ValueError('Narrator-return lacks the quotation comparison')
    speaker.validate(ab)
    return (ab['reference_speakers'] == 'one' and
            (ab['match'] == 'none' and ab['target_speakers'] in ('one', 'multiple')
             or ab['match'] == 'part' and ab['target_speakers'] == 'multiple'))


def confirmed_return(proof):
    if not audio_pattern(proof['audio']):
        return False
    value = validate(proof.get('context'))
    return (value['group_role'] == 'assembled_quote' and value['b_is_speaking'] == 'yes'
            and value['c_is_speaking'] == 'no' and value['own_review_flow'] == 'no'
            and value['external_narrator_return'] == 'yes')


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    a, b, c = target['ranges']
    proof = dict(target, audio={}, context=None)
    for name, interval in (('a_c', c), ('a_b', b)):
        item = dict(interval, speaker_reference=a)
        proof['audio'][name] = speaker.observe(source, item, work/name, env, tick, request)
        if name == 'a_c' and proof['audio'][name]['match'] != 'all':
            break
    if audio_pattern(proof['audio']):
        clip = work/'context.mp4'
        start, end = a['start_ms'], c['end_ms']
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(start/1000), '-i', str(source),
                   '-t', str((end-start)/1000), '-vf', 'scale=-2:480', '-c:v', 'libx264',
                   '-preset', 'fast', '-crf', '26', '-c:a', 'aac', str(clip)]
        if run_media(command, env, tick, 300, poll_seconds=.2):
            raise ValueError('Narrator-return context extraction failed')
        offsets = [[(v['start_ms']-start)/1000, (v['end_ms']-start)/1000] for v in (a, b, c)]
        result = request(PROMPT+'\nA/B/C在本裁片的秒数：'+json.dumps(offsets)+
                         '\n独立音频观察：'+json.dumps(proof['audio'], ensure_ascii=False),
                         schema(), proxy=clip, fps=2, thinking='enabled', reasoning_effort='low')
        proof.update(context=validate(result.payload), responseId=result.response_id, usage=result.usage)
    (work/'evidence.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2))
    return proof


def apply(segments, targets, proofs):
    if len(targets) != len(proofs):
        raise ValueError('Incomplete narrator-return evidence')
    result, corrections, unresolved = [dict(s) for s in segments], [], []
    for target, proof in zip(targets, proofs):
        if any(proof.get(k) != v for k, v in target.items()):
            raise ValueError('Narrator-return evidence bound to wrong target')
        for index, interval in zip(target['indices'], target['ranges'][1:]):
            if (not 0 <= index < len(result) or result[index]['label_key'] != 'live_demo'
                    or any(result[index][k] != v for k, v in interval.items())):
                raise ValueError('Stale narrator-return target')
        if not audio_pattern(proof['audio']):
            continue
        value = validate(proof.get('context'))
        if value['group_role'] in ('own_review', 'independent_reviews'):
            continue
        if not confirmed_return(proof):
            unresolved.append(dict(start_ms=target['ranges'][1]['start_ms'],
                                   end_ms=target['ranges'][2]['end_ms']))
            continue
        for i in target['indices']:
            result[i].update(label_key='mixed_voiceover', reason='前后旁白归属：'+value['evidence'])
        corrections.append(dict(target, rule='source_bound_narrator_return'))
    return result, corrections, unresolved


def resolve_editorial_conflicts(segments, editorial, receipt):
    """Close an earlier A/B hypothesis only with the later source-bound A/B/C proof.

    The raw observations stay intact. Only C's fully covered final montage can
    close this warning; an accepted correction alone cannot hide later changes.
    """
    confirmed = []
    for correction in receipt.get('corrections', []):
        if correction.get('rule') != 'source_bound_narrator_return':
            continue
        proof = next((p for p in receipt.get('observations', [])
                      if p.get('indices') == correction['indices']
                      and p.get('ranges') == correction['ranges']), None)
        if proof is not None and confirmed_return(proof):
            confirmed.append(correction['ranges'][-1])
    retained, resolved = [], list(editorial.get('audioResolutions', []))
    for conflict in editorial.get('audioConflicts', []):
        a, b = conflict['start_ms'], conflict['end_ms']
        cursor = a
        for segment in segments:
            if segment['end_ms'] <= cursor:
                continue
            if segment['start_ms'] > cursor or segment['label_key'] != 'mixed_voiceover':
                break
            cursor = max(cursor, segment['end_ms'])
            if cursor >= b:
                break
        if (cursor >= b and any(p['start_ms'] <= a < b <= p['end_ms'] for p in confirmed)):
            resolved.append(dict(conflict, resolution='source_bound_narrator_return'))
        else:
            retained.append(conflict)
    return dict(editorial, audioConflicts=retained, audioResolutions=resolved)


def verify(segments, source, work, env, tick, request, *, editorial, windows):
    targets = plan(segments, editorial, windows)
    proofs = [observe(source, target, work/str(i), env, tick, request) for i, target in enumerate(targets)]
    result, corrections, unresolved = apply(segments, targets, proofs)
    return result, dict(policy=POLICY, targets=targets, observations=proofs,
                        corrections=corrections, unresolved=unresolved)
