"""视频云管家 → cloud_video.spend_by_day: each video's spend per Beijing day, for sums over any date range.

The near-30-day snapshots (spend_daily) cannot be added up over a chosen range, so the daily sync also
asks the list for single days (dyStatCostStartTime = dyStatCostEndTime = the day, sorted by spend) and
reads it down to the first video without spend: ~5 requests a day for 香粉 (2026-10-28: 415 videos).
A day counts as synced (cloud_video.spend_days) only once its last page was read. Every run fills the
missing days of the last BACKFILL_DAYS and re-reads the latest RESYNC_DAYS, whose spend the vendor may
still be completing.
"""
import datetime as dt

from psycopg2.extras import execute_batch

from .cloud_video_sync import BATCH, in_type

BACKFILL_DAYS = 30
RESYNC_DAYS = 2

SYNCED_SQL = """SELECT stat_date FROM cloud_video.spend_days
  WHERE one_level_type_id = %s AND stat_date BETWEEN %s AND %s"""
# A re-read day zeroes the rows it no longer lists; the desktop role may update but not delete.
ZERO_SQL = """UPDATE cloud_video.spend_by_day SET spend = 0, synced_at = NOW()
  WHERE stat_date = %s AND one_level_type_id = %s AND spend > 0 AND NOT (video_id = ANY(%s))"""
ROW_SQL = """INSERT INTO cloud_video.spend_by_day (video_id, stat_date, one_level_type_id, spend)
  VALUES (%s, %s, %s, %s) ON CONFLICT (video_id, stat_date) DO UPDATE
  SET one_level_type_id = EXCLUDED.one_level_type_id, spend = EXCLUDED.spend, synced_at = NOW()"""
DAY_SQL = """INSERT INTO cloud_video.spend_days (stat_date, one_level_type_id, videos, total_spend)
  VALUES (%s, %s, %s, %s) ON CONFLICT (stat_date, one_level_type_id) DO UPDATE
  SET videos = EXCLUDED.videos, total_spend = EXCLUDED.total_spend, synced_at = NOW()"""


def _spend(row):
    return float(row.get('totalStatCost') or 0)


def days_to_sync(conn, type_id, today):
    """Complete days of the last BACKFILL_DAYS not synced yet, plus the latest RESYNC_DAYS; oldest first."""
    latest = today - dt.timedelta(days=1)
    first = today - dt.timedelta(days=BACKFILL_DAYS)
    with conn.cursor() as cur:
        cur.execute(SYNCED_SQL, (type_id, first, latest))
        synced = {row[0] for row in cur.fetchall()}
    conn.commit()
    recent = {latest - dt.timedelta(days=k) for k in range(RESYNC_DAYS)}
    return sorted(day for day in (first + dt.timedelta(days=k) for k in range(BACKFILL_DAYS))
                  if day not in synced or day in recent)


def fetch_day(client, type_id, day):
    """{video id: spend} of the videos that spent on `day`."""
    rows = client.videos({'isInner': 0, 'videoType': 0, 'oneLevelTypeId': type_id, 'orderByType': 9,
                          'dyStatCostStartTime': day.isoformat(), 'dyStatCostEndTime': day.isoformat()},
                         until=lambda batch: _spend(batch[-1]) <= 0)
    # The date branch ignores some filters: keep only the asked 一级分类, as the window sync does.
    return {int(r['videoId']): round(_spend(r), 2) for r in rows if in_type(r, type_id) and _spend(r) > 0}


def sync_days(conn, client, *, type_id, today):
    """Writes each pending day in one transaction; returns counts."""
    days = days_to_sync(conn, type_id, today)
    written = 0
    for day in days:
        spend = fetch_day(client, type_id, day)
        with conn.cursor() as cur:
            cur.execute(ZERO_SQL, (day, type_id, list(spend)))
            execute_batch(cur, ROW_SQL, [(video_id, day, type_id, value) for video_id, value in spend.items()],
                          page_size=BATCH)
            cur.execute(DAY_SQL, (day, type_id, len(spend), round(sum(spend.values()), 2)))
        conn.commit()
        written += len(spend)
    return {'spend_days': len(days), 'spend_rows': written,
            'spend_range': f'{days[0]}..{days[-1]}' if days else None}
