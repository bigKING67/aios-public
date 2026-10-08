"""Segment cover frames: timing, keys and the evidence-only sweep (disposable DB for the sweep)."""
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production import segment_covers  # noqa: E402

DB = os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL")


class CoverMathTests(unittest.TestCase):
    def test_frame_is_the_opening_shot(self):
        # 0.5 s past the (shot-snapped) start, never past a third of a short segment.
        self.assertEqual(segment_covers.cover_time_ms(38_400, 161_000), 38_900)
        self.assertEqual(segment_covers.cover_time_ms(0, 900), 300)

    def test_key_is_bounded_by_segment_and_range(self):
        key = segment_covers.cover_key("s-1", 0, 38_400, datetime(2026, 9, 30, tzinfo=timezone.utc))
        self.assertEqual(key, "segment-cover/2026/09/s-1-0-38400-opening.webp")
        self.assertEqual(segment_covers.cover_range(0, 38_400), "opening:0-38400")


class FakeStorage:
    class config:
        bucket = "fixture-bucket"

    def __init__(self):
        self.uploads = []

    def presign_get_url(self, key, ttl):
        return f"https://tos.invalid/{key}?sig"

    def upload_file(self, key, path, content_type):
        self.uploads.append((key, path.read_bytes(), content_type))


@unittest.skipUnless(DB, "requires disposable database with migrations 021-032")
class CoverSweepTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        sha = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        self.asset = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,raw_object_key,
            preview_object_key,raw_sha256,duration_seconds) VALUES (%s,'cover source','ready','fixture-bucket',
            'raw/s.mp4','preview/s.mp4',%s,60)""", (self.asset, sha))
        self.segments = {}
        for name, start, end, status in [("confirmed", 0, 9_000, "confirmed"), ("suggested", 9_000, 30_000, "suggested"),
                                         ("rejected", 30_000, 40_000, "rejected")]:
            segment = str(uuid.uuid4())
            self.execute("""INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,
                end_ms,preset_key,preset_version,label_key,origin,status,confirmed_by,confirmed_at) VALUES (%s,'u',%s,%s,%s,%s,
                'framework',1,'mixed_voiceover','ai',%s,CASE WHEN %s THEN 'u' END,CASE WHEN %s THEN NOW() END)""",
                         (segment, self.asset, sha, start, end, status, status == "confirmed", status == "confirmed"))
            self.segments[name] = segment

    def execute(self, sql, params=()):
        with self.conn.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall() if cursor.description else None
        self.conn.commit()
        return rows

    def evidence(self, name):
        return self.execute("SELECT evidence, revision FROM ads.content_segments WHERE segment_id=%s",
                            (self.segments[name],))[0]

    def sweep(self, storage, extract):
        with tempfile.TemporaryDirectory() as folder:
            return segment_covers.sweep(self.conn, storage, Path(folder), limit=50, extract=extract)

    def test_covers_live_segments_once_and_redoes_them_when_bounds_change(self):
        frames = []

        def extract(url, seconds, target, env):
            frames.append((url, seconds))
            target.write_bytes(b"webp")
        storage = FakeStorage()
        result = self.sweep(storage, extract)
        self.assertGreaterEqual(result["covered"], 2)
        mine = [f for f in frames if "preview/s.mp4" in f[0]]
        self.assertEqual(sorted(seconds for _, seconds in mine), [0.5, 9.5])  # opening shots of 0-9 s and 9-30 s
        evidence, revision = self.evidence("confirmed")
        self.assertEqual(evidence["coverRange"], "opening:0-9000")
        self.assertTrue(evidence["coverKey"].endswith(f"{self.segments['confirmed']}-0-9000-opening.webp"))
        self.assertEqual(revision, 1)  # derived data, not an edit
        self.assertNotIn("coverKey", self.evidence("rejected")[0] or {})

        frames.clear()
        self.sweep(storage, extract)
        self.assertFalse([f for f in frames if "preview/s.mp4" in f[0]])  # nothing pending

        self.execute("UPDATE ads.content_segments SET end_ms=12000 WHERE segment_id=%s", (self.segments["confirmed"],))
        self.sweep(storage, extract)
        self.assertEqual(self.evidence("confirmed")[0]["coverRange"], "opening:0-12000")

        # A cover made under an older rule is redone.
        self.execute("""UPDATE ads.content_segments SET evidence = evidence || '{"coverRange": "0-12000"}'::JSONB
            WHERE segment_id=%s""", (self.segments["confirmed"],))
        frames.clear()
        self.sweep(storage, extract)
        self.assertEqual([s for u, s in frames if "preview/s.mp4" in u], [0.5])

    def test_fresh_suggestions_are_covered_from_the_local_original(self):
        storage = FakeStorage()
        seen = []

        def extract(source, seconds, target, env):
            seen.append((source, seconds))
            target.write_bytes(b"local")
        segment = {"segment_id": self.segments["suggested"], "start_ms": 9_000, "end_ms": 30_000}
        with tempfile.TemporaryDirectory() as folder:
            done = segment_covers.cover_from_file(self.conn, storage, Path(folder) / "source.mp4", [segment],
                                                  Path(folder), extract=extract)
        self.assertEqual(done, 1)
        self.assertEqual([s for _, s in seen], [9.5])
        self.assertTrue(seen[0][0].endswith("source.mp4"))
        self.assertEqual(self.evidence("suggested")[0]["coverRange"], "opening:9000-30000")

    def test_a_failed_frame_is_not_retried_until_the_bounds_change(self):
        def broken(url, seconds, target, env):
            raise RuntimeError("no frame")
        storage = FakeStorage()
        self.sweep(storage, broken)
        evidence = self.evidence("suggested")[0]
        self.assertEqual(evidence["coverFailedRange"], "opening:9000-30000")
        self.assertNotIn("coverKey", evidence)
        calls = []
        self.sweep(storage, lambda url, s, t, e: calls.append(url) or t.write_bytes(b"x"))
        self.assertFalse([c for c in calls if "preview/s.mp4" in c])

    def test_a_storage_outage_marks_nothing_and_is_retried(self):
        class Down(FakeStorage):
            def upload_file(self, key, path, content_type):
                raise OSError("tos unavailable")
        result = self.sweep(Down(), lambda url, s, t, e: t.write_bytes(b"x"))
        self.assertTrue(result.get("deferred"))
        self.assertNotIn("coverFailedRange", self.evidence("suggested")[0])
        storage = FakeStorage()
        self.sweep(storage, lambda url, s, t, e: t.write_bytes(b"x"))
        self.assertIn("coverKey", self.evidence("suggested")[0])


if __name__ == "__main__":
    unittest.main()
