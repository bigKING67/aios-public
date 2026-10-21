"""Source-bound speaker references and audio-only checks, on the same Lite model.

Audio estimates never supply cut timestamps or rewrite visual recording units.
The second observation sees no video, subtitle or first observation's answer.
"""
import json
import wave

from .segment_suggestion_provider import run_media

MIN_REFERENCE_MS = 750
MAX_REFERENCE_MS = 3000
PAIR_GAP_MS = 1000
INPUT_POLICY = 'single-audio-pair-v1'
PROMPT = '''只比较两份编号音频A和B的真实说话声线，不推测视频人物或框架类型。
reference_speakers/target_speakers分别记录one/multiple/none/uncertain；相同文案、同产品、都是女声或一样语速不能证明同一个人。
先写reference_words/target_words中实际听到的短句，再填match：all=参考A的唯一说话者覆盖B全部讲话；part=只覆盖B部分讲话；none=不是同一声线；uncertain=无法确认。
evidence写具体听觉依据，最多80字。不生成时间戳，不把语气变化直接当换人，也不把不同女声笼统合并。'''


def schema():
    fields = {k: {'type': 'string'} for k in ('reference_words', 'target_words', 'evidence')}
    fields['match'] = {'type': 'string', 'enum': ['all', 'part', 'none', 'uncertain']}
    for k in ('reference_speakers', 'target_speakers'):
        fields[k] = {'type': 'string', 'enum': ['one', 'multiple', 'none', 'uncertain']}
    return {'type': 'object', 'additionalProperties': False, 'required': list(fields), 'properties': fields}


def validate(proof):
    fields = schema()['properties']
    if (not isinstance(proof, dict) or set(proof) != set(fields)
            or any(not isinstance(v, str) for v in proof.values())
            or any(proof[k] not in f['enum'] for k, f in fields.items() if 'enum' in f)
            or not proof['evidence'].strip()):
        raise ValueError('Invalid independent speaker evidence')
    if proof['match'] == 'all' and (proof['reference_speakers'] != 'one'
            or proof['target_speakers'] != 'one'
            or not proof['reference_words'].strip() or not proof['target_words'].strip()):
        raise ValueError('Voice continuity contradicts speaker coverage')
    return proof


def bind_reference(item, windows):
    """Same-window units only; intersect references instead of guessing an A speaker."""
    a, s, e = item['context_start_ms'], item['start_ms'], item['end_ms']
    references, relations = [], set()
    for window in windows:
        if window['start'] > a or window['end'] <= s:
            continue
        left = [v for v in window['events'] if v['end_ms'] > a and v['start_ms'] < s
                and v.get('unit') and v['kind'] == 'presenter']
        right = [v for v in window['events'] if v['end_ms'] > s and v['start_ms'] < min(e, window['end'])
                 and v.get('unit') and v['kind'] == 'presenter']
        if left and right:
            reference = left[-1]
            relations.add('same_review' if reference['unit'] == right[0]['unit'] else 'different_review')
            references.append((max(a, reference['start_ms']), min(s, reference['end_ms'])))
    if len(relations) > 1:
        raise ValueError('Conflicting source ownership at audio anchor')
    relation = next(iter(relations), 'unavailable')
    if not references:
        return dict(visual_link=relation, speaker_reference=None)
    lo, hi = max(p[0] for p in references), min(p[1] for p in references)
    if hi - lo < MIN_REFERENCE_MS:
        # The reference can be too short even though the visual relationship is known.
        return dict(visual_link=relation, speaker_reference=None)
    return dict(visual_link=relation,
                speaker_reference=dict(start_ms=lo, end_ms=min(hi, lo + MAX_REFERENCE_MS)))


def join_pair(samples, destination):
    """One acoustic timeline, with exact PCM and a source-bound A/B mapping.

    Separate audio inputs failed an identical-recording control on Lite. Keep
    both samples in one input; silence separates them but is not voice evidence.
    """
    pieces, durations = [], []
    for path in samples:
        with wave.open(str(path), 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                raise ValueError('Speaker pair requires mono PCM16 at 16kHz')
            frames = audio.getnframes()
            data = audio.readframes(frames)
            if not frames or len(data) != frames * 2:
                raise ValueError('Incomplete speaker sample')
            pieces.append(data)
            durations.append(frames / 16)
    a_ms, b_ms = durations
    with wave.open(str(destination), 'wb') as audio:
        audio.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        audio.writeframes(pieces[0] + bytes(PAIR_GAP_MS * 32) + pieces[1])
    return [dict(start_ms=0, end_ms=a_ms),
            dict(start_ms=a_ms + PAIR_GAP_MS, end_ms=a_ms + PAIR_GAP_MS + b_ms)]


def observe(source, item, folder, env, tick, request):
    reference = item.get('speaker_reference')
    if reference is None:
        raise ValueError('External narration lacks a source-bound speaking reference')
    folder.mkdir(parents=True, exist_ok=True)
    samples = []
    ranges = [reference, dict(start_ms=item['start_ms'], end_ms=item['end_ms'])]
    for name, interval in zip(('A', 'B'), ranges):
        path = folder / f'{name}.wav'
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(interval['start_ms'] / 1000),
                   '-i', str(source), '-t', str((interval['end_ms'] - interval['start_ms']) / 1000),
                   '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', str(path)]
        if run_media(command, env, tick, 60, poll_seconds=.2):
            raise ValueError('Speaker reference extraction failed')
        samples.append(path)
    joined = folder / 'pair.wav'
    offsets = join_pair(samples, joined)
    prompt = PROMPT + ('\n本次A、B合在同一音频中，中间有1秒静音：'
        f'A=0–{offsets[0]["end_ms"]/1000:.3f}秒，'
        f'B={offsets[1]["start_ms"]/1000:.3f}–{offsets[1]["end_ms"]/1000:.3f}秒。'
        '只比较指定两段，不把中间静音作为换说话人的证据。')
    result = request(prompt, schema(), audio=joined, thinking='enabled', reasoning_effort='medium')
    (folder / 'evidence.json').write_text(json.dumps(dict(policy=INPUT_POLICY, ranges=ranges,
        audio_ranges=offsets, gap_ms=PAIR_GAP_MS, payload=result.payload,
        responseId=result.response_id, usage=result.usage), ensure_ascii=False))
    return validate(result.payload)
