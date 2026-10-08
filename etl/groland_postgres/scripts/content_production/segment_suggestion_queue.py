"""Fenced AI 切段 job queue and atomic publication of suggested segments.

Jobs are claimed with a token; every write checks the token and `running`
status, so an expired or cancelled worker can never publish. Expired leases fail
without retry because a model call may already have been billed. Publication
replaces only earlier `origin=ai, status=suggested` segments of the same
(asset, preset) by marking them `rejected` with `evidence.supersededByJobId`;
confirmed, rejected-by-human, stale and human segments are never touched.
Suggestions repeating a confirmed segment (same label, IoU >= 0.8) are skipped
and counted; an original without a product lends new suggestions the single
product its confirmed segments agree on.
"""
import json
import math
import unicodedata
import uuid
from psycopg2.extras import Json, RealDictCursor
from .execution import Cancelled
from .segment_suggestion_contract import drop_confirmed_duplicates, inherited_product
from .segment_suggestion_provider import SuggestionError

LEASE_SQL = "INTERVAL '2 minutes'"
MAX_PRODUCT_NAME_CHARS = 200


def claim(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"""UPDATE ads.content_segment_suggestion_jobs SET status='failed',stage='执行租约过期',
          error_code='lease_expired',error_message='worker 已中断；模型调用可能已计费，请检查后手动重新发起',
          finished_at=NOW(),updated_at=NOW()
          WHERE status='running' AND heartbeat_at<NOW()-{LEASE_SQL}""")
        cur.execute("SELECT job_id FROM ads.content_segment_suggestion_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")
        row = cur.fetchone()
        if not row:
            conn.commit()
            return None
        cur.execute("""UPDATE ads.content_segment_suggestion_jobs SET status='running',stage='准备原片',claim_token=%s,
          heartbeat_at=NOW(),attempt=attempt+1,started_at=NOW(),updated_at=NOW()
          WHERE job_id=%s RETURNING job_id,owner_user_id,asset_id,source_content_hash,preset_key,preset_version,request_settings,claim_token,attempt""",
                    (str(uuid.uuid4()), row['job_id']))
        job = dict(cur.fetchone())
    conn.commit()
    return job


def heartbeat(conn, job, stage):
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_segment_suggestion_jobs SET heartbeat_at=NOW(),stage=%s,updated_at=NOW()
          WHERE job_id=%s AND claim_token=%s AND status='running' RETURNING status""",
                    (stage, job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    if not row:
        raise Cancelled('segment suggestion cancelled or lease lost')


def record_request(conn, job, model, prompt_version, settings):
    """Persists the call intent before the billable provider request.

    Merged into the API-written settings so the requested `labelKeys` survive.
    """
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_segment_suggestion_jobs SET model=%s,prompt_version=%s,
          request_settings=request_settings||%s::JSONB,
          stage='调用模型',heartbeat_at=NOW(),updated_at=NOW()
          WHERE job_id=%s AND claim_token=%s AND status='running' RETURNING job_id""",
                    (model, prompt_version, Json(settings), job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    if not row:
        raise Cancelled('segment suggestion cancelled or lease lost')


def fail(conn, job, code, message, usage=None):
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_segment_suggestion_jobs SET status='failed',stage='切段失败',error_code=%s,
          error_message=%s,usage=COALESCE(%s,usage),finished_at=NOW(),updated_at=NOW()
          WHERE job_id=%s AND claim_token=%s AND status='running' RETURNING job_id""",
                    (code, message[:500], Json(usage) if usage else None, job['job_id'], job['claim_token']))
        row = cur.fetchone()
    conn.commit()
    return bool(row)


def asset_duration_ms(duration_seconds):
    """Mirrors the Rust segment contract: floor seconds*1000, unknown or invalid -> None."""
    if duration_seconds is None:
        return None
    value = float(duration_seconds)
    if not math.isfinite(value) or value <= 0:
        return None
    millis = math.floor(value * 1000)
    return millis if 1 <= millis <= 2 ** 31 - 1 else None


def normalize_product(value):
    """Mirrors Rust normalize_product_name: an over-long or control-character name is not inherited."""
    text = value.strip() if isinstance(value, str) else ''
    # Rust `char::is_control` is Unicode category Cc (C0, DEL and C1).
    if not text or len(text) > MAX_PRODUCT_NAME_CHARS or any(unicodedata.category(c) == 'Cc' for c in text):
        return None
    return text


def load_source(conn, job):
    """Current asset facts; a deleted, unready or changed asset fails the job (no retry)."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT raw_object_key,bucket,raw_sha256,duration_seconds,product_name,asset_status,external_only,is_deleted
          FROM ads.marketing_content_assets WHERE asset_id=%s""", (job['asset_id'],))
        asset = cur.fetchone()
        cur.execute("SELECT name,labels,status FROM ads.content_segment_presets WHERE preset_key=%s AND version=%s",
                    (job['preset_key'], job['preset_version']))
        preset = cur.fetchone()
    conn.commit()
    if not asset or asset['is_deleted'] or asset['asset_status'] != 'ready' or asset['external_only'] or not asset['raw_object_key']:
        raise SuggestionError('source_unavailable', '原片已删除、未就绪或不可读取')
    if (asset['raw_sha256'] or '').strip().lower() != job['source_content_hash']:
        raise SuggestionError('source_changed', '原片内容已变化，请重新发起切段')
    if not preset or preset['status'] != 'active':
        raise SuggestionError('preset_retired', '分类预设已停用')
    return {'objectKey': asset['raw_object_key'], 'bucket': asset['bucket'], 'durationMs': asset_duration_ms(asset['duration_seconds']),
            'productName': normalize_product(asset['product_name']), 'presetName': preset['name'], 'labels': preset['labels']}


def publish(conn, job, source, segments, *, model, provider, summary, usage, inserted=None):
    """One transaction: fence, recheck source/preset, supersede old AI suggestions, insert, succeed.

    `inserted`, when given, receives {segment_id, start_ms, end_ms} of the new rows after commit.
    """
    written = []
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT status FROM ads.content_segment_suggestion_jobs WHERE job_id=%s AND claim_token=%s FOR UPDATE",
                        (job['job_id'], job['claim_token']))
            row = cur.fetchone()
            if not row or row['status'] != 'running':
                conn.rollback()
                return False
            cur.execute("""SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id=%s AND is_deleted=FALSE
              AND asset_status='ready' FOR SHARE""", (job['asset_id'],))
            asset = cur.fetchone()
            if not asset or (asset['raw_sha256'] or '').strip().lower() != job['source_content_hash']:
                raise SuggestionError('source_changed', '原片内容已变化，请重新发起切段')
            cur.execute("SELECT status FROM ads.content_segment_presets WHERE preset_key=%s AND version=%s FOR SHARE",
                        (job['preset_key'], job['preset_version']))
            preset = cur.fetchone()
            if not preset or preset['status'] != 'active':
                raise SuggestionError('preset_retired', '分类预设已停用')
            # Same scope lock as the Rust segment writers.
            cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s || ':' || %s, 0))",
                        (str(job['asset_id']), job['preset_key']))
            cur.execute("""UPDATE ads.content_segments SET status='stale',revision=revision+1,updated_at=NOW()
              WHERE asset_id=%s AND source_content_hash<>%s AND status<>'stale'""",
                        (job['asset_id'], job['source_content_hash']))
            cur.execute("""UPDATE ads.content_segments SET status='rejected',revision=revision+1,updated_at=NOW(),
              evidence=evidence || jsonb_build_object('supersededByJobId', %s::TEXT)
              WHERE asset_id=%s AND preset_key=%s AND origin='ai' AND status='suggested' AND source_content_hash=%s""",
                        (str(job['job_id']), job['asset_id'], job['preset_key'], job['source_content_hash']))
            superseded = cur.rowcount
            cur.execute("""SELECT start_ms,end_ms,label_key,product_name FROM ads.content_segments
              WHERE asset_id=%s AND preset_key=%s AND status='confirmed' AND source_content_hash=%s""",
                        (job['asset_id'], job['preset_key'], job['source_content_hash']))
            confirmed = cur.fetchall()
            segments, duplicates = drop_confirmed_duplicates(segments, confirmed)
            product_name = inherited_product(source['productName'], confirmed)
            for segment in segments:
                evidence = {'jobId': str(job['job_id']), 'provider': provider, 'model': model,
                            'promptVersion': summary['promptVersion'], 'confidence': segment['confidence'],
                            'reason': segment['reason'], 'basis': 'model-observation'}
                segment_id = str(uuid.uuid4())
                written.append({'segment_id': segment_id, 'start_ms': segment['start_ms'], 'end_ms': segment['end_ms']})
                cur.execute("""INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,
                  source_duration_ms,start_ms,end_ms,preset_key,preset_version,label_key,product_name,origin,status,evidence)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ai','suggested',%s)""",
                            (segment_id, job['owner_user_id'], job['asset_id'], job['source_content_hash'],
                             source['durationMs'], segment['start_ms'], segment['end_ms'], job['preset_key'],
                             job['preset_version'], segment['label_key'], product_name, Json(evidence)))
            result = {**summary, 'segmentsInserted': len(segments), 'supersededSuggestions': superseded,
                      'skippedConfirmedDuplicates': duplicates}
            cur.execute("""UPDATE ads.content_segment_suggestion_jobs SET status='succeeded',stage='切段完成',
              result_summary=%s,usage=%s,finished_at=NOW(),updated_at=NOW() WHERE job_id=%s""",
                        (json.dumps(result, ensure_ascii=False), Json(usage or {}), job['job_id']))
        conn.commit()
        if inserted is not None:
            inserted.extend(written)
        return True
    except Exception:
        conn.rollback()
        raise
