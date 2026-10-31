"""Disposable PostgreSQL, real queue transitions, fake vendor and storage only."""
import json
import os
import threading
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock
import psycopg2
from psycopg2.extras import RealDictCursor
import test_remix_output_postgres as fixtures
from content_production import cloud_video_push as worker, cloud_video_push_queue as queue
from content_production.run_bridge import reconcile


class Vendor:
    def __init__(self):
        self.writes=[];self.queries=[];self.write_error=None;self.query_error=None;self.status=10
        self.video_id=uuid.uuid4().int % 10**15 + 1
    def call(self,path,body):
        if path.endswith('/type/list'): return [{'id':10,'children':[{'id':20}]}]
        if path.endswith('/label/list'): return [{'state':1,'children':[{'id':30,'level':2,'state':1,'name':'AI混剪'}]}]
        self.queries.append(body)
        if self.query_error: raise self.query_error
        return {'list':[{'videoName':json.loads(self.writes[-1]['videoJSON'])[0]['videoName'],
                         'status':self.status,'videoId':self.video_id}]}
    def write_once(self,path,body):
        self.writes.append(body)
        if self.write_error: raise self.write_error
        return {'requestId':'9007199254740993123'}


@unittest.skipUnless(os.getenv('CONTENT_PRODUCTION_TEST_DATABASE_URL'),'requires disposable PostgreSQL')
class PushQueueTests(unittest.TestCase):
    execute,complete,outputs=fixtures.RemixOutputTests.execute,fixtures.RemixOutputTests.complete,fixtures.RemixOutputTests.outputs
    def setUp(self):
        fixtures.RemixOutputTests.setUp(self)
        self.complete();reconcile(self.conn)
        self.asset=str(self.outputs()[0][0]);self.vendor=Vendor()
        self.execute("""INSERT INTO ads.content_remix_output_reviews(run_id,output_asset_id,decision,reviewer_user_id)
            VALUES (%s,%s,'approved','push-fixture')""",(self.run,self.asset))
        self.source_video_id=uuid.uuid4().int % 10**15 + 1
        self.execute("""INSERT INTO cloud_video.videos(video_id,name,video_type,one_level_type_id,two_level_type_id,
            asset_id,url_path,outer_host,inner_host) VALUES (%s,'source',0,10,20,%s,'/source.mp4','files.example','inner.example')""",
                     (self.source_video_id,self.source))
        bucket=self.execute('SELECT bucket FROM ads.marketing_content_assets WHERE asset_id=%s',(self.asset,))[0][0]
        self.storage=Mock(config=SimpleNamespace(bucket_for=lambda key:bucket))
        self.storage.presign_get_url.return_value='https://files.example/out.mp4?signature=fixture-private'
        self.addCleanup(self.quiesce)
    def quiesce(self):
        self.conn.rollback()
        self.execute("UPDATE cloud_video.pushes SET next_attempt_at=NOW()+INTERVAL '100 years' WHERE output_asset_id=%s",(self.asset,))
        self.execute('UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=ANY(%s::UUID[])',([self.asset,self.source],))
    def push(self):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT * FROM cloud_video.pushes WHERE output_asset_id=%s',(self.asset,));row=cur.fetchone()
        self.conn.commit();return row
    def tick(self):
        worker.run_once(self.conn,self.vendor,self.storage)
    def due(self):
        self.execute("UPDATE cloud_video.pushes SET next_attempt_at=NOW()-INTERVAL '1 second' WHERE output_asset_id=%s",(self.asset,))

    def test_success_is_async_and_repeated_ticks_do_not_duplicate(self):
        self.tick();self.assertEqual(self.push()['status'],'importing')
        self.assertEqual(self.push()['request_id'],'9007199254740993123')
        self.due();self.tick();self.assertEqual(self.push()['status'],'succeeded')
        self.assertEqual(self.push()['cloud_video_id'],self.vendor.video_id)
        self.due();self.tick();self.assertEqual(len(self.vendor.writes),1)
        self.assertNotIn('fixture-private',json.dumps(self.push(),default=str))
        self.storage.presign_get_url.assert_called_once_with(self.key,ttl_seconds=86400,response_content_type='video/mp4')

    def test_write_timeout_and_crash_after_commit_are_never_automatically_replayed(self):
        self.vendor.write_error=TimeoutError('signed URL fixture-private')
        self.tick();self.assertEqual(self.push()['status'],'uncertain')
        self.due();self.tick();self.assertEqual(len(self.vendor.writes),1)
        self.execute("UPDATE cloud_video.pushes SET status='submitting' WHERE output_asset_id=%s",(self.asset,))
        self.due();self.tick();self.assertEqual(self.push()['status'],'uncertain')
        self.assertEqual(len(self.vendor.writes),1)

    def test_query_timeout_is_only_requeried_never_resubmitted(self):
        self.tick();self.vendor.query_error=TimeoutError('fixture-private');self.due();self.tick()
        self.assertEqual(self.push()['status'],'importing');self.assertEqual(self.push()['error_code'],'query_failed')
        self.vendor.query_error=None;self.due();self.tick()
        self.assertEqual(self.push()['status'],'succeeded');self.assertEqual(len(self.vendor.writes),1)

    def test_only_confirmed_failure_retries_and_stops_after_initial_plus_three(self):
        self.vendor.status=20
        for attempt in range(4):
            self.due();self.tick();self.assertEqual(self.push()['status'],'importing')
            self.due();self.tick();self.assertEqual(self.push()['status'],'failed')
        self.due();self.tick();self.assertEqual(len(self.vendor.writes),4)
        self.assertEqual(self.push()['attempts'],4)

    def test_revoked_approval_missing_source_and_missing_qc_do_not_send(self):
        queue.enqueue(self.conn,20)
        self.execute("UPDATE ads.content_remix_output_reviews SET decision='rejected',reasons=ARRAY['pacing'] WHERE run_id=%s",(self.run,))
        self.tick();self.assertEqual(self.push()['error_code'],'approval_changed');self.assertEqual(self.vendor.writes,[])
        self.execute("UPDATE ads.content_remix_output_reviews SET decision='approved',reasons='{}' WHERE run_id=%s",(self.run,))
        self.execute("UPDATE cloud_video.pushes SET status='pending' WHERE output_asset_id=%s",(self.asset,))
        self.execute('DELETE FROM cloud_video.videos WHERE video_id=%s',(self.source_video_id,))
        self.due();self.tick();self.assertEqual(self.push()['error_code'],'source_category_missing')
        self.execute("UPDATE cloud_video.pushes SET status='pending' WHERE output_asset_id=%s",(self.asset,))
        self.execute("UPDATE ads.content_production_jobs SET receipt=receipt-'host_remix_qc' WHERE job_id=%s",(self.job,))
        self.due();self.tick();self.assertEqual(self.push()['error_code'],'qc_required');self.assertEqual(self.vendor.writes,[])

    def test_session_lock_prevents_second_worker_and_review_lock_rechecks_after_commit(self):
        queue.enqueue(self.conn,20)
        other=psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']);self.addCleanup(other.close)
        self.assertTrue(queue.lock(self.conn,self.asset))
        worker.process(other,self.vendor,self.storage,self.push());self.assertEqual(self.vendor.writes,[])
        queue.lock(self.conn,self.asset,False)
        with self.conn.cursor() as cur:
            cur.execute('SELECT PG_ADVISORY_XACT_LOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+self.asset,))
            cur.execute("UPDATE ads.content_remix_output_reviews SET decision='rejected',reasons=ARRAY['pacing'] WHERE run_id=%s",(self.run,))
        push={'output_asset_id':self.asset,'run_id':self.run};errors=[]
        def submit():
            try: worker.process(other,self.vendor,self.storage,push)
            except Exception as error: errors.append(type(error).__name__)
        thread=threading.Thread(target=submit);thread.start()
        time.sleep(0.15);self.assertTrue(thread.is_alive());self.conn.commit();thread.join(timeout=5)
        self.assertFalse(thread.is_alive());self.assertEqual(errors,[])
        self.assertEqual(self.vendor.writes,[]);self.assertEqual(self.push()['error_code'],'approval_changed')


    def test_exact_asset_filter_does_not_enqueue_or_process_another_output(self):
        result=worker.run_once(self.conn,self.vendor,self.storage,asset_id=str(uuid.uuid4()))
        self.assertEqual(result,{})
        self.assertIsNone(self.push());self.assertEqual(self.vendor.writes,[])
        result=worker.run_once(self.conn,self.vendor,self.storage,asset_id=self.asset)
        self.assertEqual(result,{'importing':1})
        self.assertEqual(self.push()['status'],'importing');self.assertEqual(len(self.vendor.writes),1)

    def test_uncertain_recovery_queries_verified_request_without_importing(self):
        from content_production.cloud_video_push_recovery import recover
        from content_production.cloud_video_push_contract import PushBlocked
        self.vendor.write_error=TimeoutError('unknown response');self.tick()
        self.assertEqual(self.push()['status'],'uncertain')
        original_call=self.vendor.call
        self.vendor.call=lambda path,body:{'list':[{'videoName':'another output','status':10,'videoId':123}]}
        with self.assertRaises(PushBlocked): recover(self.conn,self.vendor,self.asset,'123')
        self.assertEqual(self.push()['status'],'uncertain')
        self.vendor.call=original_call
        result=recover(self.conn,self.vendor,self.asset,'9007199254740993123')
        self.assertEqual(result['status'],'succeeded');self.assertEqual(len(self.vendor.writes),1)
        with self.assertRaises(PushBlocked): recover(self.conn,self.vendor,self.asset,'9007199254740993123')

    def test_renamed_pushed_outputs_and_ai_prefix_never_reenter_original_hash_or_intake(self):
        from content_production.cloud_video_sync import TO_HASH_SQL
        from content_production.cloud_video_intake import PENDING_SQL,FRAMEWORK_DIMENSION
        self.tick();self.due();self.tick()
        video_ids=[self.vendor.video_id+offset for offset in range(3)]
        self.addCleanup(self.execute,'DELETE FROM cloud_video.videos WHERE video_id=ANY(%s)',(video_ids,))
        for vid,name in [(self.vendor.video_id,'renamed by a person'),(self.vendor.video_id+1,'【AI框架混剪】fixture'),(self.vendor.video_id+2,'original control')]:
            self.execute("""INSERT INTO cloud_video.videos(video_id,name,video_type,one_level_type_id,two_level_type_id,
                eligibility,url_path,outer_host,inner_host) VALUES (%s,%s,0,10,20,'ge_5k','/out.mp4','files.example','inner.example')""",(vid,name))
        ids={row[0] for row in self.execute(TO_HASH_SQL,(10,100))}
        self.assertNotIn(self.vendor.video_id,ids);self.assertNotIn(self.vendor.video_id+1,ids)
        self.assertIn(self.vendor.video_id+2,ids)
        self.execute("UPDATE cloud_video.videos SET file_sha256=%s WHERE video_id=ANY(%s)",('a'*64,video_ids))
        ids={row[0] for row in self.execute(PENDING_SQL,(FRAMEWORK_DIMENSION,100))}
        self.assertNotIn(self.vendor.video_id,ids);self.assertNotIn(self.vendor.video_id+1,ids)
        self.assertIn(self.vendor.video_id+2,ids)

    def test_vendor_timeout_or_unknown_error_is_uncertain_but_rate_rejection_can_retry(self):
        from content_production.cloud_video_client import CloudVideoError
        for code in (20001,0,None,99999):
            self.vendor.write_error=CloudVideoError(code,'do not persist raw vendor details','/openapi/video/import')
            self.execute('DELETE FROM cloud_video.pushes WHERE output_asset_id=%s',(self.asset,))
            self.tick();self.assertEqual(self.push()['status'],'uncertain')
            calls=len(self.vendor.writes);self.due();self.tick();self.assertEqual(len(self.vendor.writes),calls)
        self.execute('DELETE FROM cloud_video.pushes WHERE output_asset_id=%s',(self.asset,))
        self.vendor.write_error=CloudVideoError(20002,'rate limited','/openapi/video/import')
        self.tick();self.assertEqual(self.push()['status'],'failed')
        self.assertEqual(self.push()['error_code'],'vendor_rejected')
        self.vendor.write_error=None;self.due();self.tick();self.assertEqual(self.push()['status'],'importing')
