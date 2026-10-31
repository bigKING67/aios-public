"""框架结构排行 for the 爆款分析 page, over the cards' `framework` field (the drawer's 框架 / 卖点 lanes).

A framework structure is the framework segments' labels in time order with adjacent repeats merged
(实拍 → 实拍 → 机制 reads 实拍 → 机制). A selling-point structure is the set of selling-point labels a
film states, in preset order: by order of appearance nearly every film had its own structure
(2026-10-27: 89 films, about 70 sequences, against 28 sets).

Counts are opening families with any variant present, as on the other rankings. Sales come from the
罗盘 live-trade ranking: the paid amount of the rooms a structure's films drove traffic to inside the
window, each room-day once. The ranking gives bands, so lower and upper bounds are summed; an open top
band leaves the upper bound unknown. It is the rooms' amount, not what a film sold.

Since v2 each lane also counts structure elements (`elements`): which labels a film has at all, which
one it opens and closes with (framework only), and how many steps or selling points it has. Exact
sequences scatter (2026-10-27: 42 families in 28 framework structures, the top one 14%), so a
comparison with our originals reads at element level; `elements_of` is mirrored for our side by the
page (`competitor-patterns.ts`) and by the online report, and the three must agree.
"""
from collections import defaultdict

from . import breakdown_terms as terms

STRUCTURE_VERSION = 'competitor-structure-rank-v3'
LANES = ('framework', 'sellingPoint')
JOINERS = {'framework': ' > ', 'sellingPoint': ' + '}
ROW_LIMIT = 30  # per order; the rows kept are the union of the top by families and by sales
EXAMPLE_LIMIT = 5


def framework_of(card):
    """The card's structure when it was built (`status` ok), else None."""
    value = card.get('framework') if isinstance(card, dict) else None
    if not isinstance(value, dict) or value.get('status') != 'ok' or not isinstance(value.get('segments'), list):
        return None
    return value


def _keys(values):
    return [key for key in values if isinstance(key, str) and key]


def framework_keys(framework):
    keys = []
    segments = [s for s in framework['segments'] if isinstance(s, dict)]
    for key in _keys(s.get('labelKey') for s in sorted(segments, key=lambda s: s.get('startMs') or 0)):
        if not keys or keys[-1] != key:
            keys.append(key)
    return keys


def selling_point_keys(framework, order):
    points = [p for p in framework.get('sellingPoints') or [] if isinstance(p, dict)]
    found = set(_keys(key for point in points for key in point.get('labelKeys') or []))
    return sorted(found, key=lambda key: (order.index(key) if key in order else len(order), key))


def _preset_versions(framework):
    presets = framework.get('presets') if isinstance(framework.get('presets'), dict) else {}
    return tuple(value if isinstance(value, int) else 0 for value in (presets.get('framework'), presets.get('sellingPoint')))


def dictionary(frameworks):
    """Label names and preset order per lane; a newer preset's name wins (each lane by its own version)."""
    frameworks = list(frameworks)
    labels = {lane: {} for lane in LANES}
    order = {lane: [] for lane in LANES}
    for index, lane in enumerate(LANES):
        for framework in sorted(frameworks, key=lambda f: _preset_versions(f)[index]):
            names = (framework.get('labels') or {}).get(lane)
            if isinstance(names, dict):
                labels[lane].update({k: v for k, v in names.items() if isinstance(v, str)})
            keys = (framework.get('labelOrder') or {}).get(lane)
            if isinstance(keys, list) and keys:
                order[lane] = _keys(keys)
    return labels, order


def _size(count, kinds):
    return kinds[0] if count <= 2 else kinds[1] if count == 3 else kinds[2]


def elements_of(lane, keys):
    """[(key, kind, label)] of one structure: `has` per distinct label; `first` / `last` for a framework;
    a size bucket (`steps_*` for a framework, `points_*` for selling points: 1–2, 3, 4 or more)."""
    found = [(f'has_{key}', 'has', key) for key in dict.fromkeys(keys)]
    if lane == 'framework':
        found += [(f'first_{keys[0]}', 'first', keys[0]), (f'last_{keys[-1]}', 'last', keys[-1])]
        size = _size(len(keys), ('steps_short', 'steps_three', 'steps_long'))
    else:
        size = _size(len(set(keys)), ('points_few', 'points_three', 'points_many'))
    return found + [(size, 'size', size)]


def _elements(lane, groups, family):
    films_of, kind_of = defaultdict(set), {}
    for keys, films in groups.items():
        for key, kind, label in elements_of(lane, list(keys)):
            films_of[key].update(films)
            kind_of[key] = (kind, label)
    rows = [{'key': key, 'kind': kind_of[key][0], 'label': kind_of[key][1], 'films': len(films),
             'families': len({family[film] for film in films})} for key, films in films_of.items()]
    return sorted(rows, key=lambda r: (-r['families'], -r['films'], r['key']))


def room_days(compass, film, window):
    """{(date, room): (low, high)} of the rooms a film drove traffic to, inside the window (None: all time)."""
    return {(day, room): (low, high) for day, room, low, high in compass.get(film, ())
            if window is None or window[0] <= day <= window[1]}


def sales(days):
    lows = [low for low, _ in days.values()]
    highs = [high for _, high in days.values()]
    return {'min': round(sum(lows), 2), 'max': None if None in highs else round(sum(highs), 2),
            'rooms': len({room for _, room in days}), 'roomDays': len(days)}


def _lane(lane, ok, keys_of, family, film_days, brand_of):
    groups, empty = defaultdict(list), 0
    for film, framework in ok.items():
        keys = keys_of(framework)
        if keys:
            groups[tuple(keys)].append(film)
        else:
            empty += 1
    counted = [film for films in groups.values() for film in films]
    rows = []
    for keys, films in groups.items():
        days = {}
        for film in films:
            days.update(film_days[film])
        examples = sorted(films, key=lambda film: (-sales(film_days[film])['min'], film))
        rows.append({'key': JOINERS[lane].join(keys), 'labels': list(keys), 'films': len(films),
                     'families': len({family[film] for film in films}),
                     'brands': len({brand_of[film][0] for film in films if brand_of.get(film)}), 'sales': sales(days),
                     'exampleFilms': examples[:EXAMPLE_LIMIT]})
    # Since v3 the page ranks by films (a re-posted material is tested by each placement) with brands beside.
    by_films = sorted(rows, key=lambda r: (-r['films'], -r['brands'], -r['sales']['min'], r['key']))
    by_sales = sorted((r for r in rows if r['sales']['roomDays']), key=lambda r: (-r['sales']['min'], -r['films'], r['key']))
    kept = {r['key'] for r in by_films[:ROW_LIMIT] + by_sales[:ROW_LIMIT]}
    return {'films': len(counted), 'families': len({family[film] for film in counted}), 'empty': empty,
            'rows': [r for r in by_films if r['key'] in kept], 'elements': _elements(lane, groups, family)}


def ranking(records, family, compass, window):
    """The payload's `structures`: both lanes plus the films carrying a structure and sales.

    `compass` is {film: [(date, room, low, high)]}, or None when the ranking tables cannot be read
    (no sales then, and the page says so)."""
    ok = {r['film']: framework for r in records if (framework := framework_of(r['card']))}
    labels, order = dictionary(ok.values())
    film_days = {film: room_days(compass or {}, film, window) for film in ok}
    brand_of = {r['film']: terms.brand_key((r['card'].get('product') or {}).get('brand')) for r in records}
    keys_of = {'framework': framework_keys,
               'sellingPoint': lambda framework: selling_point_keys(framework, order['sellingPoint'])}
    return {
        'version': STRUCTURE_VERSION,
        'films': len(ok), 'missing': len(records) - len(ok),
        'sales': {'available': compass is not None, 'films': sum(1 for days in film_days.values() if days)},
        'labels': labels, 'labelOrder': order,
        **{lane: _lane(lane, ok, keys_of[lane], family, film_days, brand_of) for lane in LANES},
    }
