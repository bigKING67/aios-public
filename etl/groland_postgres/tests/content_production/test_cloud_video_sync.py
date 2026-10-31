import datetime as dt
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import cloud_video_client as cvc  # noqa: E402
from content_production import cloud_video_sync as cvs  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')
TODAY = dt.date(2026, 10, 29)
OUTER = 'youmou-sucaiwang.sucaicloud.com:9001'
INNER = 'youmou-sucaiwang-inner.sucaicloud.com'


def item(video_id, *, name='10.20-蜜粉-混剪裂变', created='2026-10-20 18:00:00', cost=0.0, labels=(), inner=False, size=12):
    host = INNER if inner else OUTER
    return {'videoId': video_id, 'name': name, 'videoType': 0, 'createTime': created, 'shootTime': '2026-10-20 00:00:00',
            'duration': 168, 'fileSize': size, 'rawMd5': 'ab' * 16, 'totalStatCost': cost,
            'videoUrl': f'https://{host}/sucaiwang/sucaiwang/100053/{video_id}/f.mp4',
            'coverUrl': f'https://{INNER}/cover/{video_id}.jpg',
            'oneLevelVideoType': {'id': 73180, 'name': '百雀香粉'}, 'twoLevelVideoType': {'id': 86071, 'name': '花悦二组'},
            'videoLabels': [{'id': i, 'name': n} for i, n in enumerate(labels)]}


class FakeTransport:
    def __init__(self, pages):
        self.pages, self.requests = pages, []

    def post(self, url, headers, body):
        self.requests.append((url, headers, body))
        path = url.split('sucaicloud.com', 1)[1]
        if path == '/openapi/auth/access_token':
            return {'code': 1, 'success': True, 'data': {'accessToken': 'tok'}}
        if path == '/openapi/account/list':
            return {'code': 1, 'success': True, 'data': {'list': [{'accountKey': 'acc'}]}}
        return {'code': 1, 'success': True, 'data': self.pages(body)}


def client_for(pages):
    return cvc.CloudVideoClient('https://sucaiwang-open-api.sucaicloud.com', 'key', 'secret', transport=FakeTransport(pages),
                                clock=lambda: 1_800_000_000.0, sleep=lambda _s: None)


class SignTest(unittest.TestCase):
    def test_matches_the_vendor_example(self):
        params = {'access_token': 'aaa', 'account_key': 'aaa', 'company_key': 'aaa', 'nonce': 'aaaaaa', 'pageNo': 1,
                  'pageSize': 20, 'timestamp': 213123123123, 'sign': 'ignored'}
        expected = hashlib.md5(b'access_token=aaa&account_key=aaa&company_key=aaa&nonce=aaaaaa&pageNo=1&pageSize=20'
                               b'&timestamp=213123123123&company_secret=aaa').hexdigest().upper()
        self.assertEqual(cvc.sign(params, 'aaa'), expected)

    def test_values_are_url_encoded_with_upper_case_hex_and_nested_values_skipped(self):
        signed = cvc.sign({'name': '香粉 a', 'list': [1]}, 's')
        self.assertEqual(signed, hashlib.md5('name=%E9%A6%99%E7%B2%89%20a&company_secret=s'.encode()).hexdigest().upper())

    def test_token_errors_refresh_and_rate_limits_back_off(self):
        calls = {'n': 0}

        def pages(body):
            calls['n'] += 1
            if calls['n'] == 1:
                raise AssertionError('unreachable')
            return {'list': [], 'totalPage': 0}
        transport = FakeTransport(pages)
        responses = iter([{'code': 20013, 'success': False, 'info': 'expired'}, {'code': 20002, 'success': False, 'info': 'busy'}])
        original = transport.post

        def post(url, headers, body):
            if url.endswith('/openapi/video/list'):
                try:
                    return next(responses)
                except StopIteration:
                    return {'code': 1, 'success': True, 'data': {'list': [], 'totalPage': 0}}
            return original(url, headers, body)
        transport.post = post
        client = cvc.CloudVideoClient('https://x.sucaicloud.com', 'k', 's', transport=transport, clock=lambda: 0.0, sleep=lambda _s: None)
        self.assertEqual(client.videos({}), [])
        self.assertEqual(sum(1 for url, *_ in transport.requests if url.endswith('access_token')), 2)

    def test_dropped_connections_are_retried_with_fresh_headers(self):
        transport = FakeTransport(lambda body: {'list': [], 'totalPage': 0})
        original, failures, sleeps = transport.post, iter([ConnectionResetError(), cvc.ssl.SSLEOFError()]), []

        def post(url, headers, body):
            error = next(failures, None)
            if error:
                raise error
            return original(url, headers, body)
        transport.post = post
        client = cvc.CloudVideoClient('https://x.sucaicloud.com', 'k', 's', transport=transport, clock=lambda: 0.0, sleep=sleeps.append)
        self.assertEqual(client.videos({}), [])
        self.assertEqual(sleeps, [1, 2])

    def test_no_call_is_retried_more_than_three_times(self):
        transport, sleeps = FakeTransport(lambda body: {}), []

        def post(url, headers, body):
            transport.requests.append(url)
            raise ConnectionResetError()
        transport.post = post
        client = cvc.CloudVideoClient('https://x.sucaicloud.com', 'k', 's', transport=transport, clock=lambda: 0.0, sleep=sleeps.append)
        with self.assertRaises(ConnectionResetError):
            client.videos({})
        self.assertEqual((len(transport.requests), sleeps), (cvc.MAX_RETRIES + 1, [1, 2, 4]))

    def test_requests_stay_within_the_rate_limit(self):
        now, sleeps = [0.0], []

        def sleep(seconds):
            sleeps.append(seconds)
            now[0] += seconds
        client = cvc.CloudVideoClient('https://x.sucaicloud.com', 'k', 's', transport=FakeTransport(lambda body: {}),
                                      clock=lambda: now[0], sleep=sleep)
        for _ in range(cvc.RATE_PER_MINUTE):
            client._throttle()
            now[0] += 0.1
        self.assertEqual(sleeps, [])
        client._throttle()  # the next request waits until the first one is 60 s old
        self.assertEqual([round(x, 6) for x in sleeps], [round(60 - cvc.RATE_PER_MINUTE * 0.1, 6)])
        self.assertLessEqual(cvc.RATE_PER_MINUTE, 100)

    def test_concurrent_calls_never_exceed_the_concurrency_limit(self):
        import threading
        running, peak, guard = [0], [0], threading.Lock()

        def pages(body):
            with guard:
                running[0] += 1
                peak[0] = max(peak[0], running[0])
            threading.Event().wait(0.02)
            with guard:
                running[0] -= 1
            return {'list': [], 'total': 0}
        client = client_for(pages)
        client.each(lambda n: client.call('/openapi/video/list', {'n': n}), range(12), workers=10)
        self.assertEqual(peak[0], cvc.MAX_CONCURRENCY)
        self.assertLessEqual(cvc.MAX_CONCURRENCY, 10)

    def test_video_pages_reads_every_page_and_reports_the_totals_seen(self):
        def pages(body):
            page = body['pageNo']
            return {'list': [item(page * 1000 + k) for k in range(cvc.PAGE_SIZE if page < 3 else 5)],
                    'totalPage': 3, 'total': 205 if page < 3 else 206}
        rows, totals = client_for(pages).video_pages({'videoType': 0})
        self.assertEqual((len(rows), len({r['videoId'] for r in rows}), totals), (205, 205, {205, 206}))

    def test_the_api_lock_admits_one_holder_and_waits_for_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'sub', 'api.lock')
            with cvc.api_lock(path):
                with self.assertRaises(TimeoutError):
                    with cvc.api_lock(path, wait=0):
                        pass
                waits = []
                with self.assertRaises(TimeoutError):
                    with cvc.api_lock(path, wait=10, poll=5, sleep=waits.append):
                        pass
                self.assertEqual(waits, [5, 5])
            with cvc.api_lock(path, wait=0):  # released
                pass

    def test_the_spend_list_is_read_only_down_to_the_lowest_eligible_spend(self):
        asked = []

        def pages(body):
            asked.append(body.get('pageNo'))
            first = 3000 - (body['pageNo'] - 1) * 2000
            return {'list': [item(body['pageNo'] * 1000 + i, cost=first - i) for i in range(cvc.PAGE_SIZE)], 'totalPage': 9}
        rows, spend, _inner = cvs.fetch(client_for(pages), 73180, TODAY, 1000)
        self.assertEqual(asked[:2], [1, 2])  # page 2 ends at 901, so page 3 is never asked
        self.assertNotIn(3, asked)
        self.assertEqual(len(rows), cvc.PAGE_SIZE + 1)  # page 1 and the one row of page 2 at 1000
        self.assertTrue(all(value >= 1000 for value in spend.values()))

    def test_paging_reads_every_page(self):
        def pages(body):
            rows = [item(body['pageNo'] * 1000 + i) for i in range(cvc.PAGE_SIZE if body['pageNo'] == 1 else 3)]
            return {'list': rows, 'totalPage': 2}
        self.assertEqual(len(client_for(pages).videos({'x': 1})), cvc.PAGE_SIZE + 3)


class JudgeTest(unittest.TestCase):
    def at(self, day):
        return dt.datetime.combine(day, dt.time(12), tzinfo=cvs.BUSINESS_TZ)

    def test_rules(self):
        recent, old = self.at(TODAY - dt.timedelta(days=5)), self.at(TODAY - dt.timedelta(days=25))
        self.assertEqual(cvs.judge(6000, old, True, TODAY, 1000)[0], 'ge_5k')  # 抽帧 only matters below 5k
        self.assertEqual(cvs.judge(1500, recent, False, TODAY, 1000)[0], 'recent_ge_1k')
        self.assertIsNone(cvs.judge(1500, recent, True, TODAY, 1000)[0])
        self.assertIsNone(cvs.judge(800, recent, False, TODAY, 1000)[0])
        self.assertIsNone(cvs.judge(1500, old, False, TODAY, 1000)[0])
        self.assertEqual(cvs.judge(1500, self.at(TODAY - dt.timedelta(days=20)), False, TODAY, 1000)[0], 'recent_ge_1k')
        self.assertIsNone(cvs.judge(1500, None, False, TODAY, 1000)[0])

    def test_window_is_the_30_complete_days_before_today(self):
        self.assertEqual(cvs.window(TODAY), (dt.date(2026, 9, 29), dt.date(2026, 10, 28)))

    def test_record_maps_paths_hosts_and_choufen(self):
        row = cvs.record(item(7, labels=('【工具抽帧】',)), INNER, 0.0, TODAY, 1000)
        self.assertEqual((row['url_path'], row['outer_host'], row['inner_host']), ('/sucaiwang/sucaiwang/100053/7/f.mp4', OUTER, INNER))
        self.assertTrue(row['is_choufen'])
        self.assertEqual(row['cover_host'], INNER)
        self.assertTrue(cvs.is_choufen({'name': '【抽帧】8.14-蜜粉'}))


class PinnedTest(unittest.TestCase):
    def setUp(self):
        cvc._resolved.clear()

    def test_real_address_comes_from_public_dns_and_is_cached(self):
        calls = []

        def opener(url, timeout):
            calls.append(url)
            return FakeResponse(json.dumps({'Answer': [{'type': 5, 'data': 'x.'}, {'type': 1, 'data': '172.18.33.110'}]}).encode())
        self.assertEqual(cvc.real_address(INNER, opener), '172.18.33.110')
        self.assertEqual(cvc.real_address(INNER, opener), '172.18.33.110')
        self.assertEqual(len(calls), 1)
        self.assertIn('name=youmou-sucaiwang-inner.sucaicloud.com', calls[0])

    def test_unresolvable_falls_back_to_the_system_resolver(self):
        def opener(url, timeout):
            raise OSError('dns down')
        self.assertIsNone(cvc.real_address('a.example', opener))
        with unittest.mock.patch.object(cvc, 'real_address', return_value=None), \
                unittest.mock.patch.object(cvc.urllib.request, 'urlopen', return_value='plain') as plain:
            self.assertEqual(cvc.pinned_open('https://a.example/f.mp4'), 'plain')
            plain.assert_called_once()

    def test_api_calls_go_through_the_pinned_connection(self):
        calls = []

        def opener(url, timeout, **kwargs):
            calls.append((url, kwargs['method'], json.loads(kwargs['body'])))
            return FakeResponse(b'{"code": 1}')
        with unittest.mock.patch.object(cvc, 'pinned_open', opener):
            self.assertEqual(cvc.Transport().post('https://api.example/openapi/x', {'sign': 's'}, {'a': 1}), {'code': 1})
        self.assertEqual(calls, [('https://api.example/openapi/x', 'POST', {'a': 1})])

    def test_a_pinned_connection_keeps_the_host_name_for_tls(self):
        conn = cvc._PinnedHTTPSConnection('youmou-sucaiwang-inner.sucaicloud.com', '172.18.33.110', port=443)
        self.assertEqual((conn.host, conn._address), ('youmou-sucaiwang-inner.sucaicloud.com', '172.18.33.110'))


class FakeResponse(io.BytesIO):
    def __init__(self, body, length=None):
        super().__init__(body)
        self.headers = {} if length is None else {'Content-Length': str(length)}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@unittest.skipUnless(DB, 'disposable database required')
class SyncDbTest(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM cloud_video.videos')
        self.conn.commit()
        self.cache = tempfile.TemporaryDirectory()
        self.addCleanup(self.cache.cleanup)

    def pages(self, window_rows, recent_rows):
        def pages(body):
            if body.get('isInner') == 1:
                return {'list': [item(1, inner=True)], 'totalPage': 1}
            return {'list': window_rows if body.get('orderByType') == 9 else recent_rows, 'totalPage': 1}
        return pages

    def rows(self):
        with self.conn.cursor() as cur:
            cur.execute('SELECT video_id, eligibility, window_spend, file_sha256, inner_host FROM cloud_video.videos ORDER BY video_id')
            return cur.fetchall()

    def test_sync_judges_hashes_prunes_and_rejudges(self):
        body = b'video-bytes!'
        window_rows = [item(1, cost=9000, created='2026-08-01 10:00:00', size=len(body)), item(2, cost=1200, size=len(body)),
                       item(3, cost=800, size=len(body))]  # below the lowest eligible spend: not recorded
        recent_rows = [item(4, size=len(body))]  # the recent-upload list is no longer read
        other = item(9, cost=99999, size=len(body))
        other['oneLevelVideoType'] = {'id': 166150, 'name': '美白防晒气垫'}
        window_rows.append(other)  # the vendor's date branch may return another 分类: dropped locally
        client = client_for(self.pages(window_rows, recent_rows))
        result = cvs.sync(self.conn, client, type_id=73180, today=TODAY, low_min=1000)
        self.assertEqual((result['videos'], result['ge_5k'], result['recent_ge_1k']), (2, 1, 1))
        self.assertEqual([(r[0], r[1]) for r in self.rows()], [(1, 'ge_5k'), (2, 'recent_ge_1k')])
        with self.conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM cloud_video.spend_daily WHERE stat_date = %s', (TODAY,))
            self.assertEqual(cur.fetchone()[0], 2)

        stray = Path(self.cache.name) / ('f' * 64 + '.mp4')
        stray.write_bytes(b'old')
        opened = []
        result = cvs.hash_pending(self.conn, self.cache.name, type_id=73180, limit=10,
                                  opener=lambda url, timeout: opened.append(url) or FakeResponse(body))
        self.assertEqual(result, {'hashed': 2, 'hash_failed': 0})
        self.assertTrue(all(url.startswith(f'https://{INNER}/') for url in opened))
        sha = hashlib.sha256(body).hexdigest()
        self.assertTrue(cvs.cache_path(self.cache.name, sha).exists())
        self.assertEqual(cvs.prune_cache(self.conn, self.cache.name), {'cache_removed': 1})
        self.assertFalse(stray.exists())

        # A day later video 2 left the window list: it is judged again with no spend and drops out.
        client = client_for(self.pages([item(1, cost=9000, created='2026-08-01 10:00:00', size=len(body))], []))
        result = cvs.sync(self.conn, client, type_id=73180, today=TODAY + dt.timedelta(days=1), low_min=1000)
        self.assertEqual(result['re_judged'], 1)
        self.assertEqual([(r[0], r[1]) for r in self.rows()][:2], [(1, 'ge_5k'), (2, None)])

    def test_the_vendor_file_size_is_not_the_served_file_and_stays_for_change_detection(self):
        client = client_for(self.pages([item(6, cost=8000, size=999)], []))
        cvs.sync(self.conn, client, type_id=73180, today=TODAY, low_min=1000)
        result = cvs.hash_pending(self.conn, self.cache.name, type_id=73180, limit=10,
                                  opener=lambda url, timeout: FakeResponse(b'served', length=6))
        self.assertEqual(result, {'hashed': 1, 'hash_failed': 0})
        cvs.sync(self.conn, client, type_id=73180, today=TODAY, low_min=1000)  # unchanged: the hash stays
        with self.conn.cursor() as cur:
            cur.execute('SELECT file_sha256, file_size FROM cloud_video.videos WHERE video_id = 6')
            self.assertEqual(cur.fetchone(), (hashlib.sha256(b'served').hexdigest(), 999))

    def test_a_short_download_is_recorded_and_nothing_cached(self):
        client = client_for(self.pages([item(5, cost=8000, size=999)], []))
        cvs.sync(self.conn, client, type_id=73180, today=TODAY, low_min=1000)
        result = cvs.hash_pending(self.conn, self.cache.name, type_id=73180, limit=10,
                                  opener=lambda url, timeout: FakeResponse(b'short', length=999))
        self.assertEqual(result, {'hashed': 0, 'hash_failed': 1})
        with self.conn.cursor() as cur:
            cur.execute('SELECT file_sha256, hash_error FROM cloud_video.videos WHERE video_id = 5')
            sha, error = cur.fetchone()
        self.assertIsNone(sha)
        self.assertIn('服务器声明 999', error)
        self.assertEqual(list(Path(self.cache.name).glob('*')), [])


if __name__ == '__main__':
    unittest.main()
