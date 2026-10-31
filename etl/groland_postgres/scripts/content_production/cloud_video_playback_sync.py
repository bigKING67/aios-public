"""Read back imported IDs and verify a playable copy before local retention can expire."""
import re
from urllib.parse import urlsplit
from .cloud_video_client import pinned_open
from .cloud_video_push_contract import PushBlocked


def address(value):
    url=urlsplit(value)
    if (url.scheme!='https' or not re.fullmatch(r'[a-z0-9.-]+(?::[0-9]{1,5})?',url.netloc)
            or not re.fullmatch(r'/[^?#]+',url.path) or url.query or url.fragment):
        raise PushBlocked('playback_address_invalid')
    return url.netloc,url.path


def row_for(client, video_id, inner):
    data=client.call('/openapi/video/list',{'pageNo':1,'pageSize':100,'videoIds':str(video_id),'isInner':inner})
    rows=data.get('list') if isinstance(data,dict) else None
    if not isinstance(rows,list) or len(rows)!=1 or str(rows[0].get('videoId') or rows[0].get('id'))!=str(video_id):
        raise PushBlocked('playback_record_missing')
    return address(rows[0].get('videoUrl') or '')


def probe(url):
    with pinned_open(url,timeout=15,method='HEAD') as response:
        return response.status==200 and int(response.headers.get('Content-Length','0'))>0


def refresh(conn,client,*,limit=20,asset_id=None,probe_file=probe):
    with conn.cursor() as cur:
        cur.execute("""SELECT p.output_asset_id,p.cloud_video_id FROM cloud_video.pushes p
            LEFT JOIN ads.content_remix_retention rt ON rt.output_asset_id=p.output_asset_id
            WHERE p.status='succeeded' AND (rt.status IS DISTINCT FROM 'completed')
              AND (%s::UUID IS NULL OR p.output_asset_id=%s::UUID)
              AND (p.playback_verified_at IS NULL OR p.playback_verified_at<NOW()-INTERVAL '12 hours')
            ORDER BY COALESCE(p.playback_verified_at,p.updated_at),p.output_asset_id LIMIT %s""",(asset_id,asset_id,limit))
        rows=cur.fetchall()
    conn.commit()
    for asset,video in rows:
        try:
            outer,path=row_for(client,video,0);inner,inner_path=row_for(client,video,1)
            if inner_path!=path: raise PushBlocked('playback_address_mismatch')
            if not probe_file(f'https://{inner}{path}'): raise PushBlocked('playback_unavailable')
        except Exception:
            # Never keep an old successful probe after a current failed read.
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute("UPDATE cloud_video.pushes SET playback_verified_at=NULL,playback_error_code='playback_unavailable',updated_at=NOW() WHERE output_asset_id=%s",(asset,))
        else:
            with conn.cursor() as cur:
                cur.execute("""UPDATE cloud_video.pushes SET playback_outer_host=%s,playback_inner_host=%s,
                    playback_path=%s,playback_verified_at=NOW(),playback_error_code=NULL WHERE output_asset_id=%s""",(outer,inner,path,asset))
        conn.commit()
