"""Caption-independent, source-bound continuity for the opt-in v16 candidate.

The model observes people and recording units, never qualifying durations. A
returning face is not proof that an inserted recording belongs to its review.
"""
from collections import defaultdict

POLICY = 'framework-continuity-v2'


def label_spans(runs, packaging_links):
    """Label a qualified review's packaging intro/outro without extending its core.

    Links are separately observed same-review packaging displays between the
    same presenter. They cannot qualify short runs, chain over more inserts,
    or remove the boundary between independently qualified demonstrations.
    """
    links = {(e['start_ms'], e['end_ms'], e['outro_unit']) for e in packaging_links if e.get('outro_unit')}
    intro_links = {(e['start_ms'], e['end_ms'], e['intro_unit']) for e in packaging_links if e.get('intro_unit')}
    spans, extensions, skipped = [], [], set()
    for i, run in enumerate(runs):
        if i in skipped:
            continue
        span = dict(start_ms=run['start_ms'], end_ms=run['end_ms'],
                    label_key='live_demo' if run['qualifies'] else 'mixed_voiceover',
                    witness=(run['start_ms'], run['end_ms']),
                    minimum=9000 if run['tolerance'] else 10001)
        if run['qualifies'] and not run['tolerance'] and i >= 2 and not ({i-2,i-1} & skipped):
            introducing, insert = runs[i-2:i]
            if (not insert['unit'] and introducing['end_ms'] == insert['start_ms']
                    and insert['end_ms'] == run['start_ms'] and introducing['unit'] == run['unit']
                    and introducing['people'] and not introducing['qualifies'] and not introducing['clipped']
                    and (insert['start_ms'],insert['end_ms'],run['unit']) in intro_links
                    and len(spans) >= 2 and spans[-2]['start_ms'] == introducing['start_ms']
                    and spans[-1]['start_ms'] == insert['start_ms']
                    and all(s['label_key'] == 'mixed_voiceover' for s in spans[-2:])):
                del spans[-2:]
                span['start_ms'] = introducing['start_ms']
                skipped.update((i-2,i-1))
                extensions.append(dict(direction='intro', core_start_ms=run['start_ms'], core_end_ms=run['end_ms'],
                    insert_start_ms=insert['start_ms'],insert_end_ms=insert['end_ms'],start_ms=introducing['start_ms']))
        if run['qualifies'] and not run['tolerance'] and i + 2 < len(runs):
            insert, returning = runs[i + 1:i + 3]
            if (not insert['unit'] and run['end_ms'] == insert['start_ms']
                    and insert['end_ms'] == returning['start_ms']
                    and returning['unit'] == run['unit'] and returning['people']
                    and not returning['qualifies'] and not returning['clipped']
                    and (insert['start_ms'], insert['end_ms'], run['unit']) in links):
                span['end_ms'] = returning['end_ms']
                skipped.update((i + 1, i + 2))
                extensions.append(dict(core_start_ms=run['start_ms'], core_end_ms=run['end_ms'],
                                       insert_start_ms=insert['start_ms'], insert_end_ms=insert['end_ms'],
                                       end_ms=returning['end_ms']))
        spans.append(span)
    return spans, extensions


def validate(frames, payload):
    values = payload.get('shots') if isinstance(payload, dict) else None
    expected = {f['index'] for f in frames}
    if not isinstance(values, list) or len(values) != len(expected) or len(expected) != len(frames):
        raise ValueError('Continuity observations do not cover all frames')
    indexed = {}
    for v in values:
        if (not isinstance(v, dict) or set(v) != {'i', 'p', 'u', 'r', 'l'}
                or type(v['i']) is not int or v['i'] not in expected or v['i'] in indexed
                or v['r'] not in ('presenter','own_detail','independent_insert','interview','promotion','unknown')
                or v['l'] not in ('face','matching_setting','own_comparison','none')
                or not isinstance(v['p'], str) or not isinstance(v['u'], str)):
            raise ValueError('Invalid continuity observation')
        if v['r'] == 'presenter' and (not v['p'] or not v['u']):
            raise ValueError('Presenter lacks visible person/recording evidence')
        if v['r'] == 'own_detail' and (not v['u'] or v['l'] not in ('matching_setting','own_comparison')):
            raise ValueError('Detail lacks its own review evidence')
        if v['r'] in ('independent_insert','unknown') and v['u']:
            v = {**v, 'u': ''}  # Explicit insert role is a barrier regardless of an inconsistent unit ID.
        indexed[v['i']] = v
    return indexed



def source_shots(frames, observations):
    indexed = validate(frames, observations)
    grouped = defaultdict(list)
    clipped = set()
    for f in frames:
        a, b = f['start_ms'], f['end_ms']
        if type(a) is not int or type(b) is not int or not 0 <= a < b:
            raise ValueError('Invalid source interval')
        grouped[a, b].append(indexed[f['index']])
        if f.get('clipped'):
            clipped.add((a, b))
    shots = []
    for (a, b), facts in sorted(grouped.items()):
        if shots and a < shots[-1]['end_ms']:
            raise ValueError('Overlapping source intervals')
        units = {f['u'] for f in facts}
        usable = all(f['r'] in ('presenter','own_detail') for f in facts) and len(units) == 1
        # Disagreeing representative frames mean a missed source boundary.
        # They never establish one continuous run for the entire physical shot.
        shots.append(dict(start_ms=a, end_ms=b, unit=next(iter(units)) if usable else '',
                          people=sorted({f['p'] for f in facts if f['p']}),
                          clipped=(a, b) in clipped,
                          allow_tolerance=all(f.get('allow_tolerance', True) for f in frames
                                              if f['start_ms'] == a and f['end_ms'] == b),
                          ambiguous=len({(f['u'], f['r'] in ('presenter','own_detail')) for f in facts}) > 1,
                          indices=[f['i'] for f in facts]))
    return shots


def apply(proposals, frames, observations, duration_ms):
    """Rebuild person boundaries across coarse proposals, preserve sales/interviews."""
    shots = source_shots(frames, observations)
    runs = []
    for shot in shots:
        if (runs and shot['unit'] and runs[-1]['unit'] == shot['unit']
                and runs[-1]['end_ms'] == shot['start_ms']):
            runs[-1]['end_ms'] = shot['end_ms']
            runs[-1]['people'] = sorted(set(runs[-1]['people']) | set(shot['people']))
            runs[-1]['clipped'] = runs[-1]['clipped'] or shot['clipped']
            runs[-1]['allow_tolerance'] = runs[-1]['allow_tolerance'] and shot['allow_tolerance']
        else:
            runs.append(dict(shot))
    for run in runs:
        # The owner's ~1s tolerance applies only to a complete independent
        # review. A returning presenter on either side of an insert gets no
        # tolerance, even if the observer assigned the returns different units.
        interrupted = any(other is not run and other['unit'] and
                          (other['unit'] == run['unit'] or set(other['people']) & set(run['people']))
                          for other in runs)
        interrupted = interrupted or any(not other['unit'] and
            (other['end_ms'] == run['start_ms'] or other['start_ms'] == run['end_ms'])
            for other in runs)
        length = run['end_ms'] - run['start_ms']
        run['tolerance'] = bool(run['unit'] and run['allow_tolerance'] and not interrupted
                                and not run['clipped'] and 9000 <= length <= 10000)
        run['qualifies'] = bool(run['unit'] and run['people'] and (length > 10000 or run['tolerance']))
    # Existing content taxonomy only supplies interview/sales blocks. It does
    # not lock identity boundaries or suppress reviews mislabelled as montage.
    protected = [s for s in proposals['segments'] if s['label_key'] not in ('live_demo', 'mixed_voiceover')]
    edges = {0, duration_ms}
    for r in runs:
        edges.update((r['start_ms'], r['end_ms']))
    for s in protected:
        edges.update((max(0, round(s['start_sec'] * 1000)), min(duration_ms, round(s['end_sec'] * 1000))))
    segments = []
    for a, b in zip(sorted(edges), sorted(edges)[1:]):
        if a >= b or a >= duration_ms:
            continue
        run = next((r for r in runs if r['start_ms'] <= a and r['end_ms'] >= b), None)
        block = next((s for s in protected if s['start_sec'] * 1000 <= a and s['end_sec'] * 1000 >= b), None)
        qualifies = bool(run and run['qualifies'])
        # A presenter's price wrap-up may cross the proposal's sales boundary;
        # an independent sales board never has the same review recording unit.
        continuation = (qualifies and block and block['label_key'] == 'promotion'
                        and run['start_ms'] < round(block['start_sec'] * 1000))
        label = (block['label_key'] if block and not continuation else
                 'live_demo' if qualifies else 'mixed_voiceover')
        unit = run['unit'] if label == 'live_demo' else ''
        if segments and segments[-1]['label_key'] == label and segments[-1]['_unit'] == unit:
            segments[-1]['end_sec'] = b / 1000
            continue
        segments.append(dict(start_sec=a / 1000, end_sec=b / 1000, label_key=label,
            confidence=.9, reason='原片人物与拍摄片段连续性核验', same_person_as_previous=False,
            visual_kind='single_presenter' if label == 'live_demo' else 'montage' if label == 'mixed_voiceover' else 'other',
            endorsement_marker='', continuous_start_sec=a / 1000 if label == 'live_demo' else None,
            continuous_end_sec=b / 1000 if label == 'live_demo' else None, _unit=unit))
    for s in segments:
        s.pop('_unit')
        if s['label_key'] == 'live_demo':
            s['continuous_end_sec'] = s['end_sec']
    return {'segments': segments}, {'policy': POLICY, 'frames': len(frames), 'runs': runs,
                                   'ambiguousShots': [s for s in shots if s['ambiguous']]}
