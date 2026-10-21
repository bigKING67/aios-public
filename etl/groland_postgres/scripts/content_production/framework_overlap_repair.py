"""Resolve incompatible ownership of the same physical interval across windows."""
import copy
import json

from . import framework_review_ownership as ownership


def conflicts(windows, active_spans=None):
    spans = []
    for i, w in enumerate(windows):
        for other in windows[i+1:]:
            for a in w['events']:
                for b in other['events']:
                    lo, hi = max(a['start_ms'], b['start_ms']), min(a['end_ms'], b['end_ms'])
                    if (lo < hi and {a['kind'], b['kind']} == {'own_detail', 'independent_insert'}
                            and (active_spans is None or any(min(hi, end)>max(lo, start) for start,end in active_spans))):
                        spans.append((lo, hi))
    merged = []
    for lo, hi in sorted(spans):
        if merged and lo <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(hi, merged[-1][1]))
        else:
            merged.append((lo, hi))
    if len(merged) > 4 or any(b-a > 8000 for a, b in merged):
        raise ValueError('Overlapping source ownership exceeds bounded repair budget')
    return merged


def direction_conflicts(windows):
    """Compare physical owner positions, never window-local person identifiers."""
    def owner_extent(window, event):
        owners = [e for e in window['events'] if e['kind']=='presenter' and e['unit']==event['unit']]
        return (min(e['start_ms'] for e in owners),max(e['end_ms'] for e in owners)) if owners else None
    spans = []
    for i, window in enumerate(windows):
        for other in windows[i+1:]:
            for a in window['events']:
                if a['kind']!='own_detail': continue
                for b in other['events']:
                    lo,hi=max(a['start_ms'],b['start_ms']),min(a['end_ms'],b['end_ms'])
                    if lo<hi and b['kind']=='own_detail':
                        x,y=owner_extent(window,a),owner_extent(other,b)
                        if x and y and min(x[1],y[1])<=max(x[0],y[0]): spans.append((lo,hi))
    merged=[]
    for lo,hi in sorted(spans):
        if merged and lo<=merged[-1][1]: merged[-1]=(merged[-1][0],max(hi,merged[-1][1]))
        else: merged.append((lo,hi))
    if len(merged)>4 or any(b-a>8000 for a,b in merged):
        raise ValueError('Conflicting owner direction exceeds bounded repair budget')
    return merged


def fragmented_operations(windows):
    """Select conflicting operation tails that can erase a whole review.

    Selection is not continuity evidence: every distinct operation is observed
    again with the two complete neighboring demonstrations before any repair.
    """
    targets = set()
    def operation(event):
        # A coarse powder macro may say "packaging" while the source action
        # observer saw fingers taking powder. This only selects a new source
        # check; an actual packshot/ad without that observation is not a step.
        return (event.get('visible') in ('hands','product') and
                (event.get('observed_function') == 'product_operation' if 'observed_function' in event
                 else event.get('action') == 'hand_operation'))
    for window in windows:
        events = window['events']
        for i, event in enumerate(events):
            if (not i or event['kind'] != 'independent_insert'
                    or not operation(event)):
                continue
            first = i
            while (first and events[first-1]['kind'] in ('own_detail','independent_insert')
                   and operation(events[first-1])):
                first -= 1
            j = i + 1
            while (j < len(events) and events[j]['kind'] in ('own_detail','independent_insert')
                   and operation(events[j])):
                j += 1
            if not first or j == len(events) or events[j]['kind'] != 'presenter':
                continue
            block = events[first:j]
            if any(e.get('needs_ownership') for e in block):
                continue
            left = events[first-1]
            if left['kind'] != 'presenter' or not left['unit']:
                continue
            start = left['start_ms']
            for previous in reversed(events[:first-1]):
                if previous['end_ms'] != start or previous['unit'] != left['unit']:
                    break
                start = previous['start_ms']
            a, b = block[0]['start_ms'], events[j]['start_ms']
            if (not 0 < b-a <= 8000 or a-start >= 9000 or b-start < 10001
                    or any(x['end_ms'] != y['start_ms'] for x,y in zip(events[first-1:j],events[first:j+1]))):
                continue
            if not any(r['start_ms'] == b and r['qualifies'] for r in window['measured']['runs']):
                continue
            for other in windows:
                if other is window:
                    continue
                inside = [e for e in other['events'] if min(b,e['end_ms']) > max(a,e['start_ms'])]
                if (inside and inside[0]['start_ms'] <= a and inside[-1]['end_ms'] >= b
                        and all(e['kind'] == 'own_detail' and not e.get('needs_ownership') for e in inside)
                        and all(x['end_ms'] == y['start_ms'] for x,y in zip(inside,inside[1:]))):
                    targets.add((a,b))
    if len(targets) > 4:
        raise ValueError('Fragmented operation repair exceeds bounded budget')
    return sorted(targets)


def apply(windows, span, proof, anchors=None):
    ownership.validate(proof)
    a, b = span
    independent = proof['middle_owner'] == 'neither'
    if not independent and proof['middle_function'] in ('packaging_display', 'ingredient_ad'):
        raise ValueError('Contradictory overlapping packaging ownership')
    output = copy.deepcopy(windows)
    for w in output:
        events = []
        for e in w['events']:
            lo, hi = max(a, e['start_ms']), min(b, e['end_ms'])
            if lo >= hi:
                events.append(e)
                continue
            if e['kind'] not in ('own_detail', 'independent_insert'):
                raise ValueError('Overlap repair conflicts with presenter evidence')
            if e['start_ms'] < lo:
                events.append(dict(e, end_ms=lo))
            target = dict(e, start_ms=lo, end_ms=hi, needs_ownership=False,
                          overlap_ownership_resolved=True)
            if independent:
                target.update(kind='independent_insert', unit='')
                target.pop('intro_unit', None)
                target.pop('outro_unit', None)
            else:
                left = next((x for x in reversed(w['events']) if x['end_ms'] <= a and x['kind']=='presenter'), None)
                right = next((x for x in w['events'] if x['start_ms'] >= b and x['kind']=='presenter'), None)
                if anchors:
                    # left/right refer to the photographed source anchors in
                    # this request, not another window's nearest presenter.
                    left,right=[next((x for x in w['events'] if x['start_ms']<=at<x['end_ms']),None)
                                for at in anchors]
                owner = proof['middle_owner']
                if owner == 'both' and (not left or not right or left['unit'] != right['unit']):
                    if (not proof['left_demonstrates'] and proof['right_demonstrates']
                            and proof['middle_function']=='product_operation'
                            and proof['outer_relation']=='same_review'):
                        # A shared preparation belongs with the actual
                        # demonstrator. Do not join the preceding talker's unit
                        # or use that talker's time to qualify the demonstration.
                        owner='right'
                    elif (proof['left_demonstrates'] and proof['right_demonstrates']
                            and proof['middle_function']=='product_operation'):
                        # A shared operation does not erase either independent
                        # presenter boundary. Keep it as the preceding review's
                        # closing step, as in the existing ownership policy.
                        owner = 'left'
                    else:
                        raise ValueError('Overlap repair cannot pool distinct local presenters')
                anchor = left if owner in ('left', 'both') else right
                if not anchor or not anchor['unit']:
                    raise ValueError('Overlap repair lacks a local operation owner')
                target.update(kind='own_detail', unit=anchor['unit'])
            events.append(target)
            if hi < e['end_ms']:
                events.append(dict(e, start_ms=hi))
        w['events'] = events
    return output


def verify(windows, source, work, env, tick, request, *, active_spans=None, targets=None, subdivide=False):
    directional = targets is not None
    targets = conflicts(windows, active_spans) if targets is None else targets
    output, receipts = windows, []
    for i, (a, b) in enumerate(targets):
        covering = [w for w in output if w['start'] < a and w['end'] > b]
        context = (max(covering, key=lambda w:min(a-w['start'],12000)+min(w['end']-b,12000), default=None)
                   if directional else next(iter(covering),None))
        if context is None:
            raise ValueError('Conflicting source interval lacks two-sided context')
        left = next((e for e in reversed(context['events']) if e['end_ms'] <= a and e['kind']=='presenter'), None)
        right = next((e for e in context['events'] if e['start_ms'] >= b and e['kind']=='presenter'), None)
        if left is None or right is None:
            raise ValueError('Conflicting source ownership lacks observed presenters')
        # Observe the anchors' whole recorded actions, not only a 0.6s return
        # shot which would hide an already completed personal demonstration.
        left_start,right_end=left['start_ms'],right['end_ms']
        for e in reversed(context['events'] if directional else []):
            if e['end_ms']==left_start and e['unit']==left['unit'] and e['kind'] in ('presenter','own_detail'):
                left_start=e['start_ms']
        for e in context['events'] if directional else []:
            if e['start_ms']==right_end and e['unit']==right['unit'] and e['kind'] in ('presenter','own_detail'):
                right_end=e['end_ms']
        left = dict(left, start_ms=max(left_start, a-12000))
        right = dict(right, end_ms=min(right_end, b+12000))
        edges = sorted({a,b,*[e['end_ms'] for e in context['events'] if a<e['end_ms']<b]}) if subdivide else [a,b]
        middles = [dict(start_ms=start,end_ms=end) for start,end in zip(edges,edges[1:])]
        proofs = ownership.observe_many(source, left, middles, right, work/str(i), env, tick, request)
        anchors=[(left['start_ms']+left['end_ms'])//2,(right['start_ms']+right['end_ms'])//2]
        for middle,proof in zip(middles,proofs):
            output = apply(output, (middle['start_ms'], middle['end_ms']), proof,anchors)
            receipts.append(dict(middle, anchors_ms=anchors,proof=proof))
    if receipts:
        (work/'resolutions.json').write_text(json.dumps(receipts, ensure_ascii=False, indent=2))
    return output, receipts


def reconcile(segments, receipt, source, duration_ms, work, env, tick, request):
    active = [(s['start_ms'], s['end_ms']) for s in segments if s['label_key']=='live_demo']
    observed, repairs = verify(receipt['windows'], source, work, env, tick, request, active_spans=active)
    receipt['overlapOwnershipRepairs'] = repairs
    if not repairs:
        return segments
    from . import framework_window_audit as audit, framework_continuity as continuity
    receipt['windows'] = observed
    for w in observed:
        frames, facts = audit.event_facts(w['events'], duration_ms, core=(w['core_start'], w['core_end']))
        frames[0]['clipped'], frames[-1]['clipped'] = w['start']>0, w['end']<duration_ms
        _, w['measured'] = continuity.apply({'segments': []}, frames, facts, duration_ms)
    result = [dict(s) for s in segments]
    for repair in repairs:
        if repair['proof']['middle_owner'] != 'neither':
            continue
        a, b = repair['start_ms'], repair['end_ms']
        split = []
        for s in result:
            lo, hi = max(a,s['start_ms']), min(b,s['end_ms'])
            if lo>=hi or s['label_key']!='live_demo':
                split.append(s)
                continue
            if s['start_ms']<lo: split.append(dict(s,end_ms=lo))
            split.append(dict(s,start_ms=lo,end_ms=hi,label_key='mixed_voiceover',
                              reason='重叠窗口冲突经原片补证：独立插片'))
            if hi<s['end_ms']: split.append(dict(s,start_ms=hi))
        result = split
        claims = []
        for c in receipt['liveClaims']:
            if b<=c['start_ms'] or a>=c['end_ms']:
                claims.append(c)
            else:
                if c['start_ms']<a: claims.append(dict(c,end_ms=a))
                if b<c['end_ms']: claims.append(dict(c,start_ms=b))
        receipt['liveClaims'] = claims
    return audit.finalize(result, receipt)[0]
