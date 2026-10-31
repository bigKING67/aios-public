"""Exact object manifests; no listing/prefix deletion and no mutation during dry run."""
import datetime as dt
from psycopg2.extras import RealDictCursor
from .cloud_video_push_contract import PushBlocked

CANDIDATES = """SELECT a.asset_id FROM ads.marketing_content_assets a
 LEFT JOIN ads.content_remix_retention rt ON rt.output_asset_id=a.asset_id
 LEFT JOIN cloud_video.pushes p ON p.output_asset_id=a.asset_id
 WHERE a.source_type='ai_studio_output' AND (
 (rt.status IN ('pending','deleting','failed') AND rt.cleanup_at<=NOW()) OR
 ((rt.output_asset_id IS NULL OR rt.status='cancelled') AND NOT a.is_deleted
   AND p.status='succeeded' AND p.succeeded_at<=NOW()-INTERVAL '7 days'))
 AND (%s::UUID IS NULL OR a.asset_id=%s::UUID)
 ORDER BY COALESCE(rt.updated_at,p.succeeded_at),a.asset_id LIMIT %s"""


def candidates(conn,limit,asset_id=None):
    with conn.cursor() as cur:
        cur.execute(CANDIDATES,(asset_id,asset_id,limit));return [str(row[0]) for row in cur.fetchall()]


def inspect(conn,asset_id,storage,*,lock=False):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM ads.marketing_content_assets WHERE asset_id=%s"+(' FOR UPDATE' if lock else ''),(asset_id,))
        asset=cur.fetchone()
        if not asset or asset['source_type']!='ai_studio_output': raise PushBlocked('protected_asset')
        cur.execute('SELECT *,cleanup_at<=NOW() AS due FROM ads.content_remix_retention WHERE output_asset_id=%s',(asset_id,));retention=cur.fetchone()
        cur.execute("SELECT *,succeeded_at<=NOW()-INTERVAL '7 days' AS due,playback_verified_at>=NOW()-INTERVAL '24 hours' AS fresh FROM cloud_video.pushes WHERE output_asset_id=%s",(asset_id,));push=cur.fetchone()
        reason=retention['reason'] if retention and retention['status']!='cancelled' else 'delivered'
        if retention and retention['status']=='completed': raise PushBlocked('already_cleaned')
        if reason=='rejected':
            cur.execute("""SELECT COUNT(*)>0 AND BOOL_AND(COALESCE(rv.decision='rejected' AND rv.reviewed_at<=NOW()-INTERVAL '7 days',FALSE)) AS allowed
                FROM ads.content_remix_batch_runs br LEFT JOIN ads.content_remix_output_reviews rv
                ON rv.run_id=br.run_id AND rv.output_asset_id=br.output_asset_id WHERE br.output_asset_id=%s""",(asset_id,))
            if not cur.fetchone()['allowed'] or not asset['is_deleted'] or not retention['due']: raise PushBlocked('review_changed')
            if push and push['status'] in ('submitting','importing','uncertain'): raise PushBlocked('delivery_unresolved')
        elif not push or push['status']!='succeeded' or not push['due'] or not push['fresh'] or not all(push[k] for k in ('playback_outer_host','playback_inner_host','playback_path')) or (asset['is_deleted'] and not (retention and retention['reason']=='delivered' and retention['purge_started_at'])):
            raise PushBlocked('cloud_copy_unverified')
        cur.execute("SELECT EXISTS(SELECT 1 FROM ads.content_segments WHERE asset_id=%s) OR EXISTS(SELECT 1 FROM ads.content_production_revisions WHERE snapshot->'assets' @> %s::JSONB) AS used",(asset_id,'[{"assetId":"'+str(asset_id)+'"}]'))
        if cur.fetchone()['used']: raise PushBlocked('output_used_as_source')
        cur.execute("SELECT job_id,status,job_type,output_object_key FROM ads.marketing_content_asset_processing_jobs WHERE asset_id=%s"+(' FOR UPDATE' if lock else ''),(asset_id,))
        jobs=cur.fetchall()
        if any(j['status']=='running' for j in jobs): raise PushBlocked('processing_active')
        roles={'raw','preview','cover'} if reason=='rejected' else {'raw','preview'}
        cur.execute('SELECT bucket,object_key,object_role FROM ads.marketing_content_asset_objects WHERE asset_id=%s AND status<>\'deleted\'',(asset_id,))
        objects=[{'bucket':r['bucket'],'key':r['object_key'],'role':r['object_role']} for r in cur.fetchall() if r['object_role'] in roles]
        for role,column in [('raw','raw_object_key'),('preview','preview_object_key'),('cover','cover_object_key')]:
            if role in roles and asset[column]:
                key=asset[column];objects.append({'bucket':asset['bucket'] if role=='raw' else storage.config.bucket_for(key),'key':key,'role':role})
        for job in jobs:
            if job['job_type'] in roles and job['output_object_key']:
                key=job['output_object_key'];objects.append({'bucket':storage.config.bucket_for(key),'key':key,'role':job['job_type']})
        if retention and retention['purge_started_at']:
            # Keep the frozen manifest for crash recovery, including objects already deleted.
            objects=retention['objects']
        unique={}
        for obj in objects:
            key=obj['key']
            if not key or key.startswith('/') or '..' in key.split('/') or '://' in key or obj['bucket']!=storage.config.bucket_for(key):
                raise PushBlocked('storage_mismatch')
            cur.execute("""SELECT EXISTS(SELECT 1 FROM ads.marketing_content_assets WHERE asset_id<>%s AND
                (raw_object_key=%s OR preview_object_key=%s OR cover_object_key=%s)) OR
                EXISTS(SELECT 1 FROM ads.marketing_content_asset_objects WHERE asset_id<>%s AND bucket=%s AND object_key=%s AND status='active') OR
                EXISTS(SELECT 1 FROM ads.marketing_content_asset_processing_jobs WHERE asset_id<>%s AND (input_object_key=%s OR output_object_key=%s)) AS shared""",
                (asset_id,key,key,key,asset_id,obj['bucket'],key,asset_id,key,key))
            if cur.fetchone()['shared']: raise PushBlocked('shared_object')
            unique[(obj['bucket'],key)]=obj
        due=retention['cleanup_at'] if retention and retention['status']!='cancelled' else push['succeeded_at']+dt.timedelta(days=7)
        return {'outputAssetId':str(asset_id),'reason':reason,'cleanupAt':due.isoformat(),'objects':sorted(unique.values(),key=lambda o:(o['bucket'],o['key']))}
