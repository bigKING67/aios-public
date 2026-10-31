"""competitor.analyses queue: claim, heartbeat and terminal writes (one claim token per run)."""

import json
import uuid

from psycopg2.extras import Json, RealDictCursor

LEASE_SQL = "INTERVAL '5 minutes'"
# The API stages the original after responding (bounded at 10 minutes); a row still unstaged
# after this lost its staging task (API restart) and must not block a new request.
STAGING_SQL = "INTERVAL '15 minutes'"
TRANSPORT_ATTEMPTS = 3


def claim(conn, claim_after=None):
    """Expires stale leases and lost staging, then claims the oldest staged analysis or returns None.
    `claim_after` (seconds): only analyses queued at least that long (fallback instance)."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Only a durable, already-billed delivery can safely survive a lost worker lease.
        cur.execute(f"""UPDATE competitor.analyses SET status='queued', claim_token=NULL,
          heartbeat_at=NOW(), error_code='storage_retry', error_message='分析结果已保存，等待恢复文件交付'
          WHERE status='running' AND heartbeat_at < NOW() - {LEASE_SQL}
            AND attempt < %s AND card IS NOT NULL
            AND usage->'deliveryCheckpoint'->>'version'='1'
            AND usage->'deliveryCheckpoint'->>'sourceSha256'=source_sha256""", (TRANSPORT_ATTEMPTS,))
        cur.execute(f"""UPDATE competitor.analyses SET status='failed', error_code='lease_expired',
          error_message='worker 已中断；模型调用可能已计费，请检查后重新发起分析', finished_at=NOW()
          WHERE status='running' AND heartbeat_at < NOW() - {LEASE_SQL}""")
        cur.execute(f"""UPDATE competitor.analyses SET status='failed', error_code='staging_lost',
          error_message='原片暂存中断，请重新发起分析', finished_at=NOW()
          WHERE status='queued' AND source_sha256 IS NULL AND created_at < NOW() - {STAGING_SQL}""")
        cur.execute("""SELECT analysis_id FROM competitor.analyses WHERE status='queued' AND source_sha256 IS NOT NULL
          AND (%s::INTEGER IS NULL OR created_at < NOW() - make_interval(secs => %s::INTEGER))
          AND (error_code IS DISTINCT FROM 'storage_retry' OR
               heartbeat_at <= NOW() - make_interval(secs => CASE WHEN attempt=1 THEN 60 ELSE 300 END))
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1""", (claim_after, claim_after))
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None
        token = str(uuid.uuid4())
        cur.execute("""UPDATE competitor.analyses SET status='running', claim_token=%s, heartbeat_at=NOW(),
          started_at=COALESCE(started_at,NOW()), attempt=attempt+1 WHERE analysis_id=%s
          RETURNING analysis_id::text, aweme_id, source_sha256, requested_by, attempt""", (token, row['analysis_id']))
        job = dict(cur.fetchone())
    conn.commit()
    job['claim_token'] = token
    return job


def previous_result(conn, job):
    """Only immutable, byte-identical source results are candidates for component reuse."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT analysis_id::text, source_sha256, input_manifest_hash, model_id, prompt_version,
          taxonomy_version, card, host_errors, evidence_objects FROM competitor.analyses
          WHERE aweme_id=%s AND analysis_id<>%s::uuid AND source_sha256=%s
            AND (status IN ('succeeded','partial') OR
                 (status='failed' AND usage->'deliveryCheckpoint'->>'version'='1'
                  AND usage->'deliveryCheckpoint'->>'sourceSha256'=source_sha256)) AND card IS NOT NULL
          ORDER BY created_at DESC LIMIT 1""", (job['aweme_id'], job['analysis_id'], job['source_sha256']))
        return cur.fetchone()


def heartbeat(conn, job):
    """Returns False when the run lost its lease (expired or cancelled)."""
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.analyses SET heartbeat_at=NOW()
          WHERE analysis_id=%s AND claim_token=%s AND status='running' RETURNING analysis_id""",
                    (job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def finish(conn, job, result):
    """Writes a succeeded/partial card. Returns False when the lease was lost."""
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.analyses SET status=%s, input_manifest_hash=%s, model_id=%s,
          prompt_version=%s, taxonomy_version=%s, card=%s, host_errors=%s, evidence_objects=%s, usage=%s,
          cost_yuan=%s, finished_at=NOW(), error_code=NULL, error_message=NULL
          WHERE analysis_id=%s AND claim_token=%s AND status='running' RETURNING analysis_id""",
                    (result['status'], result['input_manifest_hash'], result['model_id'], result['prompt_version'],
                     result['taxonomy_version'], Json(result['card']), Json(result['host_errors']),
                     Json(result['evidence_objects']), Json(result['usage']), result['cost_yuan'],
                     job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
        if row and result.get('video'):
            video = result['video']
            cur.execute("""UPDATE competitor.videos SET duration_seconds=COALESCE(duration_seconds, %s),
              brand_name=COALESCE(brand_name, %s), product_category=COALESCE(product_category, %s)
              WHERE aweme_id=%s""", (video.get('duration_seconds'), video.get('brand_name'),
                                     video.get('product_category'), job['aweme_id']))
    conn.commit()
    return bool(row)


def save_delivery(conn, job, result):
    """Checkpoint paid results before the first evidence upload; this is not publication."""
    usage = {**result['usage'], 'deliveryCheckpoint': {
        'version': 1, 'sourceSha256': job['source_sha256'],
        'status': result['status'], 'video': result['video']}}
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.analyses SET input_manifest_hash=%s, model_id=%s,
          prompt_version=%s, taxonomy_version=%s, card=%s, host_errors=%s, evidence_objects=%s,
          usage=%s, cost_yuan=%s
          WHERE analysis_id=%s AND claim_token=%s AND status='running' RETURNING analysis_id""",
                    (result['input_manifest_hash'], result['model_id'], result['prompt_version'],
                     result['taxonomy_version'], Json(result['card']), Json(result['host_errors']),
                     Json(result['evidence_objects']), Json(usage), result['cost_yuan'],
                     job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def delivery_result(conn, job):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT input_manifest_hash,model_id,prompt_version,taxonomy_version,card,
          host_errors,evidence_objects,usage,cost_yuan::float8 AS cost_yuan FROM competitor.analyses
          WHERE analysis_id=%s AND claim_token=%s AND status='running'
            AND usage ? 'deliveryCheckpoint'""", (job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
    if not row:
        return None
    checkpoint = row['usage'].pop('deliveryCheckpoint')
    if (checkpoint.get('version') != 1 or checkpoint.get('sourceSha256') != job['source_sha256']
            or checkpoint.get('status') not in ('succeeded', 'partial') or not row['card']):
        raise RuntimeError('invalid delivery checkpoint; refusing to repeat paid inference')
    return {**row, 'status': checkpoint['status'], 'video': checkpoint['video']}


def retry_storage(conn, job, usage):
    """Same analysis and source, at most three claims, with a persistent 60/300s delay."""
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.analyses SET
          status=CASE WHEN attempt < %s THEN 'queued' ELSE 'failed' END,
          error_code=CASE WHEN attempt < %s THEN 'storage_retry' ELSE 'storage_retry_exhausted' END,
          error_message=CASE WHEN attempt < %s THEN '文件传输暂时不可用，等待网络恢复后自动重试'
                             ELSE '文件传输自动重试已耗尽，请检查业务链路后重新分析' END,
          usage=COALESCE(usage,'{}'::jsonb) || %s::jsonb, heartbeat_at=NOW(), claim_token=NULL,
          finished_at=CASE WHEN attempt < %s THEN NULL ELSE NOW() END
          WHERE analysis_id=%s AND claim_token=%s AND status='running' RETURNING status""",
                    (TRANSPORT_ATTEMPTS, TRANSPORT_ATTEMPTS, TRANSPORT_ATTEMPTS, Json(usage),
                     TRANSPORT_ATTEMPTS, job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return row[0] if row else 'lease_lost'


def fail(conn, job, code, message, usage=None, cost_yuan=None):
    with conn.cursor() as cur:
        cur.execute("""UPDATE competitor.analyses SET status='failed', error_code=%s, error_message=%s,
          usage=COALESCE(%s, usage), cost_yuan=COALESCE(%s, cost_yuan), finished_at=NOW()
          WHERE analysis_id=%s AND claim_token=%s AND status='running' RETURNING analysis_id""",
                    (code, message[:500], Json(usage) if usage else None, cost_yuan,
                     job['analysis_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def manifest_hash(manifest):
    import hashlib
    return hashlib.sha256(json.dumps(manifest, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
