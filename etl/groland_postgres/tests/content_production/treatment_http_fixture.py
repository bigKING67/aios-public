"""Only the disposable HTTP fixture invokes this host operation, never production."""
import json
import os
from pathlib import Path
import subprocess
import sys

import psycopg2
from psycopg2.extras import RealDictCursor
from content_production.derived_assets import document_bindings
from content_production.source_treatment import advance_treatment
from content_production.source_treatment_adoption import adopt_treatment
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from test_source_treatment import Provider, REGIONS


def main():
    if not os.environ.get('CONTENT_PRODUCTION_TEST_DATABASE_URL'):
        raise RuntimeError('disposable fixture database is required')
    run_id = sys.argv[1]
    conn = psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL'])
    with conn, conn.cursor(cursor_factory=RealDictCursor) as c:
        c.execute("""SELECT r.*,v.snapshot FROM ads.content_production_runs r
            JOIN ads.content_production_revisions v ON v.project_id=r.project_id AND v.revision=r.project_revision
            WHERE r.run_id=%s""", (run_id,))
        run = c.fetchone()
    snapshot = run['snapshot']
    document = snapshot['editDocument']
    media = {f"{a['assetId']}-{a['sha256'][:16]}": os.environ[
        'CONTENT_PRODUCTION_TEST_PICTURE' if a['objectKey'] == 'picture.mp4' else 'CONTENT_PRODUCTION_TEST_SOURCE']
        for a in snapshot['assets']}
    clip = document['clips'][0]
    frames = clip['timeline']['endFrame'] - clip['timeline']['startFrame']
    root = Path(os.environ['CONTENT_PRODUCTION_WORK_DIR']) / 'treated-fixture'
    root.mkdir(mode=0o700)
    replacement = root / 'simulated-provider.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=yellow:s=640x360:r=30',
        '-frames:v', str(frames), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(replacement)],
        check=True, timeout=30)
    provider = Provider(replacement)
    args = (root, document, document_bindings(snapshot), media, clip['id'], REGIONS)
    first = advance_treatment(*args, provider=provider, check=lambda: None)
    assert first['stage'] == 'submitted'
    ready = advance_treatment(*args, provider=provider, check=lambda: None)
    storage = TosStorageClient(TosStorageConfig.from_env())
    adopted = adopt_treatment(conn, storage, run['owner_user_id'], run_id, run['version'], Path(ready['workDir']), check=lambda: None)
    retried = adopt_treatment(conn, storage, run['owner_user_id'], run_id, run['version'], Path(ready['workDir']), check=lambda: None)
    assert adopted['status'] == 'queued' and retried['status'] == 'already_applied'
    assert adopted['jobId'] == retried['jobId'] and provider.submits == 1
    with conn, conn.cursor() as c:
        c.execute('SELECT snapshot FROM ads.content_production_revisions WHERE project_id=%s AND revision=%s', (run['project_id'], run['project_revision']))
        assert c.fetchone()[0] == snapshot
        c.execute('SELECT snapshot FROM ads.content_production_revisions WHERE project_id=%s AND revision=%s', (run['project_id'], adopted['projectRevision']))
        updated = c.fetchone()[0]
    assert updated['renderBinding'] == snapshot['renderBinding']
    assert updated['editDocument']['captions'] == document['captions']
    tracks = {t['id']: t['kind'] for t in document['tracks']}
    audio = lambda doc: [c for c in doc['clips'] if tracks[c['trackId']] == 'audio']
    assert audio(updated['editDocument']) == audio(document)
    print(json.dumps({**adopted, 'parentRevisionUnchanged': True, 'captionsUnchanged': True,
        'audioClipsUnchanged': True, 'idempotent': True, 'derivedCount': len(updated['derivedAssets']),
        'provider': 'synthetic yellow-video fixture; no external erasure call'}))
    conn.close()


if __name__ == '__main__': main()
