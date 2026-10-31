"""视频云管家 → AI 创作中心「团队产出」: the company's 成片 by 剪辑 (author) and 编导 (person label), their
daily 抖音 spend and direct GMV (design: .trellis/tasks/10-29-studio-team-output/design.md).

Runs on the desktop after cloud_video_sync, under the same api_lock. Each run:

1. snapshots the user list (team / group of every account, disabled ones included) for today;
2. refreshes the 「拍摄人/编导」 person labels and maps each to the one account of the same name;
3. re-reads the 成片 uploaded in each of the last UPLOAD_DAYS days (state, labels, cumulative spend);
4. for each day without complete spend, plus the latest RESYNC_DAYS, lists the videos that spent that day
   (date branch, start = end = the day: 抖音 spend, i.e. 巨量千川 + 新版巨量广告) and asks the relation
   endpoint, 100 videos a call, for the day's records. Spend, direct GMV, coupons and subsidies count only
   巨量千川 records (QIANCHUAN_TYPE), so ROI divides like by like; the date-branch spend is kept beside
   them to reconcile. Other platforms' spend (新版巨量广告, 百度, 快手) is kept apart and never enters ROI;
   a video that spent only on 百度 is not in the date branch, so that sum is a lower bound.

A weekly recheck (`--recheck-days 35`) re-reads every spend day of that window, complete or not, to catch
late corrections the daily 3-day re-read misses, and appends what changed per day to a JSON-lines log
(`--recheck-log`) so the vendor's real correction window can be measured.

Pages and relation batches run up to MAX_CONCURRENCY at a time within the client's rate limit. A day is
complete only when every page and batch was read and the vendor's total did not move; otherwise it is
recorded incomplete or failed and read again next run. Amounts stay the vendor's raw values.

    python -m content_production.cloud_video_team_sync --once [--dry-run [--day YYYY-MM-DD]]
                                                              [--backfill-from YYYY-MM-DD [--until YYYY-MM-DD]]
                                                              [--recheck-days N [--recheck-log PATH]]
"""
import argparse
import datetime as dt
import http.client
import json
import os
import sys

from psycopg2.extras import execute_batch

from .cloud_video_client import RATE_LIMITED, CloudVideoClient, CloudVideoError, api_lock
from .cloud_video_sync import BATCH, _time, business_today

# A day whose reads still fail after the client's retries: a vendor error, or a dropped connection
# (the desktop's proxy occasionally cuts TLS). The day is recorded failed and read again next run.
DAY_ERRORS = (CloudVideoError, OSError, http.client.HTTPException)

DIRECTOR_GROUP_ID = 11535  # 「拍摄人/编导」
UPLOAD_DAYS = 30
SPEND_DAYS = 30
RESYNC_DAYS = 3
RECHECK_DAYS = 35
DEFAULT_RECHECK_LOG = '~/aios-worker/work/team-output-rechecks.jsonl'
RELATION_BATCH = 100
# The relation endpoint's `type`: 0 新版巨量广告, 1 巨量广告, 2 巨量千川, 4/5/17 快手, 6 腾讯, 9 TikTok, 10 百度.
QIANCHUAN_TYPE = 2
ACCOUNT_PAGE = 100

SNAPSHOT_SQL = """INSERT INTO cloud_video.account_snapshots (snapshot_date, account_key, name, employee_id, role_name,
  team_id, team_name, group_id, group_name, state)
  VALUES (%(snapshot_date)s, %(account_key)s, %(name)s, %(employee_id)s, %(role_name)s, %(team_id)s, %(team_name)s,
          %(group_id)s, %(group_name)s, %(state)s)
  ON CONFLICT (snapshot_date, account_key) DO UPDATE SET name = EXCLUDED.name, employee_id = EXCLUDED.employee_id,
    role_name = EXCLUDED.role_name, team_id = EXCLUDED.team_id, team_name = EXCLUDED.team_name,
    group_id = EXCLUDED.group_id, group_name = EXCLUDED.group_name, state = EXCLUDED.state, synced_at = NOW()"""
# A manual mapping is kept; an automatic one follows the current unique name match.
LABEL_SQL = """INSERT INTO cloud_video.director_labels (label_id, name, state, account_key, mapping_source)
  VALUES (%(label_id)s, %(name)s, %(state)s, %(account_key)s, %(mapping_source)s)
  ON CONFLICT (label_id) DO UPDATE SET name = EXCLUDED.name, state = EXCLUDED.state,
    account_key = CASE WHEN cloud_video.director_labels.mapping_source = 'manual'
                       THEN cloud_video.director_labels.account_key ELSE EXCLUDED.account_key END,
    mapping_source = CASE WHEN cloud_video.director_labels.mapping_source = 'manual'
                          THEN 'manual' ELSE EXCLUDED.mapping_source END,
    synced_at = NOW()"""
_VIDEO_COLUMNS = """video_id, name, account_key, account_name, one_level_type_id, one_level_type_name, two_level_type_id,
  two_level_type_name, video_state_id, video_state_name, uploaded_at, recycled_at, director_label_ids"""
_VIDEO_VALUES = """%(video_id)s, %(name)s, %(account_key)s, %(account_name)s, %(one_level_type_id)s, %(one_level_type_name)s,
  %(two_level_type_id)s, %(two_level_type_name)s, %(video_state_id)s, %(video_state_name)s, %(uploaded_at)s,
  %(recycled_at)s, %(director_label_ids)s"""
_VIDEO_UPDATE = """name = EXCLUDED.name, account_key = EXCLUDED.account_key, account_name = EXCLUDED.account_name,
  one_level_type_id = EXCLUDED.one_level_type_id, one_level_type_name = EXCLUDED.one_level_type_name,
  two_level_type_id = EXCLUDED.two_level_type_id, two_level_type_name = EXCLUDED.two_level_type_name,
  video_state_id = EXCLUDED.video_state_id, video_state_name = EXCLUDED.video_state_name,
  uploaded_at = EXCLUDED.uploaded_at, recycled_at = EXCLUDED.recycled_at,
  director_label_ids = EXCLUDED.director_label_ids, synced_at = NOW()"""
# The upload list carries the cumulative spend; in the date branch the same field is the day's spend.
VIDEO_SQL = f"""INSERT INTO cloud_video.finished_videos ({_VIDEO_COLUMNS}, total_stat_cost, total_stat_cost_at)
  VALUES ({_VIDEO_VALUES}, %(total_stat_cost)s, NOW())
  ON CONFLICT (video_id) DO UPDATE SET {_VIDEO_UPDATE},
    total_stat_cost = EXCLUDED.total_stat_cost, total_stat_cost_at = NOW()"""
VIDEO_META_SQL = f"""INSERT INTO cloud_video.finished_videos ({_VIDEO_COLUMNS})
  VALUES ({_VIDEO_VALUES})
  ON CONFLICT (video_id) DO UPDATE SET {_VIDEO_UPDATE}"""
# A re-read day zeroes the rows it no longer lists; the desktop role may update but not delete.
ZERO_SQL = """UPDATE cloud_video.finished_spend_daily
  SET spend = 0, list_spend = 0, pay_order_amount = 0, pay_order_coupon_amount = 0, platform_subsidy_amount = 0,
      other_platform_spend = 0, relation_count = 0, synced_at = NOW()
  WHERE stat_date = %s AND NOT (video_id = ANY(%s))
    AND (spend > 0 OR list_spend > 0 OR pay_order_amount > 0 OR other_platform_spend > 0)"""
SPEND_SQL = """INSERT INTO cloud_video.finished_spend_daily (video_id, stat_date, spend, pay_order_amount,
  pay_order_coupon_amount, platform_subsidy_amount, other_platform_spend, list_spend, relation_count)
  VALUES (%(video_id)s, %(stat_date)s, %(spend)s, %(pay_order_amount)s, %(pay_order_coupon_amount)s,
          %(platform_subsidy_amount)s, %(other_platform_spend)s, %(list_spend)s, %(relation_count)s)
  ON CONFLICT (video_id, stat_date) DO UPDATE SET spend = EXCLUDED.spend, pay_order_amount = EXCLUDED.pay_order_amount,
    pay_order_coupon_amount = EXCLUDED.pay_order_coupon_amount, platform_subsidy_amount = EXCLUDED.platform_subsidy_amount,
    other_platform_spend = EXCLUDED.other_platform_spend, list_spend = EXCLUDED.list_spend,
    relation_count = EXCLUDED.relation_count, synced_at = NOW()"""
DAY_SQL = """INSERT INTO cloud_video.team_sync_days (kind, stat_date, status, expected_total, rows_written, spend_gap, error)
  VALUES (%s, %s, %s, %s, %s, %s, %s)
  ON CONFLICT (kind, stat_date) DO UPDATE SET status = EXCLUDED.status, expected_total = EXCLUDED.expected_total,
    rows_written = EXCLUDED.rows_written, spend_gap = EXCLUDED.spend_gap, error = EXCLUDED.error, synced_at = NOW()"""
# A day's stored spend and GMV per video, to tell what a re-read changed.
DAY_VALUES_SQL = """SELECT video_id, spend::FLOAT8, COALESCE(pay_order_amount, 0)::FLOAT8
  FROM cloud_video.finished_spend_daily WHERE stat_date = %s AND (spend > 0 OR pay_order_amount > 0)"""
COMPLETE_SQL = """SELECT stat_date FROM cloud_video.team_sync_days
  WHERE kind = 'spend' AND status = 'complete' AND stat_date BETWEEN %s AND %s"""


def _money(value):
    return round(float(value or 0), 2)


def _id(value):
    return int(value) if value not in (None, '') else None


def _days(first, last):
    return [first + dt.timedelta(days=k) for k in range((last - first).days + 1)]


# --- dictionaries -------------------------------------------------------------------------------------

def fetch_accounts(client):
    """Every account of the company, disabled ones included."""
    rows, page = [], 1
    while True:
        data = client.call('/openapi/account/list', {'pageNo': page, 'pageSize': ACCOUNT_PAGE}, account=False) or {}
        batch = data.get('list') or []
        rows.extend(batch)
        if len(batch) < ACCOUNT_PAGE:
            return rows
        page += 1


def snapshot_rows(accounts, day):
    return [{'snapshot_date': day, 'account_key': a['accountKey'], 'name': a.get('name') or '',
             'employee_id': a.get('employeeId') or None, 'role_name': a.get('roleName'), 'team_id': _id(a.get('teamId')),
             'team_name': a.get('teamName'), 'group_id': _id(a.get('groupId')), 'group_name': a.get('groupName'),
             'state': _id(a.get('state'))}
            for a in accounts if a.get('accountKey')]


def _walk(nodes):
    for node in nodes or []:
        yield node
        yield from _walk(node.get('children'))


def fetch_director_labels(client):
    tree = client.call('/openapi/video/label/list', {'videoType': 0})
    nodes = tree if isinstance(tree, list) else (tree or {}).get('list') or []
    return [n for n in _walk(nodes) if n.get('parentLabelId') == DIRECTOR_GROUP_ID]


def label_rows(labels, accounts):
    """Each person label with the account of the same name when exactly one account has it."""
    by_name = {}
    for account in accounts:
        by_name.setdefault((account.get('name') or '').strip(), []).append(account['accountKey'])
    rows = []
    for label in labels:
        keys = by_name.get((label.get('name') or '').strip(), [])
        key = keys[0] if len(keys) == 1 else None
        rows.append({'label_id': int(label['id']), 'name': label.get('name') or '', 'state': _id(label.get('state')),
                     'account_key': key, 'mapping_source': 'name_match' if key else None})
    return rows


# --- videos -------------------------------------------------------------------------------------------

def video_row(row, director_ids, *, cumulative=True):
    one, two, state = row.get('oneLevelVideoType') or {}, row.get('twoLevelVideoType') or {}, row.get('videoState') or {}
    record = {
        'video_id': int(row['videoId']), 'name': row.get('name') or '', 'account_key': row.get('accountKey') or None,
        'account_name': row.get('accountName'), 'one_level_type_id': _id(one.get('id')), 'one_level_type_name': one.get('name'),
        'two_level_type_id': _id(two.get('id')), 'two_level_type_name': two.get('name'),
        'video_state_id': _id(state.get('id')), 'video_state_name': state.get('name'),
        'uploaded_at': _time(row.get('createTime')), 'recycled_at': _time(row.get('recycleTime')),
        'director_label_ids': sorted({int(label['id']) for label in row.get('videoLabels') or []
                                      if label.get('id') is not None
                                      and (label.get('parentLabelId') == DIRECTOR_GROUP_ID or int(label['id']) in director_ids)}),
    }
    if cumulative:
        record['total_stat_cost'] = _money(row.get('totalStatCost'))
    return record


def _finished(rows):
    """成片 rows with an upload time, one per video (the date branch ignores some filters)."""
    by_id = {}
    for row in rows:
        if int(row.get('videoType') or 0) == 0 and row.get('videoId') is not None and _time(row.get('createTime')):
            by_id[int(row['videoId'])] = row
    return by_id


def fetch_uploads(client, day):
    """(成片 uploaded on `day` by id, complete?)."""
    rows, totals = client.video_pages({'isInner': 0, 'videoType': 0, 'orderByType': 1,
                                       'uploadStartTime': day.isoformat(), 'uploadEndTime': day.isoformat()})
    by_id = _finished(rows)
    return by_id, len(totals) <= 1 and len(rows) == len(by_id) == (max(totals) if totals else 0), max(totals or {0})


def fetch_day_spend(client, day):
    """(成片 that spent on `day` by id, their date-branch spend, complete?, vendor total)."""
    rows, totals = client.video_pages({'isInner': 0, 'videoType': 0, 'orderByType': 9,
                                       'dyStatCostStartTime': day.isoformat(), 'dyStatCostEndTime': day.isoformat()})
    by_id = _finished(rows)
    spend = {video_id: _money(row.get('totalStatCost')) for video_id, row in by_id.items()
             if _money(row.get('totalStatCost')) > 0}
    return by_id, spend, len(totals) <= 1 and len(rows) == (max(totals) if totals else 0), max(totals or {0})


def fetch_relations(client, video_ids, day):
    """{video id: (千川 spend, 千川 GMV, coupon, subsidy, 千川 record count, other platforms' spend)} from the
    relation endpoint for `day`."""
    batches = [video_ids[k:k + RELATION_BATCH] for k in range(0, len(video_ids), RELATION_BATCH)]

    def one(batch):
        return client.call('/openapi/video/relation/third/material/list',
                           {'videoIds': ','.join(map(str, batch)), 'startTime': day.isoformat(), 'endTime': day.isoformat()})
    sums = {}
    for data in client.each(one, batches):
        groups = data if isinstance(data, list) else (data or {}).get('list') or []
        for group in groups:
            if group.get('videoId') is None:
                continue
            records = group.get('relationList') or []
            qianchuan = [r for r in records if _id(r.get('type')) == QIANCHUAN_TYPE]
            sums[int(group['videoId'])] = (
                _money(sum(float(r.get('statCost') or 0) for r in qianchuan)),
                _money(sum(float(r.get('payOrderAmount') or 0) for r in qianchuan)),
                _money(sum(float(r.get('payOrderCouponAmount') or 0) for r in qianchuan)),
                _money(sum(float(r.get('ecomPlatformSubsidyAmount') or 0) for r in qianchuan)),
                len(qianchuan),
                _money(sum(float(r.get('statCost') or 0) for r in records if _id(r.get('type')) != QIANCHUAN_TYPE)))
    return sums


def spend_rows(day, list_spend, relations):
    """One row per video that spent: its 千川 relation sums when the endpoint returned the video, else the
    date-branch spend with GMV unknown (NULL)."""
    rows = []
    for video_id, listed in list_spend.items():
        found = relations.get(video_id)
        spend, gmv, coupon, subsidy, count, other = found if found else (listed, None, None, None, 0, 0.0)
        rows.append({'video_id': video_id, 'stat_date': day, 'spend': spend, 'pay_order_amount': gmv,
                     'pay_order_coupon_amount': coupon, 'platform_subsidy_amount': subsidy,
                     'other_platform_spend': other, 'list_spend': listed, 'relation_count': count})
    return rows


# --- sync ---------------------------------------------------------------------------------------------

def spend_days_to_sync(conn, today, backfill_from=None, backfill_until=None):
    """Complete days from `backfill_from` (default the last SPEND_DAYS) through `backfill_until` (default
    yesterday) not yet complete, plus the latest RESYNC_DAYS inside that range, whose spend the vendor may
    still be completing; oldest first."""
    latest = min(backfill_until, today - dt.timedelta(days=1)) if backfill_until else today - dt.timedelta(days=1)
    first = backfill_from or today - dt.timedelta(days=SPEND_DAYS)
    with conn.cursor() as cur:
        cur.execute(COMPLETE_SQL, (first, latest))
        complete = {row[0] for row in cur.fetchall()}
    conn.commit()
    yesterday = today - dt.timedelta(days=1)
    recent = set(_days(yesterday - dt.timedelta(days=RESYNC_DAYS - 1), yesterday))
    return [day for day in _days(first, latest) if day not in complete or day in recent]


def _record_day(conn, kind, day, status, expected, written, gap=None, error=None):
    with conn.cursor() as cur:
        cur.execute(DAY_SQL, (kind, day, status, expected, written, gap, error))
    conn.commit()


def sync_dictionaries(conn, client, today):
    accounts = fetch_accounts(client)
    labels = label_rows(fetch_director_labels(client), accounts)
    with conn.cursor() as cur:
        execute_batch(cur, SNAPSHOT_SQL, snapshot_rows(accounts, today), page_size=BATCH)
        execute_batch(cur, LABEL_SQL, labels, page_size=BATCH)
    conn.commit()
    return {int(label['label_id']) for label in labels}, {'accounts': len(accounts), 'director_labels': len(labels),
                                                          'labels_unmapped': sum(1 for l in labels if not l['account_key'])}


def sync_uploads(conn, client, days, director_ids):
    written = incomplete = 0
    for day in days:
        try:
            by_id, complete, expected = fetch_uploads(client, day)
        except DAY_ERRORS as error:
            _record_day(conn, 'uploads', day, 'failed', None, 0, error=str(error)[:500])
            incomplete += 1
            if getattr(error, 'code', None) == RATE_LIMITED:
                break
            continue
        with conn.cursor() as cur:
            execute_batch(cur, VIDEO_SQL, [video_row(row, director_ids) for row in by_id.values()], page_size=BATCH)
        conn.commit()
        _record_day(conn, 'uploads', day, 'complete' if complete else 'incomplete', expected, len(by_id))
        written += len(by_id)
        incomplete += not complete
    return {'upload_days': len(days), 'upload_rows': written, 'upload_days_incomplete': incomplete}


def _day_values(conn, day):
    with conn.cursor() as cur:
        cur.execute(DAY_VALUES_SQL, (day,))
        values = {row[0]: (row[1], row[2]) for row in cur.fetchall()}
    conn.commit()
    return values


def revision(day, before, after):
    """What a re-read changed on `day`: totals before and after and how many videos moved; None if nothing."""
    changed = sum(1 for video_id in before.keys() & after.keys()
                  if abs(before[video_id][0] - after[video_id][0]) >= 0.01
                  or abs(before[video_id][1] - after[video_id][1]) >= 0.01)
    added, dropped = len(after.keys() - before.keys()), len(before.keys() - after.keys())
    if not (changed or added or dropped):
        return None
    total = lambda values, k: _money(sum(v[k] for v in values.values()))  # noqa: E731
    return {'day': str(day), 'spend_before': total(before, 0), 'spend_after': total(after, 0),
            'gmv_before': total(before, 1), 'gmv_after': total(after, 1),
            'videos_changed': changed, 'videos_added': added, 'videos_dropped': dropped}


def sync_spend(conn, client, days, director_ids, track=False):
    """Reads each day's spend; with `track`, also returns per-day revisions of what was stored before."""
    written, gaps, problems, revisions = 0, [], [], []
    for day in days:
        before = _day_values(conn, day) if track else None
        try:
            by_id, list_spend, complete, expected = fetch_day_spend(client, day)
            relations = fetch_relations(client, sorted(list_spend), day)
        except DAY_ERRORS as error:
            _record_day(conn, 'spend', day, 'failed', None, 0, error=str(error)[:500])
            problems.append(str(day))
            if getattr(error, 'code', None) == RATE_LIMITED:
                break  # still limited after the retries: stop this run, the next one reads the rest
            continue
        rows = spend_rows(day, list_spend, relations)
        gap = _money(sum(r['spend'] for r in rows) - sum(list_spend.values()))
        missing = sum(1 for r in rows if r['pay_order_amount'] is None)
        with conn.cursor() as cur:
            execute_batch(cur, VIDEO_META_SQL, [video_row(by_id[r['video_id']], director_ids, cumulative=False) for r in rows],
                          page_size=BATCH)
            cur.execute(ZERO_SQL, (day, [r['video_id'] for r in rows]))
            execute_batch(cur, SPEND_SQL, rows, page_size=BATCH)
        conn.commit()
        _record_day(conn, 'spend', day, 'complete' if complete else 'incomplete', expected, len(rows), gap,
                    f'{missing} 条视频关联接口未返回，成交未知' if missing else None)
        written += len(rows)
        gaps.append(gap)
        if not complete:
            problems.append(str(day))
        if track:
            changed = revision(day, before, _day_values(conn, day))
            if changed:
                revisions.append(changed)
    result = {'spend_days': len(days), 'spend_rows': written, 'spend_gap': _money(sum(gaps)), 'spend_days_not_complete': problems}
    if track:
        result['revisions'] = revisions
    return result


def sync(conn, client, *, today, backfill_from=None, backfill_until=None):
    """`backfill_until` bounds a historical backfill (both kinds), so filling an old month does not re-read
    every later day's uploads."""
    if backfill_until and not backfill_from:
        raise ValueError('--until needs --backfill-from')
    if backfill_from and backfill_until and backfill_until < backfill_from:
        raise ValueError('--until is before --backfill-from')
    director_ids, result = sync_dictionaries(conn, client, today)
    yesterday = today - dt.timedelta(days=1)
    upload_first = backfill_from or today - dt.timedelta(days=UPLOAD_DAYS)
    upload_last = min(backfill_until, yesterday) if backfill_until else yesterday
    result.update(sync_uploads(conn, client, _days(upload_first, upload_last), director_ids))
    result.update(sync_spend(conn, client, spend_days_to_sync(conn, today, backfill_from, backfill_until), director_ids))
    return result


def recheck(conn, client, *, today, days=RECHECK_DAYS):
    """Re-reads the spend of the last `days` complete days, whatever their status, and reports what changed."""
    if not 1 <= days <= 400:
        raise ValueError('--recheck-days must be between 1 and 400')
    director_ids, result = sync_dictionaries(conn, client, today)
    yesterday = today - dt.timedelta(days=1)
    result.update(sync_spend(conn, client, _days(yesterday - dt.timedelta(days=days - 1), yesterday), director_ids, track=True))
    return result


def append_revisions(path, revisions, checked_at):
    """One JSON line per changed day, so weeks of rechecks show how far back the vendor corrects."""
    path = os.path.expanduser(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'a', encoding='utf-8') as handle:
        for item in revisions:
            handle.write(json.dumps({'checked_at': checked_at, **item}, ensure_ascii=False) + '\n')


def dry_run(client, day):
    """Reads one day without writing: upload and spend counts, GMV and the reconciliation gap."""
    uploads, uploads_complete, uploads_total = fetch_uploads(client, day)
    _by_id, list_spend, spend_complete, spend_total = fetch_day_spend(client, day)
    relations = fetch_relations(client, sorted(list_spend), day)
    rows = spend_rows(day, list_spend, relations)
    spend = sum(r['spend'] for r in rows)
    gmv = sum(r['pay_order_amount'] or 0 for r in rows)
    return {'day': str(day), 'uploads': len(uploads), 'uploads_total': uploads_total, 'uploads_complete': uploads_complete,
            'spend_videos': len(rows), 'spend_total': spend_total, 'spend_complete': spend_complete,
            'spend': _money(spend), 'list_spend': _money(sum(list_spend.values())), 'gmv': _money(gmv),
            'roi': round(gmv / spend, 3) if spend else None,
            'other_platform_spend': _money(sum(r['other_platform_spend'] for r in rows)),
            'gmv_unknown': sum(1 for r in rows if r['pay_order_amount'] is None)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--once', action='store_true', required=True)
    parser.add_argument('--dry-run', action='store_true', help='read one day (--day, default yesterday); write nothing')
    parser.add_argument('--day', type=dt.date.fromisoformat)
    parser.add_argument('--backfill-from', type=dt.date.fromisoformat, help='first upload and spend day to read')
    parser.add_argument('--until', type=dt.date.fromisoformat, help='last day of a --backfill-from range (default yesterday)')
    parser.add_argument('--recheck-days', type=int, help=f're-read the spend of the last N days (weekly: {RECHECK_DAYS})')
    parser.add_argument('--recheck-log', default=DEFAULT_RECHECK_LOG, help='JSON-lines log of what a recheck changed')
    args = parser.parse_args(argv)
    if args.recheck_days is not None and (args.dry_run or args.backfill_from or args.until):
        parser.error('--recheck-days cannot be combined with --dry-run, --backfill-from or --until')
    today = business_today()
    client = CloudVideoClient.from_env()
    with api_lock():  # one 视频云管家 caller per host at a time (see cloud_video_client)
        if args.dry_run:
            result = dry_run(client, args.day or today - dt.timedelta(days=1))
        else:
            from marketing_content_assets.repository import connect_pg
            with connect_pg() as conn:
                if args.recheck_days is not None:
                    result = recheck(conn, client, today=today, days=args.recheck_days)
                    append_revisions(args.recheck_log, result['revisions'], dt.datetime.now(dt.timezone.utc).isoformat())
                else:
                    result = sync(conn, client, today=today, backfill_from=args.backfill_from, backfill_until=args.until)
    print(json.dumps(result, ensure_ascii=False, default=str), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
