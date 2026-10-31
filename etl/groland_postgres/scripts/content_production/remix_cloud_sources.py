"""Resolve frozen cloud-video identities to current, verified external originals.

No vendor URLs enter snapshots/receipts and no cloud-video URI is sent to Garage.
This adapter stays opt-in until a real MediaKit source-read trial is accepted.
"""
import os
import re
from urllib.parse import quote

from psycopg2.extras import RealDictCursor

ENABLED_ENV = "CONTENT_AI_STUDIO_CLOUD_REMIX_ENABLED"
SOURCE_ERROR = "云原片已变化、不可用或有复剪限制"


def video_id(key):
    if not isinstance(key, str) or not key.startswith("cloud-video:"):
        return None
    match = re.fullmatch(r"cloud-video://([1-9][0-9]{0,18})", key)
    if not match or int(match[1]) > 9223372036854775807:
        raise ValueError("云原片标识无效")
    return int(match[1])


def require_cloud_render(snapshot, mediakit):
    if any(video_id(a["objectKey"]) is not None for a in snapshot["assets"]):
        if os.getenv(ENABLED_ENV) != "true" or not mediakit:
            raise ValueError("云原片混剪尚未启用，且仅支持无新增字幕的 MediaKit 混剪")


def external_url(host, path):
    # The vendor's external file host only; never its company-internal endpoint.
    if not isinstance(host, str) or not re.fullmatch(r"[a-z0-9-]+-sucaiwang\.sucaicloud\.com(?::(?:443|9001))?", host):
        raise ValueError("云原片外网文件域名无效")
    if (not isinstance(path, str) or not path.startswith("/") or path.startswith("//")
            or any(c in path for c in "?#\\") or any(ord(c) < 32 or ord(c) == 127 for c in path)):
        raise ValueError("云原片文件路径无效")
    return "https://" + host + quote(path, safe="/%:@!$&'()*+,;=-._~")


def resolve(cursor, asset, *, lock=False):
    ident = video_id(asset["objectKey"])
    if ident is None:
        raise ValueError("不是云原片标识")
    cursor.execute("""SELECT v.outer_host,v.url_path FROM ads.marketing_content_assets a
        JOIN cloud_video.videos v ON v.asset_id=a.asset_id
        WHERE a.asset_id=%s AND a.bucket='cloud_video' AND a.source_type='cloud_video'
          AND NOT a.is_deleted AND a.asset_status='ready' AND NOT a.external_only
          AND a.raw_object_key=%s AND LOWER(a.raw_sha256)=%s
          AND v.video_id=%s AND v.file_sha256=%s AND v.video_type=0
          AND a.repurpose_allowed IS DISTINCT FROM FALSE AND a.authorization_status NOT IN ('restricted','expired')
          AND (a.authorization_starts_at IS NULL OR a.authorization_starts_at<=CURRENT_DATE)
          AND (a.authorization_expires_at IS NULL OR a.authorization_expires_at>=CURRENT_DATE)""" +
          (" FOR SHARE OF a,v" if lock else ""),
                   (asset["assetId"], asset["objectKey"], asset["sha256"], ident, asset["sha256"]))
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(SOURCE_ERROR)
    return external_url(row["outer_host"], row["url_path"])


def resolve_urls(conn, snapshot):
    assets = [a for a in snapshot["assets"] if video_id(a["objectKey"]) is not None]
    if not assets:
        return {}
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        urls = {str(a["assetId"]): resolve(cursor, a) for a in assets}
    conn.commit()
    return urls
