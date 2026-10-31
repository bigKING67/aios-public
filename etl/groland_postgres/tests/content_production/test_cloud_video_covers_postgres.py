"""Disposable-database contract for 视频云管家 original covers made on the desktop."""
import hashlib
import io
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import cloud_video_covers as covers  # noqa: E402
from content_production import cloud_video_sync  # noqa: E402

DB = os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL')


class FakeResponse(io.BytesIO):
    def __init__(self, body):
        super().__init__(body)
        self.headers = {'Content-Length': str(len(body))}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FakeStorage:
    def __init__(self, fail=False):
        self.config, self.fail, self.uploads = SimpleNamespace(bucket='bql-media'), fail, []

    def upload_file(self, key, path, content_type):
        if self.fail:
            raise OSError('storage down')
        self.uploads.append((key, Path(path).read_bytes(), content_type))


def frame(source, target):
    target.write_bytes(b'webp:' + Path(source).read_bytes()[:8])


@unittest.skipUnless(DB, 'disposable database required')
class CloudVideoCoversTest(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        covers._retry_after.clear()
        self.execute("UPDATE ads.marketing_content_assets SET is_deleted = TRUE WHERE bucket = 'cloud_video'")
        self.work = Path(tempfile.mkdtemp())
        self.cache = Path(tempfile.mkdtemp())
        self.body = f'cloud-bytes-{uuid.uuid4()}'.encode()
        self.sha = hashlib.sha256(self.body).hexdigest()
        self.asset = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id, title, asset_type, asset_status, source_type,
            bucket, raw_object_key, raw_sha256) VALUES (%s, '10.20-蜜粉-实拍', 'video', 'ready', 'cloud_video', 'cloud_video', %s, %s)""",
                     (self.asset, f'cloud-video://{self.asset}', self.sha))
        video_id = uuid.uuid4().int % 10**9
        self.execute("""INSERT INTO cloud_video.videos (video_id, name, video_type, url_path, outer_host, inner_host, asset_id)
            VALUES (%s, 'v', 0, '/p/f.mp4', 'youmou-sucaiwang.sucaicloud.com:9001', 'youmou-sucaiwang-inner.sucaicloud.com', %s)""",
                     (video_id, self.asset))

    def execute(self, sql, params=()):
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else None
        self.conn.commit()
        return rows

    def cover(self):
        [(key,)] = self.execute('SELECT cover_object_key FROM ads.marketing_content_assets WHERE asset_id = %s', (self.asset,))
        return key

    def test_a_cached_original_gets_a_cover_once(self):
        cloud_video_sync.cache_path(self.cache, self.sha).write_bytes(self.body)
        storage = FakeStorage()
        self.assertEqual(covers.sweep(self.conn, storage, self.cache, self.work, extract=frame), {'covered': 1, 'failed': 0})
        [(key, data, content_type)] = storage.uploads
        self.assertEqual((self.cover(), content_type), (key, 'image/webp'))
        self.assertRegex(key, rf'^cover/\d{{4}}/\d{{2}}/{self.asset}/{hashlib.sha256(data).hexdigest()}\.webp$')
        [(bucket, size)] = self.execute("""SELECT bucket, size_bytes FROM ads.marketing_content_asset_objects
            WHERE asset_id = %s AND object_role = 'cover' AND status = 'active'""", (self.asset,))
        self.assertEqual((bucket, size), ('bql-media', len(data)))  # the storage bucket, not the cloud marker
        self.assertEqual(covers.sweep(self.conn, storage, self.cache, self.work, extract=frame), {'covered': 0, 'failed': 0})
        self.assertEqual(list(self.work.iterdir()), [])

    def test_an_uncached_original_is_read_through_the_inner_address_and_hash_checked(self):
        asked = []

        def opener(url, timeout):
            asked.append(url)
            return FakeResponse(self.body)
        storage = FakeStorage()
        self.assertEqual(covers.sweep(self.conn, storage, self.cache, self.work, extract=frame, opener=opener)['covered'], 1)
        self.assertEqual(asked, ['https://youmou-sucaiwang-inner.sucaicloud.com/p/f.mp4'])
        self.assertEqual(list(self.work.iterdir()), [])

    def test_a_failed_frame_waits_before_the_next_try(self):
        now = [1000.0]
        wrong = lambda url, timeout: FakeResponse(b'another file')  # noqa: E731
        result = covers.sweep(self.conn, FakeStorage(), self.cache, self.work, extract=frame, opener=wrong, clock=lambda: now[0])
        self.assertEqual(result, {'covered': 0, 'failed': 1})
        self.assertEqual(covers.sweep(self.conn, FakeStorage(), self.cache, self.work, extract=frame, opener=wrong,
                                      clock=lambda: now[0])['failed'], 0)
        now[0] += covers.RETRY_SECONDS + 1
        cloud_video_sync.cache_path(self.cache, self.sha).write_bytes(self.body)
        self.assertEqual(covers.sweep(self.conn, FakeStorage(), self.cache, self.work, extract=frame,
                                      clock=lambda: now[0])['covered'], 1)

    def test_a_storage_outage_records_nothing_and_is_retried(self):
        cloud_video_sync.cache_path(self.cache, self.sha).write_bytes(self.body)
        result = covers.sweep(self.conn, FakeStorage(fail=True), self.cache, self.work, extract=frame)
        self.assertEqual(result, {'covered': 0, 'failed': 0, 'deferred': True})
        self.assertIsNone(self.cover())
        self.assertEqual(covers.sweep(self.conn, FakeStorage(), self.cache, self.work, extract=frame)['covered'], 1)


if __name__ == '__main__':
    unittest.main()
