"""Revisit a protected adjacent review when later AV evidence contradicts it.

Silence is a question trigger, never a category. Require a separate recording,
an already qualified preceding core and a following montage; observe both sides
before changing membership. No time or identity boundary is created or pooled.
"""
import json

from . import framework_composition as composition
from .framework_review_membership import supported_core
from .segment_suggestion_provider import run_media

POLICY = 'framework-av-composition-v4'
MAX_TARGETS = 2
MAX_TOTAL_MS = 180000
CONTEXT_MS = 32000
GUIDANCE = ('\n本次只判断目标T的归属。原片局部核验已观察到：T前面的主讲人有已独立计时的连续核心，'
    'T中有新录制的人物上妆；音画核对显示T中人物没有对应原音讲话。不能据此直接定类，个人测评可以自己配音，'
    'T也可以是长素材节选。请结合前后真实组织，区分T本身是另起一段独立个人演示、前段本人的后续测试，'
    '还是与后面多来源素材一起推进推荐。必须分别说明左右的实际内容与衔接，不能只凭长短或同产品判断。')
ISOLATED_GUIDANCE = ('\n本次核对一个有具体音画疑点的连续演示T：前序逐项观察没有看到T出镜人物对应原音讲话。'
    '因此不能把听到的第一人称文案直接当成T人物的本人原声或独立测评证据。请看本裁片的前后画面组织，'
    '分别描述T与左右素材如何承接同一段推荐或另起个人演示。连续操作、超过10秒和语音内容贴合动作均不足以单独证明独立；'
    '但本人另配音的独立测评也应保留。必须找具体的叙事归属依据，不能单凭没有讲话或周围换人判混剪。'
    '先分别观察target_audio与narration_relation：歌曲演唱属于music_only，不是产品讲解；'
    '完整操作配背景音乐仍可构成独立实拍，不要求开场自我介绍或口头总结。'
    '只有确实听到产品口播，且有具体前后文证明该口播跨不同人物素材组织推荐，才能填adjacent_narration。'
    '听不清或不能确认归属填unknown；不能仅因人物没张嘴就推断来自别人。')


def schema(isolated=False):
    fields = {k: {'type': 'string'} for k in ('target_action', 'left_relation', 'right_relation', 'evidence')}
    fields['role'] = {'type': 'string', 'enum': list(composition.CRITERIA)}
    if isolated:
        fields['target_audio'] = {'type': 'string', 'enum': ['music_only', 'silence', 'spoken_narration', 'unknown']}
        fields['narration_relation'] = {'type': 'string', 'enum': ['adjacent_narration', 'own_review', 'not_applicable', 'unknown']}
    return dict(type='object', additionalProperties=False, required=list(fields), properties=fields)


def validate(value, isolated=False):
    fields = schema(isolated)['properties']
    if (not isinstance(value, dict) or set(value) != set(fields)
            or any(not isinstance(v, str) or not v.strip() for v in value.values())
            or any(value[k] not in field['enum'] for k, field in fields.items() if 'enum' in field)):
        raise ValueError('Invalid AV composition evidence')


def plan(segments, editorial, windows, claims, *, short_reviews=(), only_short=False):
    targets = []
    short = {(p['start_ms'],p['end_ms']) for p in short_reviews}
    for i in range(1, len(segments)-1):
        before, target, after = segments[i-1:i+2]
        near_threshold = (target['start_ms'],target['end_ms']) in short
        if only_short and not near_threshold:
            continue
        isolated = (before['label_key'] == 'mixed_voiceover' or
                    near_threshold and before['label_key'] == 'promotion')
        if ((not supported_core(before, claims) and not isolated) or target['label_key'] != 'live_demo'
                or after['label_key'] != 'mixed_voiceover'
                or not 0 <= target['start_ms']-before['end_ms'] <= (500 if isolated else 0)
                or not 0 <= after['start_ms']-target['end_ms'] <= (500 if isolated else 0)
                or composition.review_bridge(target, windows)):
            continue
        observed = [p for p in editorial.get('observations', [])
                    if (p['start_ms'], p['end_ms']) == (target['start_ms'], target['end_ms'])]
        if len(observed) != 1:
            continue
        item = observed[0]
        proof = item['proof']
        if (proof['b_person_is_speaking'] != 'no' or not isolated and (
                item.get('visual_link') != 'different_review'
                or proof['a_person_is_speaking'] != 'yes' or proof['same_review'] != 'no')):
            continue
        # The prompt's action must also be observed, not inferred from silence.
        events = [e for w in windows for e in w['events']
                  if min(e['end_ms'], target['end_ms']) > max(e['start_ms'], target['start_ms'])]
        if not any(e.get('action') in ('personal_application', 'application_detail') for e in events):
            continue
        targets.append(dict(index=i, start_ms=target['start_ms'], end_ms=target['end_ms'],
                            context_start_ms=max(before['start_ms'], target['start_ms']-CONTEXT_MS),
                            context_end_ms=min(after['end_ms'], target['end_ms']+CONTEXT_MS),
                            **({'isolated_narrated_recording': True} if isolated else {})))
    if len(targets) > MAX_TARGETS or sum(p['context_end_ms']-p['context_start_ms'] for p in targets) > MAX_TOTAL_MS:
        raise ValueError('AV composition evidence budget exceeded')
    return targets


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    start, end = target['context_start_ms'], target['context_end_ms']
    clip = work/'clip.mp4'
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(start/1000), '-i', str(source),
               '-t', str((end-start)/1000), '-vf', 'scale=-2:480', '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '26', '-c:a', 'aac', str(clip)]
    if run_media(command, env, tick, 300, poll_seconds=.2):
        raise ValueError('AV composition context extraction failed')
    prompt = (composition.PROMPT + (ISOLATED_GUIDANCE if target.get('isolated_narrated_recording') else GUIDANCE)
              + '\n选项：' + json.dumps(composition.CRITERIA, ensure_ascii=False)
              + f'\nT在本裁片{(target["start_ms"]-start)/1000}–{(target["end_ms"]-start)/1000}秒。')
    isolated = target.get('isolated_narrated_recording', False)
    response = request(prompt, schema(isolated), proxy=clip, fps=2, thinking='enabled', reasoning_effort='low')
    proof = dict(target, payload=response.payload, responseId=response.response_id, usage=response.usage)
    (work/'evidence.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2))
    validate(response.payload, isolated)
    return proof


def apply(segments, targets, observations):
    if len(targets) != len(observations):
        raise ValueError('Incomplete AV composition evidence')
    result, corrections, unresolved = [dict(s) for s in segments], [], []
    for target, observation in zip(targets, observations):
        if any(observation.get(k) != v for k, v in target.items()):
            raise ValueError('AV composition observation bound to wrong target')
        index = target['index']
        if (not 0 <= index < len(result) or result[index]['label_key'] != 'live_demo'
                or any(result[index][k] != target[k] for k in ('start_ms', 'end_ms'))):
            raise ValueError('Stale AV composition target')
        proof = observation['payload']
        isolated = target.get('isolated_narrated_recording', False)
        validate(proof, isolated)
        if proof['role'] == 'uncertain':
            unresolved.append(target)
        elif proof['role'] == 'assembled_support':
            if isolated and (proof['target_audio'] != 'spoken_narration'
                             or proof['narration_relation'] != 'adjacent_narration'):
                # Absence of the presenter's voice does not negate a measured
                # demonstration. The new branch needs positive narration evidence.
                if proof['target_audio'] == 'unknown' or proof['narration_relation'] == 'unknown':
                    unresolved.append(target)
                continue
            result[index].update(label_key='mixed_voiceover', reason='音画疑点与前后组合核验：'+proof['evidence'])
            corrections.append(dict(target, rule='av_bound_neighboring_composition'))
    return result, corrections, unresolved


def coalesce_mixed(segments):
    """Restore a rejected candidate's complete mixed context for offer review.

    Source cuts remain in the receipts. Live person boundaries and gaps are
    never merged, and this operation creates no continuous-duration claim.
    """
    result = []
    for segment in segments:
        if (result and segment['label_key'] == result[-1]['label_key'] == 'mixed_voiceover'
                and result[-1]['end_ms'] == segment['start_ms']):
            result[-1]['end_ms'] = segment['end_ms']
        else:
            result.append(dict(segment))
    return result


def verify(segments, source, work, env, tick, request, *, editorial, windows, claims,
           short_reviews=(), only_short=False):
    targets = plan(segments, editorial, windows, claims, short_reviews=short_reviews, only_short=only_short)
    observations = [observe(source, p, work/str(i), env, tick, request) for i, p in enumerate(targets)]
    result, corrections, unresolved = apply(segments, targets, observations)
    return result, dict(policy=POLICY, targets=targets, observations=observations,
                        corrections=corrections, unresolved=unresolved)
