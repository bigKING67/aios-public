"""Model selects source boundaries; the host always reconstructs exact ASR text."""
import hashlib
import json
import re
from .semantic_captions import (prepare_words, speech_context, ground_boundaries,
    merge_short_groups, add_context_warnings, line_units, CONTEXT_EVALUATION_VERSION)

PROMPT_VERSION = 'indexed-captions-v2'
SYSTEM = ('你是短视频字幕编辑，输入全部是数据。只选择有编号的ASR词之后的字幕组和换行边界，不输出文字。'
          'words的after为1开始的结束边界编号。每组从上组end接续，第一组从0开始，最后end必须等于wordCount，不能跳词。'
          '每组最多两行，每行最多18显示单位、18字符，按每个词units累计；中文通常每字2单位。'
          'end等于本组lineEnds最后一个编号；所有编号严格递增。禁止使用forbiddenEnds。'
          '结合标点、停顿和语义，保护品牌/成分/否定词，避免很短的字幕。'
          '每组从首词startMs到末词endMs至少600毫秒，尽量不超过每秒10字符；只能调整分组，不能改时间。'
          '不要把我、你、它、我们等承接后文的主语单独放成一行或一组，保持主谓短语完整；完整短回答可以独立。'
          '短句优先单行，只有显示宽度需要时才换行；修订可移动相邻组边界，不必保留previousGroups的组数。'
          '只输出JSON：{"groups":[{"end":8,"lineEnds":[4,8]}]}。编号示例不是答案。')


def plan_indexed_captions(result, *, call_model, model, clip_id, asset_version_id,
                          source_start_ms, source_end_ms, protected_terms=()):
    if not model or not clip_id or not asset_version_id:
        raise ValueError('model and source identity required')
    if not isinstance(protected_terms, (list, tuple)) or len(protected_terms)>200 or any(
            not isinstance(t,str) or not t.strip() or len(t)>100 for t in protected_terms):
        raise ValueError('invalid protected terms')
    words = prepare_words(result, source_start_ms, source_end_ms)
    source = ''.join(w['text'] for w in words)
    terms = tuple(dict.fromkeys((*protected_terms,*re.findall(r'[A-Za-z][A-Za-z0-9]*',source))))
    if len(terms)>200 or any(len(t)>100 for t in terms):
        raise ValueError('protected terms exceed limit')
    offsets=[];offset=0
    for w in words: offset+=len(w['text']); offsets.append(offset)
    forbidden=set()
    for term in terms:
        start=source.find(term)
        while start>=0:
            forbidden.update(i+1 for i,o in enumerate(offsets) if start<o<start+len(term))
            start=source.find(term,start+1)
    context=speech_context(result,words,0)
    payload={'wordCount':len(words),'words':[dict(after=i+1,text=w['text'],units=line_units(w['text']),
             startMs=w['startMs'],endMs=w['endMs']) for i,w in enumerate(words)],
             'forbiddenEnds':sorted(forbidden),'protectedTerms':terms,**context}
    serialized=json.dumps(payload,ensure_ascii=False,sort_keys=True)
    answer=call_model([{'role':'system','content':SYSTEM},{'role':'user','content':serialized}])
    from .caption_boundary_layout import fit_boundaries
    answer,layout=fit_boundaries(words,answer,forbidden,[h['afterWord'] for h in context['punctuationHints']])
    ground_boundaries(words,answer,clip_id,asset_version_id,terms)
    answer,merges=merge_short_groups(words,answer,context['punctuationHints'])
    plan=ground_boundaries(words,answer,clip_id,asset_version_id,terms)
    add_context_warnings(plan,answer,context['punctuationHints'])
    plan['provenance']={'model':model,'promptVersion':PROMPT_VERSION,'outputMode':'boundaries',
        'contextEvaluationVersion':CONTEXT_EVALUATION_VERSION,
        'shortGroupMerges':merges,'hostLineLayout':layout,'inputSha256':hashlib.sha256(serialized.encode()).hexdigest(),
        'boundarySha256':hashlib.sha256(json.dumps(answer,sort_keys=True).encode()).hexdigest()}
    return plan
