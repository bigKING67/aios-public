import csv
import io
import os
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.competitor_analysis import compass_import as ci  # noqa: E402

TEST_DB = os.getenv('COMPETITOR_TEST_DATABASE_URL')
HEADER = ['日期', '排名', '播主', '抖音号', '直播间ID', '店铺ID', '粉丝数', '直播用户支付金额', '直播间观看次数', '商品点击次数',
          '点击成交转化率', '视频ID', '视频标题', '发布时间', '抖音视频链接', '播放地址', '封面', '直播间引流曝光人次',
          '直播入口点击人次', '直播入口点击率']
ROOM_A = ['2', '小树美护肤旗舰店', '56473516388', '7700318903557245746', '170565815', '1405126', '¥100万 - ¥250万',
          '100万 - 250万', '25万 - 50万', '25% - 30%']
ROOM_B = ['', '三资堂美妆官方旗舰店', '36518446984', '7698086107530988315', '101227965', '2033097', '¥25万 - ¥50万',
          '10万 - 25万', '2.5万 - 5万', '15% - 20%']


def row(day, room, aweme, title, extra=('', '', '')):
    return [day, *room, aweme, title, '2026/10/17 15:14', f'https://www.douyin.com/video/{aweme}',
            'https://v26.douyinvod.com/signed', 'https://p3.byteimg.com/signed', *extra]


def write(folder, day, rows, suffix='csv'):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(HEADER)
    writer.writerows(rows)
    path = Path(folder) / f'直播交易榜单-引流短视频_{day}.{suffix}'
    path.write_text(out.getvalue(), encoding='utf-8-sig')
    return path


DAY = '2026-10-25'
ROWS = [
    row(DAY, ROOM_A, '7697531652578299186', '第一行\n第二行 #底妆', ('100万 - 250万', '1万 - 2.5万', '1% - 2.5%')),
    row(DAY, ROOM_A, '7699451694043680041', '素颜霜'),
    row(DAY, ROOM_B, '7662712203858005291', '睫毛打底膏'),
]


class BoundsTest(unittest.TestCase):
    def test_compass_ranges(self):
        self.assertEqual(ci.bounds('¥25万 - ¥50万'), ('¥25万 - ¥50万', Decimal(250000), Decimal(500000)))
        self.assertEqual(ci.bounds('7500 - 1万'), ('7500 - 1万', Decimal(7500), Decimal(10000)))
        self.assertEqual(ci.bounds('25% - 30%'), ('25% - 30%', Decimal('0.25'), Decimal('0.30')))
        self.assertEqual(ci.bounds('2.5% - 5%')[1:], (Decimal('0.025'), Decimal('0.05')))
        self.assertEqual(ci.bounds('>1亿'), ('>1亿', Decimal(100_000_000), None))
        self.assertEqual(ci.bounds('<1000'), ('<1000', None, Decimal(1000)))
        self.assertEqual(ci.bounds('1405126'), ('1405126', Decimal(1405126), Decimal(1405126)))
        self.assertEqual(ci.bounds(''), (None, None, None))
        self.assertEqual(ci.bounds('暂无'), ('暂无', None, None))


class ParseTest(unittest.TestCase):
    def test_rooms_are_deduplicated_and_multi_line_titles_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            day, rooms, videos, row_count = ci.parse(write(tmp, DAY, ROWS))
        self.assertEqual((day, len(rooms), len(videos), row_count), (DAY, 2, 3, 3))
        self.assertIsNone(rooms['7698086107530988315']['rank'])
        self.assertEqual(rooms['7700318903557245746']['pay_amount'][1:], (Decimal(1_000_000), Decimal(2_500_000)))
        self.assertEqual(videos[0]['title'], '第一行\n第二行 #底妆')
        self.assertEqual(videos[0]['published_at'].isoformat(), '2026-10-17T15:14:00+08:00')
        self.assertEqual(videos[1]['traffic_exposure'], (None, None, None))

    def test_inconsistent_or_mislabelled_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            changed = list(ROOM_A)
            changed[5] = '999'
            with self.assertRaisesRegex(ci.RejectedFile, '直播间指标不一致'):
                ci.parse(write(tmp, DAY, [*ROWS, row(DAY, changed, '7600000000000000001', 'x')]))
            with self.assertRaisesRegex(ci.RejectedFile, '不一致'):
                ci.parse(write(tmp, DAY, [row('2026-10-24', ROOM_A, '7600000000000000002', 'x')]))
            with self.assertRaisesRegex(ci.RejectedFile, '多次'):
                ci.parse(write(tmp, DAY, [ROWS[1], ROWS[1]]))


@unittest.skipUnless(TEST_DB, 'needs COMPETITOR_TEST_DATABASE_URL (competitor schema + compass tables)')
class ImportPostgresTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.env = patch.dict(os.environ, {'DATABASE_URL': TEST_DB})
        self.env.start()
        self.conn = psycopg2.connect(TEST_DB)
        self.clean()

    def tearDown(self):
        self.clean()
        self.conn.close()
        self.env.stop()

    def clean(self):
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM competitor.compass_imports')
            cur.execute("DELETE FROM competitor.videos WHERE aweme_id IN %s", (tuple(r[11] for r in ROWS) + ('7600000000000000009',),))
        self.conn.commit()

    def counts(self):
        with self.conn.cursor() as cur:
            cur.execute("""SELECT (SELECT count(*) FROM competitor.compass_imports), (SELECT count(*) FROM competitor.compass_live_rooms_daily),
              (SELECT count(*) FROM competitor.compass_traffic_videos_daily),
              (SELECT count(*) FROM competitor.videos WHERE source='compass' AND aweme_id LIKE '76%%')""")
            return cur.fetchone()

    def test_the_gpu_node_grants_are_enough(self):
        # Production imports as aios_gpu_node with only the migration's grants; replay them on a role.
        with self.conn.cursor() as cur:
            cur.execute("DROP ROLE IF EXISTS compass_import_probe")
            cur.execute("CREATE ROLE compass_import_probe LOGIN PASSWORD 'probe'")
            cur.execute("GRANT USAGE ON SCHEMA competitor TO compass_import_probe")
            cur.execute("GRANT SELECT, INSERT, DELETE ON competitor.compass_imports TO compass_import_probe")
            cur.execute("GRANT SELECT, INSERT ON competitor.compass_live_rooms_daily, competitor.compass_traffic_videos_daily TO compass_import_probe")
            cur.execute("GRANT SELECT, INSERT, UPDATE ON competitor.videos TO compass_import_probe")
        self.conn.commit()
        from urllib.parse import urlsplit, urlunsplit
        url = urlsplit(TEST_DB)
        probe = urlunsplit(url._replace(netloc=f'compass_import_probe:probe@{url.hostname}:{url.port}'))
        try:
            with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'DATABASE_URL': probe}):
                path = write(tmp, DAY, ROWS)
                self.assertEqual(ci.run(tmp), {path.name: 'imported'})
                write(tmp, DAY, ROWS[:2])
                self.assertEqual(ci.run(tmp), {path.name: 'replaced'})
        finally:
            self.clean()
            with self.conn.cursor() as cur:
                cur.execute("DROP OWNED BY compass_import_probe")
                cur.execute("DROP ROLE compass_import_probe")
            self.conn.commit()

    def test_import_skip_and_replace(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write(tmp, DAY, ROWS)
            write(tmp, DAY, ROWS, suffix='xlsx')
            self.assertEqual(ci.run(tmp), {path.name: 'imported'})
            self.assertEqual(self.counts(), (1, 2, 3, 3))
            self.assertEqual(ci.run(tmp), {path.name: 'skipped'})
            with self.conn.cursor() as cur:
                cur.execute("""SELECT rank, pay_amount_min, click_conversion_rate_max FROM competitor.compass_live_rooms_daily
                  WHERE live_room_id='7700318903557245746'""")
                self.assertEqual(cur.fetchone(), (2, Decimal('1000000.00'), Decimal('0.3000')))
                cur.execute("SELECT title, author_name FROM competitor.videos WHERE aweme_id='7697531652578299186'")
                self.assertEqual(cur.fetchone(), ('第一行\n第二行 #底妆', '小树美护肤旗舰店'))
            self.conn.commit()
            write(tmp, DAY, [*ROWS[:2], row(DAY, ROOM_A, '7600000000000000009', '新视频')])
            self.assertEqual(ci.run(tmp), {path.name: 'replaced'})
            # The day is replaced; 爆款视频 keeps every video it has seen.
            self.assertEqual(self.counts(), (1, 1, 3, 4))


if __name__ == '__main__':
    unittest.main()
