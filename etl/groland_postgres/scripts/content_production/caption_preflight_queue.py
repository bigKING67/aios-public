"""Host consumer for caption preflight suboperations in the existing asset queue.

The host must supply live authorization/source revalidation and a model callback.
No public request may provide storage paths or bypass the authorization callback.
"""
import json
import uuid
import hashlib
import secrets
from pathlib import Path

from psycopg2.extras import RealDictCursor
from .caption_quality import document_digest
from .source_caption_input import preflight_source_captions

OPERATION = 'source_caption_preflight_v1'


def claim(conn):
    token = str(uuid.uuid4())
    authorization_secret = secrets.token_urlsafe(32)
    authorization_digest = hashlib.sha256(authorization_secret.encode()).hexdigest()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""UPDATE ads.marketing_content_asset_processing_jobs
          SET status='failed',finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,
              error_message='caption_preflight_expired'
          WHERE job_type='analysis' AND status='running' AND max_attempts=1
            AND metadata->>'operation'=%s AND (started_at IS NULL OR started_at <= clock_timestamp()-INTERVAL '20 minutes')""",
          (OPERATION,))
        cur.execute("""WITH next_job AS (
          SELECT job_id FROM ads.marketing_content_asset_processing_jobs
          WHERE job_type='analysis' AND status='queued' AND attempts=0 AND max_attempts=1
            AND metadata->>'operation'=%s
          ORDER BY queued_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1)
          UPDATE ads.marketing_content_asset_processing_jobs j
          SET status='running', attempts=1, started_at=CURRENT_TIMESTAMP,
              updated_at=CURRENT_TIMESTAMP, error_message=NULL,
              metadata=j.metadata || jsonb_build_object('caption_claim_token',%s::text,'caption_calls_reserved',0,
                'caption_authorization_sha256',%s::text)
          FROM next_job n WHERE j.job_id=n.job_id
          RETURNING j.job_id,j.asset_id,j.input_object_key,j.metadata,j.attempts,j.max_attempts""",
          (OPERATION, token, authorization_digest))
        row = cur.fetchone()
    conn.commit()
    if row is None:
        return None
    job = dict(row)
    # Capability exists only in this claimant's memory, never queue metadata/logs.
    job['authorization_secret'] = authorization_secret
    return job


def _mutate(conn, job, request, *, report=None, failure=None, reserve=False):
    token = job['metadata']['caption_claim_token']
    with conn.cursor() as cur:
        # Lock first: evaluate wall-clock expiry after any lock wait.
        cur.execute('SELECT job_id FROM ads.marketing_content_asset_processing_jobs WHERE job_id=%s FOR UPDATE',
                    (job['job_id'],))
        if reserve:
            cur.execute("""UPDATE ads.marketing_content_asset_processing_jobs
              SET metadata=jsonb_set(metadata,'{caption_calls_reserved}',
                    to_jsonb((metadata->>'caption_calls_reserved')::integer+1)),updated_at=CURRENT_TIMESTAMP
              WHERE job_id=%s AND status='running' AND attempts=1 AND max_attempts=1
                AND metadata->>'operation'=%s AND metadata->>'caption_claim_token'=%s
                AND COALESCE(metadata->'caption_request','null'::jsonb)=%s::jsonb
                AND started_at > clock_timestamp()-INTERVAL '20 minutes'
                AND (metadata->>'caption_calls_reserved')::integer < %s RETURNING job_id""",
              (job['job_id'], OPERATION, token, json.dumps(request), request['maxCalls']))
        else:
            value = {'requestSha256': document_digest(request), 'report': report,
                     'reportSha256': document_digest(report) if report is not None else None,
                     'deliveryApproved': False}
            cur.execute("""UPDATE ads.marketing_content_asset_processing_jobs
              SET status=%s,finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,
                  error_message=%s,metadata=metadata || jsonb_build_object('host_caption_preflight',%s::jsonb)
              WHERE job_id=%s AND status='running' AND attempts=1 AND max_attempts=1
                AND metadata->>'operation'=%s AND metadata->>'caption_claim_token'=%s
                AND COALESCE(metadata->'caption_request','null'::jsonb)=%s::jsonb
                AND (%s OR started_at > clock_timestamp()-INTERVAL '20 minutes') RETURNING job_id""",
              ('failed' if failure else 'succeeded', failure, json.dumps(value), job['job_id'], OPERATION,
               token, json.dumps(request), bool(failure)))
        accepted = cur.fetchone() is not None
    conn.commit()
    if not accepted:
        raise ValueError('caption preflight claim changed or call budget exhausted')


def consume_one(conn, storage, workspace, *, authorize, call_model, download_source=None):
    """Claim once, preflight, persist once; failures never return to queued.

    authorize(job) must check current owner permissions, Run execution version,
    pause/cancel state and return the current permission-checked frozen source list.
    """
    job = claim(conn)
    if job is None:
        return None
    request = job['metadata'].get('caption_request')
    try:
        if (not isinstance(request, dict) or set(request) != {
                'runId', 'executionVersion', 'assetVersionId', 'sourceSha256',
                'startFrame', 'frames', 'requiredFrames', 'region', 'model', 'maxCalls'}
                or type(request['executionVersion']) is not int or request['executionVersion'] < 1
                or type(request['maxCalls']) is not int or not 3 <= request['maxCalls'] <= 7):
            raise ValueError('invalid caption preflight request')
        uuid.UUID(request['runId'])
        sources = authorize(job)
        frozen_digest = document_digest(sources)
        matches = [s for s in sources if s['assetVersionId'] == request['assetVersionId']]
        if len(matches) != 1:
            raise ValueError('caption source version unavailable')
        source = matches[0]
        if (str(job['asset_id']) != source['assetId'] or source['sha256'] != request['sourceSha256']
                or source['objectKey'] != job['input_object_key']):
            raise ValueError('caption source differs from frozen job input')
        root = Path(workspace)
        if root.is_symlink():
            raise ValueError('caption workspace cannot be a symlink')
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        import os
        if root.stat().st_uid != os.geteuid() or root.stat().st_mode & 0o777 != 0o700:
            raise ValueError('caption workspace must be private')
        work = root / str(uuid.UUID(str(job['job_id'])))
        work.mkdir(mode=0o700, exist_ok=False)  # A claimed job is never silently replayed.
        media = work / 'source.mp4'
        def check():
            if document_digest(authorize(job)) != frozen_digest:
                raise ValueError('caption frozen sources changed')
            with conn.cursor() as cur:
                cur.execute("""SELECT job_id FROM ads.marketing_content_asset_processing_jobs
                  WHERE job_id=%s AND status='running' AND attempts=1 AND max_attempts=1
                    AND metadata->>'operation'=%s AND metadata->>'caption_claim_token'=%s
                    AND COALESCE(metadata->'caption_request','null'::jsonb)=%s::jsonb
                    AND started_at > clock_timestamp()-INTERVAL '20 minutes'""",
                  (job['job_id'], OPERATION, job['metadata']['caption_claim_token'], json.dumps(request)))
                valid = cur.fetchone() is not None
            conn.commit()
            if not valid:
                raise ValueError('caption preflight cancelled or superseded')
        check()
        if download_source is None:
            storage.download_file(source['objectKey'], media)
        else:
            download_source(source, media, check)
        def dispatch(messages):
            check()
            _mutate(conn, job, request, reserve=True)  # Reservation survives a lost provider response.
            result = call_model(request['model'], messages)
            check()
            return result
        report = preflight_source_captions(sources, request['assetVersionId'], request['startFrame'],
            request['frames'], {request['assetVersionId']: media}, work / 'preflight',
            required_frames=request['requiredFrames'], region=request['region'], model=request['model'],
            max_calls=request['maxCalls'], call_model=dispatch, check=check)
        check()
        _mutate(conn, job, request, report=report)
        return report
    except Exception:
        conn.rollback()
        # Stable error code only: provider strings can contain sensitive request details.
        _mutate(conn, job, request, failure='caption_preflight_failed')
        raise
