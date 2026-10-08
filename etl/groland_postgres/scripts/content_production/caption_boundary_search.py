"""Bounded adjacent-cue boundary search; never rewrite speech or claim semantic approval."""
from .semantic_captions import text_groups_to_boundaries, ground_boundaries, add_context_warnings
from .caption_boundary_layout import fit_boundaries


def repair_reading_boundaries(words, plan, punctuation, protected_terms, clip_id, asset_version_id, evaluate):
    attempts=0; changes=[]
    answer=text_groups_to_boundaries(words,{'groups':[{'lines':c['text'].split('\n')} for c in plan['captions']]})
    groups=answer['groups'];clause_ends={h['afterWord'] for h in punctuation}
    source=''.join(w['text'] for w in words);offsets=[];offset=0;forbidden=set()
    for word in words:
        offset+=len(word['text']);offsets.append(offset)
    for term in protected_terms:
        start=source.find(term)
        while start>=0:
            forbidden.update(i+1 for i,o in enumerate(offsets) if start<o<start+len(term))
            start=source.find(term,start+1)
    flagged={w['captionId'] for w in plan['warnings'] if w['reason']=='reading_duration_requires_review'}
    for i in range(len(groups)-1):
        if not flagged.intersection(c['id'] for c in plan['captions'][i:i+2]): continue
        lo=groups[i-1]['end'] if i else 0
        middle,hi=groups[i]['end'],groups[i+1]['end']
        # Do not move a boundary across ASR clauses or search large windows.
        if any(lo<b<hi for b in clause_ends) or hi-lo>80 or sum(len(w['text']) for w in words[lo:hi])>320: continue
        local_words=words[lo:hi]
        # Reuse model-selected line boundaries; arbitrary Chinese character
        # splits can turn a product name into fragments such as 白 / 金洗发水.
        known_ends={b for g in groups[i:i+2] for b in g['lineEnds']}
        for split in sorted((b for b in known_ends if lo<b<hi),key=lambda b:(abs(b-middle),b)):
            if split==middle or split in forbidden:continue
            if attempts>=128:return plan,{'attempts':attempts,'changes':changes,'budgetExhausted':True}
            attempts+=1
            try:
                proposed=[]
                for start,end in ((lo,split),(split,hi)):
                    lines=sorted({b-lo for b in known_ends if start<b<end}|{end-lo})
                    if len(lines)>2:break
                    proposed.append({'end':end-lo,'lineEnds':lines})
                if len(proposed)!=2:continue
                local,_=fit_boundaries(local_words,{'groups':proposed},
                    {b-lo for b in forbidden if lo<b<=hi})
                if len(local['groups'])!=2:continue
                replacement=[{'end':g['end']+lo,'lineEnds':[e+lo for e in g['lineEnds']]} for g in local['groups']]
                candidate={'groups':groups[:i]+replacement+groups[i+2:]}
                trial=ground_boundaries(words,candidate,clip_id,asset_version_id,protected_terms)
                add_context_warnings(trial,candidate,punctuation)
                evaluate(trial)
            except ValueError:
                continue
            if len(trial['warnings'])<len(plan['warnings']) and {w['reason'] for w in trial['warnings']} <= {w['reason'] for w in plan['warnings']}:
                changes.append({'startWord':lo,'endWord':hi,'boundaryBefore':middle,'boundaryAfter':split})
                # One adopted move per invocation bounds both work and semantic drift.
                return trial,{'attempts':attempts,'changes':changes,'budgetExhausted':False}
    return plan,{'attempts':attempts,'changes':changes,'budgetExhausted':False}
