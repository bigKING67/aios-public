"""Replay a saved edit through the real Worker in the disposable bridge database."""
import hashlib
import json
import os
from pathlib import Path
import uuid

import psycopg2
from psycopg2.extras import Json
from content_production.render_binding import current_binding
import caption_render_bridge_fixture


def main():
    root = Path(os.environ['AIOS_REAL_MEDIA_REPLAY'])
    document = json.loads((root / 'local-frozen-edit.json').read_text())
    records = json.loads(Path(os.environ['AIOS_REAL_MEDIA_SOURCES']).read_text())
    assets, files = [], {}
    for asset in document['assets']:
        record = next(row for row in records if row['sha256'] == asset['sha256'])
        source = Path(record['path'])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == asset['sha256']
        asset_id = str(uuid.uuid4())
        key = f'{asset_id}.mp4'
        asset['assetVersionId'] = f"{asset_id}-{asset['sha256'][:16]}"
        assets.append({'assetId': asset_id, 'objectKey': key, 'sha256': asset['sha256'],
                       'durationMs': round(record['durationSeconds'] * 1000)})
        files[key] = str(source)
    project, run, job = [str(uuid.uuid4()) for _ in range(3)]
    snapshot = {'title': 'Saved real footage isolated replay', 'aspect': 'portrait',
                'outputProfile': 'legacy_v1', 'assets': assets, 'editDocument': document,
                'renderBinding': current_binding()}
    with psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL']) as conn, conn.cursor() as cur:
        # Called only by the disposable-container harness; no production credentials.
        for asset in assets:
            cur.execute("INSERT INTO ads.marketing_content_assets(asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds) VALUES(%s,'local replay','ready','fixture',%s,%s,%s)",
                        (asset['assetId'], asset['objectKey'], asset['sha256'], asset['durationMs'] / 1000))
        cur.execute("INSERT INTO ads.content_production_projects(project_id,owner_user_id,title,revision) VALUES(%s,'90000001','local replay',1)", (project,))
        cur.execute('INSERT INTO ads.content_production_revisions(project_id,revision,snapshot) VALUES(%s,1,%s)', (project, Json(snapshot)))
        cur.execute("INSERT INTO ads.content_production_jobs(job_id,project_id,revision,preview) VALUES(%s,%s,1,FALSE)", (job, project))
        cur.execute("INSERT INTO ads.content_production_runs(run_id,owner_user_id,idempotency_key,request,source_snapshot,status,stage,plan_revision,project_id,project_revision,render_job_id) VALUES(%s,'90000001',%s,'{}',%s,'running','production',1,%s,1,%s)",
                    (run, run, Json(snapshot), project, job))
        cur.execute("INSERT INTO ads.content_production_plans(run_id,revision,execution_version,document,origin) VALUES(%s,1,1,%s,'user')", (run, Json(document)))
        cur.execute('INSERT INTO ads.content_production_run_renders(run_id,execution_version,plan_revision,job_id) VALUES(%s,1,1,%s)', (run, job))
    output = Path(os.environ['AIOS_CAPTION_BRIDGE_OUTPUT']) / 'real-media'
    os.environ['AIOS_CAPTION_BRIDGE_OUTPUT'] = str(output)
    os.environ['AIOS_CAPTION_BRIDGE_FIXTURE'] = json.dumps({'sources': files, 'runId': run, 'work': str(output / 'work')})
    caption_render_bridge_fixture.main()
    evidence = json.loads((output / 'receipt.json').read_text())
    evidence.update(media='cached_real_footage', scope='saved edit replay; isolated SQL fixture seed, actual Worker',
                    productionAuthorizationVerified=False, liveProviderCalls=0)
    (output / 'receipt.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
    (output / 'frozen-snapshot.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
