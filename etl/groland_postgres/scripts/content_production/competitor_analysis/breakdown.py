"""爆款拆解 statistics for the snapshot payload (`payload.breakdown`): openings, scenes, endorsers.

Counts are films: a material run again under another account is another film, and a hook many films
open with has been tested by that many placements (2026-10-28). Next to each count is the number of
brands the films come from, which tells an industry habit from one brand pushing hard. Each row also
names its TOP5 films by the 罗盘 room sales of the window (the rooms' amount, not what a film sold),
one per opening family so a re-posted material cannot fill the list.

Openings are grouped by opening family (stats.opening_families, similarity >= 0.8); the online report
turns groups into formulas. Scenes and endorsers come from the per-film text extraction
(enrichment.py); a film without a finished extraction counts in neither, and `enriched` says how many
have one.
"""
from collections import Counter, defaultdict

from . import breakdown_terms as terms
from . import structure_ranks

BREAKDOWN_VERSION = 'competitor-breakdown-v1'
TOP = 5
HOOK_GROUPS = 60  # every group the report may see; the page shows the first five
ROWS = 30
OTHER_CUES = ('user_word_of_mouth', 'sales_data', 'unfiltered_claim', 'bystander_reaction', 'authority_visual',
              'award_or_institution', 'test_report', 'brand_story')


def opening(card):
    """The first 3 seconds as said (or, without speech, as written on screen)."""
    hook = card.get('hook') or {}
    return ((hook.get('speech') or '').strip() or (hook.get('onscreen_text') or '').strip()) or None


def brand_keys(records):
    return {r['film']: terms.brand_key((r['card'].get('product') or {}).get('brand')) for r in records}


class Tally:
    """Films, brands and TOP5 of a set of films inside one window."""

    def __init__(self, records, family, compass, window):
        self.brands = brand_keys(records)
        self.family = family
        self.openings = {r['film']: opening(r['card']) for r in records}
        self.cards = {r['film']: r['card'] for r in records}
        self.sales = {r['film']: structure_ranks.sales(structure_ranks.room_days(compass or {}, r['film'], window))
                      for r in records}

    def tally(self, films):
        return {'films': len(films), 'brands': len({self.brands[f][0] for f in films if self.brands.get(f)})}

    def top(self, films):
        ordered = sorted(films, key=lambda f: (0 if self.sales[f]['roomDays'] else 1, -self.sales[f]['min'], f))
        kept, families = [], set()
        for film in ordered:
            family = self.family.get(film, film)
            if family in families:
                continue
            families.add(family)
            sale = self.sales[film]
            kept.append({'film': film, 'salesMin': sale['min'] if sale['roomDays'] else None,
                         'salesMax': sale['max'] if sale['roomDays'] else None, 'opening': self.openings.get(film)})
            if len(kept) == TOP:
                break
        return kept

    def row(self, films, **fields):
        return {**fields, **self.tally(films), 'top': self.top(films)}

    def sources(self, films):
        """All distinct source videos, never deduplicated by opening similarity or cut to TOP5."""
        result = []
        for film in sorted(set(films)):
            card = self.cards[film]
            hook = card.get('hook') or {}
            speech = bool((hook.get('speech') or '').strip())
            kind = 'speech' if speech else 'onscreen_text'
            refs = set(hook.get('evidence_refs') or [])
            evidence = [{'start': e.get('start_sec'), 'end': e.get('end_sec')} for e in card.get('evidence') or []
                        if e.get('id') in refs and e.get('modality') == kind]
            sale = self.sales[film]
            result.append({'film': film, 'opening': self.openings[film], 'openingKind': kind,
                           'evidence': evidence,
                           'salesMin': sale['min'] if sale['roomDays'] else None,
                           'salesMax': sale['max'] if sale['roomDays'] else None})
        return result


def _sorted(rows, key, limit):
    return sorted(rows, key=lambda r: (-r['films'], -r['brands'], r[key]))[:limit]


def hook_groups(records, count):
    """{opening family: films with an opening}; the report builds formulas out of these groups."""
    groups = defaultdict(list)
    for record in records:
        if count.openings.get(record['film']):
            groups[count.family.get(record['film'], record['film'])].append(record['film'])
    return groups


def hooks(records, count):
    groups = hook_groups(records, count)
    cards = {r['film']: r['card'] for r in records}
    rows = []
    for group, films in groups.items():
        text = Counter(count.openings[f] for f in films).most_common(1)[0][0]
        mechanisms = Counter(m for f in films for m in (cards[f].get('hook') or {}).get('mechanism_ids') or [])
        rows.append(count.row(films, group=group, text=text, mechanisms=[m for m, _ in mechanisms.most_common(2)]))
    return {'films': sum(len(f) for f in groups.values()), 'groups': len(groups),
            'rows': _sorted(rows, 'group', HOOK_GROUPS)}


def scenes(enriched, count):
    groups = {}
    for record in enriched:
        lines = {e.get('id'): e.get('content') for e in record['card'].get('evidence') or [] if isinstance(e, dict)}
        seen = set()
        for item in record['enrichment'].get('scene_pains') or []:
            scene, point = terms.normalize_scene(item.get('scene')), item.get('selling_point')
            other = (item.get('other_point') or '').strip() if point == terms.OTHER_POINT else ''
            if not scene:
                continue
            key = f'{scene}|{point}|{terms.compact(other)}' if other else f'{scene}|{point}'
            group = groups.setdefault(key, {'scene': scene, 'point': point, 'other': other, 'films': [],
                                            'pains': Counter(), 'audiences': Counter(), 'text': None})
            if key in seen:
                continue
            seen.add(key)
            group['films'].append(record['film'])
            group['pains'][(item.get('pain') or '').strip()] += 1
            group['audiences'].update(item.get('audience_tags') or [])
            if group['text'] is None:
                group['text'] = next((lines[ref] for ref in item.get('evidence_refs') or [] if lines.get(ref)), None)
    rows = [count.row(g['films'], key=key, scene=g['scene'], pain=g['pains'].most_common(1)[0][0],
                      sellingPoint=g['point'], otherPoint=g['other'] or None,
                      audiences=[a for a, _ in g['audiences'].most_common(3)], text=g['text'])
            for key, g in groups.items()]
    return {'films': len(enriched), 'rows': _sorted(rows, 'key', ROWS)}


def endorsers(records, enriched, count):
    named, unnamed = {}, defaultdict(set)
    for record in enriched:
        for item in record['enrichment'].get('endorsers') or []:
            role = item.get('role')
            if role not in terms.ENDORSER_ROLES:
                continue
            key = terms.endorser_key(item.get('name'))
            if key is None:
                unnamed[role].add(record['film'])
                continue
            group = named.setdefault(key[0], {'films': set(), 'names': Counter(), 'roles': Counter()})
            if record['film'] not in group['films']:
                group['films'].add(record['film'])
                group['names'][key[1]] += 1
                group['roles'][role] += 1
    rows = [count.row(sorted(g['films']), key=key, name=g['names'].most_common(1)[0][0],
                      role=g['roles'].most_common(1)[0][0]) for key, g in named.items()]
    other, cues = set(), Counter()
    for record in records:
        trust = ((record['card'].get('dimensions') or {}).get('trust_cues') or {}).get('labels') or []
        found = {t.get('cue') for t in trust if isinstance(t, dict)} & set(OTHER_CUES)
        if found:
            other.add(record['film'])
            cues.update(found)
    return {'films': len(enriched),
            'unnamed': {role: count.tally(sorted(films)) for role, films in sorted(unnamed.items())},
            'other': {**count.tally(sorted(other)), 'cues': dict(cues.most_common())},
            'rows': _sorted(rows, 'key', ROWS)}


def breakdown(records, family, compass, window):
    """The payload's `breakdown` for one cohort × window. `compass` as from snapshots.load_compass."""
    count = Tally(records, family, compass, window)
    enriched = [r for r in records if isinstance(r.get('enrichment'), dict)]
    known = [b for b in count.brands.values() if b]
    return {
        'version': BREAKDOWN_VERSION,
        'films': len(records), 'enriched': len(enriched),
        'brands': {'brands': len({b[0] for b in known}), 'unknown': len(records) - len(known)},
        'sales': {'available': compass is not None},
        'hook': hooks(records, count),
        'scene': scenes(enriched, count),
        'endorser': endorsers(records, enriched, count),
    }
