"""QC publication barrier against actual segment state in a disposable database."""
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_remix_output_postgres as fixtures
from content_production import remix_qc, remix_qc_sources
from content_production.run_bridge import reconcile


@unittest.skipUnless(os.getenv("CONTENT_PRODUCTION_TEST_DATABASE_URL"), "requires disposable PostgreSQL")
class RemixQcSourcesTests(unittest.TestCase):
    setUp, execute, complete = fixtures.RemixOutputTests.setUp, fixtures.RemixOutputTests.execute, fixtures.RemixOutputTests.complete
    run_state, outputs = fixtures.RemixOutputTests.run_state, fixtures.RemixOutputTests.outputs

    def check(self):
        return remix_qc_sources.review(self.conn, self.run, self.snapshot)

    def test_confirmed_multilabel_slot_is_valid(self):
        self.execute("UPDATE ads.content_segments SET label_key='mechanism',additional_label_keys=ARRAY['mixed_voiceover'] WHERE segment_id=%s",
                     (self.segments[0]['segmentId'],))
        self.execute("UPDATE ads.marketing_content_assets SET raw_sha256=UPPER(raw_sha256) WHERE asset_id=%s", (self.source,))
        self.assertEqual(self.check()['status'], 'passed')

    def test_rejected_or_changed_label_hash_product_range_cannot_publish(self):
        for clause in ("status='suggested'", "label_key='mechanism'", "source_content_hash=REPEAT('b',64)",
                       "product_name='different'", "end_ms=3999"):
            original = self.segments[0]
            self.execute(f"UPDATE ads.content_segments SET {clause} WHERE segment_id=%s", (original['segmentId'],))
            self.assertEqual(self.check()['status'], 'failed', clause)
            self.execute("""UPDATE ads.content_segments SET status='confirmed',label_key=%s,source_content_hash=%s,
              product_name=%s,end_ms=%s WHERE segment_id=%s""",
                         (original['labelKey'], self.source_sha, self.product, original['endMs'], original['segmentId']))

    def test_publication_rechecks_changes_after_qc(self):
        self.complete()
        self.execute("UPDATE ads.content_segments SET status='suggested' WHERE segment_id=%s", (self.segments[0]['segmentId'],))
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ('failed', 'remix_qc_sources_changed'))
        self.assertEqual(self.outputs(), [])

    def test_revoked_source_is_blocked_at_publication(self):
        self.complete()
        self.execute("UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=%s", (self.source,))
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ('failed', 'remix_qc_sources_changed'))
        self.assertEqual(self.outputs(), [])

    def test_old_receipt_without_qc_is_quarantined(self):
        self.complete()
        self.execute("UPDATE ads.content_production_jobs SET receipt=receipt-'host_remix_qc' WHERE job_id=%s", (self.job,))
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ('failed', remix_qc.INCOMPLETE))
        self.assertEqual(self.outputs(), [])

    def test_failed_qc_report_is_retained_and_not_an_active_daily_run(self):
        self.complete()
        self.execute("""UPDATE ads.content_production_jobs SET status='failed',output_object_key=NULL,
            receipt=jsonb_set(receipt,'{host_remix_qc,status}','"failed"') WHERE job_id=%s""", (self.job,))
        reconcile(self.conn)
        self.assertEqual(self.run_state(), ('failed', remix_qc.FAILED))
        self.assertEqual(self.outputs(), [])
        self.assertEqual(self.execute("SELECT receipt->'host_remix_qc'->>'status' FROM ads.content_production_jobs WHERE job_id=%s", (self.job,)), [('failed',)])
        self.assertEqual(self.execute("SELECT status FROM ads.content_remix_batches WHERE batch_id=%s", (self.batch,)), [('failed',)])

    def test_slot_order_is_rechecked(self):
        self.execute("UPDATE ads.content_remix_batches SET structure=%s WHERE batch_id=%s",
                     (json.dumps({'labels': ['live_demo', 'mixed_voiceover']}), self.batch))
        self.assertEqual(self.check()['reason'], 'slot_mapping_changed')

    def test_old_selling_point_without_frozen_guards_fails_closed(self):
        self.execute("UPDATE ads.content_remix_batches SET structure=structure || '{\"mode\":\"sellingPoint\"}' WHERE batch_id=%s", (self.batch,))
        self.assertEqual(self.check(), {'status': 'incomplete', 'reason': 'missing_frozen_source_checks'})

    def test_trimmed_edit_keeps_confirmed_source_range(self):
        self.segments[0]['startMs'] = 200
        self.snapshot['clips'][0]['startMs'] = 200
        self.execute("UPDATE ads.content_remix_batch_runs SET segments=%s WHERE run_id=%s", (json.dumps(self.segments), self.run))
        self.execute("UPDATE ads.content_remix_batches SET structure=structure || '{\"mode\":\"edit\"}' WHERE batch_id=%s", (self.batch,))
        self.assertEqual(self.check()['status'], 'passed')

    def test_single_edit_from_selling_point_preset_keeps_its_confirmed_label(self):
        self.execute("UPDATE ads.content_segments SET preset_key='selling_point' WHERE asset_id=%s", (self.source,))
        self.execute("""UPDATE ads.content_remix_batches SET preset_key='selling_point',
            structure=structure || '{"mode":"edit"}' WHERE batch_id=%s""", (self.batch,))
        self.assertEqual(self.check()['status'], 'passed')

    def test_selling_point_parts_and_framework_guards_are_both_rechecked(self):
        point_id = str(uuid.uuid4())
        self.execute("""INSERT INTO ads.content_segments(segment_id,owner_user_id,asset_id,source_content_hash,
          start_ms,end_ms,preset_key,preset_version,label_key,additional_label_keys,product_name,origin,status,confirmed_by,confirmed_at)
          VALUES(%s,'annotator',%s,%s,0,4000,'selling_point',1,'makeup_effect',ARRAY['texture'],%s,'human','confirmed','annotator',NOW())""",
                     (point_id, self.source, self.source_sha, self.product))
        for index, segment in enumerate(self.segments):
            segment['slot'] = index + 1
            segment['sourceChecks'] = [{**segment, 'presetKey': 'framework', 'presetVersion': 1,
                                        'additionalLabelKeys': [], 'continuesPrevious': False}]
        self.segments[0]['sourceChecks'].append({'segmentId': point_id, 'startMs': 0, 'endMs': 4000,
            'presetKey': 'selling_point', 'presetVersion': 1, 'labelKey': 'makeup_effect',
            'additionalLabelKeys': ['texture'], 'continuesPrevious': False})
        self.execute("UPDATE ads.content_remix_batch_runs SET segments=%s WHERE run_id=%s", (json.dumps(self.segments), self.run))
        self.execute("UPDATE ads.content_remix_batches SET structure=structure || '{\"mode\":\"sellingPoint\"}' WHERE batch_id=%s", (self.batch,))
        self.assertEqual(self.check()['status'], 'passed')
        self.execute("UPDATE ads.content_segments SET additional_label_keys='{}' WHERE segment_id=%s", (point_id,))
        self.assertEqual(self.check()['status'], 'failed')
        self.execute("UPDATE ads.content_segments SET additional_label_keys=ARRAY['texture'] WHERE segment_id=%s", (point_id,))
        self.execute("UPDATE ads.content_segments SET status='suggested' WHERE segment_id=%s", (self.segments[0]['segmentId'],))
        self.assertEqual(self.check()['status'], 'failed')

    def test_source_locks_prevent_change_until_publication_transaction_ends(self):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cursor:
            self.assertEqual(remix_qc_sources.check(cursor, self.run, self.snapshot)['status'], 'passed')
        with psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']) as other:
            with other.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout='100ms'")
                with self.assertRaises(psycopg2.errors.LockNotAvailable):
                    cursor.execute("UPDATE ads.content_segments SET status='suggested' WHERE segment_id=%s", (self.segments[0]['segmentId'],))
            other.rollback()
        self.conn.commit()
