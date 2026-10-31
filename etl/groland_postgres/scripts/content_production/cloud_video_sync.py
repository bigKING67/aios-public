"""视频云管家 → cloud_video.videos: our 成片 of one 一级分类, their near-30-day spend and which ones are
decomposed automatically (design: .trellis/tasks/10-29-remix-admission-pool/design.md).

Runs on the desktop (WSL), the only machine whose network reaches the vendor's file server inside the
company: it reads the window-spend list (sorted by spend, read only down to the lowest eligible spend),
upserts the videos and the day's spend, fills the per-day spend (cloud_video_days.py), then downloads
each eligible video without a hash through the inner address, stores its SHA-256 and keeps the file in
CLOUD_VIDEO_CACHE_DIR (named by hash) while it stays eligible. The
VPS intake (cloud_video_intake.py) turns hashed rows into originals and framework jobs.

    python -m content_production.cloud_video_sync --once [--dry-run] [--no-download]
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path
from zoneinfo import ZoneInfo

from psycopg2.extras import Json, execute_batch

from .cloud_video_client import CloudVideoClient, api_lock, pinned_open

BUSINESS_TZ = ZoneInfo('Asia/Shanghai')
WINDOW_DAYS = 30
RECENT_DAYS = 20
GE_5K = 5000.0
DEFAULT_TYPE_ID = 73180  # 百雀香粉
DEFAULT_LOW_SPEND_MIN = 1000.0
DEFAULT_DOWNLOAD_LIMIT = 200
CHOUFEN = '抽帧'
DOWNLOAD_TIMEOUT_SECONDS = 600
CHUNK = 1 << 20
# The desktop reaches the VPS database at ~230 ms a round trip: ~11k single upserts took ~45 minutes.
BATCH = 500

UPSERT_SQL = """INSERT INTO cloud_video.videos (video_id, name, video_type, one_level_type_id, one_level_type_name,
  two_level_type_id, two_level_type_name, labels, is_choufen, uploaded_at, shot_at, duration_seconds, file_size, raw_md5,
  url_path, outer_host, inner_host, cover_path, cover_host, window_spend, window_end, eligibility, eligibility_reason, synced_at)
  VALUES (%(video_id)s, %(name)s, %(video_type)s, %(one_level_type_id)s, %(one_level_type_name)s, %(two_level_type_id)s,
          %(two_level_type_name)s, %(labels)s, %(is_choufen)s, %(uploaded_at)s, %(shot_at)s, %(duration_seconds)s, %(file_size)s,
          %(raw_md5)s, %(url_path)s, %(outer_host)s, %(inner_host)s, %(cover_path)s, %(cover_host)s, %(window_spend)s,
          %(window_end)s, %(eligibility)s, %(eligibility_reason)s, NOW())
  ON CONFLICT (video_id) DO UPDATE SET name = EXCLUDED.name, video_type = EXCLUDED.video_type,
    one_level_type_id = EXCLUDED.one_level_type_id, one_level_type_name = EXCLUDED.one_level_type_name,
    two_level_type_id = EXCLUDED.two_level_type_id, two_level_type_name = EXCLUDED.two_level_type_name,
    labels = EXCLUDED.labels, is_choufen = EXCLUDED.is_choufen, uploaded_at = EXCLUDED.uploaded_at, shot_at = EXCLUDED.shot_at,
    duration_seconds = EXCLUDED.duration_seconds, file_size = EXCLUDED.file_size, raw_md5 = EXCLUDED.raw_md5,
    url_path = EXCLUDED.url_path, outer_host = EXCLUDED.outer_host, inner_host = EXCLUDED.inner_host,
    cover_path = EXCLUDED.cover_path, cover_host = EXCLUDED.cover_host, window_spend = EXCLUDED.window_spend,
    window_end = EXCLUDED.window_end, eligibility = EXCLUDED.eligibility, eligibility_reason = EXCLUDED.eligibility_reason,
    -- A changed file (new path or size) must be hashed again before it is decomposed.
    file_sha256 = CASE WHEN cloud_video.videos.url_path = EXCLUDED.url_path
                        AND cloud_video.videos.file_size IS NOT DISTINCT FROM EXCLUDED.file_size
                       THEN cloud_video.videos.file_sha256 END,
    hashed_at = CASE WHEN cloud_video.videos.url_path = EXCLUDED.url_path
                      AND cloud_video.videos.file_size IS NOT DISTINCT FROM EXCLUDED.file_size
                     THEN cloud_video.videos.hashed_at END,
    synced_at = NOW()"""
SPEND_SQL = """INSERT INTO cloud_video.spend_daily (video_id, stat_date, window_start, window_end, window_spend)
  VALUES (%s, %s, %s, %s, %s) ON CONFLICT (video_id, stat_date) DO UPDATE
  SET window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end, window_spend = EXCLUDED.window_spend, synced_at = NOW()"""
# Videos eligible before but absent from today's lists lost their window spend: re-judge them with 0.
STALE_SQL = """SELECT video_id, uploaded_at, is_choufen FROM cloud_video.videos
  WHERE eligibility IS NOT NULL AND one_level_type_id = %s AND NOT (video_id = ANY(%s))"""
UNELIGIBLE_SQL = """UPDATE cloud_video.videos SET window_spend = 0, window_end = %s, eligibility = %s,
  eligibility_reason = %s, synced_at = NOW() WHERE video_id = %s"""
TO_HASH_SQL = """SELECT video_id, url_path, inner_host FROM cloud_video.videos
  WHERE eligibility IS NOT NULL AND file_sha256 IS NULL AND one_level_type_id = %s
    AND name NOT LIKE '【AI%%'
    AND NOT EXISTS (SELECT 1 FROM cloud_video.pushes p WHERE p.cloud_video_id=cloud_video.videos.video_id)
  ORDER BY window_spend DESC NULLS LAST, uploaded_at DESC NULLS LAST LIMIT %s"""
# file_size stays the vendor's value: the next sync compares it to tell a replaced file.
HASHED_SQL = """UPDATE cloud_video.videos SET file_sha256 = %s, hashed_at = NOW(), hash_error = NULL,
  duration_seconds = COALESCE(%s, duration_seconds) WHERE video_id = %s AND url_path = %s"""
HASH_FAILED_SQL = 'UPDATE cloud_video.videos SET hash_error = %s WHERE video_id = %s'
KEEP_SQL = """SELECT file_sha256 FROM cloud_video.videos WHERE eligibility IS NOT NULL AND file_sha256 IS NOT NULL"""


def business_today(now=None):
    return (now or dt.datetime.now(BUSINESS_TZ)).astimezone(BUSINESS_TZ).date()


def window(today):
    """The near-30-day window: the 30 complete days before `today` (spend of today is not final)."""
    end = today - dt.timedelta(days=1)
    return end - dt.timedelta(days=WINDOW_DAYS - 1), end


def is_choufen(row):
    return CHOUFEN in (row.get('name') or '') or any(CHOUFEN in (label.get('name') or '') for label in row.get('videoLabels') or [])


def _time(value):
    if not value:
        return None
    try:
        return dt.datetime.strptime(value, '%Y-%m-%d %H:%M:%S').replace(tzinfo=BUSINESS_TZ)
    except ValueError:
        return None


def judge(spend, uploaded_at, choufen, today, low_min):
    """(eligibility, reason). 5k+ always; below that only a recent, spending, non-抽帧 upload (D17 + D19)."""
    if spend >= GE_5K:
        return 'ge_5k', f'近 30 天消耗 {spend:.0f}'
    if uploaded_at is None:
        return None, '没有上传时间'
    age = (today - uploaded_at.astimezone(BUSINESS_TZ).date()).days
    if age > RECENT_DAYS:
        return None, f'上传 {age} 天，消耗不足 5000'
    if choufen:
        return None, '抽帧成片'
    if spend < low_min:
        return None, f'上传 {age} 天，近 30 天消耗 {spend:.0f} 不足 {low_min:.0f}'
    return 'recent_ge_1k', f'上传 {age} 天，近 30 天消耗 {spend:.0f}'


def record(row, inner_host, spend, today, low_min):
    """The cloud_video.videos row of one list item (spend: the window spend, 0 when not in the window list)."""
    url = urllib.parse.urlparse(row.get('videoUrl') or '')
    cover = urllib.parse.urlparse(row.get('coverUrl') or '')
    one, two = row.get('oneLevelVideoType') or {}, row.get('twoLevelVideoType') or {}
    uploaded = _time(row.get('createTime'))
    choufen = is_choufen(row)
    eligibility, reason = judge(spend, uploaded, choufen, today, low_min)
    return {
        'video_id': int(row.get('videoId') or row.get('id')), 'name': (row.get('name') or '').strip() or f'云管家成片 {row.get("videoId")}',
        'video_type': int(row.get('videoType') or 0), 'one_level_type_id': one.get('id'), 'one_level_type_name': one.get('name'),
        'two_level_type_id': two.get('id'), 'two_level_type_name': two.get('name'),
        'labels': Json([{'id': label.get('id'), 'name': label.get('name')} for label in row.get('videoLabels') or []]),
        'is_choufen': choufen, 'uploaded_at': uploaded, 'shot_at': _time(row.get('shootTime')),
        'duration_seconds': row.get('duration'), 'file_size': row.get('fileSize'), 'raw_md5': row.get('rawMd5') or None,
        'url_path': url.path, 'outer_host': url.netloc, 'inner_host': inner_host,
        'cover_path': cover.path or None, 'cover_host': cover.netloc or None,
        'window_spend': round(spend, 2), 'window_end': window(today)[1], 'eligibility': eligibility, 'eligibility_reason': reason,
    }


def in_type(row, type_id):
    return ((row.get('oneLevelVideoType') or {}).get('id') == type_id and int(row.get('videoType') or 0) == 0
            and not (row.get('name') or '').startswith('【AI'))


def _spend(row):
    return float(row.get('totalStatCost') or 0)


def fetch(client, type_id, today, low_min):
    """(rows by id, window spend by id, inner host): the window-spend list down to `low_min`, one inner sample.

    Every eligible video spends at least `low_min` in the window (judge), and the list comes sorted by that
    spend (orderByType 9), so the pages below it are never needed: ~3 requests instead of ~110 a day
    (2026-10-29: 52 pages of window spend plus the recent uploads), each a chance for a dropped connection.
    Videos below it keep their last synced row; an eligible one that fell below is re-judged in sync()."""
    start, end = window(today)
    base = {'isInner': 0, 'videoType': 0, 'oneLevelTypeId': type_id}
    in_window = client.videos({**base, 'orderByType': 9, 'dyStatCostStartTime': start.isoformat(),
                               'dyStatCostEndTime': end.isoformat()},
                              until=lambda batch: _spend(batch[-1]) < low_min)
    # The vendor ignores some filters on the date branch (videoIds, statCostStart): keep only the asked 一级分类.
    in_window = [r for r in in_window if in_type(r, type_id) and _spend(r) >= low_min]
    spend = {int(r['videoId']): _spend(r) for r in in_window}
    rows = {int(r['videoId']): r for r in in_window}
    sample = client.call('/openapi/video/list', {**base, 'isInner': 1, 'pageNo': 1, 'pageSize': 1}).get('list') or []
    inner_host = urllib.parse.urlparse(sample[0].get('videoUrl') or '').netloc if sample else ''
    if not inner_host:
        raise RuntimeError('没有取到内网地址的域名')
    return rows, spend, inner_host


def sync(conn, client, *, type_id, today, low_min):
    rows, spend, inner_host = fetch(client, type_id, today, low_min)
    with conn.cursor() as cur:
        cur.execute('SELECT cloud_video_id FROM cloud_video.pushes WHERE cloud_video_id=ANY(%s)', (list(rows),))
        pushed = {row[0] for row in cur.fetchall()}
        cur.execute("""UPDATE cloud_video.videos SET eligibility=NULL,eligibility_reason='AI 合成成片不拆解'
            WHERE name LIKE '【AI%%' OR video_id IN (SELECT cloud_video_id FROM cloud_video.pushes WHERE cloud_video_id IS NOT NULL)""")
    rows = {key: row for key, row in rows.items() if key not in pushed}
    spend = {key: value for key, value in spend.items() if key not in pushed}
    start, end = window(today)
    records = [record(row, inner_host, spend.get(video_id, 0.0), today, low_min) for video_id, row in rows.items()]
    with conn.cursor() as cur:
        execute_batch(cur, UPSERT_SQL, records, page_size=BATCH)
        execute_batch(cur, SPEND_SQL, [(video_id, today, start, end, round(value, 2)) for video_id, value in spend.items()],
                      page_size=BATCH)
        cur.execute(STALE_SQL, (type_id, list(rows)))
        stale = cur.fetchall()
        execute_batch(cur, UNELIGIBLE_SQL, [(end, *judge(0.0, uploaded_at, choufen, today, low_min), video_id)
                                            for video_id, uploaded_at, choufen in stale], page_size=BATCH)
    conn.commit()
    eligible = [r for r in records if r['eligibility']]
    return {'videos': len(records), 'in_window': len(spend), 'ge_5k': sum(1 for r in eligible if r['eligibility'] == 'ge_5k'),
            'recent_ge_1k': sum(1 for r in eligible if r['eligibility'] == 'recent_ge_1k'), 're_judged': len(stale),
            'window': f'{start}..{end}'}


def probe_duration(path):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)],
                             check=True, capture_output=True, text=True, timeout=60).stdout
        return round(float(json.loads(out)['format']['duration']), 3)
    except Exception:  # noqa: BLE001 - the vendor's duration stays when probing fails
        return None


def download(url, destination, opener=pinned_open):
    """Streams `url` into `destination`; returns (sha256, bytes). The list's `fileSize` describes another
    file than the one `videoUrl` serves (2026-10-29: served bytes were 45-57 % of it, Content-Length
    matching), so completeness is checked against the server's Content-Length only."""
    digest, size = hashlib.sha256(), 0
    with opener(url, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, open(destination, 'wb') as out:
        expected = (getattr(response, 'headers', None) or {}).get('Content-Length')
        while True:
            chunk = response.read(CHUNK)
            if not chunk:
                break
            digest.update(chunk)
            out.write(chunk)
            size += len(chunk)
    if expected is not None and int(expected) != size:
        raise RuntimeError(f'只下载到 {size} 字节，服务器声明 {expected}')
    return digest.hexdigest(), size


def cache_path(cache_dir, sha256):
    return Path(cache_dir) / f'{sha256}.mp4'


def hash_pending(conn, cache_dir, *, type_id, limit, opener=pinned_open):
    """Downloads eligible videos without a hash through the inner address and keeps them in the cache."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    with conn.cursor() as cur:
        cur.execute(TO_HASH_SQL, (type_id, limit))
        pending = cur.fetchall()
    conn.commit()
    done, failed = 0, 0
    for video_id, url_path, inner_host in pending:
        fd, tmp = tempfile.mkstemp(dir=cache_dir, suffix='.part')
        os.close(fd)
        try:
            sha256, _size = download(f'https://{inner_host}{url_path}', tmp, opener)
            final = cache_path(cache_dir, sha256)
            os.replace(tmp, final)
            with conn.cursor() as cur:
                cur.execute(HASHED_SQL, (sha256, probe_duration(final), video_id, url_path))
            conn.commit()
            done += 1
        except Exception as error:  # noqa: BLE001 - one unreachable file must not stop the others
            Path(tmp).unlink(missing_ok=True)
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute(HASH_FAILED_SQL, (f'{type(error).__name__}: {str(error)[:300]}', video_id))
            conn.commit()
            failed += 1
    return {'hashed': done, 'hash_failed': failed}


def prune_cache(conn, cache_dir):
    """Deletes cached files of videos that left the pool (and leftover partial downloads)."""
    with conn.cursor() as cur:
        cur.execute(KEEP_SQL)
        keep = {row[0] for row in cur.fetchall()}
    conn.commit()
    removed = 0
    for path in Path(cache_dir).glob('*'):
        if path.suffix == '.part' or (path.suffix == '.mp4' and path.stem not in keep):
            path.unlink(missing_ok=True)
            removed += 1
    return {'cache_removed': removed}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--once', action='store_true', required=True)
    parser.add_argument('--dry-run', action='store_true', help='fetch and judge only; write nothing, download nothing')
    parser.add_argument('--no-download', action='store_true', help='sync metadata and spend; skip hashing')
    args = parser.parse_args(argv)
    with api_lock():  # one 视频云管家 caller per host at a time (see cloud_video_client)
        return run(args)


def run(args):
    type_id = int(os.getenv('CLOUD_VIDEO_TYPE_ID', DEFAULT_TYPE_ID))
    low_min = float(os.getenv('CLOUD_VIDEO_LOW_SPEND_MIN', DEFAULT_LOW_SPEND_MIN))
    today = business_today()
    client = CloudVideoClient.from_env()
    if args.dry_run:
        rows, spend, inner_host = fetch(client, type_id, today, low_min)
        judged = [record(row, inner_host, spend.get(video_id, 0.0), today, low_min) for video_id, row in rows.items()]
        print(json.dumps({'videos': len(judged), 'in_window': len(spend), 'inner_host': inner_host,
                          'ge_5k': sum(1 for r in judged if r['eligibility'] == 'ge_5k'),
                          'recent_ge_1k': sum(1 for r in judged if r['eligibility'] == 'recent_ge_1k')}, ensure_ascii=False))
        return 0
    from marketing_content_assets.repository import connect_pg
    with connect_pg() as conn:
        result = sync(conn, client, type_id=type_id, today=today, low_min=low_min)
        from .cloud_video_days import sync_days
        result.update(sync_days(conn, client, type_id=type_id, today=today))
        cache_dir = os.getenv('CLOUD_VIDEO_CACHE_DIR')
        if not args.no_download:
            if not cache_dir:
                raise SystemExit('CLOUD_VIDEO_CACHE_DIR 未配置')
            result.update(hash_pending(conn, cache_dir, type_id=type_id,
                                       limit=int(os.getenv('CLOUD_VIDEO_DOWNLOAD_DAILY_LIMIT', DEFAULT_DOWNLOAD_LIMIT))))
            result.update(prune_cache(conn, cache_dir))
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
