from __future__ import annotations

import json
import uuid
from psycopg2.extras import RealDictCursor
from .execution import Cancelled


def claim(conn) -> dict | None:
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("""UPDATE ads.content_production_jobs SET status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE 'failed' END,
          stage='worker 已中断', error_message='执行租约过期，请检查 worker 后重新制作', finished_at=NOW()
          WHERE status IN ('running','cancel_requested') AND heartbeat_at < NOW()-INTERVAL '2 minutes'""")
        cursor.execute("SELECT job_id FROM ads.content_production_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")
        row = cursor.fetchone()
        if not row:
            conn.commit()
            return None
        token = str(uuid.uuid4())
        cursor.execute("""UPDATE ads.content_production_jobs SET status='running',claim_token=%s,heartbeat_at=NOW(),stage='准备原片'
          WHERE job_id=%s RETURNING job_id,project_id,revision,preview""", (token, row["job_id"]))
        job = dict(cursor.fetchone())
        cursor.execute("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=%s AND revision=%s", (job["project_id"], job["revision"]))
        job["snapshot"] = cursor.fetchone()["snapshot"]
        job["claim_token"] = token
    conn.commit()
    return job


def heartbeat(conn, job: dict, stage: str) -> None:
    with conn.cursor() as cursor:
        cursor.execute("""UPDATE ads.content_production_jobs SET heartbeat_at=NOW(),stage=%s
          WHERE job_id=%s AND claim_token=%s AND status IN ('running','cancel_requested') RETURNING status""",
                       (stage, job["job_id"], job["claim_token"]))
        row = cursor.fetchone()
    conn.commit()
    if not row or row[0] != "running":
        raise Cancelled("任务已取消或执行租约失效")


def finish(conn, job: dict, status: str, *, key=None, receipt=None, error=None) -> bool:
    with conn.cursor() as cursor:
        cursor.execute("""UPDATE ads.content_production_jobs SET
          status=CASE WHEN status='cancel_requested' THEN 'cancelled' ELSE %s END,
          stage=CASE WHEN status='cancel_requested' THEN '已取消' ELSE %s END,
          output_object_key=CASE WHEN status='cancel_requested' THEN NULL ELSE %s END,
          receipt=CASE WHEN status='cancel_requested' THEN NULL ELSE %s::JSONB END,
          error_message=%s,finished_at=NOW()
          WHERE job_id=%s AND claim_token=%s AND status IN ('running','cancel_requested') RETURNING status""",
                       (status, {"completed": "制作完成", "failed": "制作失败", "cancelled": "已取消"}[status], key,
                        json.dumps(receipt) if receipt else None, error, job["job_id"], job["claim_token"]))
        row = cursor.fetchone()
    conn.commit()
    return bool(row and row[0] == status)


def verify_sources(conn, snapshot: dict, bucket: str) -> None:
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        for asset in snapshot["assets"]:
            cursor.execute("""SELECT raw_object_key,raw_sha256 FROM ads.marketing_content_assets
              WHERE asset_id=%s AND bucket=%s AND asset_status='ready' AND NOT external_only
                AND repurpose_allowed IS DISTINCT FROM FALSE AND authorization_status NOT IN ('restricted','expired')
                AND (authorization_starts_at IS NULL OR authorization_starts_at<=CURRENT_DATE)
                AND (authorization_expires_at IS NULL OR authorization_expires_at>=CURRENT_DATE)""", (asset["assetId"], bucket))
            row = cursor.fetchone()
            if not row or row["raw_object_key"] != asset["objectKey"] or (row["raw_sha256"] or "").lower() != asset["sha256"]:
                raise RuntimeError("源素材已变化、不可用或有复剪限制")
    conn.commit()
