"""Disposable DB only: framework remix outputs are registered once with segment lineage."""
import hashlib
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
from unittest.mock import patch
import psycopg2
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.run_bridge import reconcile

DB = os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL")


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@unittest.skipUnless(DB, "requires disposable database with migrations 021–032")
class RemixOutputTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"CONTENT_PRODUCTION_RUNS_ENABLED": "true"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.conn = psycopg2.connect(DB)
        self.addCleanup(self.conn.close)
        # The raw asset migration predates these columns; the warehouse adds them later.
        self.execute("""ALTER TABLE ads.marketing_content_assets
          ADD COLUMN IF NOT EXISTS product_names TEXT[] DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
          ADD COLUMN IF NOT EXISTS uploaded_by_user_id TEXT""")
        self.product = f"精华-{uuid.uuid4().hex[:8]}"
        self.source, self.source_sha = str(uuid.uuid4()), sha(str(uuid.uuid4()))
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,raw_object_key,
            raw_sha256,duration_seconds,product_name,tags) VALUES (%s,'remix source','ready','fixture-bucket','raw/s.mp4',%s,60,%s,
            ARRAY['企业:测试', '测试样片'])""",
                     (self.source, self.source_sha, self.product))
        self.segments = []
        for index, (start, end, label) in enumerate([(0, 4000, "mixed_voiceover"), (10000, 15000, "live_demo")]):
            segment = str(uuid.uuid4())
            self.execute("""INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,
                end_ms,preset_key,preset_version,label_key,product_name,origin,status,confirmed_by,confirmed_at)
                VALUES (%s,'annotator',%s,%s,%s,%s,'framework',1,%s,%s,'human','confirmed','annotator',NOW())""",
                         (segment, self.source, self.source_sha, start, end, label, self.product))
            self.segments.append({"segmentId": segment, "assetId": self.source, "startMs": start, "endMs": end,
                                  "labelKey": label, "sourceContentHash": self.source_sha})
        clips = [{"id": f"slot-{i + 1}", "assetId": s["assetId"], "startMs": s["startMs"], "endMs": s["endMs"],
                  "caption": "", "volume": 1.0} for i, s in enumerate(self.segments)]
        self.run, self.project, self.job, self.batch = (str(uuid.uuid4()) for _ in range(4))
        self.key = f"production/{self.project}/{self.job}/video.mp4"
        self.execute("INSERT INTO ads.content_production_projects (project_id,owner_user_id,title,revision) VALUES (%s,'remix-owner','fixture',1)", (self.project,))
        self.execute("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,1,%s)",
                     (self.project, json.dumps({"aspect": "portrait", "clips": clips})))
        self.execute("""INSERT INTO ads.content_production_runs (run_id,owner_user_id,idempotency_key,request,source_snapshot,
            plan_revision,project_id,project_revision) VALUES (%s,'remix-owner',%s,'{}','{}',1,%s,1)""",
                     (self.run, self.run, self.project))
        self.execute("INSERT INTO ads.content_production_plans (run_id,revision,execution_version,document,origin) VALUES (%s,1,1,'{}','user')", (self.run,))
        self.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES (%s,%s,1,FALSE)", (self.job, self.project))
        self.execute("INSERT INTO ads.content_production_run_renders (run_id,execution_version,plan_revision,job_id) VALUES (%s,1,1,%s)", (self.run, self.job))
        self.execute("UPDATE ads.content_production_runs SET status='running',stage='production',render_job_id=%s WHERE run_id=%s", (self.job, self.run))
        self.execute("""INSERT INTO ads.content_remix_batches (batch_id,owner_user_id,idempotency_key,request_digest,
            preset_key,preset_version,structure,constraints,requested_count,planned_count,seed)
            VALUES (%s,'remix-owner',%s,%s,'framework',1,%s,%s,1,1,7)""",
                     (self.batch, self.batch, sha(self.batch), json.dumps({"labels": ["mixed_voiceover", "live_demo"]}),
                      json.dumps({"productName": self.product})))
        self.execute("""INSERT INTO ads.content_remix_batch_runs (batch_id,ordinal,run_id,combination_hash,segments)
            VALUES (%s,1,%s,%s,%s)""", (self.batch, self.run, sha(self.run), json.dumps(self.segments)))
        self.output_sha = sha(self.job)

    def execute(self, sql, params=()):
        with self.conn.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall() if cursor.description else None
        self.conn.commit()
        return rows

    def complete(self, status="completed"):
        receipt = {"host_run_id": self.run, "host_project_id": self.project, "host_revision": 1,
                   "host_execution_version": 1, "host_plan_revision": 1,
                   "host_inspection": {"schema": "aios.media-inspection.v1", "status": "passed", "width": 720,
                                       "height": 1280, "fps": 30, "sha256": self.output_sha, "durationSeconds": 9.0}}
        self.execute("UPDATE ads.content_production_jobs SET status=%s,output_object_key=%s,receipt=%s::JSONB WHERE job_id=%s",
                     (status, self.key if status == "completed" else None, json.dumps(receipt), self.job))

    def run_state(self):
        return self.execute("SELECT status,waiting_reason FROM ads.content_production_runs WHERE run_id=%s", (self.run,))[0]

    def outputs(self):
        return self.execute("""SELECT asset_id,title,source_type,asset_status,raw_object_key,raw_sha256,product_name,
            product_names,owner_user_id,duration_seconds,width,height,bucket FROM ads.marketing_content_assets
            WHERE raw_object_key=%s""", (self.key,))

    def test_success_registers_asset_object_and_lineage_once(self):
        self.complete()
        self.assertEqual(reconcile(self.conn), 1)
        self.assertEqual(self.run_state(), ("succeeded", None))
        [asset] = self.outputs()
        asset_id, title, source_type, status, key, raw_sha, product, products, owner, duration, width, height, bucket = asset
        self.assertEqual((source_type, status, key, raw_sha), ("ai_studio_output", "ready", self.key, self.output_sha))
        self.assertEqual((product, products, owner, bucket), (self.product, [self.product], "remix-owner", "fixture-bucket"))
        self.assertEqual((float(duration), width, height), (9.0, 720, 1280))
        self.assertIn(self.product, title)
        # Only the enterprise tag is inherited, keeping the output in its enterprise's studio scope.
        self.assertEqual(self.execute("SELECT tags FROM ads.marketing_content_assets WHERE asset_id=%s", (asset_id,)),
                         [(["企业:测试"],)])
        objects = self.execute("SELECT object_role,object_key,sha256,status FROM ads.marketing_content_asset_objects WHERE asset_id=%s", (asset_id,))
        self.assertEqual(objects, [("raw", self.key, self.output_sha, "active")])
        jobs = self.execute("""SELECT job_type,status,input_object_key,output_object_key
            FROM ads.marketing_content_asset_processing_jobs WHERE asset_id=%s ORDER BY job_type""", (asset_id,))
        self.assertEqual([(t, st, src) for t, st, src, _ in jobs],
                         [("cover", "queued", self.key), ("preview", "queued", self.key)])
        self.assertTrue(jobs[0][3].startswith("cover/") and jobs[0][3].endswith(".webp"))
        self.assertTrue(jobs[1][3].startswith("preview/") and jobs[1][3].endswith(".mp4"))
        lineage = self.execute("""SELECT ordinal,segment_id::TEXT,source_asset_id::TEXT,source_start_ms,source_end_ms
            FROM ads.content_asset_lineage WHERE run_id=%s ORDER BY ordinal""", (self.run,))
        self.assertEqual(lineage, [(i + 1, s["segmentId"], s["assetId"], s["startMs"], s["endMs"])
                                   for i, s in enumerate(self.segments)])
        self.assertEqual(self.execute("SELECT output_asset_id FROM ads.content_remix_batch_runs WHERE run_id=%s", (self.run,)),
                         [(asset_id,)])
        self.assertEqual(self.execute("SELECT status FROM ads.content_remix_batches WHERE batch_id=%s", (self.batch,)),
                         [("succeeded",)])
        # A repeated reconciliation of the same Run never registers a second asset.
        self.execute("UPDATE ads.content_production_runs SET status='running' WHERE run_id=%s", (self.run,))
        self.assertEqual(reconcile(self.conn), 1)
        self.assertEqual(len(self.outputs()), 1)
        self.assertEqual(self.execute("SELECT COUNT(*) FROM ads.content_asset_lineage WHERE run_id=%s", (self.run,)), [(2,)])

    def test_edit_batches_title_their_single_output(self):
        self.execute("UPDATE ads.content_remix_batches SET structure = structure || '{\"mode\": \"edit\"}' WHERE batch_id=%s",
                     (self.batch,))
        self.complete()
        self.assertEqual(reconcile(self.conn), 1)
        [asset] = self.outputs()
        self.assertEqual(asset[1], f"单条剪辑 · {self.product} · {uuid.UUID(self.batch).hex[:8]}")
        [(message, mode)] = self.execute("""SELECT message, payload->>'mode' FROM ads.marketing_content_asset_events
          WHERE asset_id=%s AND event_type='ai_studio_output_created'""", (asset[0],))
        self.assertEqual((message, mode), ("单条剪辑成片已回存素材库", "edit"))

    def test_a_transient_database_error_keeps_the_run_for_a_later_retry(self):
        from content_production import remix_output
        self.complete()
        with patch.object(remix_output, "_register", side_effect=psycopg2.errors.LockNotAvailable()):
            reconcile(self.conn)
        self.assertEqual(self.run_state(), ("running", None))
        self.assertEqual(self.outputs(), [])
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ("succeeded", None))
        self.assertEqual(len(self.outputs()), 1)

    def test_a_failed_cloud_attempt_is_offered_to_the_next_render_of_the_same_revision(self):
        from content_production import remix_mediakit
        attempt = {"taskId": "amk-1", "timelineSha256": "a" * 64}
        self.execute("UPDATE ads.content_production_jobs SET status='failed',finished_at=NOW(),receipt=%s::JSONB WHERE job_id=%s",
                     (json.dumps({"mediakit_attempt": attempt}), self.job))
        retry = {"job_id": str(uuid.uuid4()), "project_id": self.project, "revision": 1, "preview": False}
        self.assertEqual(remix_mediakit.previous_attempt(self.conn, retry), attempt)
        self.assertIsNone(remix_mediakit.previous_attempt(self.conn, {**retry, "revision": 2}))
        self.conn.rollback()

    def test_clip_mismatch_is_not_delivered_or_registered(self):
        changed = [dict(self.segments[0], endMs=3000), self.segments[1]]
        self.execute("UPDATE ads.content_remix_batch_runs SET segments=%s WHERE run_id=%s", (json.dumps(changed), self.run))
        self.complete()
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ("waiting", "remix_lineage_mismatch"))
        self.assertEqual(self.outputs(), [])

    def test_failed_render_marks_the_batch_failed_without_output(self):
        self.complete("failed")
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ("waiting", "render_failed"))
        self.assertEqual(self.outputs(), [])
        self.assertEqual(self.execute("SELECT status FROM ads.content_remix_batches WHERE batch_id=%s", (self.batch,)),
                         [("failed",)])

    def batch_status(self):
        return self.execute("SELECT status FROM ads.content_remix_batches WHERE batch_id=%s", (self.batch,))[0][0]

    def cancel_render(self):
        self.execute("UPDATE ads.content_production_runs SET status='cancelling' WHERE run_id=%s", (self.run,))
        self.complete("cancelled")

    def test_cancelled_render_marks_the_batch_cancelled(self):
        self.cancel_render()
        self.assertEqual(reconcile(self.conn), 1)
        self.assertEqual(self.run_state(), ("cancelled", None))
        self.assertEqual(self.outputs(), [])
        self.assertEqual(self.batch_status(), "cancelled")

    def test_before_migration_032_a_cancelled_batch_keeps_the_031_vocabulary(self):
        widened = "CHECK (status IN ('running','succeeded','partially_failed','failed','cancelled'))"
        narrow = "CHECK (status IN ('running','succeeded','partially_failed','failed'))"
        swap = ("ALTER TABLE ads.content_remix_batches DROP CONSTRAINT content_remix_batches_status_check, "
                "ADD CONSTRAINT content_remix_batches_status_check ")
        self.execute(swap + narrow + " NOT VALID")  # other tests may already hold 'cancelled' rows
        self.addCleanup(self.execute, swap + widened)
        self.cancel_render()
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ("cancelled", None))
        self.assertEqual(self.batch_status(), "failed")

    def test_duplicate_output_bytes_link_the_existing_asset_with_lineage(self):
        existing = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,raw_sha256)
            VALUES (%s,'same bytes','ready',%s)""", (existing, self.output_sha))
        self.complete()
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ("succeeded", None))
        self.assertEqual(self.outputs(), [])
        self.assertEqual(self.execute("SELECT output_asset_id::TEXT FROM ads.content_remix_batch_runs WHERE run_id=%s",
                                      (self.run,)), [(existing,)])
        self.assertEqual(self.execute("""SELECT output_asset_id::TEXT,ordinal,segment_id::TEXT FROM ads.content_asset_lineage
            WHERE run_id=%s ORDER BY ordinal""", (self.run,)),
                         [(existing, i + 1, s["segmentId"]) for i, s in enumerate(self.segments)])


if __name__ == "__main__":
    unittest.main()
