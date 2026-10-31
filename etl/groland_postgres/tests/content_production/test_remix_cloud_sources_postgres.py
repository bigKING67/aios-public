"""Disposable database: revalidate cloud originals at execution and publication."""
import hashlib
import os
from pathlib import Path
import sys
import unittest
import uuid

import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import remix_cloud_sources as sources
from content_production.queue import verify_source_rows

DB = os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL")


@unittest.skipUnless(DB, "requires disposable database with cloud_video migration")
class CloudSourcePostgresTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        self.cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        self.addCleanup(self.cursor.close)
        ident = uuid.uuid4()
        self.video = ident.int & 0x7fffffffffffffff
        self.asset = {"assetId": str(ident), "sha256": hashlib.sha256(ident.bytes).hexdigest(),
                      "objectKey": f"cloud-video://{self.video}"}
        self.cursor.execute("""INSERT INTO ads.marketing_content_assets
            (asset_id,title,asset_status,source_type,bucket,raw_object_key,raw_sha256)
            VALUES (%s,'cloud source contract','ready','cloud_video','cloud_video',%s,%s)""",
                            (self.asset["assetId"], self.asset["objectKey"], self.asset["sha256"]))
        self.cursor.execute("""INSERT INTO cloud_video.videos
            (video_id,name,video_type,url_path,outer_host,inner_host,asset_id,file_sha256)
            VALUES (%s,'cloud source',0,'/fixture.mp4','fixture-sucaiwang.sucaicloud.com:9001',
                    'fixture-sucaiwang-inner.sucaicloud.com',%s,%s)""",
                            (self.video, self.asset["assetId"], self.asset["sha256"]))

    def test_verified_mapping_resolves_and_revalidates_with_row_locks(self):
        url = sources.resolve(self.cursor, self.asset, lock=True)
        self.assertEqual(url, "https://fixture-sucaiwang.sucaicloud.com:9001/fixture.mp4")
        verify_source_rows(self.cursor, {"assets": [self.asset]}, "actual-output-bucket", lock=True)

    def test_vendor_identity_hash_and_asset_rights_changes_each_reject(self):
        mutations = [
            ("UPDATE cloud_video.videos SET file_sha256=NULL WHERE video_id=%s", (self.video,)),
            ("UPDATE cloud_video.videos SET asset_id=NULL WHERE video_id=%s", (self.video,)),
            ("UPDATE cloud_video.videos SET video_type=1 WHERE video_id=%s", (self.video,)),
        ] + [(f"UPDATE ads.marketing_content_assets SET {clause} WHERE asset_id=%s", (self.asset["assetId"],))
             for clause in ["is_deleted=TRUE", "repurpose_allowed=FALSE", "authorization_status='restricted'",
                            "authorization_starts_at=CURRENT_DATE+1", "authorization_expires_at=CURRENT_DATE-1",
                            "asset_status='failed'", "bucket='wrong-bucket'", "source_type='manual_upload'",
                            "raw_object_key='cloud-video://1'", "raw_sha256=REPEAT('0',64)"]]
        for sql, params in mutations:
            with self.subTest(sql=sql):
                self.cursor.execute("SAVEPOINT mutation")
                self.cursor.execute(sql, params)
                with self.assertRaises(RuntimeError):
                    verify_source_rows(self.cursor, {"assets": [self.asset]}, "actual-output-bucket")
                self.cursor.execute("ROLLBACK TO SAVEPOINT mutation")

    def test_other_frozen_video_id_cannot_read_the_same_asset(self):
        with self.assertRaises(RuntimeError):
            sources.resolve(self.cursor, {**self.asset, "objectKey": f"cloud-video://{self.video + 1}"})


if __name__ == "__main__":
    unittest.main()
