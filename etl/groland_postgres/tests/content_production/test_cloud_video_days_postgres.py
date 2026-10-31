"""Disposable-database contract for the per-day 视频云管家 spend (cloud_video.spend_by_day)."""
import datetime as dt
import os
import sys
import unittest
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_production import cloud_video_days as days  # noqa: E402
from test_cloud_video_sync import TODAY, client_for, item  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')


@unittest.skipUnless(DB, 'disposable database required')
class SpendByDayTest(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.execute('DELETE FROM cloud_video.spend_by_day')
        self.execute('DELETE FROM cloud_video.spend_days')
        self.asked = []

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def client(self, spend_of):
        """Every asked day returns videos 1..3 with spend_of(day, video), sorted by spend."""
        def pages(body):
            day = dt.date.fromisoformat(body['dyStatCostStartTime'])
            self.assertEqual(body['dyStatCostEndTime'], body['dyStatCostStartTime'])
            self.asked.append(day)
            rows = sorted((item(v, cost=spend_of(day, v)) for v in (1, 2, 3)), key=lambda r: -r['totalStatCost'])
            other = item(9, cost=99999)
            other['oneLevelVideoType'] = {'id': 1, 'name': '别的分类'}
            return {'list': [other] + rows, 'totalPage': 1}
        return client_for(pages)

    def test_the_first_run_fills_thirty_complete_days_and_later_runs_only_the_recent_ones(self):
        result = days.sync_days(self.conn, self.client(lambda day, v: 0 if v == 3 else 10.0 * v), type_id=73180, today=TODAY)
        self.assertEqual(result['spend_days'], days.BACKFILL_DAYS)
        self.assertEqual((min(self.asked), max(self.asked)), (TODAY - dt.timedelta(days=30), TODAY - dt.timedelta(days=1)))
        [(rows, total)] = self.execute('SELECT COUNT(*), SUM(spend) FROM cloud_video.spend_by_day')
        self.assertEqual((rows, float(total)), (2 * days.BACKFILL_DAYS, 30.0 * days.BACKFILL_DAYS))  # no zero, no other 分类
        self.asked.clear()
        result = days.sync_days(self.conn, self.client(lambda day, v: 10.0 * v), type_id=73180, today=TODAY + dt.timedelta(days=1))
        self.assertEqual(sorted(self.asked), [TODAY - dt.timedelta(days=1), TODAY])
        self.assertEqual(result['spend_days'], days.RESYNC_DAYS)

    def test_a_resynced_day_replaces_its_rows(self):
        days.sync_days(self.conn, self.client(lambda day, v: 5.0), type_id=73180, today=TODAY)
        yesterday = TODAY - dt.timedelta(days=1)
        days.sync_days(self.conn, self.client(lambda day, v: 7.0 if v == 1 else 0), type_id=73180, today=TODAY)
        rows = self.execute('SELECT video_id, spend FROM cloud_video.spend_by_day WHERE stat_date = %s AND spend > 0', (yesterday,))
        self.assertEqual([(v, float(s)) for v, s in rows], [(1, 7.0)])
        [(total,)] = self.execute('SELECT SUM(spend) FROM cloud_video.spend_by_day WHERE stat_date = %s', (yesterday,))
        self.assertEqual(float(total), 7.0)  # rows no longer listed are zeroed, not deleted
        [(count, total)] = self.execute('SELECT videos, total_spend FROM cloud_video.spend_days WHERE stat_date = %s', (yesterday,))
        self.assertEqual((count, float(total)), (1, 7.0))


if __name__ == '__main__':
    unittest.main()
