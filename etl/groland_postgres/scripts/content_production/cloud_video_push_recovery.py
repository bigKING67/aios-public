"""Operator recovery of a verified request ID; this path never submits an import."""
from psycopg2.extras import RealDictCursor
from . import cloud_video_push_queue as queue
from .cloud_video_push_contract import PushBlocked, import_result, request_id


def recover(conn, client, asset_id, identifier):
    identifier = request_id({'requestId': identifier})
    if not queue.lock(conn, asset_id):
        raise PushBlocked('delivery_busy')
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT * FROM cloud_video.pushes WHERE output_asset_id=%s', (asset_id,))
            push = cur.fetchone()
        conn.commit()
        if not push or push['status'] != 'uncertain' or not push['video_name']:
            raise PushBlocked('recovery_not_allowed')
        # The operator first verifies this request belongs to this asset. The
        # vendor must additionally return exactly one result matching its frozen name.
        data = client.call('/openapi/video/import/query', {'requestId': identifier, 'pageNo': 1, 'pageSize': 100})
        status, video_id = import_result(data, push['video_name'])
        queue.transition(conn, asset_id, status, request_id=identifier, video_id=video_id,
                         code='import_failed' if status == 'failed' else None)
        return {'outputAssetId': str(asset_id), 'status': status}
    finally:
        conn.rollback()
        queue.lock(conn, asset_id, acquire=False)
