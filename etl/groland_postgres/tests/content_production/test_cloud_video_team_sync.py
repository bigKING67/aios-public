"""团队产出 sync (cloud_video_team_sync): label mapping, video rows, spend/GMV rows, and the disposable-database
contract for snapshots, uploads, per-day spend and the sync-day status."""
import datetime as dt
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import cloud_video_client as cvc  # noqa: E402
from content_production import cloud_video_team_sync as team  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
TODAY = dt.date(2026, 10, 29)
YESTERDAY = TODAY - dt.timedelta(days=1)
ACCOUNTS = [
    {'accountKey': 'ed1', 'name': '剪辑甲', 'roleName': '抖音组-剪辑', 'teamId': 1, 'teamName': '花悦', 'groupId': 11, 'groupName': '内容1组', 'state': 1},
    {'accountKey': 'dr1', 'name': '编导乙', 'roleName': '花悦编导', 'teamId': 1, 'teamName': '花悦', 'groupId': 12, 'groupName': '内容2组', 'state': 1},
    {'accountKey': 'dup1', 'name': '同名', 'state': 1},
    {'accountKey': 'dup2', 'name': '同名', 'state': 0},
]
LABELS = [{'id': 11535, 'name': '拍摄人/编导', 'children': [
    {'id': 501, 'name': '编导乙', 'parentLabelId': 11535, 'state': 1},
    {'id': 502, 'name': '同名', 'parentLabelId': 11535, 'state': 1},
    {'id': 503, 'name': '没有账号', 'parentLabelId': 11535, 'state': 1}]},
    {'id': 900, 'name': '痛点', 'children': [{'id': 901, 'name': '脱妆', 'parentLabelId': 900}]}]


def video(video_id, *, day=YESTERDAY, author='ed1', labels=(), cost=0.0, video_type=0):
    return {'videoId': video_id, 'name': f'成片{video_id}', 'videoType': video_type, 'accountKey': author, 'accountName': author,
            'createTime': f'{day.isoformat()} 18:00:00', 'totalStatCost': cost,
            'oneLevelVideoType': {'id': 73180, 'name': '百雀香粉'}, 'twoLevelVideoType': {'id': 86071, 'name': '花悦二组'},
            'videoState': {'id': 3, 'name': '已投放'},
            'videoLabels': [{'id': i, 'name': str(i), 'parentLabelId': 11535 if i in (501, 502, 503) else 900} for i in labels]}


class Vendor:
    """A fake vendor: uploads by day, date-branch spend by day and relation records by (video, day)."""

    def __init__(self, uploads=None, spend=None, relations=None):
        self.uploads, self.spend, self.relations = uploads or {}, spend or {}, relations or {}
        self.calls, self.fail = [], {}

    def post(self, url, headers, body):
        path = url.split('example.com', 1)[1]
        self.calls.append((path, body))
        if path in self.fail:
            return {'code': self.fail[path], 'success': False, 'info': 'fail'}
        if path == '/openapi/auth/access_token':
            return self.ok({'accessToken': 'tok'})
        if path == '/openapi/account/list':
            return self.ok({'list': ACCOUNTS[:body['pageSize']]})
        if path == '/openapi/video/label/list':
            return self.ok(LABELS)
        if path == '/openapi/video/list':
            if 'dyStatCostStartTime' in body:
                rows = self.spend.get(dt.date.fromisoformat(body['dyStatCostStartTime']), [])
            else:
                rows = self.uploads.get(dt.date.fromisoformat(body['uploadStartTime']), [])
            start = (body['pageNo'] - 1) * body['pageSize']
            pages = max(1, -(-len(rows) // body['pageSize']))
            return self.ok({'list': rows[start:start + body['pageSize']], 'total': len(rows), 'totalPage': pages})
        if path == '/openapi/video/relation/third/material/list':
            day = dt.date.fromisoformat(body['startTime'])
            ids = [int(v) for v in body['videoIds'].split(',')]
            return self.ok([{'videoId': v, 'relationList': self.relations[(v, day)]} for v in ids if (v, day) in self.relations])
        raise AssertionError(path)

    @staticmethod
    def ok(data):
        return {'code': 1, 'success': True, 'data': data}


def client_for(vendor):
    return cvc.CloudVideoClient('https://open.example.com', 'key', 'secret', transport=vendor,
                                clock=lambda: 1_800_000_000.0, sleep=lambda _s: None)


def relation(cost, gmv, coupon=0.0, platform=team.QIANCHUAN_TYPE):
    return {'type': platform, 'statCost': cost, 'payOrderAmount': gmv, 'payOrderCouponAmount': coupon,
            'ecomPlatformSubsidyAmount': 0}


class RowsTest(unittest.TestCase):
    def test_a_label_maps_only_to_the_one_account_of_its_name(self):
        rows = team.label_rows(team.fetch_director_labels(client_for(Vendor())), ACCOUNTS)
        self.assertEqual([(r['label_id'], r['account_key'], r['mapping_source']) for r in rows],
                         [(501, 'dr1', 'name_match'), (502, None, None), (503, None, None)])

    def test_a_video_keeps_only_its_person_labels_and_the_upload_time_in_beijing(self):
        row = team.video_row(video(7, labels=(502, 901, 501)), {501, 502, 503})
        self.assertEqual(row['director_label_ids'], [501, 502])
        self.assertEqual(row['uploaded_at'].utcoffset(), dt.timedelta(hours=8))
        self.assertNotIn('total_stat_cost', team.video_row(video(7), set(), cumulative=False))

    def test_qianchuan_sums_win_and_a_video_the_endpoint_missed_keeps_its_listed_spend_with_unknown_gmv(self):
        vendor = Vendor(relations={(1, YESTERDAY): [relation(60, 100, 5), relation(40.5, 0),
                                                    relation(328.58, 0, platform=10), relation(0, 12, platform=0)]})
        sums = team.fetch_relations(client_for(vendor), [1, 2], YESTERDAY)
        rows = team.spend_rows(YESTERDAY, {1: 100.5, 2: 30.0}, sums)
        self.assertEqual([(r['video_id'], r['spend'], r['pay_order_amount'], r['other_platform_spend'], r['list_spend'],
                           r['relation_count']) for r in rows],
                         [(1, 100.5, 100.0, 328.58, 100.5, 2), (2, 30.0, None, 0.0, 30.0, 0)])  # 百度 spend and 巨量广告 GMV stay out

    def test_relations_are_asked_in_batches_of_one_hundred(self):
        vendor = Vendor()
        team.fetch_relations(client_for(vendor), list(range(1, 251)), YESTERDAY)
        sizes = sorted(len(b['videoIds'].split(',')) for p, b in vendor.calls if p.endswith('third/material/list'))
        self.assertEqual(sizes, [50, 100, 100])

    def test_materials_and_rows_without_an_upload_time_are_not_counted(self):
        broken = video(3)
        broken['createTime'] = None
        self.assertEqual(list(team._finished([video(1), video(2, video_type=1), broken])), [1])


@unittest.skipUnless(DB, 'disposable database required')
class TeamSyncDbTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        for table in ('finished_spend_daily', 'finished_videos', 'director_labels', 'account_snapshots', 'team_sync_days'):
            self.execute(f'DELETE FROM cloud_video.{table}')

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def vendor(self):
        old = YESTERDAY - dt.timedelta(days=40)
        return Vendor(
            uploads={YESTERDAY: [video(1, labels=(501,), cost=900), video(2, author='dr1', labels=(501, 503), cost=0)]},
            spend={YESTERDAY: [video(1, labels=(501,), cost=100), video(5, day=old, cost=40), video(2, cost=0)]},
            relations={(1, YESTERDAY): [relation(100, 250), relation(30, 0, platform=10)], (5, YESTERDAY): [relation(40, 20)]})

    def test_a_run_snapshots_accounts_maps_labels_and_writes_uploads_spend_and_gmv(self):
        vendor = self.vendor()
        result = team.sync(self.conn, client_for(vendor), today=TODAY)
        self.assertEqual((result['accounts'], result['director_labels'], result['labels_unmapped']), (4, 3, 2))
        self.assertEqual(self.execute('SELECT COUNT(*) FROM cloud_video.account_snapshots WHERE snapshot_date = %s', (TODAY,)), [(4,)])
        videos = self.execute('SELECT video_id, director_label_ids, total_stat_cost FROM cloud_video.finished_videos ORDER BY 1')
        self.assertEqual([(v, ids, None if c is None else float(c)) for v, ids, c in videos],
                         [(1, [501], 900.0), (2, [501, 503], 0.0), (5, [], None)])  # an old video joins through its spend
        rows = self.execute('SELECT video_id, spend, pay_order_amount, other_platform_spend, list_spend '
                            'FROM cloud_video.finished_spend_daily WHERE stat_date = %s ORDER BY 1', (YESTERDAY,))
        self.assertEqual([(v, float(s), float(g), float(o), float(l)) for v, s, g, o, l in rows],
                         [(1, 100.0, 250.0, 30.0, 100.0), (5, 40.0, 20.0, 0.0, 40.0)])
        days = dict(self.execute("SELECT kind, status FROM cloud_video.team_sync_days WHERE stat_date = %s", (YESTERDAY,)))
        self.assertEqual(days, {'uploads': 'complete', 'spend': 'complete'})
        self.assertEqual(result['spend_days'], team.SPEND_DAYS)
        self.assertEqual(result['spend_days_not_complete'], [])

    def test_later_runs_read_only_missing_and_recent_days_and_zero_rows_no_longer_listed(self):
        vendor = self.vendor()
        team.sync(self.conn, client_for(vendor), today=TODAY)
        vendor.spend[YESTERDAY] = [video(1, labels=(501,), cost=70)]
        vendor.relations = {(1, YESTERDAY): [relation(70, 140)]}
        vendor.calls.clear()
        result = team.sync(self.conn, client_for(vendor), today=TODAY)
        self.assertEqual(result['spend_days'], team.RESYNC_DAYS)
        rows = self.execute('SELECT video_id, spend, pay_order_amount, other_platform_spend FROM cloud_video.finished_spend_daily '
                            'WHERE stat_date = %s ORDER BY 1', (YESTERDAY,))
        self.assertEqual([(v, float(s), float(g), float(o)) for v, s, g, o in rows], [(1, 70.0, 140.0, 0.0), (5, 0.0, 0.0, 0.0)])

    def test_a_bounded_backfill_reads_only_its_own_days(self):
        vendor = self.vendor()
        first, last = dt.date(2026, 8, 1), dt.date(2026, 8, 3)
        result = team.sync(self.conn, client_for(vendor), today=TODAY, backfill_from=first, backfill_until=last)
        asked = {(p, b.get('uploadStartTime') or b.get('dyStatCostStartTime')) for p, b in vendor.calls if p == '/openapi/video/list'}
        days = {d for _, d in asked}
        self.assertEqual(days, {'2026-08-01', '2026-08-02', '2026-08-03'})  # no later day, no recent re-read
        self.assertEqual((result['upload_days'], result['spend_days']), (3, 3))
        with self.assertRaises(ValueError):
            team.sync(self.conn, client_for(vendor), today=TODAY, backfill_until=last)
        with self.assertRaises(ValueError):
            team.sync(self.conn, client_for(vendor), today=TODAY, backfill_from=last, backfill_until=first)

    def test_a_dropped_connection_fails_that_day_and_the_run_goes_on(self):
        vendor = self.vendor()
        original = vendor.post
        first, last = dt.date(2026, 8, 1), dt.date(2026, 8, 3)

        def flaky(url, headers, body):
            if body.get('startTime') == '2026-08-02':
                raise ConnectionResetError('TLS cut')
            return original(url, headers, body)
        vendor.post = flaky
        vendor.spend.update({day: [video(1, labels=(501,), cost=10)] for day in (first, dt.date(2026, 8, 2), last)})
        vendor.relations.update({(1, day): [relation(10, 20)] for day in (first, dt.date(2026, 8, 2), last)})
        result = team.sync(self.conn, client_for(vendor), today=TODAY, backfill_from=first, backfill_until=last)
        self.assertEqual(result['spend_days_not_complete'], ['2026-08-02'])
        states = dict(self.execute("SELECT stat_date, status FROM cloud_video.team_sync_days WHERE kind = 'spend' ORDER BY 1"))
        self.assertEqual(states, {first: 'complete', dt.date(2026, 8, 2): 'failed', last: 'complete'})

    def test_a_weekly_recheck_reads_old_complete_days_and_logs_what_changed(self):
        vendor = self.vendor()
        old = TODAY - dt.timedelta(days=20)
        vendor.spend[old] = [video(1, labels=(501,), cost=100)]
        vendor.relations[(1, old)] = [relation(100, 200)]
        team.sync(self.conn, client_for(vendor), today=TODAY)  # 30 days, old one included

        vendor.relations[(1, old)] = [relation(100, 260)]  # the vendor corrects GMV of a day long past
        daily = team.sync(self.conn, client_for(vendor), today=TODAY)
        self.assertEqual(daily['spend_days'], team.RESYNC_DAYS)  # the daily run never reads it again
        gmv = lambda: float(self.execute('SELECT pay_order_amount FROM cloud_video.finished_spend_daily '  # noqa: E731
                                         'WHERE video_id = 1 AND stat_date = %s', (old,))[0][0])
        self.assertEqual(gmv(), 200.0)

        result = team.recheck(self.conn, client_for(vendor), today=TODAY, days=team.RECHECK_DAYS)
        self.assertEqual(result['spend_days'], team.RECHECK_DAYS)
        self.assertEqual(gmv(), 260.0)
        self.assertEqual(result['revisions'], [{'day': str(old), 'spend_before': 100.0, 'spend_after': 100.0,
                                                'gmv_before': 200.0, 'gmv_after': 260.0, 'videos_changed': 1,
                                                'videos_added': 0, 'videos_dropped': 0}])
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'sub', 'rechecks.jsonl')
            team.append_revisions(path, result['revisions'], '2026-11-01T19:30:00+00:00')
            with open(path, encoding='utf-8') as handle:
                lines = [json.loads(line) for line in handle]
        self.assertEqual((lines[0]['day'], lines[0]['gmv_after'], lines[0]['checked_at']), (str(old), 260.0, '2026-11-01T19:30:00+00:00'))
        with self.assertRaises(ValueError):
            team.recheck(self.conn, client_for(vendor), today=TODAY, days=0)

    def test_a_manual_label_mapping_survives_the_name_match(self):
        team.sync(self.conn, client_for(self.vendor()), today=TODAY)
        self.execute("UPDATE cloud_video.director_labels SET account_key = 'dup2', mapping_source = 'manual' WHERE label_id = 502")
        self.execute("UPDATE cloud_video.director_labels SET account_key = 'ed1', mapping_source = 'manual' WHERE label_id = 501")
        team.sync(self.conn, client_for(self.vendor()), today=TODAY)
        self.assertEqual(self.execute('SELECT label_id, account_key, mapping_source FROM cloud_video.director_labels ORDER BY 1'),
                         [(501, 'ed1', 'manual'), (502, 'dup2', 'manual'), (503, None, None)])

    def test_a_list_that_moves_while_read_is_incomplete_and_a_rate_limit_stops_the_run(self):
        vendor = self.vendor()
        rows = [video(k, cost=1000 - k) for k in range(1, 151)]
        vendor.spend[YESTERDAY] = rows
        original = vendor.post

        def moving(url, headers, body):
            reply = original(url, headers, body)
            if body.get('dyStatCostStartTime') and body.get('pageNo') == 2:
                reply['data']['total'] += 1  # a video started spending between the two pages
            return reply
        vendor.post = moving
        result = team.sync(self.conn, client_for(vendor), today=TODAY)
        self.assertEqual(result['spend_days_not_complete'], [str(YESTERDAY)])
        self.assertEqual(self.execute("SELECT status FROM cloud_video.team_sync_days WHERE kind = 'spend' AND stat_date = %s",
                                      (YESTERDAY,)), [('incomplete',)])

        vendor.post = original
        vendor.fail['/openapi/video/relation/third/material/list'] = cvc.RATE_LIMITED
        result = team.sync(self.conn, client_for(vendor), today=TODAY)
        failed = self.execute("SELECT stat_date FROM cloud_video.team_sync_days WHERE kind = 'spend' AND status = 'failed'")
        self.assertEqual(len(failed), 1)  # the first day still limited after the retries stops the run
        self.assertEqual(len(result['spend_days_not_complete']), 1)


if __name__ == '__main__':
    unittest.main()
