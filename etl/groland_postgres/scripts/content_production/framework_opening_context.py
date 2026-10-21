"""Resolve opening membership over the entire candidate, not its first chunk."""
import json

from .segment_suggestion_provider import run_media

PROMPT = '''核对片头与后续目标完整内容的组织关系，不识别姓名、不用角标、不修改时间。
短片头可以是本人测评的引入，也可以与后面一个被引用的素材共同构成混剪。请看完目标全段再判断，不能把前几秒共用旁白推及整段。一个人在自己的流程中讲解、操作、展示结果，可以独立成立，即使开头插了其他来源的引子；反过来，被借用的短推荐在多来源推荐单元中也可能有完整操作及本人原声。
target_action描述整个B的实际进展；opening_relation说明A与B的具体联系；target_role说明B整体是independent_review独立测评、own_intro_review本人测评引入、assembled_support多来源组合的一块、uncertain无法确定。evidence只写视频可核对的事实。'''


def schema():
    fields = {k: {'type': 'string'} for k in ('target_action', 'opening_relation', 'evidence')}
    fields['target_role'] = {'type': 'string', 'enum': ['independent_review', 'own_intro_review', 'assembled_support', 'uncertain']}
    return {'type': 'object', 'additionalProperties': False, 'required': list(fields), 'properties': fields}


def observe(source, target, work, env, tick, request):
    work.mkdir(parents=True, exist_ok=True)
    clip = work/'context.mp4'
    end = target['end_ms']
    if not 0 < target['start_ms'] < end <= 360000:
        raise ValueError('Invalid complete opening context extent')
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-t', str(end/1000),
           '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-c:a', 'aac', str(clip)]
    if run_media(cmd, env, tick, 300, poll_seconds=.2):
        raise ValueError('Complete opening context extraction failed')
    response = request(PROMPT + f'\nA=0–{target["start_ms"]/1000:.3f}秒；B={target["start_ms"]/1000:.3f}–{end/1000:.3f}秒。',
                       schema(), proxy=clip, fps=1, thinking='enabled', reasoning_effort='low')
    value = response.payload
    record = dict(start_ms=0, target_start_ms=target['start_ms'], end_ms=end,
                  payload=value, usage=response.usage, responseId=response.response_id)
    (work/'evidence.json').write_text(json.dumps(record, ensure_ascii=False))
    if (not isinstance(value, dict) or set(value) != set(schema()['properties']) or
            any(not isinstance(v,str) or not v.strip() for v in value.values()) or
            value['target_role'] not in schema()['properties']['target_role']['enum'] or
            value['target_role'] == 'uncertain'):
        raise ValueError('Unresolved complete opening context')
    return record
