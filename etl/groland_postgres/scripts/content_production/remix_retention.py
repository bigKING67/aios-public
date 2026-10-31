"""VPS-only seven-day output cleanup. Default command is a read-only exact manifest.

--apply additionally requires CONTENT_AI_STUDIO_CLEANUP_ENABLED=true.
"""
import argparse
import json
import os
import sys
import time
import uuid
from psycopg2.extras import Json
from . import remix_retention_plan as plan
from .cloud_video_push_contract import PushBlocked


def process(conn,storage,asset_id,*,apply=False):
    try:
        with conn.cursor() as cur:
            # The same transaction lock as review and delivery pre-submit; remains
            # held through deletion so a withdrawal cannot race object removal.
            if apply:
                cur.execute('SELECT PG_ADVISORY_XACT_LOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+str(asset_id),))
        manifest=plan.inspect(conn,asset_id,storage,lock=apply)
        if not apply:
            conn.rollback();return {**manifest,'status':'dry_run'}
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at,status,purge_started_at,objects)
                VALUES (%s,%s,%s,'deleting',NOW(),%s) ON CONFLICT(output_asset_id) DO UPDATE
                SET reason=EXCLUDED.reason,cleanup_at=EXCLUDED.cleanup_at,status='deleting',purge_started_at=COALESCE(ads.content_remix_retention.purge_started_at,NOW()),objects=EXCLUDED.objects,error_code=NULL,cleaned_at=NULL,updated_at=NOW()""",(asset_id,manifest['reason'],manifest['cleanupAt'],Json(manifest['objects'])))
            cur.execute("UPDATE ads.marketing_content_asset_processing_jobs SET status='cancelled',updated_at=NOW() WHERE asset_id=%s AND status='queued'",(asset_id,))
        # A durable checkpoint is needed before irreversible I/O. The session lock
        # below continues exclusion; review checks purge_started_at after commit.
        with conn.cursor() as cur:
            cur.execute('UPDATE ads.marketing_content_assets SET is_deleted=TRUE WHERE asset_id=%s',(asset_id,))
        conn.commit()
        # Revalidate after the durable checkpoint and hold the asset/job rows
        # while deleting; published source checks take conflicting share locks.
        manifest=plan.inspect(conn,asset_id,storage,lock=True)
        for obj in manifest['objects']:
            if storage.object_exists(obj['key']): storage.delete_object(obj['key'])
            if storage.object_exists(obj['key']): raise PushBlocked('delete_not_confirmed')
        with conn.cursor() as cur:
            for obj in manifest['objects']:
                cur.execute("UPDATE ads.marketing_content_asset_objects SET status='deleted',updated_at=NOW() WHERE asset_id=%s AND bucket=%s AND object_key=%s",(asset_id,obj['bucket'],obj['key']))
            cur.execute("UPDATE ads.marketing_content_assets SET is_deleted=(%s='rejected'),raw_object_key=NULL,preview_object_key=NULL,cover_object_key=CASE WHEN %s='rejected' THEN NULL ELSE cover_object_key END,updated_at=NOW() WHERE asset_id=%s",(manifest['reason'],manifest['reason'],asset_id))
            cur.execute("UPDATE ads.content_remix_retention SET status='completed',cleaned_at=NOW(),error_code=NULL,updated_at=NOW() WHERE output_asset_id=%s",(asset_id,))
        conn.commit();return {**manifest,'status':'completed'}
    except Exception as error:
        conn.rollback()
        code=str(error) if isinstance(error,PushBlocked) else 'storage_cleanup_failed'
        if apply:
            with conn.cursor() as cur:
                # A delivered output can fail before its first deletion ledger
                # exists. Record that attempt too, so it cannot monopolize the queue.
                cur.execute("""INSERT INTO ads.content_remix_retention(output_asset_id,reason,cleanup_at)
                    SELECT a.asset_id,'delivered',p.succeeded_at+INTERVAL '7 days'
                    FROM ads.marketing_content_assets a JOIN cloud_video.pushes p ON p.output_asset_id=a.asset_id
                    WHERE a.asset_id=%s AND a.source_type='ai_studio_output' AND NOT a.is_deleted
                      AND p.status='succeeded' AND p.succeeded_at<=NOW()-INTERVAL '7 days'
                    ON CONFLICT(output_asset_id) DO UPDATE SET reason='delivered',status='pending',
                      cleanup_at=EXCLUDED.cleanup_at,updated_at=NOW()
                    WHERE ads.content_remix_retention.status='cancelled'""",(asset_id,))
                cur.execute("UPDATE ads.content_remix_retention SET status='failed',error_code=%s,updated_at=NOW() WHERE output_asset_id=%s AND status IN ('pending','deleting','failed')",(code,asset_id))
            conn.commit()
        return {'outputAssetId':str(asset_id),'status':'blocked','errorCode':code}


def run_once(conn,storage,*,limit=20,asset_id=None,apply=False):
    ids=plan.candidates(conn,limit,asset_id);conn.rollback()
    results=[]
    for asset in ids:
        with conn.cursor() as cur:
            cur.execute('SELECT PG_TRY_ADVISORY_LOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+asset,));locked=cur.fetchone()[0]
        conn.commit()
        if not locked: continue
        try: results.append(process(conn,storage,asset,apply=apply))
        finally:
            conn.rollback()
            with conn.cursor() as cur: cur.execute('SELECT PG_ADVISORY_UNLOCK(HASHTEXTEXTENDED(%s,0))',('aios-cloud-push-review:'+asset,))
            conn.commit()
    return results


_last_cleanup = 0.0

def idle_cleanup(conn,storage):
    global _last_cleanup
    now=time.monotonic()
    if now-_last_cleanup<1800: return
    _last_cleanup=now
    results=run_once(conn,storage,limit=5,apply=True)
    if results:
        print(json.dumps({'retentionCompleted':sum(r['status']=='completed' for r in results),
                          'retentionBlocked':sum(r['status']=='blocked' for r in results)}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once',action='store_true',required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--limit',type=int,default=20)
    parser.add_argument('--asset-id',type=lambda s:str(uuid.UUID(s)))
    args=parser.parse_args()
    if not 1<=args.limit<=100: parser.error('--limit must be between 1 and 100')
    if args.apply and os.getenv('CONTENT_AI_STUDIO_CLEANUP_ENABLED')!='true':
        print(json.dumps({'status':'disabled'}));return 0
    from marketing_content_assets.repository import connect_pg
    from marketing_content_assets.tos_storage import TosStorageClient,TosStorageConfig
    with connect_pg() as conn:
        result=run_once(conn,TosStorageClient(TosStorageConfig.from_env()),limit=args.limit,asset_id=args.asset_id,apply=args.apply)
    print(json.dumps({'results':result},ensure_ascii=False));return 0


if __name__=='__main__':
    try: sys.exit(main())
    except Exception:
        print('Remix retention failed; inspect the safe retention error code.',file=sys.stderr);sys.exit(1)
