"""Real disposable DB and fake storage: no real deletes or vendor calls."""
import datetime as dt
import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch
import test_remix_output_postgres as fixtures
from content_production import remix_retention as cleanup,remix_retention_plan as plan,cloud_video_playback_sync as playback
from content_production.run_bridge import reconcile


class Storage:
    def __init__(self):
        self.config=SimpleNamespace(bucket_for=lambda key:'fixture-bucket')
        self.files=set();self.deleted=[];self.fail_on=None
    def object_exists(self,key): return key in self.files
    def delete_object(self,key):
        if key==self.fail_on: raise OSError('private signed request must not escape')
        self.files.discard(key);self.deleted.append(key)


@unittest.skipUnless(os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL'),'requires disposable PostgreSQL')
class RetentionTests(unittest.TestCase):
    execute,complete,outputs=fixtures.RemixOutputTests.execute,fixtures.RemixOutputTests.complete,fixtures.RemixOutputTests.outputs
    def setUp(self):
        fixtures.RemixOutputTests.setUp(self);self.complete();reconcile(self.conn)
        self.asset=str(self.outputs()[0][0]);self.storage=Storage()
        self.execute("INSERT INTO ads.content_remix_output_reviews(run_id,output_asset_id,decision,reasons,reviewer_user_id,reviewed_at) VALUES (%s,%s,'rejected',ARRAY['pacing'],'reviewer',NOW()-INTERVAL '8 days')",(self.run,self.asset))
        self.execute("INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at) VALUES (%s,'rejected',NOW()-INTERVAL '1 day')",(self.asset,))
        self.execute('UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=%s',(self.asset,))
        manifest=plan.inspect(self.conn,self.asset,self.storage);self.conn.rollback()
        self.storage.files={o['key'] for o in manifest['objects']}
        self.addCleanup(self.quiesce)
    def quiesce(self):
        self.conn.rollback()
        self.execute("UPDATE ads.content_remix_retention SET cleanup_at=NOW()+INTERVAL '100 years' WHERE output_asset_id=%s",(self.asset,))
        self.execute('UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=ANY(%s::UUID[])',([self.asset,self.source],))
    def run_cleanup(self,apply=True): return cleanup.run_once(self.conn,self.storage,asset_id=self.asset,apply=apply)
    def test_dry_run_is_exact_and_does_not_mutate_storage_jobs_or_ledger(self):
        before=set(self.storage.files);result=self.run_cleanup(False)[0]
        self.assertEqual(result['status'],'dry_run');self.assertEqual({o['key'] for o in result['objects']},before)
        self.assertEqual(self.storage.deleted,[])
        self.assertEqual(self.execute('SELECT status,purge_started_at FROM ads.content_remix_retention WHERE output_asset_id=%s',(self.asset,)),[('pending',None)])
        self.assertEqual(self.execute("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE asset_id=%s AND status='queued'",(self.asset,))[0][0],2)
    def test_rejection_deletes_only_exact_files_and_keeps_reviews_lineage_and_hash(self):
        before=set(self.storage.files);result=self.run_cleanup()[0]
        self.assertEqual(result['status'],'completed');self.assertEqual(set(self.storage.deleted),before)
        self.assertEqual(self.execute('SELECT is_deleted,raw_object_key,preview_object_key,cover_object_key FROM ads.marketing_content_assets WHERE asset_id=%s',(self.asset,)),[(True,None,None,None)])
        self.assertEqual(self.execute('SELECT reasons FROM ads.content_remix_output_reviews WHERE run_id=%s',(self.run,))[0][0],['pacing'])
        self.assertEqual(self.execute('SELECT COUNT(*) FROM ads.content_remix_batch_runs WHERE run_id=%s AND combination_hash IS NOT NULL',(self.run,))[0][0],1)
        self.assertEqual(self.execute('SELECT COUNT(*) FROM ads.content_asset_lineage WHERE run_id=%s',(self.run,)),[(2,)])
        self.assertEqual(self.run_cleanup(),[])
    def test_partial_delete_retains_manifest_and_resumes_idempotently(self):
        keys=sorted(self.storage.files);self.storage.fail_on=keys[1]
        self.assertEqual(self.run_cleanup()[0]['errorCode'],'storage_cleanup_failed')
        self.assertEqual(len(self.storage.deleted),1)
        state=self.execute('SELECT status,purge_started_at,objects FROM ads.content_remix_retention WHERE output_asset_id=%s',(self.asset,))[0]
        self.assertEqual(state[0],'failed');self.assertIsNotNone(state[1]);self.assertEqual(len(state[2]),3)
        self.storage.fail_on=None;self.assertEqual(self.run_cleanup()[0]['status'],'completed')
        self.assertEqual(len(self.storage.deleted),3)
    def test_undue_shared_source_active_processing_and_unresolved_import_are_protected(self):
        self.execute("UPDATE ads.content_remix_retention SET cleanup_at=NOW()+INTERVAL '1 day' WHERE output_asset_id=%s",(self.asset,));self.assertEqual(self.run_cleanup(),[])
        self.execute("UPDATE ads.content_remix_retention SET cleanup_at=NOW()-INTERVAL '1 day' WHERE output_asset_id=%s",(self.asset,))
        self.execute("UPDATE ads.marketing_content_asset_processing_jobs SET status='running' WHERE asset_id=%s",(self.asset,));self.assertEqual(self.run_cleanup()[0]['errorCode'],'processing_active')
        self.execute("UPDATE ads.marketing_content_asset_processing_jobs SET status='queued' WHERE asset_id=%s",(self.asset,))
        self.execute('UPDATE ads.marketing_content_assets SET preview_object_key=%s WHERE asset_id=%s',(self.key,self.source));self.assertEqual(self.run_cleanup()[0]['errorCode'],'shared_object')
        self.execute('UPDATE ads.marketing_content_assets SET preview_object_key=NULL WHERE asset_id=%s',(self.source,))
        self.execute("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status) VALUES (%s,%s,'fixture',NOW(),'uncertain')",(self.asset,self.run));self.assertEqual(self.run_cleanup()[0]['errorCode'],'delivery_unresolved')
        self.assertEqual(self.storage.deleted,[])
    def test_delivered_requires_fresh_remote_copy_and_keeps_cover(self):
        self.execute("UPDATE ads.content_remix_output_reviews SET decision='approved',reasons='{}' WHERE run_id=%s",(self.run,))
        self.execute('UPDATE ads.marketing_content_assets SET is_deleted=FALSE WHERE asset_id=%s',(self.asset,))
        self.execute("UPDATE ads.content_remix_retention SET status='cancelled' WHERE output_asset_id=%s",(self.asset,))
        self.execute("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status,cloud_video_id,succeeded_at) VALUES (%s,%s,'fixture',NOW(),'succeeded',%s,NOW()-INTERVAL '8 days')",(self.asset,self.run,uuid.uuid4().int%10**15))
        self.assertEqual(self.run_cleanup()[0]['errorCode'],'cloud_copy_unverified')
        self.assertEqual(self.execute('SELECT reason,status FROM ads.content_remix_retention WHERE output_asset_id=%s',(self.asset,)),[('delivered','failed')])
        self.execute("UPDATE cloud_video.pushes SET playback_outer_host='files.example',playback_inner_host='inner.example',playback_path='/v.mp4',playback_verified_at=NOW() WHERE output_asset_id=%s",(self.asset,))
        result=self.run_cleanup()[0];self.assertEqual(result['status'],'completed');self.assertEqual(result['reason'],'delivered')
        self.assertEqual(len(self.storage.files),1);self.assertTrue(next(iter(self.storage.files)).startswith('cover/'))
        self.assertFalse(self.execute('SELECT is_deleted FROM ads.marketing_content_assets WHERE asset_id=%s',(self.asset,))[0][0])
    def test_cloud_metadata_and_probe_failure_never_authorize_deletion(self):
        video=uuid.uuid4().int%10**15
        self.execute("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status,cloud_video_id,succeeded_at) VALUES (%s,%s,'fixture',NOW(),'succeeded',%s,NOW()-INTERVAL '8 days')",(self.asset,self.run,video))
        client=SimpleNamespace(call=lambda path,body:{'list':[{'videoId':video,'videoUrl':'https://'+('inner.example' if body['isInner'] else 'files.example')+'/v.mp4'}]})
        playback.refresh(self.conn,client,asset_id=self.asset,probe_file=lambda url:True)
        self.assertIsNotNone(self.execute('SELECT playback_verified_at FROM cloud_video.pushes WHERE output_asset_id=%s',(self.asset,))[0][0])
        self.execute("UPDATE cloud_video.pushes SET playback_verified_at=NOW()-INTERVAL '2 days' WHERE output_asset_id=%s",(self.asset,))
        playback.refresh(self.conn,client,asset_id=self.asset,probe_file=lambda url:False)
        self.assertIsNone(self.execute('SELECT playback_verified_at FROM cloud_video.pushes WHERE output_asset_id=%s',(self.asset,))[0][0])
    def test_apply_is_disabled_before_opening_database(self):
        with patch.dict(os.environ,{'CONTENT_AI_STUDIO_CLEANUP_ENABLED':'false'}),patch('sys.argv',['cleanup','--once','--apply']),patch('marketing_content_assets.repository.connect_pg') as connect,patch('builtins.print'):
            self.assertEqual(cleanup.main(),0);connect.assert_not_called()
    def test_changed_review_or_output_used_as_source_is_protected(self):
        self.execute("UPDATE ads.content_remix_output_reviews SET decision='approved',reasons='{}' WHERE run_id=%s",(self.run,))
        self.assertEqual(self.run_cleanup()[0]['errorCode'],'review_changed')
        self.execute("UPDATE ads.content_remix_output_reviews SET decision='rejected',reasons=ARRAY['pacing'] WHERE run_id=%s",(self.run,))
        self.execute("UPDATE ads.content_production_revisions SET snapshot=jsonb_set(snapshot,'{assets}',%s::JSONB) WHERE project_id=%s",('[{"assetId":"'+self.asset+'"}]',self.project))
        self.assertEqual(self.run_cleanup()[0]['errorCode'],'output_used_as_source');self.assertEqual(self.storage.deleted,[])
    def test_session_lock_excludes_concurrent_cleanup(self):
        import psycopg2
        other=psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']);self.addCleanup(other.close)
        self.execute('SELECT PG_ADVISORY_LOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+self.asset,))
        self.assertEqual(cleanup.run_once(other,self.storage,asset_id=self.asset,apply=True),[])
        self.assertEqual(self.storage.deleted,[])
        self.execute('SELECT PG_ADVISORY_UNLOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+self.asset,))
        self.assertEqual(self.run_cleanup()[0]['status'],'completed')

    def test_blocked_cleanup_moves_behind_unattempted_candidates(self):
        self.execute("UPDATE ads.marketing_content_assets SET source_type='ai_studio_output' WHERE asset_id=%s",(self.source,))
        self.execute("INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at,updated_at) VALUES (%s,'rejected',NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day')",(self.source,))
        self.execute("UPDATE ads.content_remix_retention SET updated_at=NOW()-INTERVAL '2 days' WHERE output_asset_id=%s",(self.asset,))
        before=plan.candidates(self.conn,1000);self.conn.rollback()
        self.assertLess(before.index(self.asset),before.index(self.source))
        self.execute("UPDATE ads.marketing_content_asset_processing_jobs SET status='running' WHERE asset_id=%s",(self.asset,))
        self.assertEqual(self.run_cleanup()[0]['errorCode'],'processing_active')
        after=plan.candidates(self.conn,1000);self.conn.rollback()
        self.assertGreater(after.index(self.asset),after.index(self.source))
        self.execute("UPDATE ads.content_remix_retention SET cleanup_at=NOW()+INTERVAL '100 years' WHERE output_asset_id=%s",(self.source,))

    def test_failed_playback_probe_does_not_starve_other_imports(self):
        for asset,stamp in ((self.asset,'1900-01-01'),(self.source,'1900-01-02')):
            self.execute("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status,cloud_video_id,succeeded_at,updated_at) VALUES (%s,%s,'fixture',NOW(),'succeeded',%s,NOW()-INTERVAL '8 days',%s)",(asset,self.run,uuid.uuid4().int%10**15,stamp))
        seen=[]
        def unavailable(path,body):
            seen.append(body['videoIds']);raise OSError('fixture unavailable')
        client=SimpleNamespace(call=unavailable)
        playback.refresh(self.conn,client,limit=1)
        playback.refresh(self.conn,client,limit=1)
        self.assertEqual(len(seen),2);self.assertNotEqual(seen[0],seen[1])
