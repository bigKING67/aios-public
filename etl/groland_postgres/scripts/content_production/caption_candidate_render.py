"""Render a verified line-only candidate as a separate inspection artifact."""
from .caption_quality import document_digest
from .caption_review import validate_reviews
from .caption_review_revision import propose_review_revision
from .render_document import render_snapshot_document
from .derived_assets import document_bindings, document_media


def render_candidate(module, snapshot, media, work, review, tick, lock_fd=None):
    candidate = review.get('candidate')
    rereview = review.get('candidateReview')
    if not candidate or candidate.get('status') != 'candidate' or not rereview:
        return None
    document = candidate['document']
    digest = document_digest(document)
    if candidate['documentSha256'] != digest or any(
            rereview.get(key) != digest for key in ('documentSha256', 'effectiveDocumentSha256')):
        raise ValueError('stale candidate review')
    entries = validate_reviews({'reviews': rereview['reviews']}, document['captions'])
    if any(issue['kind'] != 'uncertain_term' for entry in entries for issue in entry['issues']):
        return None
    bindings, files = document_bindings(snapshot), document_media(snapshot, media)
    original_review = review['review']
    targets = {entry['captionId'] for entry in original_review['reviews']
               if any(i['kind'] != 'uncertain_term' for i in entry['issues'])}
    answer = {'captions': [{'captionId': cue['id'], 'lines': cue['text'].split('\n')}
                           for cue in document['captions'] if cue['id'] in targets]}
    # Re-run grounding and whole-document checks with stored text, no model call.
    replay = propose_review_revision(snapshot['editDocument'], original_review, bindings, files,
        model=candidate['model'], call_model=lambda _: answer)
    if any(candidate.get(key) != replay[key] for key in (
            'baseDocumentSha256', 'baseEffectiveDocumentSha256', 'reviewSha256', 'documentSha256')):
        raise ValueError('candidate differs from source-bound revision')
    tick()
    candidate_work = work / 'caption-candidate'
    candidate_work.mkdir()  # Never overwrite/retry a previous attempt in this job workspace.
    video, receipt = render_snapshot_document(module, {**snapshot, 'editDocument': document},
        media, candidate_work, False, tick, lock_fd)
    if receipt['edit_document']['sha256'] != digest:
        raise ValueError('candidate render document mismatch')
    return video, {'schema': 'aios.caption-candidate-render.v1', 'documentSha256': digest,
        'baseDocumentSha256': candidate['baseDocumentSha256'],
        'reviewSha256': document_digest(rereview), 'receipt': receipt,
        'status': 'inspection_pending', 'deliveryApproved': False}
