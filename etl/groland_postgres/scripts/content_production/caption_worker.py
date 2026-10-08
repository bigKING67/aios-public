"""Opt-in, bounded post-render review; candidates never replace rendered evidence."""
import os
import threading

from . import caption_review, caption_review_revision
from .execution import Cancelled
from .semantic_captions import chat_completion_callback
from .derived_assets import document_bindings, document_media


def reserve_call(conn, job, phase, limit):
    """Commit before dispatch. A lost outcome still consumes this job's slot."""
    if phase not in ('review', 'revision', 'rereview') or not 1 <= limit <= 3:
        raise ValueError('invalid caption call reservation')
    with conn.cursor() as cursor:
        cursor.execute('SELECT job_id FROM ads.content_production_jobs WHERE job_id=%s FOR UPDATE', (job['job_id'],))
        cursor.execute("""UPDATE ads.content_production_jobs SET
          receipt=COALESCE(receipt,'{}'::JSONB) || jsonb_build_object('host_caption_calls',
            COALESCE(receipt->'host_caption_calls','{}'::JSONB) || jsonb_build_object(%s::text,'reserved_outcome_unknown'))
          WHERE job_id=%s AND claim_token=%s AND status='running'
            AND heartbeat_at>=clock_timestamp()-INTERVAL '2 minutes'
            AND NOT COALESCE(receipt->'host_caption_calls','{}'::JSONB) ? %s
            AND (SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(receipt->'host_caption_calls','{}'::JSONB))) < %s
          RETURNING job_id""", (phase, job['job_id'], job['claim_token'], phase, limit))
        accepted = cursor.fetchone() is not None
    conn.commit()
    if not accepted:
        raise Cancelled('字幕调用已占用、预算耗尽或租约失效')


def run_review(document, bindings, media, *, limit, model, callback_factory, reserve, tick):
    result = {'schema': 'aios.caption-worker-review.v1', 'deliveryApproved': False,
              'candidateRendered': False, 'callLimit': limit, 'callsReserved': 0}
    if not 1 <= limit <= 3:
        raise ValueError('caption review call limit must be 1..3')

    def callback(phase, schema):
        upstream = callback_factory(schema)
        def call(prompt):
            tick()
            reserve(phase, limit)
            result['callsReserved'] += 1
            values, errors = [], []
            def dispatch():
                try:
                    values.append(upstream(prompt))
                except Exception as error:
                    errors.append(type(error).__name__)
            thread = threading.Thread(target=dispatch, daemon=True)
            thread.start()
            while thread.is_alive():
                thread.join(1)
                tick()
            tick()
            if errors:
                raise RuntimeError('caption provider call failed')
            return values[0]
        return call

    try:
        if 'captionOverlayPolicy' in document:
            from .caption_execution import derive_caption_document
            from .edit_document import resolve_caption_display
            effective = derive_caption_document(document)[0] if 'captionRepair' in document else document
            display = resolve_caption_display(effective)
            if display and all(not cue['renderRanges'] for cue in display):
                result.update(status='skipped', reason='original_source_picture_preserved')
                return result
        review = caption_review.review_captions(document, model=model,
            call_model=callback('review', caption_review.SCHEMA))
        result['review'] = review
        result['status'] = 'reviewed'
        if not review['semanticIssueCount'] or limit < 2:
            return result
        candidate = caption_review_revision.propose_review_revision(document, review, bindings, media,
            model=model, call_model=callback('revision', caption_review_revision.SCHEMA))
        result['candidate'] = candidate
        result['status'] = 'candidate_pending'
        if candidate['status'] == 'candidate' and limit >= 3:
            result['candidateReview'] = caption_review.review_captions(candidate['document'], model=model,
                call_model=callback('rereview', caption_review.SCHEMA))
        return result
    except Cancelled:
        raise
    except Exception as error:
        # No retry, no raw provider messages or credentials in persisted evidence.
        result.update(status='incomplete', errorType=type(error).__name__)
        return result


def review_job(conn, job, media, tick):
    limit = int(os.getenv('AIOS_CAPTION_WORKER_MAX_CALLS', '0'))
    if not 0 <= limit <= 3:
        raise ValueError('AIOS_CAPTION_WORKER_MAX_CALLS must be 0..3')
    document = job['snapshot'].get('editDocument')
    if not limit or job['preview'] or not document:
        return None
    if not document.get('captionRepair') and not (
            job['snapshot'].get('derivedAssets') and caption_review_revision.explicit_source_captions(document)):
        return None
    bindings, files = document_bindings(job['snapshot']), document_media(job['snapshot'], media)
    model = os.environ.get('AIOS_CAPTION_REVIEW_MODEL', '')
    def factory(schema):
        return chat_completion_callback(base_url=os.getenv('AIOS_CAPTION_BASE_URL', ''),
            api_key=os.getenv('AIOS_CAPTION_API_KEY', ''), model=model,
            protocol='responses', response_schema=schema)
    return run_review(document, bindings, files, limit=limit, model=model,
        callback_factory=factory, reserve=lambda phase, budget: reserve_call(conn, job, phase, budget), tick=tick)
