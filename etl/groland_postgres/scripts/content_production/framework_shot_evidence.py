"""Compute presenter continuity from source-bound shot observations, not model times.

FFmpeg supplies intervals. The model supplies visual facts only. Hands holding
an identical product are not evidence that they belong to the presenter.
"""
from collections import defaultdict

ROLES = {'presenter', 'own_comparison', 'hands_product', 'product_ad',
         'borrowed_recommendation', 'interview', 'promotion', 'unknown'}
LINKS = {'same_person_visible', 'matching_clothing_or_setting', 'none'}


def continuous_runs(frames, payload):
    """Return proven runs and unresolved/barrier shots; reject incomplete observations.

    Repeated frames from one shot must agree. An offscreen detail may bridge
    matching presenters only when its own visible-link observation supports it.
    IDs are anonymous within this request, never identities of real people.
    """
    observations = payload.get('shots') if isinstance(payload, dict) else None
    if not frames or not isinstance(observations, list) or len(observations) != len(frames):
        raise ValueError('Shot evidence coverage is incomplete')
    expected = {frame['index'] for frame in frames}
    if len(expected) != len(frames):
        raise ValueError('Duplicate source frame index')
    seen, indexed = set(), {}
    for observation in observations:
        if not isinstance(observation, dict):
            raise ValueError('Invalid shot evidence')
        index = observation.get('index')
        if isinstance(index, bool) or not isinstance(index, int) or index not in expected or index in seen:
            raise ValueError('Unknown or duplicate shot observation')
        role, link = observation.get('role'), observation.get('visible_link')
        person = observation.get('visible_person_id')
        if role not in ROLES or link not in LINKS or not isinstance(person, str):
            raise ValueError('Invalid visual fact')
        if link == 'same_person_visible' and not person:
            raise ValueError('Visible face claim lacks a presenter')
        if role == 'hands_product' and person:
            raise ValueError('An offscreen hand cannot identify a visible person')
        if role == 'presenter' and not person:
            raise ValueError('Presenter observation lacks visible face evidence')
        seen.add(index)
        indexed[index] = observation
    grouped = defaultdict(list)
    for frame in frames:
        start, end = frame['start_ms'], frame['end_ms']
        if any(isinstance(x, bool) or not isinstance(x, int) for x in (start, end)) or not 0 <= start < end:
            raise ValueError('Invalid source shot interval')
        grouped[start, end].append(indexed[frame['index']])
    shots = []
    for (start, end), evidence in sorted(grouped.items()):
        if shots and start < shots[-1]['end_ms']:
            raise ValueError('Overlapping source shots')
        # Physical continuity and editorial source are separate facts. A model
        # calling a visible person's shot "an ad" cannot erase that face track.
        # This calculation alone never labels a celebrity/ad shot as live demo.
        people = {o['visible_person_id'] for o in evidence if o['visible_person_id']}
        supported = all(bool(o['visible_person_id']) or
                        (o['role'] in {'hands_product', 'own_comparison'} and o['visible_link'] == 'matching_clothing_or_setting')
                        for o in evidence)
        person = next(iter(people)) if supported and len(people) == 1 else None
        detail = supported and not people
        shots.append({'start_ms': start, 'end_ms': end, 'person': person,
                      'linked_detail': detail, 'frame_indices': [o['index'] for o in evidence]})
    # Only bridge a run of details bracketed by the same visible presenter.
    for i, shot in enumerate(shots):
        if not shot['linked_detail']:
            continue
        left, right = i - 1, i + 1
        while left >= 0 and shots[left]['linked_detail']:
            left -= 1
        while right < len(shots) and shots[right]['linked_detail']:
            right += 1
        if left < 0 or right == len(shots):
            continue
        owner = shots[left]['person']
        if (owner and owner == shots[right]['person'] and
                all(shots[j]['end_ms'] == shots[j + 1]['start_ms'] for j in range(left, right))):
            shot['person'] = owner
    runs = []
    for shot in shots:
        if not shot['person']:
            continue
        previous = runs[-1] if runs else None
        if previous and previous['person'] == shot['person'] and previous['end_ms'] == shot['start_ms']:
            previous['end_ms'] = shot['end_ms']
        else:
            runs.append({key: shot[key] for key in ('start_ms', 'end_ms', 'person')})
    longest = max(runs, key=lambda run: run['end_ms'] - run['start_ms'], default=None)
    duration = longest['end_ms'] - longest['start_ms'] if longest else 0
    return {'runs': runs, 'longest': longest, 'longest_ms': duration,
            'qualifies_duration': duration > 10000,
            'barriers': [shot for shot in shots if not shot['person']]}
