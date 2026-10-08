"""Per-segment cover frames for 片段素材 cards.

Segments of one original used to share the original's cover, so ten cards
looked identical. The AI 切段 worker sweeps, while idle, suggested/confirmed
segments whose `evidence.coverRange` does not match their current bounds and
cover rule, grabs the segment's opening shot (0.5 s after the start, which AI
切段 snaps to a shot cut, so the frame is past the cut but still in the first
shot) from the original's preview derivative (ffmpeg seeks over the signed URL,
so only a small range is read), uploads it as
`segment-cover/YYYY/MM/<segment>-<start>-<end>-<rule>.webp` and records
`coverKey`/`coverRange` in the segment evidence. AI 切段 covers its own new
suggestions from the already downloaded original (`cover_from_file`). Revision is not bumped: the
cover is derived data, not an edit. A failed range is remembered in
`coverFailedRange` and not retried until the bounds change.
"""
from datetime import datetime, timezone
import json
import subprocess

from psycopg2.extras import RealDictCursor

COVER_PREFIX = 'segment-cover'
SWEEP_LIMIT = 10
FRAME_TIMEOUT_SECONDS = 60
SIGNED_URL_TTL_SECONDS = 600
# Bumping the rule re-covers every segment (the range marker and key include it).
COVER_RULE = 'opening'
OPENING_OFFSET_MS = 500


def cover_time_ms(start_ms, end_ms):
    """The opening shot: just past the start cut, within the first third of a short segment."""
    return start_ms + min(OPENING_OFFSET_MS, (end_ms - start_ms) // 3)


def cover_range(start_ms, end_ms):
    return f'{COVER_RULE}:{start_ms}-{end_ms}'


def cover_key(segment_id, start_ms, end_ms, now=None):
    now = now or datetime.now(timezone.utc)
    return f'{COVER_PREFIX}/{now:%Y/%m}/{segment_id}-{start_ms}-{end_ms}-{COVER_RULE}.webp'


def pending(conn, bucket, limit=SWEEP_LIMIT):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT s.segment_id, s.start_ms, s.end_ms,
              COALESCE(NULLIF(a.preview_object_key, ''), a.raw_object_key) AS source_key
            FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id
            WHERE s.status IN ('suggested', 'confirmed') AND a.is_deleted = FALSE AND a.bucket = %s
              AND COALESCE(NULLIF(a.preview_object_key, ''), a.raw_object_key) IS NOT NULL
              AND COALESCE(s.evidence->>'coverRange', '') <> %s || ':' || s.start_ms || '-' || s.end_ms
              AND COALESCE(s.evidence->>'coverFailedRange', '') <> %s || ':' || s.start_ms || '-' || s.end_ms
            ORDER BY (s.status = 'confirmed') DESC, s.updated_at DESC, s.segment_id
            LIMIT %s""", (bucket, COVER_RULE, COVER_RULE, limit))
        rows = cur.fetchall()
    conn.commit()
    return rows


def extract_frame(url, seconds, target, env=None):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{seconds:.3f}', '-i', url, '-frames:v', '1',
                    '-vf', "scale='min(480,iw)':-2", '-quality', '72', str(target)],
                   check=True, capture_output=True, timeout=FRAME_TIMEOUT_SECONDS, env=env)
    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError('ffmpeg produced no frame')


def _record(conn, segment, fields):
    """Writes only while the bounds still match what the frame was taken from."""
    with conn.cursor() as cur:
        cur.execute("""UPDATE ads.content_segments
            SET evidence = COALESCE(evidence, '{}'::JSONB) || %s::JSONB
            WHERE segment_id = %s AND start_ms = %s AND end_ms = %s""",
                    (json.dumps(fields, ensure_ascii=False), str(segment['segment_id']), segment['start_ms'],
                     segment['end_ms']))
    conn.commit()


class CoverStorageError(RuntimeError):
    """Storage or signing failed; transient, so nothing is recorded and the segment stays pending."""


def _cover_one(conn, storage, segment, source, work, extract, env):
    """Frame → upload → evidence for one segment; True when covered, False when the frame failed.

    Only a frame that cannot be extracted (bad source or range) is recorded as
    `coverFailedRange`; upload or bookkeeping errors raise CoverStorageError so a
    storage outage never marks segments permanently failed.
    """
    bounds = cover_range(segment['start_ms'], segment['end_ms'])
    target = work / f"{segment['segment_id']}.webp"
    try:
        try:
            extract(source, cover_time_ms(segment['start_ms'], segment['end_ms']) / 1000, target, env)
        except Exception:  # noqa: BLE001 - a bad source must not block other segments
            conn.rollback()
            _record(conn, segment, {'coverFailedRange': bounds})
            return False
        try:
            key = cover_key(segment['segment_id'], segment['start_ms'], segment['end_ms'])
            storage.upload_file(key, target, 'image/webp')
            _record(conn, segment, {'coverKey': key, 'coverRange': bounds})
        except Exception as error:  # noqa: BLE001 - retried on a later sweep
            conn.rollback()
            raise CoverStorageError('segment cover upload failed') from error
        return True
    finally:
        target.unlink(missing_ok=True)


def sweep(conn, storage, work, *, limit=SWEEP_LIMIT, extract=extract_frame, env=None):
    """Covers up to `limit` pending segments from signed preview URLs; returns counts.

    A signing or upload failure ends the sweep without recording anything, so the
    next idle sweep retries the same segments once storage is back.
    """
    done = failed = 0
    for segment in pending(conn, storage.config.bucket, limit):
        try:
            source = storage.presign_get_url(segment['source_key'], SIGNED_URL_TTL_SECONDS)
            covered = _cover_one(conn, storage, segment, source, work, extract, env)
        except Exception:  # noqa: BLE001 - storage unavailable: stop and retry later
            conn.rollback()
            return {'covered': done, 'failed': failed, 'deferred': True}
        if covered:
            done += 1
        else:
            failed += 1
    return {'covered': done, 'failed': failed}


def cover_from_file(conn, storage, source_path, segments, work, *, extract=extract_frame, env=None):
    """Covers freshly published segments from a local copy of the original (no extra download)."""
    done = 0
    for segment in segments:
        try:
            done += _cover_one(conn, storage, segment, str(source_path), work, extract, env)
        except CoverStorageError:
            break  # the idle sweep covers the rest once storage is back
    return done
