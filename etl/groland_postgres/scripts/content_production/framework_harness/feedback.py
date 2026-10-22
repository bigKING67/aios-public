"""Train-only, observation-grounded reflection. Grading internals never enter proposals."""
import copy

from .evaluate import NAMES

SHOT_FIELDS = ('start', 'end', 'chain', 'kind', 'bg_near', 'mouth', 'ocr')
FACT_FIELDS = ('subject', 'style', 'people_count', 'talking_to_camera', 'celebrity_tag',
               'offer_text', 'using_product')


def reflection_feedback(row, errors):
    if row.get('error'):
        # A provider failure is not evidence that the observation guidance is wrong.
        return dict(status='execution_failed', cases=[])
    stages = row.get('stages')
    if stages is None:
        raise ValueError('Reflection requires recorded intermediate stages')
    cases = []
    for error in errors:
        # Do not ask the proposer to repair approximate timing, old gold already
        # superseded by an owner decision, or labels beyond the source duration.
        if any(error.get(k) for k in ('withinAnnotationTolerance', 'resolvedByAdjudications', 'outsideSourceVideo')):
            continue
        if len(cases) == 12:
            break
        shots = stages['shots']
        hits = [i for i, s in enumerate(shots) if s['start'] < error['end'] and s['end'] > error['start']]
        local = shots[max(0, hits[0]-1):hits[-1]+2] if hits else []
        a, b = (local[0]['start'], local[-1]['end']) if local else (error['start'], error['end'])
        case = {k: error[k] for k in ('start', 'end', 'expected', 'actual')}
        case['observations'] = [dict({k: copy.deepcopy(s[k]) for k in SHOT_FIELDS if k in s},
            facts={k: (s['facts'] or {})[k] for k in FACT_FIELDS if k in (s['facts'] or {})}) for s in local]
        for name in ('beforeReview', 'afterReview', 'afterRules'):
            case[name] = [[x, y, NAMES[label]] for x, y, label in stages[name] if x < b and y > a]
        case['reviewWindows'] = [dict(start=w['start'], end=w['end'], response=[
            {k: segment[k] for k in ('start', 'end', 'label', 'reason')} for segment in w['response']])
            for w in stages['windows'] if w['start'] < b and w['end'] > a]
        cases.append(case)
    return dict(status='observed', cases=cases)
