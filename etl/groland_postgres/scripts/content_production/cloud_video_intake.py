"""视频云管家 originals → AI 创作中心 原片 and framework jobs (idle-time sweep of the AI 切段 worker).

The desktop sync (cloud_video_sync.py) marks which cloud 成片 are eligible and stores the SHA-256 of
their file. Here a role that may insert originals and jobs (the VPS worker) gives every eligible,
hashed video one original (`source_type='cloud_video'`, bucket `cloud_video`, raw key
`cloud-video://<video_id>`, the outer-network address in `source_url`) and queues one framework job per
source hash. Framework only: selling-point jobs stay manual for these originals (selling_point_auto
skips them). The job is claimed by the desktop, the only worker whose network reaches the files
(segment_suggestion_queue.claim(cloud=False) elsewhere). Results stay suggestions for review.

Configuration: CLOUD_VIDEO_OWNER_USER_ID (owner of originals and jobs; unset disables the sweep),
CLOUD_VIDEO_PRODUCT_NAME (default 百雀羚香粉), CONTENT_AI_STUDIO_ENTERPRISE (the studio's enterprise tag).
"""
import json
import os
import uuid

CLOUD_BUCKET = 'cloud_video'
SOURCE_TYPE = 'cloud_video'
SOURCE_PLATFORM = '视频云管家'
TRIGGER = 'cloud_video_intake'
DEFAULT_PRODUCT = '百雀羚香粉'
FRAMEWORK_DIMENSION = 'framework'
SWEEP_LIMIT = 20
ENTERPRISE_PREFIX = '企业:'

PENDING_SQL = """SELECT v.video_id, v.name, v.url_path, v.outer_host, v.file_sha256, v.duration_seconds, v.file_size, v.uploaded_at,
  v.asset_id::TEXT AS asset_id, LOWER(TRIM(a.raw_sha256)) AS asset_sha
  FROM cloud_video.videos v LEFT JOIN ads.marketing_content_assets a ON a.asset_id = v.asset_id
  WHERE v.eligibility IS NOT NULL AND v.file_sha256 IS NOT NULL
    AND v.name NOT LIKE '【AI%%'
    AND NOT EXISTS (SELECT 1 FROM cloud_video.pushes p WHERE p.cloud_video_id=v.video_id)
    AND (v.asset_id IS NULL OR a.asset_id IS NULL OR a.is_deleted OR LOWER(TRIM(a.raw_sha256)) IS DISTINCT FROM v.file_sha256
         OR NOT EXISTS (SELECT 1 FROM ads.content_segment_suggestion_jobs j
                        JOIN ads.content_segment_presets p ON p.preset_key = j.preset_key AND p.version = j.preset_version
                        WHERE j.asset_id = v.asset_id AND j.source_content_hash = v.file_sha256 AND p.dimension = %s))
  ORDER BY v.window_spend DESC NULLS LAST, v.video_id LIMIT %s"""
ASSET_INSERT = """INSERT INTO ads.marketing_content_assets (asset_id, title, asset_type, asset_status, source_type, source_platform,
  source_url, source_record_id, bucket, raw_object_key, raw_sha256, mime_type, file_ext, duration_seconds, file_size_bytes,
  product_name, tags, owner_user_id, uploaded_at)
  VALUES (%(asset_id)s, %(title)s, 'video', 'ready', %(source_type)s, %(platform)s, %(url)s, %(record)s, %(bucket)s, %(key)s,
          %(sha)s, 'video/mp4', 'mp4', %(duration)s, %(size)s, %(product)s, %(tags)s, %(owner)s, %(uploaded_at)s)"""
# A replaced file keeps the original and its history; old segments go stale by hash, as for uploads.
ASSET_REFRESH = """UPDATE ads.marketing_content_assets SET raw_sha256 = %(sha)s, source_url = %(url)s, title = %(title)s,
  duration_seconds = %(duration)s, file_size_bytes = %(size)s, is_deleted = FALSE, asset_status = 'ready', updated_at = NOW()
  WHERE asset_id = %(asset_id)s"""
LINK_SQL = 'UPDATE cloud_video.videos SET asset_id = %s WHERE video_id = %s'
# The same file may already be an original (an earlier upload, or another cloud video re-uploaded): reuse it,
# since active originals are unique by hash (idx_marketing_content_assets_raw_sha256_active).
SAME_FILE_SQL = """SELECT asset_id::TEXT FROM ads.marketing_content_assets
  WHERE LOWER(TRIM(raw_sha256)) = %s AND is_deleted = FALSE ORDER BY created_at LIMIT 1"""
PRESET_SQL = """SELECT preset_key, version, labels FROM ads.content_segment_presets
  WHERE dimension = %s AND status = 'active' ORDER BY version DESC LIMIT 1"""
JOB_INSERT = """INSERT INTO ads.content_segment_suggestion_jobs
  (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, request_settings)
  VALUES (%s, %s, %s, %s, %s, %s, %s)
  ON CONFLICT (asset_id, preset_key) WHERE status IN ('queued', 'running') DO NOTHING RETURNING job_id::TEXT"""

_state = {'allowed': None}


def owner():
    return (os.getenv('CLOUD_VIDEO_OWNER_USER_ID') or '').strip() or None


def enterprise_tag():
    name = (os.getenv('CONTENT_AI_STUDIO_ENTERPRISE') or '').strip()
    return f'{ENTERPRISE_PREFIX}{name}' if name and ':' not in name and len(name) <= 32 else None


def allowed(conn):
    """Whether this role may create originals and queue jobs (the VPS worker); checked once per process."""
    if _state['allowed'] is None:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('cloud_video.videos') IS NOT NULL")
            exists = cur.fetchone()[0]
            if exists:
                cur.execute("""SELECT has_table_privilege('ads.marketing_content_assets', 'INSERT')
                                 AND has_table_privilege('ads.content_segment_suggestion_jobs', 'INSERT')
                                 AND has_table_privilege('cloud_video.videos', 'UPDATE')""")
                exists = bool(cur.fetchone()[0])
        conn.commit()
        _state['allowed'] = bool(exists)
    return _state['allowed']


def sweep(conn, limit=SWEEP_LIMIT):
    """Creates or refreshes originals of eligible hashed cloud videos and queues their framework jobs.
    Returns {'originals': n, 'queued': n}."""
    user = owner()
    if not user or not allowed(conn):
        return {'originals': 0, 'queued': 0}
    product = (os.getenv('CLOUD_VIDEO_PRODUCT_NAME') or DEFAULT_PRODUCT).strip()
    tags = [tag for tag in [enterprise_tag()] if tag]
    created = queued = 0
    failed = []
    with conn.cursor() as cur:
        cur.execute(PRESET_SQL, (FRAMEWORK_DIMENSION,))
        preset = cur.fetchone()
        if not preset:
            conn.commit()
            return {'originals': 0, 'queued': 0}
        preset_key, version, labels = preset
        cur.execute(PENDING_SQL, (FRAMEWORK_DIMENSION, limit))
        settings = json.dumps({'labelKeys': [label['key'] for label in labels], 'trigger': TRIGGER})
        for video_id, name, url_path, outer_host, sha, duration, size, uploaded_at, asset_id, asset_sha in cur.fetchall():
            values = {'title': name, 'url': f'https://{outer_host}{url_path}', 'sha': sha, 'duration': duration, 'size': size}
            cur.execute('SAVEPOINT cloud_video')
            try:
                if asset_id is None or asset_sha != sha:
                    cur.execute(SAME_FILE_SQL, (sha,))
                    same = cur.fetchone()
                    if same:
                        asset_id = same[0]
                    elif asset_id is None:
                        asset_id = str(uuid.uuid4())
                        cur.execute(ASSET_INSERT, {**values, 'asset_id': asset_id, 'source_type': SOURCE_TYPE,
                                                   'platform': SOURCE_PLATFORM, 'record': str(video_id), 'bucket': CLOUD_BUCKET,
                                                   'key': f'cloud-video://{video_id}', 'product': product, 'tags': tags,
                                                   'owner': user, 'uploaded_at': uploaded_at})
                        created += 1
                    else:
                        cur.execute(ASSET_REFRESH, {**values, 'asset_id': asset_id})
                    cur.execute(LINK_SQL, (asset_id, video_id))
                cur.execute(JOB_INSERT, (str(uuid.uuid4()), user, asset_id, sha, preset_key, version, settings))
                queued += 1 if cur.fetchone() else 0
                cur.execute('RELEASE SAVEPOINT cloud_video')
            except Exception as error:  # noqa: BLE001 - one bad row must not block the others
                cur.execute('ROLLBACK TO SAVEPOINT cloud_video')
                failed.append(f'{video_id}: {type(error).__name__}')
    conn.commit()
    if failed:
        print(f'[cloud-video-intake] skipped {len(failed)}: {"; ".join(failed[:5])}', flush=True)
    return {'originals': created, 'queued': queued}
