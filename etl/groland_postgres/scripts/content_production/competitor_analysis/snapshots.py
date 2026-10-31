"""Locked statistics snapshots for the 爆款分析 page (`competitor.stat_snapshots`).

Rebuilds stats.py records from stored cards and writes one row per cohort (taxonomy category
key, or `all`) × window. A window key is `all` or `YYYY-MM-DD..YYYY-MM-DD`, a calendar window by
the Beijing date a film was first seen, both ends included. A row is keyed by its input snapshot,
so an unchanged input only refreshes its watermark. Only the current TAXONOMY_VERSION is counted;
statistics never mix versions, and the other versions are reported next to the sample.

Every month and year with films, and every such day of the last PRECOMPUTED_DAYS, is computed
ahead; any other window the page asks for lands in `competitor.stat_requests` and is computed on
the next idle tick. The competitor worker calls `maybe_refresh` and `maybe_process_requests`
while idle; a role without write access to the table (the GPU node) skips both and the VPS worker
keeps the snapshots current.

    python -m content_production.competitor_analysis.snapshots --refresh [--force]
"""
import argparse
import datetime as dt
import re
import sys
import time
from collections import Counter
from zoneinfo import ZoneInfo

from psycopg2.extras import Json, RealDictCursor

from . import breakdown, contract, enrichment, stats, structure_ranks
from . import taxonomy as tx

ALL_TIME = 'all'
# Rolling windows written before calendar windows; still readable for report jobs queued earlier.
LEGACY_PERIODS = {'last7': 7, 'last30': 30}
WINDOW_KEY = re.compile(r'^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$')
PRECOMPUTED_DAYS = 60
REQUEST_BATCH = 20
DEFAULT_COHORT = 'loose_powder'
BUSINESS_TZ = ZoneInfo('Asia/Shanghai')
CHECK_INTERVAL_SECONDS = 60
TEXT_LIMIT = 30
EXAMPLE_LIMIT = 5
ROW_FIELDS = ('dimension', 'label', 'numerator', 'denominator', 'partial_count', 'unassessable_count',
              'blocked_count', 'family_numerator', 'family_denominator', 'example_films')
# Free-text dimensions without a dictionary yet: aggregated by text, never given a rate.
TEXT_DIMENSIONS = {'scenes': ('label', 'source'), 'audiences': ('label', 'basis')}

# Latest finished result per video; its taxonomy decides whether it is counted.
LOAD_SQL = """SELECT DISTINCT ON (a.aweme_id) a.analysis_id::TEXT AS analysis_id, a.aweme_id, a.status,
  a.taxonomy_version, a.source_sha256, a.card, a.host_errors, v.title, v.first_seen_at
  FROM competitor.analyses a JOIN competitor.videos v ON v.aweme_id = a.aweme_id
  WHERE a.status IN ('succeeded', 'partial')
  ORDER BY a.aweme_id, a.finished_at DESC NULLS LAST, a.created_at DESC"""

UPSERT_SQL = """INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version,
  normalization_version, input_snapshot, source_watermark, films, families, payload)
  VALUES (%(cohort)s, %(period)s, %(stats_version)s, %(taxonomy_version)s, %(normalization_version)s,
          %(input_snapshot)s, %(source_watermark)s, %(films)s, %(families)s, %(payload)s)
  ON CONFLICT (cohort, period, stats_version, input_snapshot) DO UPDATE
  SET taxonomy_version = EXCLUDED.taxonomy_version, normalization_version = EXCLUDED.normalization_version,
      source_watermark = EXCLUDED.source_watermark, films = EXCLUDED.films, families = EXCLUDED.families,
      payload = EXCLUDED.payload, computed_at = NOW()"""

# Every live window is rewritten at least daily (the watermark carries the date), so rows not
# rewritten for 30 days are superseded inputs, custom windows nobody asked for again, or the
# retired rolling windows.
PRUNE_SQL = """DELETE FROM competitor.stat_snapshots WHERE computed_at < NOW() - INTERVAL '30 days'"""

# Windows other than the precomputed ones that are still being read: rewritten with new data.
RECENT_WINDOWS_SQL = """SELECT DISTINCT cohort, period FROM competitor.stat_snapshots
  WHERE computed_at >= NOW() - INTERVAL '30 days' AND period ~ '^\\d{4}-\\d{2}-\\d{2}\\.\\.'"""

CLAIM_REQUESTS_SQL = """SELECT cohort, period FROM competitor.stat_requests
  ORDER BY requested_at LIMIT %s FOR UPDATE SKIP LOCKED"""
DELETE_REQUEST_SQL = 'DELETE FROM competitor.stat_requests WHERE cohort = %s AND period = %s'
WRITE_PRIVILEGES = ('INSERT', 'UPDATE', 'DELETE')

# 罗盘 live-trade ranking (sales of the rooms a film drove traffic to). Optional: without the tables
# or SELECT on them every other statistic is still written, and the structures say sales are missing.
COMPASS_TABLES = ('competitor.compass_imports', 'competitor.compass_live_rooms_daily',
                  'competitor.compass_traffic_videos_daily')
COMPASS_WATERMARK_SQL = 'SELECT COUNT(*), MAX(imported_at) FROM competitor.compass_imports'
# 爆款拆解 text extractions (enrichment.py) of the current prompt; optional like the 罗盘 tables.
ENRICHMENT_SQL = """SELECT analysis_id::TEXT, enrichment_id::TEXT, result FROM competitor.film_enrichments
  WHERE status = 'succeeded' AND prompt_version = %s"""
ENRICHMENT_WATERMARK_SQL = """SELECT COUNT(*), MAX(finished_at) FROM competitor.film_enrichments
  WHERE status = 'succeeded' AND prompt_version = %s"""
# One row per film × room-day with a paid amount. A room-day counts once with one band (the 'all' scope
# first) whichever scope listed the film; a bottom band (<X) has no lower bound and counts from 0; text
# the importer could not parse (both bounds empty) carries no amount and is left out.
COMPASS_SQL = """WITH rooms AS (
    SELECT DISTINCT ON (data_date, live_room_id) data_date, live_room_id, pay_amount_min, pay_amount_max
    FROM competitor.compass_live_rooms_daily
    WHERE pay_amount_min IS NOT NULL OR pay_amount_max IS NOT NULL
    ORDER BY data_date, live_room_id, (list_scope = 'all') DESC, list_scope)
  SELECT DISTINCT t.aweme_id, r.data_date, r.live_room_id, COALESCE(r.pay_amount_min, 0) AS low, r.pay_amount_max AS high
  FROM rooms r
  JOIN competitor.compass_traffic_videos_daily t ON t.data_date = r.data_date AND t.live_room_id = r.live_room_id"""


def business_today():
    return dt.datetime.now(BUSINESS_TZ).date()


def watermark(conn, today):
    """Changes when a result is added or replaced, when a 罗盘 day is imported or replaced, when the
    statistics code or a version changes, and once a day as the windows roll."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), MAX(finished_at) FROM competitor.analyses WHERE status IN ('succeeded', 'partial')")
        count, latest = cur.fetchone()
        compass = '-'
        if compass_readable(conn):
            cur.execute(COMPASS_WATERMARK_SQL)
            imports, imported = cur.fetchone()
            compass = f"{imports}@{imported.isoformat() if imported else '-'}"
        enriched = '-'
        if enrichments_readable(conn):
            cur.execute(ENRICHMENT_WATERMARK_SQL, (enrichment.PROMPT_VERSION,))
            done, finished = cur.fetchone()
            enriched = f"{done}@{finished.isoformat() if finished else '-'}"
    versions = (f'{stats.STATS_VERSION}|{tx.TAXONOMY_VERSION}|{contract.NORMALIZATION_VERSION}|'
                f'{structure_ranks.STRUCTURE_VERSION}|{breakdown.BREAKDOWN_VERSION}')
    return (f"{versions}|{count}|{latest.isoformat() if latest else '-'}|{compass}|{enriched}|"
            f"{today.isoformat()}")


def compass_readable(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT ' + ' AND '.join(f"to_regclass('{table}') IS NOT NULL" for table in COMPASS_TABLES))
        if not cur.fetchone()[0]:
            return False
        cur.execute('SELECT ' + ', '.join(f"has_table_privilege('{table}', 'SELECT')" for table in COMPASS_TABLES))
        return all(cur.fetchone())


def load_compass(conn):
    """{film: [(date, room, low, high)]} of the 罗盘 ranking, or None when it cannot be read."""
    if not compass_readable(conn):
        return None
    found = {}
    with conn.cursor() as cur:
        cur.execute(COMPASS_SQL)
        for film, day, room, low, high in cur.fetchall():
            found.setdefault(film, []).append((day, room, float(low), None if high is None else float(high)))
    return found


def latest_watermark(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT source_watermark FROM competitor.stat_snapshots ORDER BY computed_at DESC LIMIT 1')
        row = cur.fetchone()
    return row[0] if row else None


def enrichments_readable(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('competitor.film_enrichments') IS NOT NULL")
        if not cur.fetchone()[0]:
            return False
        cur.execute("SELECT has_table_privilege('competitor.film_enrichments', 'SELECT')")
        return all(cur.fetchone())


def load_rows(conn):
    """Latest result per video, each with its finished text extraction (or None) attached."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(LOAD_SQL)
        rows = [dict(r) for r in cur.fetchall()]
    found = {}
    if enrichments_readable(conn):
        with conn.cursor() as cur:
            cur.execute(ENRICHMENT_SQL, (enrichment.PROMPT_VERSION,))
            found = {analysis: (enrichment_id, result) for analysis, enrichment_id, result in cur.fetchall() or []}
    for row in rows:
        row['enrichment_id'], row['enrichment'] = found.get(row['analysis_id'], (None, None))
    return rows


CARD_SHAPE = {'hook': dict, 'dimensions': dict, 'claims': list, 'segments': list, 'evidence': list, 'structure': dict}
STRUCTURE_SHAPE = {'path': list, 'coarse_nodes': list, 'unknown_intervals': list}


def to_record(row):
    """A stored analysis as the record shape stats.py works on; None when it cannot be counted.

    A partial card can miss whole parts (the host records the error and keeps it); stats.py reads
    those parts before any per-part blocking, so such a card is reported, never counted."""
    card = row.get('card')
    if not isinstance(card, dict) or any(not isinstance(card.get(k), t) for k, t in CARD_SHAPE.items()):
        return None
    if any(not isinstance(card['structure'].get(k), t) for k, t in STRUCTURE_SHAPE.items()):
        return None
    issues = [(e.get('severity'), e.get('path'), e.get('message')) for e in row.get('host_errors') or []]
    return {'film': row['aweme_id'], 'card': card, 'structure': card['structure'], 'issues': issues,
            'input_manifest': {'source_sha256': row.get('source_sha256')}, 'response_id': row['analysis_id'],
            'enrichment_id': row.get('enrichment_id'), 'enrichment': row.get('enrichment')}


def window_key(first, last):
    return f'{first.isoformat()}..{last.isoformat()}'


def window_bounds(period):
    """(first, last) dates of a calendar window key; ValueError for anything else."""
    match = WINDOW_KEY.match(period or '')
    if not match:
        raise ValueError(f'not a window key: {period!r}')
    first, last = (dt.date.fromisoformat(value) for value in match.groups())
    if first > last:
        raise ValueError(f'window ends before it starts: {period!r}')
    return first, last


def window_name(period):
    """How a report names its window: 全部时间, 2026/10/26, 2026 年 10 月, 2026 年 or a range."""
    if period == ALL_TIME:
        return '全部时间'
    if period in LEGACY_PERIODS:
        return f'近 {LEGACY_PERIODS[period]} 天'
    first, last = window_bounds(period)
    if first == last:
        return first.strftime('%Y/%m/%d')
    if (first.month, first.day, last.month, last.day) == (1, 1, 12, 31) and first.year == last.year:
        return f'{first.year} 年'
    if first.day == 1 and _month_end(first) == last:
        return f'{first.year} 年 {first.month} 月'
    return f"{first.strftime('%Y/%m/%d')} - {last.strftime('%Y/%m/%d')}"


def _month_end(day):
    return (day.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)


def _seen_date(row):
    return row['first_seen_at'].astimezone(BUSINESS_TZ).date()


def window_dates(period, today):
    """(first, last) dates a window covers, or None for all time."""
    if period == ALL_TIME:
        return None
    if period in LEGACY_PERIODS:
        return today - dt.timedelta(days=LEGACY_PERIODS[period] - 1), today
    return window_bounds(period)


def _in_window(row, period, today):
    if period == ALL_TIME:
        return True
    seen = _seen_date(row)
    if period in LEGACY_PERIODS:
        return seen >= today - dt.timedelta(days=LEGACY_PERIODS[period] - 1)
    first, last = window_bounds(period)
    return first <= seen <= last


def calendar_windows(rows, cohort, today):
    """`all`, plus every month and year a film of the cohort was first seen in, and every such day
    of the last PRECOMPUTED_DAYS (older days are computed on request)."""
    windows = {ALL_TIME}
    recent = today - dt.timedelta(days=PRECOMPUTED_DAYS - 1)
    for row in rows:
        if cohort != 'all' and _category(row) != cohort:
            continue
        seen = _seen_date(row)
        month = seen.replace(day=1)
        windows.add(window_key(month, _month_end(month)))
        windows.add(window_key(dt.date(seen.year, 1, 1), dt.date(seen.year, 12, 31)))
        if seen >= recent:
            windows.add(window_key(seen, seen))
    return windows


def _category(row):
    card = row.get('card')
    product = card.get('product') if isinstance(card, dict) else None
    return product.get('category') if isinstance(product, dict) else None


def text_labels(records, dimension):
    """Films per normalised free-text label, over the films whose dimension is assessable."""
    text_key, kind_key = TEXT_DIMENSIONS[dimension]
    def part(record):
        value = (record['card'].get('dimensions') or {}).get(dimension)
        return value if isinstance(value, dict) else {}

    assessable = [r for r in records if part(r).get('assessment') == 'assessable' and stats.usable(r, dimension)]
    groups = {}
    for record in assessable:
        seen = set()
        for label in part(record).get('labels') or []:
            raw = (label.get(text_key) or '').strip()
            key = ''.join(raw.lower().split())
            if not key:
                continue
            group = groups.setdefault(key, {'text': raw, 'films': [], 'kinds': Counter()})
            group['kinds'][label.get(kind_key) or 'unknown'] += 1
            if key not in seen:
                seen.add(key)
                group['films'].append(record['film'])
    items = sorted(groups.values(), key=lambda g: (-len(g['films']), g['text']))[:TEXT_LIMIT]
    return {'denominator': len(assessable), 'labels': [
        {'text': g['text'], 'films': len(g['films']), 'kinds': dict(g['kinds']),
         'example_films': g['films'][:EXAMPLE_LIMIT]} for g in items]}


def scope(rows, cohort, period, today):
    """Rows in a cohort (card category, or `all`) and window key."""
    return [r for r in rows if _in_window(r, period, today) and (cohort == 'all' or _category(r) == cohort)]


def counted_records(scoped):
    """Records of the current taxonomy, with the other versions and unreadable cards counted aside."""
    records, other_versions, unreadable = [], Counter(), 0
    for row in scoped:
        if row['taxonomy_version'] != tx.TAXONOMY_VERSION:
            other_versions[row['taxonomy_version']] += 1
            continue
        record = to_record(row)
        if record is None:
            unreadable += 1
        else:
            records.append(record)
    return records, other_versions, unreadable


def build(rows, cohort, period, today, compass=None):
    """One snapshot row (without the watermark) for a cohort and window key; `compass` as from
    load_compass (None: no sales in the structure ranking)."""
    scoped = scope(rows, cohort, period, today)
    records, other_versions, unreadable = counted_records(scoped)
    statuses = Counter(r['status'] for r in scoped if r['taxonomy_version'] == tx.TAXONOMY_VERSION)
    family = stats.opening_families(records)
    families = len(set(family.values()))
    films = {r['aweme_id']: {'analysisId': r['analysis_id'], 'title': r.get('title')}
             for r in scoped if r['taxonomy_version'] == tx.TAXONOMY_VERSION}
    payload = {
        'sample': {'films': len(records), 'families': families, 'statuses': dict(statuses),
                   'otherVersions': dict(other_versions), 'unreadable': unreadable},
        'rows': [{field: row[field] for field in ROW_FIELDS}
                 for row in stats.compute(records, cohort, period, family=family)],
        'dimensions': stats.dimension_summary(records, family=family),
        'roleTime': stats.role_time_share(records),
        'text': {dimension: text_labels(records, dimension) for dimension in TEXT_DIMENSIONS},
        'structures': structure_ranks.ranking(records, family, compass, window_dates(period, today)),
        'breakdown': breakdown.breakdown(records, family, compass, window_dates(period, today)),
        'films': films,
        'labels': tx.display_labels(),
    }
    return {'cohort': cohort, 'period': period, 'stats_version': stats.STATS_VERSION,
            'taxonomy_version': tx.TAXONOMY_VERSION, 'normalization_version': contract.NORMALIZATION_VERSION,
            'input_snapshot': stats.input_snapshot(records), 'films': len(records), 'families': families,
            'payload': payload}


def cohorts(rows, existing=()):
    """`all`, the default category, every category the counted cards name, and every cohort that
    already has snapshots (rewritten empty once its films are gone, so it never goes stale)."""
    found = {_category(r) for r in rows if r['taxonomy_version'] == tx.TAXONOMY_VERSION}
    return sorted({'all', DEFAULT_COHORT} | {c for c in found if c in tx.PRODUCT_CATEGORIES} | set(existing))


def existing_cohorts(conn):
    with conn.cursor() as cur:
        cur.execute('SELECT DISTINCT cohort FROM competitor.stat_snapshots')
        return [row[0] for row in cur.fetchall()]


def recent_windows(conn):
    """{cohort: window keys} computed in the last 30 days: custom windows still being read, and
    windows whose films are gone (rewritten empty, so they never go stale)."""
    found = {}
    with conn.cursor() as cur:
        cur.execute(RECENT_WINDOWS_SQL)
        for cohort, period in cur.fetchall():
            found.setdefault(cohort, set()).add(period)
    return found


def _write(cur, rows, cohort, period, today, mark, compass):
    snapshot = build(rows, cohort, period, today, compass)
    cur.execute(UPSERT_SQL, {**snapshot, 'source_watermark': mark, 'payload': Json(snapshot['payload'])})


def refresh(conn, force=False, today=None):
    """Recomputes every cohort × window when the watermark moved; returns the rows written."""
    today = today or business_today()
    mark = watermark(conn, today)
    if not force and latest_watermark(conn) == mark:
        conn.commit()
        return 0
    rows, compass = load_rows(conn), load_compass(conn)
    recent = recent_windows(conn)
    written = 0
    with conn.cursor() as cur:
        for cohort in cohorts(rows, existing_cohorts(conn)):
            for period in sorted(calendar_windows(rows, cohort, today) | recent.get(cohort, set())):
                _write(cur, rows, cohort, period, today, mark, compass)
                written += 1
        cur.execute(PRUNE_SQL)
    conn.commit()
    return written


def process_requests(conn, today=None):
    """Computes windows the page asked for and drops their requests; returns the rows written."""
    today = today or business_today()
    with conn.cursor() as cur:
        cur.execute(CLAIM_REQUESTS_SQL, (REQUEST_BATCH,))
        requests = list(cur.fetchall())
        if not requests:
            conn.commit()
            return 0
        rows, compass, mark = load_rows(conn), load_compass(conn), watermark(conn, today)
        for cohort, period in requests:
            try:
                window_bounds(period)
            except ValueError:
                pass  # the table CHECK makes this unreachable; a bad key is dropped, never computed
            else:
                _write(cur, rows, cohort, period, today, mark, compass)
            cur.execute(DELETE_REQUEST_SQL, (cohort, period))
    conn.commit()
    return len(requests)


_state = {'next_check': 0.0, 'allowed': None}


def due(now=None):
    """At most one refresh check per interval per process."""
    now = time.monotonic() if now is None else now
    if _state['allowed'] is False or now < _state['next_check']:
        return False
    _state['next_check'] = now + CHECK_INTERVAL_SECONDS
    return True


def disallowed():
    """True once this process found its role cannot write snapshots (the GPU node)."""
    return _state['allowed'] is False


def _writable(conn):
    """True once the tables exist and this role may write snapshots; a missing table (migration not
    applied yet) is checked again next time, a missing privilege is remembered for the process."""
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('competitor.stat_snapshots') IS NOT NULL "
                    "AND to_regclass('competitor.stat_requests') IS NOT NULL")
        if not cur.fetchone()[0]:
            conn.commit()
            return False
        if _state['allowed'] is None:
            cur.execute('SELECT ' + ', '.join(f"has_table_privilege('competitor.stat_snapshots', '{p}')"
                                              for p in WRITE_PRIVILEGES)
                        + ", has_table_privilege('competitor.stat_requests', 'DELETE')")
            _state['allowed'] = all(cur.fetchone())
            if not _state['allowed']:
                print('[competitor-snapshots] role cannot write snapshots; refresh left to another worker',
                      flush=True)
    if not _state['allowed']:
        conn.commit()
    return bool(_state['allowed'])


def maybe_refresh(conn):
    """Refresh for the idle worker: skips roles that cannot write and never raises."""
    try:
        if not _writable(conn):
            return None
        written = refresh(conn)
        if written:
            print(f'[competitor-snapshots] refreshed {written} snapshots', flush=True)
        return written
    except Exception as error:  # noqa: BLE001 - statistics must never stop the analysis queue
        conn.rollback()
        print(f'[competitor-snapshots] refresh failed: {type(error).__name__}: {str(error)[:300]}', flush=True)
        return None


def maybe_process_requests(conn):
    """Requested windows for the idle worker (every tick): same role rule as refresh, never raises."""
    try:
        if not _writable(conn):
            return None
        done = process_requests(conn)
        if done:
            print(f'[competitor-snapshots] computed {done} requested windows', flush=True)
        return done
    except Exception as error:  # noqa: BLE001 - statistics must never stop the analysis queue
        conn.rollback()
        print(f'[competitor-snapshots] requests failed: {type(error).__name__}: {str(error)[:300]}', flush=True)
        return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true', help='recompute snapshots when the data changed')
    parser.add_argument('--force', action='store_true', help='recompute even if the watermark is unchanged')
    args = parser.parse_args(argv)
    if not args.refresh:
        parser.print_help()
        return 2
    from marketing_content_assets.repository import connect_pg
    with connect_pg() as conn:
        written = refresh(conn, force=args.force)
    print(f'[competitor-snapshots] wrote {written} snapshots', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
