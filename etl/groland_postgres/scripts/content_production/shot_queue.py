"""Fenced queue and atomic catalog publication for raw-video extraction."""
import hashlib
import json
import uuid
from psycopg2.extras import RealDictCursor
from .execution import Cancelled


def claim(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""UPDATE ads.content_production_shot_jobs SET
          status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE 'failed' END,
          stage='执行租约过期',error_message='worker 已中断，请检查后重新提取',finished_at=NOW()
          WHERE status IN ('running','cancel_requested') AND heartbeat_at<NOW()-INTERVAL '2 minutes'""")
        cur.execute("SELECT job_id FROM ads.content_production_shot_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None
        cur.execute("""UPDATE ads.content_production_shot_jobs SET status='running',stage='准备原片',claim_token=%s,heartbeat_at=NOW()
          WHERE job_id=%s RETURNING job_id,owner_user_id,asset_id,snapshot,claim_token""", (str(uuid.uuid4()), row['job_id']))
        job = dict(cur.fetchone())
    conn.commit()
    return job


def heartbeat(conn, job, stage):
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_production_shot_jobs SET heartbeat_at=NOW(),stage=%s
          WHERE job_id=%s AND claim_token=%s AND status IN ('running','cancel_requested') RETURNING status""",
                    (stage, job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    if not row or row[0] != 'running':
        raise Cancelled('extraction cancelled or lease lost')


def finish(conn, job, status, stored=None):
    """The completed job and catalog become visible in one transaction."""
    with conn.cursor() as cur:
        cur.execute("SELECT status FROM ads.content_production_shot_jobs WHERE job_id=%s AND claim_token=%s FOR UPDATE",
                    (job['job_id'], job['claim_token']))
        row = cur.fetchone()
        if not row or row[0] not in ('running', 'cancel_requested'):
            conn.rollback()
            return False
        if row[0] == 'cancel_requested':
            status = 'cancelled'
        catalog_id = None
        if status == 'completed':
            if stored is None:
                raise ValueError('missing extraction output')
            payload = json.dumps(stored, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
            digest = hashlib.sha256(payload.encode()).hexdigest()
            cur.execute("""INSERT INTO ads.content_production_shot_catalogs(catalog_id,owner_user_id,asset_id,content_hash,snapshot)
              VALUES (%s,%s,%s,%s,%s::JSONB) ON CONFLICT (owner_user_id,asset_id,content_hash) DO NOTHING""",
                        (str(uuid.uuid4()), job['owner_user_id'], job['asset_id'], digest, payload))
            cur.execute("SELECT catalog_id FROM ads.content_production_shot_catalogs WHERE owner_user_id=%s AND asset_id=%s AND content_hash=%s",
                        (job['owner_user_id'], job['asset_id'], digest))
            catalog_id = cur.fetchone()[0]
        stages = {'completed': '提取完成', 'cancelled': '已取消', 'failed': '提取失败'}
        cur.execute("""UPDATE ads.content_production_shot_jobs SET status=%s,stage=%s,catalog_id=%s,error_message=%s,finished_at=NOW()
          WHERE job_id=%s AND claim_token=%s""", (status, stages[status], catalog_id,
                    '提取失败，请检查原片、时长与 worker 环境' if status == 'failed' else None, job['job_id'], job['claim_token']))
    conn.commit()
    return status == 'completed'
