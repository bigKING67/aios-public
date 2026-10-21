"""Audio/visual editorial ownership after the v16 local continuity measurement.

A measured continuous review is only a candidate. An external speaker quoting
that review may make it montage footage. All evidence uses the same Lite model.
"""
import json

from .shot_catalog import run as run_probe

from .segment_suggestion_provider import run_media, SuggestionError
from . import framework_speaker_evidence as speaker
from . import framework_identity_evidence as identity

POLICY = 'framework-editorial-av-v5'
MAX_CHECKS = 24
MAX_AUDIO_MS = 960000
CORE_MS = 36000
PROMPT = '这是一段原片画面及其严格对齐的真实音频。A/B时间范围见末尾。不要分类，不判断长短，只逐项观察：\na_words/b_words分别写听到的实际原话短句。a_person/b_person描述大画面的人。a_person_is_speaking/b_person_is_speaking：大画面的人是否确实在讲话、口型和该时刻音频对应（必须看视频动态，不从字幕和图片推测）。same_voice：A和B实际声线是否相同，与画面是否换人分开判断。same_person：A与B大画面是否同一个人。same_review：是否有具体同次拍摄环境/动作流程证据，A本人介绍后B演示者属于同一次测评分工，不能仅凭同产品/同解说认定。\npip_is_speaking：B里小窗是否有实际讲话动作，静态头像不算；pip_matches_audio：小窗口型/声线是否对应真实音频；pip_is_other_person：是否和B大画面不同人。没有小窗填no。\nevidence只记录以上可核对的具体依据，最多100字。无法确定填uncertain，不要把连续配音直接当A画面人物在讲话，也不要把A里的人名角标当发声者。'
PROMPT += ('\nA仅指指定的原片人物锚点，A与B之间可能还有其他人物或产品画面，不能把它们算入A。'
           'B里可以有同一次测评的多个角色；pip_is_other_person只在小窗人物不属于B内任何主讲/演示角色时填yes。'
           '自己的主讲人在B前段出现、后段缩成小窗，不是外来人物。'
           'same_person必须核对脸部，不能仅因换衣服判断不同人；same_review不重新决定已核验的素材单元。')
PROMPT += ('\nb_person_is_speaking=yes表示B内至少有一个已出镜主讲/演示角色的实际讲话与原音对应；'
           'B只在部分时间自己讲话也填yes，并在evidence写明具体范围。'
           '这意味着不能把整个B当作另一个人的画外讲解素材。纯产品画面上的画外音不算。')
OPENING_PROMPT = '另观察片头A与目标B的组合关系opening_link：montage_sequence=片头多来源短画面和B共用连续旁白/叙事，属于同一开场组合；self_intro=同次本人测评介绍；new_review=B从头开始独立测评；uncertain。不能只因位于开头或相邻就选montage_sequence。opening_evidence最多80字。'
OPENING_PROMPT += ('另填opening_distinct_sources=yes/no/uncertain：片头是否确有独立来源，'
                   '例如不同人物/不同拍摄环境/独立广告素材；同一环境同一人物的上妆开场、'
                   '动作剪辑或对白衔接填no。只有yes才能选montage_sequence，'
                   'opening_evidence要指明两种来源，不能仅以“开场蒙太奇”为依据。')
FACTS = ('a_person_is_speaking','b_person_is_speaking','same_voice','same_person','same_review',
         'pip_is_speaking','pip_matches_audio','pip_is_other_person')


def schema(opening=False):
    fields = {k:{'type':'string'} for k in ('a_words','b_words','a_person','b_person','evidence')}
    fields.update({k:{'type':'string','enum':['yes','no','uncertain']} for k in FACTS})
    if opening:
        fields.update(opening_link={'type':'string','enum':['montage_sequence','self_intro','new_review','uncertain']},
                      opening_distinct_sources={'type':'string','enum':['yes','no','uncertain']},
                      opening_evidence={'type':'string'})
    return {'type':'object','additionalProperties':False,'required':list(fields),'properties':fields}


def opening_candidate(segments):
    """Only the original short prefix may request a link; merges never cascade."""
    # At the upstream 2fps sampling cadence, a sub-frame opening flash cannot
    # establish a separate narrative unit that absorbs a complete review.
    if len(segments) < 2:
        return None
    left, right = segments[:2]
    if (left['start_ms'] == 0 and left['label_key'] == 'mixed_voiceover'
            and 500 <= left['end_ms'] < 9000 and right['label_key'] == 'live_demo'
            and left['end_ms'] == right['start_ms']):
        return 1
    return None


def plan(segments, duration_ms, *, resolved_indices=()):
    opening = opening_candidate(segments)
    planned = []
    for i, s in enumerate(segments):
        if s['label_key'] != 'live_demo' or i in resolved_indices:
            continue
        for a in range(s['start_ms'], s['end_ms'], CORE_MS):
            b = min(a + CORE_MS, s['end_ms'])
            # Check all of a long candidate, never infer the middle from its ends.
            planned.append(dict(index=i, start_ms=a, end_ms=b,
                                context_start_ms=0 if i == opening and a == s['start_ms'] else max(0, a - 4000),
                                context_end_ms=b,
                                opening=(i == opening and a == s['start_ms'])))
    if len(planned) > MAX_CHECKS or sum(p['context_end_ms']-p['context_start_ms'] for p in planned) > MAX_AUDIO_MS:
        raise ValueError('Editorial audio/video budget exceeded; no partial publication')
    return planned


def visual_link(item, windows):
    """Compare source-verified units only inside the same window ID namespace."""
    return speaker.bind_reference(item, windows)['visual_link']


def opening_source_relation(item, windows):
    """The whole opening is distinct from the immediate audio anchor.

    A proposal may start a few frames inside its measured source shot. That
    tiny same-person prefix cannot erase earlier independent opening footage.
    """
    relations = set()
    for window in windows:
        if window['start'] != 0 or window['end'] < item['end_ms']:
            continue
        target = next((e for e in window['events']
                       if e['start_ms'] <= item['start_ms'] < e['end_ms']), None)
        prefix = [e for e in window['events'] if e['start_ms'] < item['start_ms']]
        if (not target or not target['unit'] or not prefix or prefix[0]['start_ms'] != 0
                or prefix[-1]['end_ms'] < item['start_ms']
                or any(a['end_ms'] != b['start_ms'] for a,b in zip(prefix,prefix[1:]))):
            continue
        unit = target['unit']
        if any(e['kind'] == 'independent_insert' and unit not in (e.get('intro_unit'),e.get('outro_unit'))
               or e['kind'] in ('presenter','own_detail') and e['unit'] and e['unit'] != unit
               and not e.get('needs_ownership') for e in prefix):
            relations.add('different_sources')
        elif all(e['unit'] == unit and e['kind'] in ('presenter','own_detail')
                 and not e.get('needs_ownership') or unit in (e.get('intro_unit'),e.get('outro_unit'))
                 for e in prefix):
            relations.add('same_review')
    if len(relations) > 1:
        raise ValueError('Conflicting source opening evidence')
    return next(iter(relations), None)


def validate(proof, item):
    fields = schema(item['opening'])['properties']
    if (not isinstance(proof,dict) or set(proof) - {'voice_check','identity_check'} != set(fields)
            or any(not isinstance(proof[k],str) for k in fields)
            or any(proof[k] not in f['enum'] for k,f in fields.items() if 'enum' in f)
            or not proof['evidence'].strip()):
        raise ValueError('Invalid editorial audio/video evidence')
    if item['opening'] and (proof['opening_link']=='uncertain' or not proof['opening_evidence'].strip()):
        raise ValueError('Unresolved opening composition')
    if (item['opening'] and proof['opening_link'] == 'montage_sequence'
            and (proof['opening_distinct_sources'] != 'yes' or
                 (item.get('opening_source_relation') or item.get('visual_link')) == 'same_review')):
        raise ValueError('Opening montage lacks independent source evidence')
    if 'voice_check' in proof:
        speaker.validate(proof['voice_check'])
    if 'identity_check' in proof:
        identity.validate(proof['identity_check'])
    return proof


def proposed_external_narrator(item, proof):
    # A complete, visually verified review can contain original speech plus its
    # own voiced-over operations. A whole-candidate veto must not erase that.
    # A new outfit/recording of the same physical reviewer is not borrowed footage.
    if proof['b_person_is_speaking'] == 'yes' or proof['same_person'] == 'yes':
        return False
    # A later audio observation cannot reassign visual identities or erase the
    # independently verified recording boundary (including same-person re-edits).
    separate = item['visual_link'] == 'different_review'
    # These facts propose a check; independent audio corroboration is mandatory.
    continued = (separate and proof['a_person_is_speaking']=='yes'
                 and proof['same_voice'] in ('yes', 'uncertain'))
    pip = (item['visual_link']!='same_review' and all(proof[k]=='yes' for k in
           ('pip_is_speaking','pip_matches_audio','pip_is_other_person')))
    return continued or pip


def needs_voice_check(item, proof):
    if (item['opening'] and proof.get('opening_link') == 'montage_sequence'
            and proof.get('opening_distinct_sources') == 'yes'
            and (item.get('opening_source_relation') or item['visual_link']) != 'same_review'):
        # Independently established opening composition does not depend on
        # proving who supplied its voice. Audio is only auxiliary to this label.
        return False
    # Same identity or some original speech can protect a review from wholesale
    # relabelling; neither may hide contradictory voice-continuity evidence.
    claimed_continuity = (item['visual_link'] == 'different_review'
        and proof['a_person_is_speaking'] == 'yes' and proof['same_voice'] == 'yes')
    return proposed_external_narrator(item, proof) or claimed_continuity


def needs_identity_check(proof):
    check = proof.get('voice_check', {})
    return (proof['same_person'] != 'no' and proof['b_person_is_speaking'] == 'yes'
            and check.get('match') == 'none'
            and check.get('reference_speakers') == check.get('target_speakers') == 'one')


def different_speakers_resolved(proof):
    """The independent audio check resolves an AV same-voice hypothesis.

    This excludes the preceding speaker, not every possible external narrator.
    Partial/uncertain audio or uncertain visual identity remain unresolved.
    """
    check = proof.get('voice_check', {})
    identity = proof.get('identity_check', {})
    different_people = proof['same_person'] == 'no' or (
        identity.get('a_matches_b') == 'no' and identity.get('b_same_person') == 'yes')
    return (proof['b_person_is_speaking'] == 'yes' and different_people
            and check.get('match') == 'none'
            and check.get('reference_speakers') == check.get('target_speakers') == 'one')


def external_narrator(item, proof):
    if not needs_voice_check(item, proof):
        return False
    # Different recording units can be one person's own edited review. Voice
    # continuity is a cross-modal hypothesis, not authority to relabel it.
    check = proof.get('voice_check')
    if check is None or item.get('speaker_reference') is None:
        raise ValueError('Unverified external speaker attribution')
    speaker.validate(check)
    if different_speakers_resolved(proof):
        # The isolated audio comparison resolves the AV model's same-voice
        # guess: different visible speakers have different voices. This agrees
        # with B speaking for herself and is not external-narrator evidence.
        return False
    if check['match'] != 'all':
        # Audio is an auxiliary hypothesis: none disproves the claimed A voice,
        # while partial/uncertain cannot relabel the entire measured candidate.
        # Preserve the primary composition and report this disagreement.
        return False
    if not proposed_external_narrator(item, proof):
        return False
    if proof['same_person'] != 'no':
        raise ValueError('External narrator may be the reviewer in another recording')
    if proof['b_person_is_speaking'] != 'no':
        raise ValueError('External narrator conflicts with target speaking evidence')
    return True


def apply(segments, planned, proofs, *, complete_opening=None, coalesce=True):
    if len(planned) != len(proofs):
        raise ValueError('Incomplete editorial evidence')
    proofs = [validate(v,p) for p,v in zip(planned,proofs)]
    # One coarse candidate cannot be relabelled wholesale when its audio roles
    # disagree. That requires a new source-bound split, not a 36s grid boundary.
    for index in {p['index'] for p in planned}:
        group = [(p,v) for p,v in zip(planned,proofs) if p['index'] == index]
        external = [external_narrator(p,v) for p,v in group]
        if any(external) and not all(external):
            raise ValueError('Conflicting editorial roles within one continuous candidate')
        if len(group)>1 and any(p['opening'] and v.get('opening_link') == 'montage_sequence' for p,v in group):
            full = (complete_opening or {}).get(index)
            if (not full or full['start_ms'] != 0 or full['target_start_ms'] != segments[index]['start_ms']
                    or full['end_ms'] != segments[index]['end_ms']
                    or full['payload'].get('target_role') not in ('independent_review','own_intro_review','assembled_support')):
                raise ValueError('Opening composition exceeds the checked context')
    result = [dict(s) for s in segments]
    corrections = []
    for p, proof in zip(planned, proofs):
        if p['opening'] and p['index'] in (complete_opening or {}):
            full = complete_opening[p['index']]['payload']
            proof = dict(proof, opening_link={'independent_review':'new_review','own_intro_review':'self_intro',
                'assembled_support':'montage_sequence'}[full['target_role']], opening_evidence=full['evidence'])
        if (external_narrator(p, proof)
                or p['opening'] and proof['opening_link'] == 'montage_sequence'):
            # A candidate containing external quoted footage has not established
            # one independent review. Do not manufacture a precise audio cut.
            i = p['index']
            result[i]['label_key'] = 'mixed_voiceover'
            result[i]['reason'] = '音画归属：' + (proof['opening_evidence'] if p['opening'] and
                proof['opening_link'] == 'montage_sequence' else proof['evidence'])
            corrections.append(dict(index=i, start_ms=p['start_ms'], end_ms=p['end_ms'],
                rule='opening_composition' if p['opening'] and proof['opening_link'] == 'montage_sequence'
                else 'external_narrator'))
    if not coalesce:
        return result, corrections
    merged = []
    for s in result:
        if (merged and s['label_key'] == merged[-1]['label_key'] == 'mixed_voiceover'
                and s['start_ms'] == merged[-1]['end_ms']):
            merged[-1]['end_ms'] = s['end_ms']
            if s.get('reason', '').startswith('音画归属：'):
                merged[-1]['reason'] = s['reason']
        else:
            merged.append(s)
    return merged, corrections


def observe(source, item, folder, env, tick, request, *, has_audio=True, reserve_audio=None, reserve_identity=None, reserve_completion=None):
    folder.mkdir(parents=True, exist_ok=True)
    a, b = item['context_start_ms'], item['context_end_ms']
    s, e = item['start_ms'], item['end_ms']
    base = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-ss', str(a / 1000), '-i', str(source), '-t', str((b-a) / 1000)]
    video, audio = folder / 'video.mp4', folder / 'audio.wav'
    tails = (['-an', '-vf', 'scale=-2:640', '-c:v', 'libx264', '-preset', 'fast', '-crf', '25', str(video)],
                 ['-vn', '-ac', '1', '-ar', '16000', str(audio)])
    for tail in tails if has_audio else tails[:1]:
        if run_media(base + tail, env, tick, 300, poll_seconds=.2):
            raise ValueError('Editorial synchronized media extraction failed')
    reference = item.get('speaker_reference')
    prompt = PROMPT + f'\nB=视频/音频内{((s-a)/1000):.3f}–{(e-a)/1000:.3f}秒。'
    if reference is not None:
        prompt += f'\nA={(reference["start_ms"]-a)/1000:.3f}–{(reference["end_ms"]-a)/1000:.3f}秒，仅此人物锚点。'
    else:
        prompt += '\nA不存在，A的所有人物/声音匹配项填uncertain，不从B反推A。'
    if not has_audio:
        prompt += '\n原片没有音轨，声音匹配项填uncertain，发声项填no，不推测口播。'
    if item['opening']:
        prompt += '\n' + OPENING_PROMPT + f'\n片头组合范围另指0–{(s-a)/1000:.3f}秒，不等于人物锚点A。'
    try:
        result = request(prompt, schema(item['opening']), proxy=video, audio=audio if has_audio else None, fps=3,
                         thinking='enabled', reasoning_effort='low')
    except SuggestionError as error:
        if error.code != 'provider_incomplete' or reserve_completion is None:
            raise
        reserve_completion()
        result = request(prompt, schema(item['opening']), proxy=video, audio=audio if has_audio else None, fps=3,
                         thinking='disabled')
    proof = validate(result.payload, item)
    (folder / 'evidence.json').write_text(json.dumps(dict(item, payload=proof,
        responseId=result.response_id, usage=result.usage), ensure_ascii=False))
    if needs_voice_check(item, proof):
        if not has_audio:
            raise ValueError('External narration cannot be verified without source audio')
        if reserve_audio is not None and reference is not None:
            reserve_audio(reference['end_ms'] - reference['start_ms'] + e - s + speaker.PAIR_GAP_MS)
        proof['voice_check'] = speaker.observe(source, item, folder / 'voice-check', env, tick, request)
        if needs_identity_check(proof):
            if reserve_identity is not None:
                reserve_identity()
            proof['identity_check'] = identity.observe(source, item, folder / 'identity', env, tick, request)
        (folder / 'evidence.json').write_text(json.dumps(dict(item, payload=proof,
            responseId=result.response_id, usage=result.usage), ensure_ascii=False))
    return proof


def verify(segments, source, duration_ms, work, env, tick, request, *, windows, resolved=()):
    # Composition is a primary decision, not a suggestion to be retried by an
    # auxiliary speaker classifier. Reuse only exact source-bound decisions.
    settled = set()
    for value in resolved:
        i = value['index']
        if (type(i) is not int or not 0 <= i < len(segments) or i in settled
                or (value['start_ms'], value['end_ms']) !=
                   (segments[i]['start_ms'], segments[i]['end_ms'])
                or value.get('reason') not in ('observed_composition', 'adjacent_measured_reviews',
                                              'resolved_review_operation')):
            raise ValueError('Invalid source-bound composition authority')
        settled.add(i)
    planned = [dict(p, **speaker.bind_reference(p, windows))
               for p in plan(segments, duration_ms, resolved_indices=settled)]
    for item in planned:
        if item['opening']:
            item['opening_source_relation'] = opening_source_relation(item, windows)
    audio_streams = json.loads(run_probe(['ffprobe','-v','error','-select_streams','a',
        '-show_entries','stream=index','-of','json',str(source)],timeout=30,env=env)).get('streams',[]) if planned else []
    proofs = []
    visual_audio_ms = sum(p['context_end_ms'] - p['context_start_ms'] for p in planned) if audio_streams else 0
    audio_ms = visual_audio_ms
    identity_checks = 0
    completion_repairs = 0

    def reserve_completion():
        nonlocal completion_repairs
        if completion_repairs >= 2:
            raise ValueError('Editorial completion repair budget exceeded')
        completion_repairs += 1

    def reserve_identity():
        nonlocal identity_checks
        if identity_checks >= 4:
            raise ValueError('Editorial identity conflict budget exceeded')
        identity_checks += 1

    def reserve_audio(milliseconds):
        nonlocal audio_ms
        if audio_ms + milliseconds > MAX_AUDIO_MS:
            raise ValueError('Editorial audio/video budget exceeded; no partial publication')
        audio_ms += milliseconds

    for i, p in enumerate(planned):
        proof = observe(source, p, work / str(i), env, tick, request, has_audio=bool(audio_streams),
                        reserve_audio=reserve_audio,reserve_identity=reserve_identity,reserve_completion=reserve_completion)
        proofs.append(validate(proof, p))  # Stop before buying further calls on invalid evidence.
        external_narrator(p, proof)  # Contradictions stop before buying the remaining candidate checks.
    complete_opening = {}
    for item, proof in zip(planned, proofs):
        target = segments[item['index']]
        if item['opening'] and proof.get('opening_link') == 'montage_sequence' and target['end_ms'] > item['end_ms']:
            from . import framework_opening_context
            reserve_audio(target['end_ms'])
            complete_opening[item['index']] = framework_opening_context.observe(source,target,work/'complete-opening',env,tick,request)
            full=complete_opening[item['index']]['payload']
            if full['target_role']!='assembled_support':
                revised=dict(proof,opening_link='new_review')
                if needs_voice_check(item,revised) and 'voice_check'not in proof:
                    reference=item.get('speaker_reference')
                    if reference is None or not audio_streams:
                        raise ValueError('Complete opening review lacks independent speaker evidence')
                    reserve_audio(reference['end_ms']-reference['start_ms']+item['end_ms']-item['start_ms']+speaker.PAIR_GAP_MS)
                    proof['voice_check']=speaker.observe(source,item,work/'complete-opening'/'voice-check',env,tick,request)
    # Missing-offer discovery needs the source blocks. An existing offer uses
    # the established coalesced-neighbor contract; changing those question
    # indices or introducing extra tiny neighbors destabilizes the same audit.
    result, corrections = apply(segments, planned, proofs, complete_opening=complete_opening,
        coalesce=any(s['label_key']=='promotion' for s in segments))
    return result, dict(policy=POLICY, checks=len(proofs), audioMs=audio_ms,identityChecks=identity_checks,
        visualAudioMs=visual_audio_ms, completeOpening=complete_opening, completionRepairs=completion_repairs,
        audioConflicts=[dict(start_ms=p['start_ms'],end_ms=p['end_ms'],
            match=v['voice_check']['match'],resolution='external_narrator_not_established')
            for p,v in zip(planned,proofs) if 'voice_check'in v and v['voice_check']['match']!='all'
            and not different_speakers_resolved(v)],
        audioResolutions=[dict(start_ms=p['start_ms'], end_ms=p['end_ms'],
            resolution='different_visible_speakers_with_distinct_voices')
            for p,v in zip(planned,proofs) if different_speakers_resolved(v)],
        corrections=corrections, compositionResolved=list(resolved),
        voiceChecks=sum('voice_check' in v for v in proofs),
        observations=[dict(p, proof=v) for p, v in zip(planned, proofs)])
