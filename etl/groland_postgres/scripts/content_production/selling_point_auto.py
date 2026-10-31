"""Queues AI 卖点切段 once an original's framework review is done (idle-time sweep of the AI 切段 worker).

Selling points are split inside confirmed 混剪口播 segments, so a selling-point job only makes sense
after the framework review. Nothing chained the two, and originals sat without selling-point
suggestions until someone started the job by hand. An original qualifies when, for its current
source hash, it has a confirmed 混剪口播 segment, no framework suggestion still waiting for review,
no framework job queued or running, and no selling-point job or segment yet: each source is queued
at most once, re-runs stay manual. The job carries every label of the active selling-point preset
and is owned by whoever confirmed the framework segments last. Results stay suggestions for review.

Only a role that may insert jobs sweeps (the VPS worker); the GPU node lacks the grant and skips,
then claims the queued jobs like any other. `CONTENT_AI_STUDIO_SELLING_POINT_AUTO=false` turns it off.
"""
import json
import os
import uuid

ENABLED_ENV = 'CONTENT_AI_STUDIO_SELLING_POINT_AUTO'
# Bounds one sweep; the next idle sweep continues.
SWEEP_LIMIT = 20
FRAMEWORK_DIMENSION = 'framework'
SELLING_POINT_DIMENSION = 'selling_point'
VOICEOVER_LABEL = 'mixed_voiceover'
TRIGGER = 'auto_after_framework'

_state = {'allowed': None}

ELIGIBLE_SELECT = """
SELECT a.asset_id::text AS asset_id, LOWER(TRIM(a.raw_sha256)) AS sha,
       (SELECT s.confirmed_by FROM ads.content_segments s
         WHERE s.asset_id = a.asset_id AND s.source_content_hash = LOWER(TRIM(a.raw_sha256))
           AND s.status = 'confirmed' AND s.preset_key IN (SELECT preset_key FROM ads.content_segment_presets
                                                            WHERE dimension = %(framework)s)
         ORDER BY s.confirmed_at DESC NULLS LAST LIMIT 1) AS owner
FROM ads.marketing_content_assets a
WHERE a.is_deleted = FALSE AND a.raw_sha256 IS NOT NULL
  -- 视频云管家 originals get framework jobs only (cloud_video_intake); their selling points stay manual.
  AND a.bucket <> 'cloud_video'
  AND EXISTS (SELECT 1 FROM ads.content_segments s
              WHERE s.asset_id = a.asset_id AND s.source_content_hash = LOWER(TRIM(a.raw_sha256))
                AND s.status = 'confirmed' AND s.label_key = %(voiceover)s
                AND s.preset_key IN (SELECT preset_key FROM ads.content_segment_presets WHERE dimension = %(framework)s))
  AND NOT EXISTS (SELECT 1 FROM ads.content_segments s
                  WHERE s.asset_id = a.asset_id AND s.status = 'suggested'
                    AND s.preset_key IN (SELECT preset_key FROM ads.content_segment_presets WHERE dimension = %(framework)s))
  AND NOT EXISTS (SELECT 1 FROM ads.content_segment_suggestion_jobs j
                  WHERE j.asset_id = a.asset_id AND j.status IN ('queued', 'running')
                    AND j.preset_key IN (SELECT preset_key FROM ads.content_segment_presets WHERE dimension = %(framework)s))
  AND NOT EXISTS (SELECT 1 FROM ads.content_segment_suggestion_jobs j
                  WHERE j.asset_id = a.asset_id AND j.source_content_hash = LOWER(TRIM(a.raw_sha256))
                    AND j.preset_key IN (SELECT preset_key FROM ads.content_segment_presets WHERE dimension = %(points)s))
  AND NOT EXISTS (SELECT 1 FROM ads.content_segments s
                  WHERE s.asset_id = a.asset_id AND s.source_content_hash = LOWER(TRIM(a.raw_sha256))
                    AND s.preset_key IN (SELECT preset_key FROM ads.content_segment_presets WHERE dimension = %(points)s))
ORDER BY a.created_at
LIMIT %(limit)s
"""

PRESET_SELECT = """
SELECT preset_key, version, labels FROM ads.content_segment_presets
WHERE dimension = %s AND status = 'active' ORDER BY version DESC LIMIT 1
"""

JOB_INSERT = """
INSERT INTO ads.content_segment_suggestion_jobs
  (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, request_settings)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (asset_id, preset_key) WHERE status IN ('queued', 'running') DO NOTHING
RETURNING job_id::text
"""


def enabled():
    return (os.getenv(ENABLED_ENV) or 'true').strip().lower() not in ('0', 'false', 'no', 'off')


def allowed(conn):
    """Whether this role may queue jobs; checked once per process."""
    if _state['allowed'] is None:
        with conn.cursor() as cur:
            cur.execute("SELECT has_table_privilege('ads.content_segment_suggestion_jobs', 'INSERT')")
            _state['allowed'] = bool(cur.fetchone()[0])
        conn.commit()
        if not _state['allowed']:
            print('[selling-point-auto] role cannot queue jobs; left to another worker', flush=True)
    return _state['allowed']


def sweep(conn, limit=SWEEP_LIMIT):
    """Queues selling-point jobs for qualifying originals; returns the queued job ids."""
    if not enabled() or not allowed(conn):
        return []
    with conn.cursor() as cur:
        cur.execute(PRESET_SELECT, (SELLING_POINT_DIMENSION,))
        preset = cur.fetchone()
        if not preset:
            conn.commit()
            return []
        preset_key, version, labels = preset
        label_keys = [label['key'] for label in labels]
        cur.execute(ELIGIBLE_SELECT, {'framework': FRAMEWORK_DIMENSION, 'points': SELLING_POINT_DIMENSION,
                                      'voiceover': VOICEOVER_LABEL, 'limit': limit})
        queued = []
        for asset_id, sha, owner in cur.fetchall():
            if not owner:
                continue
            settings = json.dumps({'labelKeys': label_keys, 'trigger': TRIGGER})
            cur.execute(JOB_INSERT, (str(uuid.uuid4()), owner, asset_id, sha, preset_key, version, settings))
            row = cur.fetchone()
            if row:
                queued.append(row[0])
    conn.commit()
    return queued
