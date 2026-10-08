"""Bind the caption consumer to a live Run; permissions stay with the API host."""
import copy
import re
import uuid

from psycopg2.extras import RealDictCursor

from .caption_preflight_queue import consume_one


def authorize_run(conn, job, *, authorize_sources):
    """Host callback must raise unless the current owner can edit every source.

    It must re-fetch active-user/role/asset rights via the canonical API policy;
    a prior approval or a client-supplied list is not a substitute. No default
    callback is provided. This read gate is not an atomic adoption permission.
    """
    request = job['metadata']['caption_request']
    run_id = str(uuid.UUID(request['runId']))

    def read():
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('''SELECT owner_user_id,status,stage,pause_requested,
                execution_version,source_snapshot FROM ads.content_production_runs
                WHERE run_id=%s''', (run_id,))
            row = cur.fetchone()
        conn.commit()
        if (not row or row['status'] != 'running' or row['stage'] != 'planning'
                or row['pause_requested'] or type(request['executionVersion']) is not int
                or row['execution_version'] != request['executionVersion']
                or not row['owner_user_id'].strip()):
            raise ValueError('caption Run is inactive or superseded')
        return dict(row)

    row = read()
    snapshot = row['source_snapshot']
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('assets'), list) or not snapshot['assets']:
        raise ValueError('caption Run has no frozen sources')
    sources = []
    seen = set()
    for asset in snapshot['assets']:
        asset_id = str(uuid.UUID(asset['assetId']))
        sha = asset['sha256']
        if (asset_id in seen or not isinstance(sha, str) or not re.fullmatch('[0-9a-f]{64}', sha)
                or not isinstance(asset.get('objectKey'), str) or not asset['objectKey'].strip()
                or type(asset.get('durationMs')) is not int or asset['durationMs'] <= 0):
            raise ValueError('invalid frozen caption source')
        seen.add(asset_id)
        sources.append({'assetId': asset_id, 'assetVersionId': f'{asset_id}-{sha[:16]}',
                        'objectKey': asset['objectKey'], 'sha256': sha, 'durationMs': asset['durationMs']})
    matches = [s for s in sources if s['assetVersionId'] == request['assetVersionId']]
    if (len(matches) != 1 or matches[0]['assetId'] != str(job['asset_id'])
            or matches[0]['sha256'] != request['sourceSha256']
            or matches[0]['objectKey'] != job['input_object_key']):
        raise ValueError('caption job does not match Run source')
    # Do not let callback mutation rewrite the snapshot used by this gate.
    authorize_sources(row['owner_user_id'], copy.deepcopy(snapshot))
    if read() != row:
        raise ValueError('caption Run changed during authorization')
    return sources


def consume_run_preflight(conn, storage, workspace, *, authorize_sources, call_model):
    """Host entrypoint: every consumer recheck reloads the Run and permissions."""
    return consume_one(conn, storage, workspace,
                       authorize=lambda job: authorize_run(conn, job, authorize_sources=authorize_sources),
                       call_model=call_model)
