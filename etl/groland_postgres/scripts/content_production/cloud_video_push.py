"""Desktop-only approved-output import. Disabled by default; no signed URLs in logs/DB.

python -m content_production.cloud_video_push --once [--dry-run] [--limit 1]
"""
import argparse
import json
import os
import sys
import uuid
from psycopg2.extras import RealDictCursor

from . import cloud_video_push_queue as queue
from .cloud_video_client import CloudVideoClient, CloudVideoError, api_lock
from .cloud_video_push_contract import PushBlocked, import_body, import_result, label_for, request_id

# Only documented validation/auth/rate rejections prove the import was refused.
# Vendor timeout (20001), generic failure (0), and malformed/unknown codes may
# follow acceptance, so they must never cause an automatic resubmission.
IMPORT_REJECTED_CODES = {20000, 20002, 20010, 20011, 20013, 20014, 20015, 20020, 20022}


def signed_url(storage, row):
    if storage.config.bucket_for(row['raw_object_key']) != row['bucket']:
        raise PushBlocked('storage_mismatch')
    url = storage.presign_get_url(row['raw_object_key'], ttl_seconds=86400, response_content_type='video/mp4')
    if not url.startswith('https://'):
        raise PushBlocked('storage_mismatch')
    return url


def query_import(conn, client, push):
    try:
        data = client.call('/openapi/video/import/query', {
            'requestId': push['request_id'], 'pageNo': 1, 'pageSize': 100})
        status, video_id = import_result(data, push['video_name'])
    except PushBlocked as error:
        queue.transition(conn, push['output_asset_id'], 'importing', code=str(error))
    except Exception:  # Vendor exceptions can contain signed request material; never persist them.
        queue.transition(conn, push['output_asset_id'], 'importing', code='query_failed')
    else:
        queue.transition(conn, push['output_asset_id'], status,
                         code='import_failed' if status == 'failed' else None, video_id=video_id)


def process(conn, client, storage, push, *, visibility=1, configured_ids=()):
    asset_id = push['output_asset_id']
    if not queue.lock(conn, asset_id):
        return
    try:
        # Re-read after the advisory lock: the caller's due list may be stale.
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT *,next_attempt_at<=NOW() AS due FROM cloud_video.pushes WHERE output_asset_id=%s', (asset_id,))
            push = cur.fetchone()
        conn.commit()
        status, current_request = push['status'], push['request_id']
        if not push['due'] or (status == 'failed' and (
            push['attempts'] >= push['retry_limit'] or push['error_code'] not in ('import_failed', 'vendor_rejected', 'query_failed')
        )):
            return
        if status == 'submitting':
            queue.transition(conn, asset_id, 'uncertain', code='submission_unknown')
            return
        if status == 'importing':
            query_import(conn, client, {**push, 'request_id': current_request})
            return
        if status not in ('pending', 'failed'):
            return
        try:
            row = queue.output(conn, push['run_id'])
            queue.eligible(row)
            meta = queue.metadata(conn, row)
            conn.commit()
            labels = label_for(client, meta['one_level_type_id'], meta['two_level_type_id'], configured_ids)
            body = import_body({**row, **meta, 'label_ids': labels}, signed_url(storage, row), visibility)
            queue.begin_submission(conn, row, meta, labels)
        except PushBlocked as error:
            conn.rollback()
            queue.transition(conn, asset_id, 'failed', code=str(error))
            return
        except (CloudVideoError, OSError):
            conn.rollback()
            queue.transition(conn, asset_id, 'failed', code='query_failed')
            return
        except Exception:
            conn.rollback()
            queue.transition(conn, asset_id, 'failed', code='output_unavailable')
            return
        try:
            data = client.write_once('/openapi/video/import', body)
        except CloudVideoError as error:
            if error.code in IMPORT_REJECTED_CODES:
                queue.transition(conn, asset_id, 'failed', code='vendor_rejected')
            else:
                queue.transition(conn, asset_id, 'uncertain', code='submission_unknown')
        except Exception:
            queue.transition(conn, asset_id, 'uncertain', code='submission_unknown')
        else:
            try:
                identifier = request_id(data)
            except PushBlocked:
                queue.transition(conn, asset_id, 'uncertain', code='submission_unknown')
            else:
                queue.transition(conn, asset_id, 'importing', request_id=identifier)
    finally:
        conn.rollback()
        queue.lock(conn, asset_id, acquire=False)


def run_once(conn, client, storage, *, limit=20, visibility=1, configured_ids=(), asset_id=None):
    queue.enqueue(conn, limit, asset_id)
    for push in queue.due(conn, limit, asset_id):
        process(conn, client, storage, push, visibility=visibility, configured_ids=configured_ids)
    # No payload, URL, credentials, or raw errors in operator output.
    with conn.cursor() as cur:
        cur.execute('SELECT status,COUNT(*) FROM cloud_video.pushes WHERE %s::UUID IS NULL OR output_asset_id=%s::UUID GROUP BY status',
                    (asset_id, asset_id))
        result = dict(cur.fetchall())
    conn.commit()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', required=True)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--asset-id', type=lambda value: str(uuid.UUID(value)), help='Only inspect or deliver this exact output asset')
    parser.add_argument('--recover-request-id', help='Query and bind a manually verified vendor request; requires --asset-id, never imports')
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error('--limit must be between 1 and 100')
    if args.recover_request_id and (not args.asset_id or args.dry_run):
        parser.error('--recover-request-id requires --asset-id and cannot be combined with --dry-run')
    if not args.dry_run and os.getenv('CONTENT_AI_STUDIO_DELIVERY_ENABLED') != 'true':
        print(json.dumps({'status': 'disabled'}))
        return 0
    from marketing_content_assets.repository import connect_pg
    with connect_pg() as conn:
        if args.dry_run:
            rows = []
            for row in queue.candidates(conn, args.limit, args.asset_id):
                item = {'outputAssetId': str(row['output_asset_id']), 'runId': str(row['run_id'])}
                try:
                    queue.eligible(row)
                    item.update(queue.metadata(conn, row))
                except PushBlocked as error:
                    item['errorCode'] = str(error)
                rows.append(item)
            conn.rollback()
            print(json.dumps({'status': 'dry_run', 'candidates': rows}, ensure_ascii=False))
            return 0
        if args.recover_request_id:
            from .cloud_video_push_recovery import recover
            with api_lock():
                result = recover(conn, CloudVideoClient.from_env(), args.asset_id, args.recover_request_id)
            print(json.dumps(result))
            return 0
        from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
        ids = tuple(int(value) for value in os.getenv('CLOUD_VIDEO_PUSH_LABEL_IDS', '').split(',') if value.strip())
        visibility = int(os.getenv('CLOUD_VIDEO_PUSH_VIDEO_RIGHT', '1'))
        if visibility not in (0, 1, 2, 3) or any(value <= 0 for value in ids):
            raise ValueError('Invalid delivery visibility or label IDs')
        from .cloud_video_playback_sync import refresh
        with api_lock():
            client = CloudVideoClient.from_env()
            result = run_once(conn, client, TosStorageClient(TosStorageConfig.from_env()),
                              limit=args.limit, visibility=visibility, configured_ids=ids, asset_id=args.asset_id)
            refresh(conn, client, limit=args.limit, asset_id=args.asset_id)
        print(json.dumps(result))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # Preserve observability without printing DB DSNs, request bodies or signed URLs.
        print('Cloud video delivery failed; inspect database delivery status.', file=sys.stderr)
        sys.exit(1)
