"""Explicitly budgeted model repair of layout failures across adjacent groups."""
import copy
import hashlib
import json
import re


def repair_groups(words, response, *, call_model, protected_terms=(), max_calls=0):
    from .semantic_captions import SYSTEM, line_units, text_groups_to_boundaries
    if type(max_calls) is not int or not 0 <= max_calls <= 2:
        raise ValueError('layout repair budget must be 0..2')
    # Establish exact whole-source coverage before any additional paid call.
    if not isinstance(response, dict) or set(response) != {'groups'} or not isinstance(response['groups'], list) or not 1 <= len(response['groups']) <= 500:
        raise ValueError('invalid model text groups')
    source = ''.join(w['text'] for w in words)
    offsets, position = {0: 0}, 0
    for i, word in enumerate(words):
        position += len(word['text']); offsets[position] = i+1
    cursor = 0
    groups = copy.deepcopy(response['groups'])
    for group in groups:
        if not isinstance(group, dict) or set(group) != {'lines'} or not isinstance(group['lines'], list) or not 1 <= len(group['lines']) <= 2:
            raise ValueError('invalid model text lines')
        for line in group['lines']:
            if not isinstance(line, str) or not line or not source.startswith(line, cursor):
                raise ValueError('model changed source text')
            cursor += len(line)
            if cursor not in offsets:
                raise ValueError('model split an ASR word')
    if cursor != len(source):
        raise ValueError('model omitted source text')
    # A contiguous Latin token must remain whole even when ASR emits several words.
    terms = tuple(dict.fromkeys((*protected_terms, *re.findall(r'[A-Za-z][A-Za-z0-9]*', source))))
    events = []
    for _ in range(max_calls):
        invalid = [i for i,g in enumerate(groups) if any(len(s)>18 or line_units(s)>18 for s in g['lines'])]
        if not invalid: break
        lo, hi = max(0, invalid[0]-1), min(len(groups), invalid[0]+2)
        prefix = sum(len(''.join(g['lines'])) for g in groups[:lo])
        text = ''.join(''.join(g['lines']) for g in groups[lo:hi])
        if len(text)>320:
            raise ValueError('caption repair window exceeds limit')
        # Do not cut a protected token at either edge of this local window.
        for term in terms:
            start = source.find(term)
            while start >= 0:
                if any(start < edge < start+len(term) for edge in (prefix, prefix+len(text))):
                    raise ValueError('repair window cuts protected term')
                start = source.find(term, start+1)
        selected = words[offsets[prefix]:offsets[prefix+len(text)]]
        payload = {'transcript': text, 'previousGroups': groups[lo:hi],
                   'protectedTerms': [t for t in terms if t in text],
                   'issue': 'line_display_width_exceeded',
                   'instruction': '可调整相邻字幕组分界和组数，每组最多两行；完整保留原文和保护词，不输出时间。'}
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        proposal = call_model([{'role':'system','content':SYSTEM}, {'role':'user','content':serialized}])
        answer = text_groups_to_boundaries(selected, proposal)
        # Full grounding verifies line/group breaks, protected terms and source time.
        from .semantic_captions import ground_boundaries
        ground_boundaries(selected, answer, 'repair', 'source', payload['protectedTerms'])
        groups[lo:hi] = proposal['groups']
        events.append({'sourceStartMs': selected[0]['startMs'], 'sourceEndMs': selected[-1]['endMs'],
                       'requestSha256': hashlib.sha256(serialized.encode()).hexdigest(),
                       'groupsBefore':hi-lo, 'groupsAfter':len(proposal['groups'])})
    result = {'groups':groups}
    text_groups_to_boundaries(words, result)  # Reject residual overflow; no partial success.
    return result, events, terms
