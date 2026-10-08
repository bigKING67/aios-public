"""Isolated DB: owned, versioned treatment adoption, without remote services."""
import copy
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
import uuid

import psycopg2
from psycopg2.extras import Json
import test_source_treatment as fixture
from content_production.caption_quality import document_digest
from content_production.derived_assets import validate_derived_assets
from content_production.render_binding import current_binding
from content_production.source_treatment_adoption import adopt_treatment


@unittest.skipUnless(os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL'), 'requires disposable database')
class TreatmentAdoptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.SourceTreatmentTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixture.SourceTreatmentTests.tearDownClass()

    def setUp(self):
        self.case = fixture.SourceTreatmentTests()
        self.case.setUp()
        self.addCleanup(self.case.doCleanups)
        self.conn = psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.run, self.project, self.job = (str(uuid.uuid4()) for _ in range(3))
        assets = []
        for asset in self.case.document['assets']:
            old, aid = asset['assetVersionId'], str(uuid.uuid4())
            version = f"{aid}-{asset['sha256'][:16]}"
            asset['assetVersionId'] = version
            self.case.bindings[version] = self.case.bindings.pop(old)
            self.case.media[version] = self.case.media.pop(old)
            for cue in self.case.document['captions']:
                if cue['anchor']['assetVersionId'] == old:
                    cue['anchor']['assetVersionId'] = version
            assets.append({'assetId': aid, 'sha256': asset['sha256'], 'objectKey': old + '.mp4',
                           'durationMs': self.case.bindings[version]['durationMs']})
        self.case.document['projectId'] = self.project
        self.snapshot = {'title': 'treatment fixture', 'aspect': 'portrait', 'outputProfile': 'legacy_v1',
            'rightsConfirmed': True, 'clips': [], 'assets': assets,
            'editDocument': copy.deepcopy(self.case.document), 'renderBinding': current_binding()}
        def clean_assets():
            # Every test owns these IDs; leave the active raw-hash uniqueness
            # constraint intact while isolating tests that reuse fixture bytes.
            with self.conn, self.conn.cursor() as c:
                for asset in assets:
                    c.execute('DELETE FROM ads.marketing_content_assets WHERE asset_id=%s', (asset['assetId'],))
        self.addCleanup(clean_assets)
        with self.conn, self.conn.cursor() as c:
            for asset in assets:
                c.execute("""INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,
                    raw_object_key,raw_sha256,duration_seconds,repurpose_allowed,authorization_status)
                    VALUES (%s,'fixture','ready','fixture',%s,%s,%s,TRUE,'authorized')""",
                    (asset['assetId'], asset['objectKey'], asset['sha256'], asset['durationMs'] / 1000))
            c.execute("INSERT INTO ads.content_production_projects (project_id,owner_user_id,title,revision) VALUES (%s,'treatment','fixture',1)", (self.project,))
            c.execute("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,1,%s)", (self.project, Json(self.snapshot)))
            c.execute("""INSERT INTO ads.content_production_runs (run_id,owner_user_id,idempotency_key,request,source_snapshot,
                plan_revision,project_id,project_revision,status,stage,waiting_reason)
                VALUES (%s,'treatment',%s,'{}',%s,1,%s,1,'waiting','inspection','caption_quality_pending')""",
                (self.run, self.run, Json(self.snapshot), self.project))
            c.execute("INSERT INTO ads.content_production_plans (run_id,revision,execution_version,document,origin) VALUES (%s,1,1,'{}','user')", (self.run,))
            c.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview,status,output_object_key,receipt) VALUES (%s,%s,1,FALSE,'completed','fixture-parent.mp4','{}')", (self.job, self.project))
            c.execute("INSERT INTO ads.content_production_run_renders (run_id,execution_version,plan_revision,job_id) VALUES (%s,1,1,%s)", (self.run, self.job))
            c.execute("UPDATE ads.content_production_runs SET render_job_id=%s WHERE run_id=%s", (self.job, self.run))
        self.case.advance()
        self.operation = Path(self.case.advance()['workDir'])
        self.uploads = []
        self.storage = SimpleNamespace(config=SimpleNamespace(bucket='fixture'), upload_file=lambda *args: self.uploads.append(args))

    def adopt(self, owner='treatment', version=1):
        return adopt_treatment(self.conn, self.storage, owner, self.run, version, self.operation, check=lambda: None)

    def frozen(self, revision=2):
        with self.conn, self.conn.cursor() as c:
            c.execute('SELECT snapshot FROM ads.content_production_revisions WHERE project_id=%s AND revision=%s', (self.project, revision))
            row = c.fetchone()
            return row[0] if row else None

    def test_adopts_once_in_same_run_without_changing_parent_audio_or_captions(self):
        result = self.adopt()
        self.assertEqual((result['status'], result['runId'], result['projectRevision']), ('queued', self.run, 2))
        self.assertEqual(self.adopt()['jobId'], result['jobId'])
        self.assertEqual(len(self.uploads), 1)
        saved = self.frozen()
        self.assertEqual(self.frozen(1), self.snapshot)
        self.assertEqual(saved['renderBinding'], self.snapshot['renderBinding'])
        self.assertEqual(saved['assets'], self.snapshot['assets'])
        self.assertEqual(saved['editDocument']['captions'], self.snapshot['editDocument']['captions'])
        self.assertEqual(saved['editDocument']['clips'][-1], self.snapshot['editDocument']['clips'][-1])
        self.assertEqual(validate_derived_assets(saved, self.project), saved['derivedAssets'])

    def test_wrong_owner_and_stale_version_do_not_upload(self):
        for owner, version in [('other', 1), ('treatment', 2)]:
            with self.assertRaises(ValueError): self.adopt(owner, version)
        self.assertEqual(self.uploads, [])
        self.assertIsNone(self.frozen())

    def test_local_candidate_cannot_smuggle_unrelated_edits(self):
        candidate = json.loads((self.operation / 'candidate.json').read_text())
        candidate['clips'][-1]['gain'] = .5
        (self.operation / 'candidate.json').write_text(json.dumps(candidate))
        state = json.loads((self.operation / 'state.json').read_text())
        state['candidateSha256'] = document_digest(candidate)
        (self.operation / 'state.json').write_text(json.dumps(state))
        with self.assertRaisesRegex(ValueError, 'unrelated'): self.adopt()
        self.assertEqual(self.uploads, [])

    def test_revoked_parent_cannot_be_laundered_through_derived_media(self):
        with self.conn, self.conn.cursor() as c:
            c.execute("UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=%s", (self.snapshot['assets'][1]['assetId'],))
        with self.assertRaises(RuntimeError): self.adopt()
        self.assertEqual(self.uploads, [])

    def test_cancel_during_upload_cannot_dispatch(self):
        def cancel(*args):
            self.uploads.append(args)
            with self.conn, self.conn.cursor() as c:
                c.execute("UPDATE ads.content_production_runs SET status='cancelled',version=version+1 WHERE run_id=%s", (self.run,))
        self.storage.upload_file = cancel
        with self.assertRaisesRegex(ValueError, 'changed'): self.adopt()
        self.assertIsNone(self.frozen())
        self.assertEqual(len(self.uploads), 1)  # Unreferenced object is allowed, no new job/revision.

    def test_manual_project_save_during_upload_is_preserved(self):
        manual = {**self.snapshot, 'title': 'manual edit wins'}
        def edit(*args):
            with self.conn, self.conn.cursor() as c:
                c.execute('INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,2,%s)',
                          (self.project, Json(manual)))
                c.execute('UPDATE ads.content_production_projects SET revision=2 WHERE project_id=%s', (self.project,))
        self.storage.upload_file = edit
        with self.assertRaisesRegex(ValueError, 'changed'): self.adopt()
        self.assertEqual(self.frozen(), manual)
        with self.conn, self.conn.cursor() as c:
            c.execute('SELECT project_revision,render_job_id FROM ads.content_production_runs WHERE run_id=%s', (self.run,))
            self.assertEqual(tuple(map(str, c.fetchone())), ('1', self.job))

    def test_unavailable_storage_leaves_old_run_and_allows_safe_retry(self):
        self.storage.upload_file = lambda *_: (_ for _ in ()).throw(TimeoutError('fixture'))
        with self.assertRaises(TimeoutError): self.adopt()
        self.assertIsNone(self.frozen())
        self.storage.upload_file = lambda *args: self.uploads.append(args)
        self.assertEqual(self.adopt()['status'], 'queued')
        self.assertEqual(self.case.provider.submits, 1)

    def test_worker_binding_rejects_foreign_object_parent_and_audio_changes(self):
        self.adopt()
        saved = self.frozen()
        for change in ('key', 'parent', 'audio', 'provenance', 'duration'):
            invalid = copy.deepcopy(saved)
            asset = invalid['derivedAssets'][0]
            if change == 'key': asset['objectKey'] = 'production/other/video.mp4'
            elif change == 'parent': asset['parentSha256'] = 'f' * 64
            elif change == 'audio': invalid['editDocument']['clips'][1]['audioPolicy'] = 'keep'
            elif change == 'provenance': asset['treatmentRequest']['frames'] += 1
            else: asset['durationMs'] = True
            with self.subTest(change=change), self.assertRaises(ValueError): validate_derived_assets(invalid, self.project)


if __name__ == '__main__': unittest.main()
