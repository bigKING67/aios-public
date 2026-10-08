"""Opt-in visual observations bound to a frozen Run render, never an approval."""
import json
import os
import re
import threading
import time

from .caption_quality import document_digest
from .caption_visual_evidence import prepare_caption_evidence
from .derived_assets import document_media, validate_derived_assets
from .execution import Cancelled, file_hash
from .semantic_captions import chat_completion_callback
from .source_treatment_media import prepare_excerpt
from .source_treatment_review import validate_review, _outcome
from .treatment_visual_input import VERSION, SCHEMA, comparison_video, review_messages
from .workspace import WorkspaceLimit


def reserve_call(conn, job, request_sha, limit):
    """Lost outcomes consume a slot; a different lease cannot submit again."""
    if not re.fullmatch('[a-f0-9]{64}', request_sha) or type(limit) is not int or not 1 <= limit <= 3:
        raise ValueError('invalid visual call reservation')
    with conn.cursor() as cursor:
        cursor.execute('SELECT job_id FROM ads.content_production_jobs WHERE job_id=%s FOR UPDATE', (job['job_id'],))
        cursor.execute("""UPDATE ads.content_production_jobs SET
          receipt=COALESCE(receipt,'{}'::JSONB) || jsonb_build_object('host_visual_calls',
            COALESCE(receipt->'host_visual_calls','{}'::JSONB) || jsonb_build_object(%s::text,'reserved_outcome_unknown'))
          WHERE job_id=%s AND claim_token=%s AND status='running'
            AND heartbeat_at>=clock_timestamp()-INTERVAL '2 minutes'
            AND NOT COALESCE(receipt->'host_visual_calls','{}'::JSONB) ? %s
            AND (SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(receipt->'host_visual_calls','{}'::JSONB))) < %s
          RETURNING job_id""", (request_sha, job['job_id'], job['claim_token'], request_sha, limit))
        accepted = cursor.fetchone() is not None
    conn.commit()
    if not accepted:
        raise Cancelled('画面复检调用已占用、预算耗尽或租约失效')


def checkpoint(conn, job, report, *, field="host_visual_review"):
    if field not in ("host_visual_review", "host_selected_semantic_review"):
        raise ValueError("unsupported visual receipt field")
    with conn.cursor() as cursor:
        cursor.execute('SELECT job_id FROM ads.content_production_jobs WHERE job_id=%s FOR UPDATE', (job['job_id'],))
        cursor.execute("""UPDATE ads.content_production_jobs SET receipt=COALESCE(receipt,'{}'::JSONB)
          || jsonb_build_object(%s::text,%s::JSONB)
          WHERE job_id=%s AND claim_token=%s AND status='running'
            AND heartbeat_at>=clock_timestamp()-INTERVAL '2 minutes' RETURNING job_id""",
          (field, json.dumps(report), job['job_id'], job['claim_token']))
        accepted = cursor.fetchone() is not None
    conn.commit()
    if not accepted:
        raise Cancelled('画面复检回执租约失效')


def call_with_heartbeat(callback, messages, tick):
    values, errors = [], []
    def dispatch():
        try:
            values.append(callback(messages))
        except Exception:
            errors.append(True)
    thread = threading.Thread(target=dispatch, daemon=True)
    thread.start()
    deadline = time.monotonic() + 120
    while thread.is_alive():
        thread.join(1)
        tick()
        if time.monotonic() > deadline:
            raise TimeoutError('visual review response deadline exceeded')
    tick()
    if errors:
        raise RuntimeError('visual review provider failed')
    return values[0]


def review_render(job, link, media, video, receipt, work, *, limit, model, callback_factory,
                  reserve, persist, tick, revalidate):
    snapshot = job['snapshot']
    derived = validate_derived_assets(snapshot, str(job['project_id']))
    document = snapshot['editDocument']
    digest = file_hash(video)
    if (video.is_symlink() or receipt.get('edit_document', {}).get('sha256') != document_digest(document)
            or receipt.get('host_inspection', {}).get('status') != 'passed'
            or receipt.get('host_inspection', {}).get('sha256') != digest
            or receipt.get('output', {}).get('sha256') != digest):
        raise ValueError('visual review requires the inspected frozen render')
    if type(limit) is not int or not 1 <= limit <= 3 or not isinstance(model, str) or not 1 <= len(model.strip()) <= 128:
        raise ValueError('visual review requires a bounded budget and model')
    identity = {'runId': str(link['run_id']), 'jobId': str(job['job_id']),
        'projectId': str(job['project_id']), 'projectRevision': job['revision'],
        'executionVersion': link['execution_version'], 'planRevision': link['plan_revision'],
        'documentSha256': document_digest(document), 'videoSha256': digest}
    entries = [{'assetVersionId': a['assetVersionId'], 'requestSha256': a['requestSha256'],
        'outputSha256': a['sha256'], 'timeline': a['treatmentRequest']['timeline'],
        'frames': a['treatmentRequest']['frames'], 'status': 'not_reviewed'} for a in derived]
    report = {'schema': 'aios.treatment-visual-worker.v1', 'identity': identity, 'model': model,
        'promptVersion': VERSION, 'samplingFps': 2, 'callLimit': limit, 'callsReserved': 0,
        'status': 'incomplete', 'entries': entries, 'deliveryApproved': False,
        'exactFontIdentity': 'unverified', 'fullTemporalQuality': 'unverified', 'productFacts': 'unverified'}
    persist(report)
    files = document_media(snapshot, media)
    for index, (asset, entry) in enumerate(zip(derived, entries)):
        if report['callsReserved'] >= limit:
            break
        stage = 'configuration'
        try:
            tick()
            callback = callback_factory()  # Validate configuration before spending a slot.
            folder = work / f'visual-review-{index}'
            folder.mkdir(mode=0o700)
            request = asset['treatmentRequest']
            before, after = folder / 'input.mp4', media[asset['assetVersionId']]
            stage = 'prepare_source'
            prepare_excerpt(media[asset['parentAssetId']], request, before, tick)
            if file_hash(after) != asset['sha256']:
                raise ValueError('treated media changed before review')
            stage = 'comparison'
            comparison = comparison_video(before, after, request, document, files, video, folder, tick)
            stage = 'caption_detail'
            evidence, images = prepare_caption_evidence(request, document, folder, tick)
            entry['captionEvidence'] = evidence
            entry['captionEvidenceSha256'] = document_digest(evidence)
            messages, _ = review_messages(request, document, comparison, caption_evidence=evidence, detail_images=images)
            entry.update(comparisonSha256=file_hash(comparison), inputSha256=document_digest(messages))
            tick()
            stage = 'source_rights'
            revalidate()  # Current rights immediately before transmitting media.
            stage = 'reservation'
            reserve(asset['requestSha256'], limit)
            report['callsReserved'] += 1
            entry['status'] = 'reserved'
            persist(report)
            stage = 'provider'
            response = call_with_heartbeat(callback, messages, tick)
            stage = 'response_validation'
            entry['responseSha256'] = document_digest(response)
            checks = validate_review(response, request['frames'])
            entry.update(checks=checks, **_outcome(checks))
        except (Cancelled, WorkspaceLimit):
            raise
        except Exception as error:
            if stage == 'source_rights':
                raise  # Stop the job; later model phases must not receive revoked sources.
            entry.update(status='incomplete', errorType=type(error).__name__, errorStage=stage)
            persist(report)
            break  # No retries, including unknown outcomes and bad provider responses.
        persist(report)
    if entries and all(e['status'] in ('issues_found', 'inconclusive', 'no_issues_reported') for e in entries):
        report['status'] = 'reviewed'
    persist(report)
    return report


def review_job(conn, job, link, media, video, receipt, work, tick, revalidate):
    limit = int(os.getenv('AIOS_VISUAL_REVIEW_MAX_CALLS', '0'))
    if not 0 <= limit <= 3:
        raise ValueError('AIOS_VISUAL_REVIEW_MAX_CALLS must be 0..3')
    if not limit or job['preview'] or not job['snapshot'].get('derivedAssets'):
        return None
    model = os.getenv('AIOS_VISUAL_REVIEW_MODEL', '')
    return review_render(job, link, media, video, receipt, work, limit=limit, model=model,
        callback_factory=lambda: chat_completion_callback(base_url=os.getenv('AIOS_VISUAL_REVIEW_BASE_URL', ''),
            api_key=os.getenv('AIOS_VISUAL_REVIEW_API_KEY', ''), model=model, protocol='responses', response_schema=SCHEMA),
        reserve=lambda sha, budget: reserve_call(conn, job, sha, budget),
        persist=lambda report: checkpoint(conn, job, report), tick=tick, revalidate=revalidate)
