"""Semantic jobs: fenced completion, no automatic retries of model calls."""
import json
import uuid
from psycopg2.extras import RealDictCursor
from .execution import Cancelled


def claim(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""UPDATE ads.content_production_semantic_jobs SET
          status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE 'failed' END,
          stage='执行租约过期',error_message='worker 已中断；模型可能已收费，请检查后手动重试',finished_at=NOW()
          WHERE status IN ('running','cancel_requested') AND heartbeat_at<NOW()-INTERVAL '2 minutes'""")
        cur.execute("SELECT job_id FROM ads.content_production_semantic_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None
        cur.execute("""UPDATE ads.content_production_semantic_jobs SET status='running',stage='准备原片',claim_token=%s,heartbeat_at=NOW()
          WHERE job_id=%s RETURNING job_id,catalog_id,snapshot,claim_token""", (str(uuid.uuid4()), row['job_id']))
        job = dict(cur.fetchone())
    conn.commit()
    return job


def heartbeat(conn, job, stage):
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_production_semantic_jobs SET heartbeat_at=NOW(),stage=%s
          WHERE job_id=%s AND claim_token=%s AND status IN ('running','cancel_requested') RETURNING status""",
                    (stage, job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    if not row or row[0] != 'running':
        raise Cancelled('Semantic job cancelled or lease lost')


def finish(conn, job, status, result=None):
    if status == 'completed' and result is None:
        raise ValueError('Missing semantic result')
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_production_semantic_jobs SET
          status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE %s END,
          stage=CASE WHEN status='cancel_requested' THEN '已取消' ELSE %s END,
          result=CASE WHEN status='cancel_requested' THEN NULL ELSE %s::JSONB END,
          error_message=%s,finished_at=NOW()
          WHERE job_id=%s AND claim_token=%s AND status IN ('running','cancel_requested') RETURNING status""",
                    (status, {'completed': '语义分析完成', 'failed': '语义分析失败', 'cancelled': '已取消'}[status],
                     json.dumps(result, ensure_ascii=False) if result is not None else None,
                     '分析失败；已发模型调用可能收费，请检查后手动重试' if status == 'failed' else None,
                     job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row and row[0] == status)
