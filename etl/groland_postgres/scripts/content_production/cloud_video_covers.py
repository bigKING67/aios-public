"""Covers for 视频云管家 originals (bucket `cloud_video`), made on the desktop.

Cloud originals are never copied to object storage, so the derivative queue (which downloads the raw
object) never covers them and their cards and player had no image. While idle, the desktop AI 切段
worker — the only one that reads cloud originals — takes the frame at 1 s from the sync's cache file,
or from the inner-network address once the file left the cache, with the same settings as every other
original's cover (`extract_cover`), uploads it as `cover/YYYY/MM/<asset>/<sha256>.webp` and records it
on the original. An original whose frame cannot be taken waits an hour before the next try; a storage
failure ends the sweep with nothing recorded, so the next idle sweep retries.
"""
import hashlib
import time
import uuid

from marketing_content_assets.models import VideoProbe
from marketing_content_assets.repository import _upsert_asset_object
from marketing_content_assets.tos_storage import build_object_key
from marketing_content_assets.video_processing import extract_cover

from . import cloud_video_sync
from .segment_suggestion_queue import CLOUD_BUCKET

SWEEP_LIMIT = 10
RETRY_SECONDS = 3600

PENDING_SQL = """SELECT a.asset_id::TEXT, LOWER(TRIM(a.raw_sha256)), 'https://' || v.inner_host || v.url_path
  FROM ads.marketing_content_assets a
  JOIN LATERAL (SELECT inner_host, url_path FROM cloud_video.videos
                WHERE asset_id = a.asset_id ORDER BY video_id LIMIT 1) v ON TRUE
  WHERE a.bucket = %s AND NOT a.is_deleted AND NULLIF(a.cover_object_key, '') IS NULL
    AND NOT (a.asset_id::TEXT = ANY(%s))
  ORDER BY a.created_at DESC, a.asset_id LIMIT %s"""
RECORD_SQL = """UPDATE ads.marketing_content_assets SET cover_object_key = %s, updated_at = NOW()
  WHERE asset_id = %s AND NULLIF(cover_object_key, '') IS NULL"""

_retry_after = {}  # asset id -> monotonic time before which its failed frame is not tried again


def pending(conn, limit=SWEEP_LIMIT, clock=time.monotonic):
    now = clock()
    waiting = [asset for asset, until in _retry_after.items() if until > now]
    with conn.cursor() as cur:
        cur.execute(PENDING_SQL, (CLOUD_BUCKET, waiting, limit))
        rows = cur.fetchall()
    conn.commit()
    return rows


def _frame(asset_id, sha256, inner_url, cache_dir, work, extract, opener):
    """The cover file of one original, from the cache or a hash-checked inner download."""
    source = cloud_video_sync.cache_path(cache_dir, sha256) if cache_dir else None
    downloaded = None
    try:
        if not (source and source.is_file()):
            downloaded = work / f'{asset_id}.mp4'
            got, _size = cloud_video_sync.download(inner_url, downloaded, *([opener] if opener else []))
            if got != sha256:
                raise RuntimeError('云管家原片摘要不匹配')
            source = downloaded
        target = work / f'{asset_id}.webp'
        extract(source, target)
        if not target.is_file() or target.stat().st_size == 0:
            raise RuntimeError('ffmpeg produced no frame')
        return target
    finally:
        if downloaded:
            downloaded.unlink(missing_ok=True)


def _record(conn, storage, asset_id, target):
    data = target.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    key = build_object_key('cover', asset_id, digest, '.webp')
    storage.upload_file(key, target, 'image/webp')
    with conn.cursor() as cur:
        cur.execute(RECORD_SQL, (key, asset_id))
        if cur.rowcount:
            _upsert_asset_object(cur, uuid.UUID(asset_id), 'cover', storage.config.bucket, key, 'image/webp', '.webp',
                                 len(data), digest, VideoProbe())
    conn.commit()


def sweep(conn, storage, cache_dir, work, *, limit=SWEEP_LIMIT, extract=extract_cover, opener=None,
          clock=time.monotonic):
    """Covers up to `limit` cloud originals without one; returns counts."""
    done = failed = 0
    for asset_id, sha256, inner_url in pending(conn, limit, clock):
        try:
            target = _frame(asset_id, sha256, inner_url, cache_dir, work, extract, opener)
        except Exception:  # noqa: BLE001 - one unreadable original must not block the others
            _retry_after[asset_id] = clock() + RETRY_SECONDS
            failed += 1
            continue
        try:
            _record(conn, storage, asset_id, target)
        except Exception:  # noqa: BLE001 - storage unavailable: stop and retry later
            conn.rollback()
            return {'covered': done, 'failed': failed, 'deferred': True}
        finally:
            target.unlink(missing_ok=True)
        _retry_after.pop(asset_id, None)
        done += 1
    return {'covered': done, 'failed': failed}
