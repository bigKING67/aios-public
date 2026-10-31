"""PostgreSQL delivery queue; each asset has one durable, crash-safe submission state."""
from psycopg2.extras import Json, RealDictCursor
from . import remix_qc
from .cloud_video_push_contract import PushBlocked, category, video_name

SELECT_OUTPUT = """SELECT br.run_id,br.output_asset_id,br.batch_id,br.ordinal,br.segments,
    COALESCE(b.structure->>'mode','framework') AS mode,b.structure->'labels' AS labels,
    b.constraints->>'productName' AS product_name,b.created_at,pr.labels AS preset_labels,
    r.status AS run_status,rv.decision,rv.output_asset_id AS reviewed_asset_id,
    rv.reviewer_user_id,rv.reviewed_at,a.is_deleted,a.asset_status,a.bucket,a.raw_object_key,a.raw_sha256,
    revision.snapshot,j.receipt
    FROM ads.content_remix_batch_runs br
    JOIN ads.content_remix_batches b ON b.batch_id=br.batch_id
    JOIN ads.content_segment_presets pr ON pr.preset_key=b.preset_key AND pr.version=b.preset_version
    JOIN ads.content_production_runs r ON r.run_id=br.run_id
    JOIN ads.content_production_jobs j ON j.job_id=r.render_job_id
    JOIN ads.content_production_revisions revision ON revision.project_id=j.project_id AND revision.revision=j.revision
    JOIN ads.marketing_content_assets a ON a.asset_id=br.output_asset_id
    LEFT JOIN ads.content_remix_output_reviews rv ON rv.run_id=br.run_id """


def output(conn, run_id):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(SELECT_OUTPUT + ' WHERE br.run_id=%s', (run_id,))
        return cur.fetchone()


def eligible(row):
    if not row or row['decision'] != 'approved' or row['reviewed_asset_id'] != row['output_asset_id']:
        raise PushBlocked('approval_changed')
    if row['run_status'] != 'succeeded' or row['is_deleted'] or row['asset_status'] != 'ready' or not row['raw_object_key']:
        raise PushBlocked('output_unavailable')
    if remix_qc.delivery_reason(row['snapshot'], row['receipt']) or row['receipt']['host_remix_qc']['outputSha256'] != row['raw_sha256']:
        raise PushBlocked('qc_required')


def candidates(conn, limit, asset_id=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(SELECT_OUTPUT + """ WHERE r.status='succeeded' AND rv.decision='approved'
            AND rv.output_asset_id=br.output_asset_id AND NOT a.is_deleted
            AND j.receipt#>>'{host_remix_qc,status}'='passed'
            AND NOT EXISTS (SELECT 1 FROM cloud_video.pushes p WHERE p.output_asset_id=br.output_asset_id)
            AND (%s::UUID IS NULL OR br.output_asset_id=%s::UUID)
            ORDER BY rv.reviewed_at,br.run_id LIMIT %s""", (asset_id, asset_id, limit))
        return cur.fetchall()


def metadata(conn, row):
    ids = list({str(segment['assetId']) for segment in row['segments']})
    with conn.cursor() as cur:
        cur.execute("""SELECT v.asset_id::TEXT,v.one_level_type_id,v.two_level_type_id
            FROM cloud_video.videos v JOIN ads.marketing_content_assets a ON a.asset_id=v.asset_id
            WHERE v.asset_id=ANY(%s::UUID[]) AND v.one_level_type_id IS NOT NULL AND v.two_level_type_id IS NOT NULL
              AND (a.source_type<>'cloud_video' OR a.source_record_id IS NULL OR a.source_record_id=v.video_id::TEXT)""", (ids,))
        choices = {}
        for asset_id, one, two in cur.fetchall():
            choices.setdefault(asset_id, []).append((one, two))
    one, two = category(row['segments'], choices)
    return {'video_name': video_name(row), 'one_level_type_id': one, 'two_level_type_id': two}


def enqueue(conn, limit, asset_id=None):
    rows = candidates(conn, limit, asset_id)
    with conn.cursor() as cur:
        for row in rows:
            cur.execute("""INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at)
                VALUES (%s,%s,%s,%s) ON CONFLICT(output_asset_id) DO NOTHING""",
                        (row['output_asset_id'], row['run_id'], row['reviewer_user_id'], row['reviewed_at']))
    conn.commit()


def due(conn, limit, asset_id=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT * FROM cloud_video.pushes WHERE next_attempt_at<=NOW()
            AND (status IN ('pending','submitting','importing')
                 OR (status='failed' AND error_code IN ('import_failed','vendor_rejected','query_failed') AND attempts<retry_limit))
            AND (%s::UUID IS NULL OR output_asset_id=%s::UUID)
            ORDER BY next_attempt_at,created_at LIMIT %s""", (asset_id, asset_id, limit))
        return cur.fetchall()


def transition(conn, asset_id, status, *, code=None, request_id=None, video_id=None):
    with conn.cursor() as cur:
        cur.execute("""UPDATE cloud_video.pushes SET status=%s,error_code=%s,
            request_id=COALESCE(%s,request_id),cloud_video_id=COALESCE(%s,cloud_video_id),
            succeeded_at=CASE WHEN %s='succeeded' THEN NOW() ELSE succeeded_at END,
            next_attempt_at=NOW()+INTERVAL '30 minutes',updated_at=NOW(),
            submission_history=submission_history || %s::JSONB WHERE output_asset_id=%s""",
                    (status, code, request_id, video_id, status,
                     Json([{'status': status, 'errorCode': code, 'requestId': request_id, 'videoId': video_id}]), asset_id))
    conn.commit()


def begin_submission(conn, row, meta, label_ids):
    """Serialize with human review changes through the delivery row, then persist before HTTP.

    Review API blocks changes during 'submitting'. A crash leaves a non-replayable
    state; the next worker changes it to uncertain instead of submitting again.
    """
    with conn.cursor() as cur:
        cur.execute('SELECT PG_ADVISORY_XACT_LOCK(HASHTEXTEXTENDED(%s,0))',
                    ('aios-cloud-push-review:' + str(row['output_asset_id']),))
        cur.execute('SELECT status FROM cloud_video.pushes WHERE output_asset_id=%s FOR UPDATE', (row['output_asset_id'],))
        if cur.fetchone()[0] not in ('pending', 'failed'):
            raise PushBlocked('submission_unknown')
        current = output(conn, row['run_id'])
        eligible(current)
        cur.execute("""UPDATE cloud_video.pushes SET status='submitting',attempts=attempts+1,
            video_name=%s,two_level_type_id=%s,label_ids=%s,request_id=NULL,error_code=NULL,
            approved_by=%s,approved_at=%s,submitted_at=NOW(),next_attempt_at=NOW(),updated_at=NOW(),
            submission_history=submission_history || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
                'status','submitting','attempt',attempts+1,'at',NOW())) WHERE output_asset_id=%s""",
                    (meta['video_name'], meta['two_level_type_id'], label_ids,
                     current['reviewer_user_id'], current['reviewed_at'], row['output_asset_id']))
    conn.commit()


def lock(conn, asset_id, acquire=True):
    # Session locks survive the state commits; use a dedicated worker connection.
    function = 'pg_try_advisory_lock' if acquire else 'pg_advisory_unlock'
    with conn.cursor() as cur:
        cur.execute(f'SELECT {function}(HASHTEXTEXTENDED(%s,0))', ('aios-cloud-push:' + str(asset_id),))
        result = cur.fetchone()[0]
    conn.commit()
    return result
