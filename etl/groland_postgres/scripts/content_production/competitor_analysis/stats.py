"""Locked statistics over validated cards (v2 design §5).

Every dimension counts numerator and denominator inside the same set of films whose
assessment for that dimension is `assessable`; partial and unassessable films are reported
next to it, never silently dropped from one side. The analysis unit is the film until creative
version de-duplication exists, and the stat says so.
"""
import hashlib
import json
from collections import Counter, defaultdict

from . import contract, evaluation
from . import taxonomy as tx

STATS_VERSION = 'competitor-stats-v1'
ANALYSIS_UNIT = 'film'  # no creative-version de-duplication yet


SOUND_DIMENSIONS = ('voice_form', 'tone', 'music', 'sfx', 'hook_audio', 'sell_tone', 'sell_music')
SELL_ROLES = ('offer', 'action')


def _dimension_status(card, dimension):
    if dimension in SOUND_DIMENSIONS:
        sound = card['dimensions'].get('sound')
        if not sound:
            return 'unassessable'
        if dimension == 'hook_audio' and card['hook']['assessment'] != 'assessable':
            return card['hook']['assessment']
        return sound['assessment']
    if dimension == 'hook':
        return card['hook']['assessment']
    if dimension in ('selling_point', 'selling_point_shown', 'evidence_form', 'opening_path', 'content_form'):
        return {'complete': 'assessable', 'partial': 'partial'}.get(card['analysis_status'], 'unassessable')
    return card['dimensions'][dimension]['assessment']


def _blocked(record):
    """Parts with host errors; only the affected part leaves the statistics (v2 design §15.1).

    A broken evidence item blocks exactly the parts that cite it."""
    card = record['card']
    paths = {issue[1] for issue in record.get('issues', []) if issue[0] == 'error'}
    bad = {card['evidence'][int(p[len('evidence['):-1])]['id'] for p in paths if p.startswith('evidence[')}
    claims = {int(p[len('claims['):-1]) for p in paths if p.startswith('claims[')}
    claims |= {i for i, c in enumerate(card['claims']) if bad & set(c['stated_refs'] + c['shown_refs'])}
    dimensions = {p.split('.')[1].split('[')[0] for p in paths if p.startswith('dimensions.')}
    for name, dimension in card['dimensions'].items():
        if any(bad & set(label['evidence_refs']) for label in dimension.get('labels', []) + dimension.get('offers', [])):
            dimensions.add(name)
    return {
        'claims': claims,
        'hook': 'hook' in paths or bool(bad & set(card['hook']['evidence_refs'])),
        'segments': any(p.startswith('segments[') for p in paths),
        'card': 'card' in paths,
        'dimensions': dimensions,
    }


CLAIM_DIMENSIONS = ('selling_point', 'selling_point_shown', 'evidence_form')
SEGMENT_DIMENSIONS = ('content_form', 'opening_path')


def usable(record, dimension):
    blocked = _blocked(record)
    if blocked['card']:
        return False
    if dimension == 'hook':
        return not blocked['hook']
    if dimension in SEGMENT_DIMENSIONS or dimension in SOUND_DIMENSIONS:
        return not blocked['segments']
    if dimension in CLAIM_DIMENSIONS:
        return True
    return dimension not in blocked['dimensions']


def _valid_claims(record):
    skip = _blocked(record)['claims']
    return [claim for i, claim in enumerate(record['card']['claims']) if i not in skip]


def _labels(card, structure, dimension, claims=None):
    if dimension == 'hook':
        return set(card['hook']['mechanism_ids'])
    claims = card['claims'] if claims is None else claims
    if dimension == 'selling_point':
        return {claim['selling_point'] for claim in claims}
    if dimension == 'selling_point_shown':
        return {claim['selling_point'] for claim in claims if claim['support'] != 'not_shown'}
    if dimension == 'evidence_form':
        return {claim['evidence_form'] for claim in claims}
    if dimension == 'content_form':
        return {form for segment in card['segments'] for form in segment['content_forms']}
    if dimension == 'trust_cues':
        return {label['cue'] for label in card['dimensions']['trust_cues']['labels']}
    if dimension == 'offer_and_cta':
        return set(card['dimensions']['offer_and_cta']['cta'])
    if dimension == 'opening_path':
        return {' > '.join(structure['path'][:3])}
    if dimension in ('voice_form', 'tone', 'music'):
        return {segment[dimension] for segment in card['segments']} - {'none', 'unclear'}
    if dimension == 'sfx':
        return {sfx for segment in card['segments'] for sfx in segment['sfx']}
    if dimension == 'hook_audio':
        return set(card['hook']['audio_cues']) - {'none'}
    if dimension in ('sell_tone', 'sell_music'):
        key = 'tone' if dimension == 'sell_tone' else 'music'
        return {segment[key] for segment in card['segments'] if segment['primary_role'] in SELL_ROLES} - {'none', 'unclear'}
    raise KeyError(dimension)


DIMENSIONS = ('hook', 'selling_point', 'selling_point_shown', 'evidence_form', 'content_form', 'trust_cues',
              'offer_and_cta', 'opening_path') + SOUND_DIMENSIONS


FAMILY_SIMILARITY = 0.8


def _opening_text(card):
    hook = card['hook']
    return evaluation._norm((hook['speech'] or '') or (hook['onscreen_text'] or ''))


def opening_families(records):
    """Films whose opening line is near-identical share a family (re-used master footage).

    Union-find over pairwise similarity; returns {film: family_id}. Films without an opening
    line stay alone."""
    import difflib
    parent = {r['film']: r['film'] for r in records}

    def root(film):
        while parent[film] != film:
            parent[film] = parent[parent[film]]
            film = parent[film]
        return film

    texts = {r['film']: _opening_text(r['card']) for r in records}
    films = sorted(texts)
    for i, a in enumerate(films):
        for b in films[i + 1:]:
            if len(texts[a]) >= 6 and len(texts[b]) >= 6 and difflib.SequenceMatcher(
                    None, texts[a], texts[b], autojunk=False).ratio() >= FAMILY_SIMILARITY:
                parent[root(b)] = root(a)
    return {film: root(film) for film in films}


def cohort_key(record):
    return record['card']['product']['category']


def compute(records, cohort_id, period=None):
    """records: dicts with film, card, structure. Returns stat rows sorted by dimension and rate.

    Each row carries the film-level count and the opening-family count (`any_variant_present`)."""
    family = opening_families(records)
    snapshot = hashlib.sha256(json.dumps(sorted(
        (r['film'], r.get('input_manifest', {}).get('source_sha256'), r.get('response_id')) for r in records),
        ensure_ascii=False).encode()).hexdigest()[:16]
    rows = []
    for dimension in DIMENSIONS:
        status = {r['film']: _dimension_status(r['card'], dimension) if usable(r, dimension) else 'blocked'
                  for r in records}
        assessable = [r for r in records if status[r['film']] == 'assessable']
        counts, examples, families = Counter(), defaultdict(list), defaultdict(set)
        for record in assessable:
            for label in _labels(record['card'], record['structure'], dimension, _valid_claims(record)):
                counts[label] += 1
                examples[label].append(record['film'])
                families[label].add(family[record['film']])
        denominator = len(assessable)
        family_denominator = len({family[r['film']] for r in assessable})
        for label, numerator in counts.most_common():
            rows.append({
                'stat_id': f'{cohort_id}:{dimension}:{label}',
                'cohort_id': cohort_id, 'dimension': dimension, 'label': label,
                'analysis_unit': ANALYSIS_UNIT, 'aggregation_rule': 'at_least_once_per_assessable_film',
                'numerator': numerator, 'denominator': denominator,
                'rate': numerator / denominator if denominator else None,
                'partial_count': sum(1 for v in status.values() if v == 'partial'),
                'unassessable_count': sum(1 for v in status.values() if v == 'unassessable'),
                'blocked_count': sum(1 for v in status.values() if v == 'blocked'),
                'family_numerator': len(families[label]), 'family_denominator': family_denominator,
                'family_rule': f'opening_similarity>={FAMILY_SIMILARITY}:any_variant_present',
                'example_films': examples[label][:5], 'period': period,
                'taxonomy_version': tx.TAXONOMY_VERSION, 'normalization_version': contract.NORMALIZATION_VERSION,
                'stats_version': STATS_VERSION, 'input_snapshot': snapshot,
            })
    return rows


def role_time_share(records):
    """Primary-role effective seconds over covered seconds; unknown gaps reported separately."""
    seconds, covered, gaps = Counter(), 0.0, 0.0
    for record in records:
        for node in record['structure']['coarse_nodes']:
            span = sum(end - start for start, end in node['covered_intervals'])
            seconds[node['role']] += span
            covered += span
        gaps += sum(end - start for start, end in record['structure']['unknown_intervals'])
    return {'covered_sec': round(covered, 1), 'unknown_gap_sec': round(gaps, 1),
            'share': {role: round(value / covered, 3) for role, value in seconds.most_common()} if covered else {}}


def by_cohort(records, period=None):
    groups = defaultdict(list)
    for record in records:
        groups[cohort_key(record)].append(record)
    result = {'all': {'films': len(records), 'stats': compute(records, 'all', period),
                      'role_time': role_time_share(records)}}
    for key, group in sorted(groups.items()):
        result[key] = {'films': len(group), 'stats': compute(group, key, period), 'role_time': role_time_share(group)}
    return result
