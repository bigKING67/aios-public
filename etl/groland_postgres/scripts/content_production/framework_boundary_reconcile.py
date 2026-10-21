"""Reconcile coarse category edges with already observed source boundaries.

This never infers a class from duration or merges independent recordings. Local
person IDs are compared only inside their own observation window.
"""

import json
import math

POLICY = 'framework-boundary-reconcile-v4'


def close_terminal_frame(segments, duration_ms, source, env, tick):
    """Close only a partially covered final source frame, never a missing shot.

    Proposal times can be rounded to tenths. Metadata alone cannot establish
    that a short tail is the same shot; require the last decoded frame to
    straddle the proposed end and reach the actual video endpoint.
    """
    result = [dict(s) for s in segments]
    if not result or not 0 < duration_ms-result[-1]['end_ms'] <= 100:
        return result, None
    from .shot_catalog import run
    from .local_media_budget import media_slot
    command = ['ffprobe','-v','error','-select_streams','v:0',
        '-read_intervals',f'{max(0,duration_ms/1000-1):.3f}%', '-show_frames',
        '-show_entries','frame=best_effort_timestamp_time,pkt_duration_time,duration_time',
        '-of','json',str(source)]
    with media_slot(command,tick,60) as bounded:
        payload = json.loads(run(bounded,timeout=60,env=env))
    frames = payload.get('frames', [])
    if not frames:
        return result, None
    frame = frames[-1]
    try:
        start = float(frame['best_effort_timestamp_time'])*1000
        duration = float(frame.get('duration_time') or frame['pkt_duration_time'])*1000
    except (KeyError, TypeError, ValueError):
        return result, None
    end = start + duration
    before = result[-1]['end_ms']
    if (not all(math.isfinite(n) for n in (start,duration,end)) or duration <= 0
            or not start < before < end or abs(end-duration_ms) > 1):
        return result, None
    result[-1]['end_ms'] = duration_ms
    return result, dict(kind='terminal_frame_rounding', before_ms=before, after_ms=duration_ms,
                        frame_start_ms=start, frame_end_ms=end)


def transition_onset(cuts):
    """Bounded weak-transition fallback for an otherwise uncovered seam."""
    peaks = [(at, score) for at, score in cuts if score >= .08]
    if not peaks:
        return None
    # Two separated changes cannot identify which one owns a semantic gap.
    if max(at for at, _ in peaks)-min(at for at, _ in peaks) > 150:
        return None
    peak = max(peaks, key=lambda p: p[1])
    onset = min(at for at, score in cuts if peak[0]-100 <= at <= peak[0] and score >= .02)
    return onset, peak[1]


def reconcile(segments, windows):
    result = [dict(s) for s in segments]
    corrections = []
    # Window cores end at the proposal's coarse timestamp. A native source cut
    # can precede it, leaving a tiny default-montage patch in the next category.
    # Require the whole patch and a sample of its right neighbour to be inside
    # one observed source event; a real short insert has a separate end edge.
    i = 1
    while i + 1 < len(result):
        left, middle, right = result[i-1:i+2]
        a, b = middle['start_ms'], middle['end_ms']
        eligible = (left['label_key'] == 'live_demo' and middle['label_key'] == 'mixed_voiceover'
                    and right['label_key'] in ('street_interview', 'promotion')
                    and left['end_ms'] == a and right['start_ms'] == b
                    and 0 < b-a <= 500 and right['end_ms'] >= b+500)
        witnesses = []
        if eligible:
            for n, window in enumerate(windows):
                if window['start'] <= a and window['end'] >= b+500:
                    events = [e for e in window['events']
                              if e['start_ms'] <= a+1 and e['end_ms'] >= b+500]
                    witnesses.append((n, events))
        if (witnesses and all(len(events) == 1 and abs(events[0]['start_ms']-a) <= 1
                              for _, events in witnesses)):
            right['start_ms'] = a
            corrections.append(dict(kind='coarse_core_sliver', start_ms=a, end_ms=b,
                                    label_key=right['label_key'], windows=[n for n, _ in witnesses]))
            del result[i]
        else:
            i += 1

    # Nearest-cut snapping can choose the new source's *second* shot (e.g. its
    # product close-up). For an existing interview -> review/montage edge, the same
    # locally identified person on both sides of that shot identifies its true
    # entry. Do not use IDs from other windows or cross an unknown event.
    for left, right in zip(result, result[1:]):
        boundary = right['start_ms']
        if ({left['label_key'],right['label_key']} not in (
                    {'street_interview','mixed_voiceover'}, {'street_interview','live_demo'})
                or left['end_ms'] != boundary):
            continue
        candidates = []
        for n, window in enumerate(windows):
            if not (window['start'] <= boundary-1000 and window['end'] >= boundary+500):
                continue
            events = window['events']
            index = next((j for j, e in enumerate(events)
                          if e['start_ms'] <= boundary+100 < e['end_ms']), None)
            if index is None or not events[index].get('person'):
                candidates.append(None)
                continue
            person = events[index]['person']
            first = index
            while (first and events[first-1].get('person') == person
                   and events[first-1]['end_ms'] == events[first]['start_ms']):
                first -= 1
            edge = events[first]['start_ms']
            previous = events[first-1] if first else None
            if (previous and previous.get('person') and previous['person'] != person
                    and previous['end_ms'] == edge and previous['kind'] == 'presenter'
                    and events[first]['kind'] == 'presenter'
                    and 0 < boundary-edge <= 1000 and left['start_ms'] < edge):
                candidates.append((edge, n))
            else:
                candidates.append(None)
        if candidates and all(c is not None and abs(c[0]-candidates[0][0]) <= 1 for c in candidates):
            edge = candidates[0][0]
            left['end_ms'] = right['start_ms'] = edge
            corrections.append(dict(kind='source_entry_before_detail', before_ms=boundary, after_ms=edge,
                                    windows=[c[1] for c in candidates]))
    for left,right in zip(result,result[1:]):
        boundary=right['start_ms']
        if (left['label_key']!='mixed_voiceover' or right['label_key']!='promotion'
                or left['end_ms']!=boundary): continue
        starts=[]
        for n,w in enumerate(windows):
            if not (w['start']<=boundary-500 and w['end']>=boundary+500): continue
            events=[e for e in w['events'] if e['start_ms']<boundary and e['end_ms']>=boundary+500]
            starts.append((events[0]['start_ms'],n) if len(events)==1
                          and events[0]['kind']=='independent_insert'
                          and 0<boundary-events[0]['start_ms']<=500 else None)
        if starts and all(s is not None and s[0]==starts[0][0] for s in starts) and starts[0][0]>left['start_ms']:
            edge=starts[0][0]
            left['end_ms']=right['start_ms']=edge
            corrections.append(dict(kind='offer_source_entry',before_ms=boundary,after_ms=edge,
                                    windows=[s[1] for s in starts]))
    # A coarse proposal can end a qualified demonstration inside its last
    # speaking shot. Require every covering window to identify the same true
    # recording end; never extend through a product insert or qualify by pooling.
    for left,right in zip(result,result[1:]):
        boundary=right['start_ms']
        if (left['label_key']!='live_demo' or right['label_key']!='mixed_voiceover'
                or left['end_ms']!=boundary or boundary-left['start_ms']<=10000):
            continue
        ends=[]
        for n,w in enumerate(windows):
            if not (w['start']<=boundary-200 and w['end']>=boundary+2000): continue
            matches=[r for r in w.get('measured',{}).get('runs',[]) if r['unit']
                     and r['start_ms']<=boundary-200 and boundary<r['end_ms']<=boundary+2000]
            if len(matches)!=1:
                ends.append(None)
                continue
            run=matches[0]
            # Only an explicit event after the run proves the recording ended.
            next_event=next((e for e in w['events'] if e['start_ms']==run['end_ms']),None)
            ends.append((run['end_ms'],n) if next_event and next_event.get('unit')!=run['unit'] else None)
        if ends and all(e is not None and e[0]==ends[0][0] for e in ends) and ends[0][0]<right['end_ms']:
            edge=ends[0][0]
            left['end_ms']=right['start_ms']=edge
            corrections.append(dict(kind='qualified_review_tail',before_ms=boundary,after_ms=edge,
                                    windows=[e[1] for e in ends]))
    return result, dict(policy=POLICY, corrections=corrections)
