"""罗盘「市场-内容榜单-直播交易榜单-引流短视频」daily exports into competitor.compass_* (GPU node timer, daily 08:30).

Scans COMPETITOR_COMPASS_DIR for `直播交易榜单-引流短视频_YYYY-MM-DD.csv` (the same-named xlsx carries the
same rows and is ignored). One batch per list, scope and day: an unchanged file (same SHA-256) is
skipped; a changed one replaces the day (rooms and videos cascade from the batch). Every video is
upserted into competitor.videos with source='compass' so it shows on 爆款视频; the API queues the
analyses of top-ranked rooms (studio/competitor_auto.rs).
"""
import argparse
import csv
import hashlib
import io
import os
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from marketing_content_assets.repository import connect_pg

DIR_ENV = 'COMPETITOR_COMPASS_DIR'
LIST_TYPE = 'live_trade_traffic_videos'
LIST_SCOPE = 'all'
FILE_RE = re.compile(r'^直播交易榜单-引流短视频_(\d{4}-\d{2}-\d{2})\.csv$')
SHANGHAI = ZoneInfo('Asia/Shanghai')
UNITS = {'': 1, '万': 10_000, '亿': 100_000_000}
NUMBER_RE = re.compile(r'^[¥￥]?\s*([0-9]+(?:\.[0-9]+)?)\s*(万|亿)?\s*(%)?$')

ROOM_COLUMNS = ['排名', '播主', '抖音号', '直播间ID', '店铺ID', '粉丝数', '直播用户支付金额', '直播间观看次数', '商品点击次数', '点击成交转化率']
VIDEO_COLUMNS = ['视频ID', '视频标题', '发布时间', '抖音视频链接', '直播间引流曝光人次', '直播入口点击人次', '直播入口点击率']
REQUIRED = ['日期', *ROOM_COLUMNS, *VIDEO_COLUMNS]


class RejectedFile(ValueError):
    """A file that cannot be imported as is; the batch is left untouched."""


def number(text):
    """`¥25万` -> 250000, `7500` -> 7500, `25%` -> 0.25; None when not a number."""
    match = NUMBER_RE.match(text.strip())
    if not match:
        return None
    value = Decimal(match.group(1)) * UNITS[match.group(2) or '']
    return value / 100 if match.group(3) else value


def bounds(text):
    """(raw, low, high) for a 罗盘 range such as `¥25万 - ¥50万`, `25% - 30%`, `>1亿` or `<1000`.
    A single value is both bounds; an open side is None; unparseable text keeps only the raw."""
    raw = (text or '').strip()
    if not raw:
        return None, None, None
    if raw[0] in '>≥' or raw.endswith('以上') or raw.endswith('+'):
        return raw, number(raw.lstrip('>≥').removesuffix('以上').removesuffix('+')), None
    if raw[0] in '<≤' or raw.endswith('以下'):
        return raw, None, number(raw.lstrip('<≤').removesuffix('以下'))
    parts = [part.strip() for part in re.split(r'\s+-\s+|\s*~\s*|\s*至\s*', raw)]
    if len(parts) == 2:
        low, high = number(parts[0]), number(parts[1])
        if low is not None and high is not None:
            return raw, low, high
        return raw, None, None
    value = number(raw)
    return raw, value, value


def integer(text):
    value = number(text or '')
    return int(value) if value is not None else None


def published(text):
    text = (text or '').strip()
    if not text:
        return None
    for pattern in ('%Y/%m/%d %H:%M', '%Y-%m-%d %H:%M', '%Y/%m/%d %H:%M:%S', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=SHANGHAI)
        except ValueError:
            continue
    return None


def parse(path):
    """(data_date, rooms by room id, videos) from one export; raises RejectedFile on anything off."""
    match = FILE_RE.match(path.name)
    if not match:
        raise RejectedFile(f'不是直播交易榜单引流短视频导出：{path.name}')
    rows = list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
    if not rows:
        raise RejectedFile('文件没有数据行')
    missing = [column for column in REQUIRED if column not in rows[0]]
    if missing:
        raise RejectedFile(f'缺少列：{"、".join(missing)}')
    dates = {row['日期'].strip() for row in rows}
    if dates != {match.group(1)}:
        raise RejectedFile(f'文件名日期 {match.group(1)} 与「日期」列 {sorted(dates)} 不一致')
    rooms, videos = {}, []
    for row in rows:
        room_id = row['直播间ID'].strip()
        room = {
            'live_room_id': room_id, 'rank': integer(row['排名']), 'anchor_name': row['播主'].strip(),
            'douyin_account': row['抖音号'].strip() or None, 'shop_id': row['店铺ID'].strip() or None,
            'follower_count': integer(row['粉丝数']),
            'pay_amount': bounds(row['直播用户支付金额']), 'watch_count': bounds(row['直播间观看次数']),
            'product_click': bounds(row['商品点击次数']), 'click_conversion_rate': bounds(row['点击成交转化率']),
        }
        if room_id in rooms and rooms[room_id] != room:
            raise RejectedFile(f'直播间 {room_id} 在不同行的直播间指标不一致')
        rooms[room_id] = room
        videos.append({
            'live_room_id': room_id, 'aweme_id': row['视频ID'].strip(), 'title': row['视频标题'].strip() or None,
            'published_at': published(row['发布时间']), 'video_url': row['抖音视频链接'].strip() or None,
            'traffic_exposure': bounds(row['直播间引流曝光人次']), 'entry_click': bounds(row['直播入口点击人次']),
            'entry_click_rate': bounds(row['直播入口点击率']),
        })
    keys = [(video['live_room_id'], video['aweme_id']) for video in videos]
    if len(set(keys)) != len(keys):
        raise RejectedFile('同一直播间的同一视频出现多次')
    bad = [value for value in [*rooms, *(v['aweme_id'] for v in videos)] if not re.fullmatch(r'[0-9]{6,32}', value)]
    if bad:
        raise RejectedFile(f'直播间或视频 ID 不合法：{bad[:3]}')
    return match.group(1), rooms, videos, len(rows)


def _ranged(prefix, value):
    raw, low, high = value
    return {f'{prefix}_text': raw, f'{prefix}_min': low, f'{prefix}_max': high}


def import_file(conn, path):
    """'skipped' (same file already imported), 'imported' or 'replaced'."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    data_date, rooms, videos, row_count = parse(path)
    with conn.cursor() as cur:
        # One import at a time (timer and a manual run); a row lock would need UPDATE, which the GPU
        # node role does not have on this table.
        cur.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ('competitor.compass_import',))
        cur.execute("""SELECT import_id, file_sha256 FROM competitor.compass_imports
          WHERE list_type=%s AND list_scope=%s AND data_date=%s""", (LIST_TYPE, LIST_SCOPE, data_date))
        existing = cur.fetchone()
        if existing and existing[1] == digest:
            conn.rollback()
            return 'skipped'
        if existing:
            cur.execute('DELETE FROM competitor.compass_imports WHERE import_id=%s', (existing[0],))
        cur.execute("""INSERT INTO competitor.compass_imports
          (list_type, list_scope, data_date, file_name, file_sha256, row_count, room_count, video_count)
          VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING import_id""",
                    (LIST_TYPE, LIST_SCOPE, data_date, path.name, digest, row_count, len(rooms), len(videos)))
        import_id = cur.fetchone()[0]
        for room in rooms.values():
            values = {'data_date': data_date, 'list_scope': LIST_SCOPE, 'import_id': import_id,
                      **{k: room[k] for k in ('live_room_id', 'rank', 'anchor_name', 'douyin_account', 'shop_id', 'follower_count')},
                      **_ranged('pay_amount', room['pay_amount']), **_ranged('watch_count', room['watch_count']),
                      **_ranged('product_click', room['product_click']),
                      **_ranged('click_conversion_rate', room['click_conversion_rate'])}
            _insert(cur, 'competitor.compass_live_rooms_daily', values)
        for video in videos:
            values = {'data_date': data_date, 'list_scope': LIST_SCOPE, 'import_id': import_id,
                      **{k: video[k] for k in ('live_room_id', 'aweme_id', 'title', 'published_at', 'video_url')},
                      **_ranged('traffic_exposure', video['traffic_exposure']), **_ranged('entry_click', video['entry_click']),
                      **_ranged('entry_click_rate', video['entry_click_rate'])}
            _insert(cur, 'competitor.compass_traffic_videos_daily', values)
            # 爆款视频: a manual entry keeps its source and notes; empty facts are filled in.
            cur.execute("""INSERT INTO competitor.videos (aweme_id, share_url, title, author_name, source)
              VALUES (%s, %s, %s, %s, 'compass')
              ON CONFLICT (aweme_id) DO UPDATE SET title = COALESCE(competitor.videos.title, EXCLUDED.title),
                author_name = COALESCE(competitor.videos.author_name, EXCLUDED.author_name)""",
                        (video['aweme_id'], video['video_url'] or f"https://www.douyin.com/video/{video['aweme_id']}",
                         video['title'], rooms[video['live_room_id']]['anchor_name']))
    conn.commit()
    return 'replaced' if existing else 'imported'


def _insert(cur, table, values):
    columns = list(values)
    cur.execute(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})",
                [values[column] for column in columns])


def run(directory):
    """Imports every export in the directory, oldest first; one bad file never blocks the others."""
    results = {}
    files = sorted(path for path in Path(directory).iterdir() if FILE_RE.match(path.name))
    with connect_pg() as conn:
        for path in files:
            try:
                results[path.name] = import_file(conn, path)
            except RejectedFile as error:
                conn.rollback()
                results[path.name] = f'rejected: {error}'
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dir', default=os.getenv(DIR_ENV))
    args = parser.parse_args(argv)
    if not args.dir or not Path(args.dir).is_dir():
        print(f'[compass-import] {DIR_ENV} is not a directory: {args.dir!r}', file=sys.stderr, flush=True)
        return 2
    results = run(args.dir)
    for name, status in results.items():
        if status != 'skipped':
            print(f'[compass-import] {name}: {status}', flush=True)
    print(f'[compass-import] {len(results)} files, '
          f"{sum(s in ('imported', 'replaced') for s in results.values())} imported", flush=True)
    return 1 if any(s.startswith('rejected') for s in results.values()) else 0


if __name__ == '__main__':
    sys.exit(main())
