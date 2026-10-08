"""Internal host operation: register treated bytes and enqueue a new frozen revision.

The caller is the trusted Run host, after checking current user edit permission.
No public client may supply a local operation path or a storage key. This uses
the existing render queue and never submits a model or erasure request.
"""
import copy
import fcntl
import os
from pathlib import Path
import uuid

from psycopg2.extras import RealDictCursor, Json

from .caption_quality import document_digest
from .derived_assets import document_bindings, validate_derived_assets
from .execution import file_hash
from .queue import verify_source_rows
from .render_binding import require_binding
from .source_treatment import _candidate, treatment_request
from .source_treatment_media import inspect_excerpt
from .source_treatment_review import load_treatment_candidate


def _read(cursor, owner, run_id, *, lock=False):
    cursor.execute("SELECT * FROM ads.content_production_runs WHERE run_id=%s AND owner_user_id=%s" +
                   (' FOR UPDATE' if lock else ''), (run_id, owner))
    run = cursor.fetchone()
    if not run or not run['project_id']:
        raise ValueError('owned Run with an existing project is required')
    cursor.execute("""SELECT p.revision AS latest_revision,v.snapshot FROM ads.content_production_projects p
        JOIN ads.content_production_revisions v ON v.project_id=p.project_id AND v.revision=%s
        WHERE p.project_id=%s AND p.owner_user_id=%s""" + (' FOR UPDATE OF p' if lock else ''),
        (run['project_revision'], run['project_id'], owner))
    project = cursor.fetchone()
    if not project:
        raise ValueError('Run project is unavailable')
    return run, project


def _already_applied(run, project, request_hash, output_hash, candidate):
    matches = [a for a in project['snapshot'].get('derivedAssets', []) if a['requestSha256'] == request_hash]
    if not matches:
        return None
    if (len(matches) != 1 or matches[0]['sha256'] != output_hash or not run['render_job_id']
            or project['latest_revision'] != run['project_revision']
            or project['snapshot']['editDocument'] != candidate
            or matches[0]['baseProjectRevision'] + 1 != run['project_revision']):
        raise ValueError('treatment was superseded or changed')
    return {'status': 'already_applied', 'runId': str(run['run_id']), 'projectRevision': run['project_revision'],
            'jobId': str(run['render_job_id']), 'deliveryApproved': False}


def _check_run(cursor, run, project, expected_version, bucket):
    if (run['version'] != expected_version or run['status'] != 'waiting'
            or run['waiting_reason'] != 'caption_quality_pending' or run['active_attempt']
            or run['pause_requested'] or project['latest_revision'] != run['project_revision']):
        raise ValueError('Run or project changed; treatment adoption requires the current waiting version')
    cursor.execute("""SELECT j.status,j.project_id,j.revision,l.plan_revision,l.execution_version FROM ads.content_production_jobs j
        JOIN ads.content_production_run_renders l ON l.job_id=j.job_id
        WHERE j.job_id=%s AND l.run_id=%s""", (run['render_job_id'], run['run_id']))
    job = cursor.fetchone()
    if (not job or job['status'] != 'completed' or job['revision'] != run['project_revision']
            or job['project_id'] != run['project_id']
            or job['plan_revision'] != run['plan_revision'] or job['execution_version'] != run['execution_version']):
        raise ValueError('treatment parent is not the current completed render')
    require_binding(project['snapshot'], required=True)
    if project['snapshot'].get('renderBinding') != run['source_snapshot'].get('renderBinding'):
        raise ValueError('Run renderer binding differs from its project')
    validate_derived_assets(project['snapshot'], str(run['project_id']))
    verify_source_rows(cursor, project['snapshot'], bucket, lock=True)


def _prepare(project, state, request, candidate, media, operation, project_id, check):
    snapshot = project['snapshot']
    base, bindings = snapshot['editDocument'], document_bindings(snapshot)
    if document_digest(base) != request['documentSha256']:
        raise ValueError('treatment was prepared from another frozen edit')
    expected_request = treatment_request(base, bindings, media, request['clipId'],
        request['parameters']['erase_ratio_location'], request['parameters']['mode'])
    if expected_request != request:
        raise ValueError('treatment parameters differ from the frozen edit')
    # The local state is provenance, not permission to rewrite other clips.
    inspection = inspect_excerpt(operation / 'output.mp4',
        {k: state['input'][k] for k in ('width', 'height')}, request['frames'], check)
    expected, _, _ = _candidate(base, bindings, media, request, operation / 'output.mp4', inspection)
    if expected != candidate:
        raise ValueError('treated candidate changed unrelated edit content')
    source = next((a for a in snapshot['assets']
        if request['source']['assetVersionId'] == f"{a['assetId']}-{a['sha256'][:16]}"), None)
    if source is None:
        raise ValueError('treat only an original frozen asset; recursive treatment is unsupported')
    digest, request_hash = inspection['sha256'], state['requestSha256']
    entry = {'assetVersionId': 'treated-' + digest[:48], 'sha256': digest,
        'durationMs': (request['frames'] * 1000 + 29) // 30,
        'objectKey': f'production/{project_id}/treatments/{request_hash}/{digest}.mp4',
        'parentAssetId': source['assetId'], 'parentSha256': source['sha256'],
        'requestSha256': request_hash, 'treatmentRequest': copy.deepcopy(request),
        'baseProjectRevision': project['latest_revision'], 'providerTaskId': state['taskId']}
    updated = copy.deepcopy(snapshot)
    updated['editDocument'] = candidate
    used = {a['assetVersionId'] for a in candidate['assets']}
    updated['derivedAssets'] = [a for a in snapshot.get('derivedAssets', []) if a['assetVersionId'] in used] + [entry]
    validate_derived_assets(updated, project_id)
    return updated, entry


def adopt_treatment(conn, storage, owner, run_id, expected_version, operation: Path, *, check):
    """Upload once on normal retry; atomically register revision/job/Run linkage.

    Permission, cancellation and budget checks belong to check(). Check again
    after upload: if the Run changes meanwhile, only an unreferenced object may
    remain, never a overwritten edit. An unknown PUT can safely repeat the same
    content-addressed key; no paid erasure request is repeated.
    """
    check()
    if operation.is_symlink():
        raise ValueError('treatment adoption cannot follow symlinks')
    lock = os.open(operation / '.lock', os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state, request, candidate, _, media = load_treatment_candidate(operation)
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                run, project = _read(cursor, owner, run_id)
                verify_source_rows(cursor, project['snapshot'], storage.config.bucket)
                done = _already_applied(run, project, state['requestSha256'], state['inspection']['sha256'], candidate)
                if done:
                    return done
                _check_run(cursor, run, project, expected_version, storage.config.bucket)
        updated, entry = _prepare(project, state, request, candidate, media, operation, str(run['project_id']), check)
        # Do not hold Run/project locks during network IO.
        check()
        storage.upload_file(entry['objectKey'], operation / 'output.mp4', 'video/mp4')
        check()
        if file_hash(operation / 'output.mp4') != entry['sha256']:
            raise ValueError('treated media changed during upload')
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                current, current_project = _read(cursor, owner, run_id, lock=True)
                _check_run(cursor, current, current_project, expected_version, storage.config.bucket)
                if current_project['snapshot'] != project['snapshot']:
                    raise ValueError('frozen parent changed during treatment adoption')
                revision, execution, job = run['project_revision'] + 1, run['execution_version'] + 1, str(uuid.uuid4())
                cursor.execute("INSERT INTO ads.content_production_revisions (project_id,revision,snapshot) VALUES (%s,%s,%s)",
                               (run['project_id'], revision, Json(updated)))
                cursor.execute("UPDATE ads.content_production_projects SET revision=%s,updated_at=NOW() WHERE project_id=%s",
                               (revision, run['project_id']))
                cursor.execute("INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview) VALUES (%s,%s,%s,FALSE)",
                               (job, run['project_id'], revision))
                cursor.execute("INSERT INTO ads.content_production_run_renders (run_id,execution_version,plan_revision,job_id) VALUES (%s,%s,%s,%s)",
                               (run_id, execution, run['plan_revision'], job))
                cursor.execute("""UPDATE ads.content_production_runs SET version=version+1,execution_version=%s,
                    project_revision=%s,render_job_id=%s,status='running',stage='production',waiting_reason=NULL,
                    updated_at=NOW() WHERE run_id=%s""", (execution, revision, job, run_id))
        return {'status': 'queued', 'runId': str(run_id), 'projectRevision': revision, 'jobId': job, 'deliveryApproved': False}
    finally:
        os.close(lock)
