"""Frozen-caption delivery boundary. Rendering is not semantic quality approval."""
import hashlib
import json
from fractions import Fraction


def document_digest(document):
    return hashlib.sha256(json.dumps(document, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def assess_rendered_captions(document):
    """Called only after the edit compiler validates the immutable document."""
    if 'captionRepair' in document:
        from .caption_execution import derive_caption_document
        effective, repair = derive_caption_document(document)
        assessment = assess_rendered_captions(effective)
        assessment.update(schema='aios.caption-quality.v3', documentSha256=document_digest(document),
                          effectiveDocumentSha256=document_digest(effective), repair=repair)
        return assessment
    if 'captionDisplayPolicy' in document or 'captionOverlayPolicy' in document:
        from .edit_document import resolve_caption_display
        display = resolve_caption_display(document)
        warnings = [{'captionId': c['id'], 'reason': 'reading_duration_requires_review'}
                    for c in display for interval in c.get('renderRanges', [c])
                    if interval['endFrame'] - interval['startFrame'] < 18
                    or len(c['text'].replace('\n', '')) * 3 > interval['endFrame'] - interval['startFrame']]
        assessment = {'schema': 'aios.caption-quality.v2', 'documentSha256': document_digest(document),
                'captionCount': len(display), 'displayPolicy': document.get('captionDisplayPolicy'),
                'displayCues': display,
                'status': 'not_applicable' if not display else 'needs_revision' if warnings else 'unverified',
                'warnings': warnings, 'semantic': 'unverified', 'terms': 'unverified'}
        if 'captionOverlayPolicy' in document:
            from .source_text_compatibility import assess_source_text
            assessment['sourceTextRouting'] = assess_source_text(document)
            assessment.update(schema='aios.caption-quality.v4', overlayPolicy=document['captionOverlayPolicy'],
                              sourceTextCompatibility='unverified')
        return assessment
    cues = document['captions']
    warnings = []
    for cue in cues:
        anchor = cue['anchor']
        if anchor['kind'] == 'timeline':
            duration = Fraction(anchor['endFrame'] - anchor['startFrame'], 30)
        else:
            end, start = anchor['sourceEnd'], anchor['sourceStart']
            duration = Fraction(end['num'], end['den']) - Fraction(start['num'], start['den'])
        size = len(cue['text'].replace('\n', ''))
        if duration < Fraction(3, 5) or size > 10 * duration:
            warnings.append({'captionId': cue['id'], 'reason': 'reading_duration_requires_review'})
    return {'schema': 'aios.caption-quality.v1', 'documentSha256': document_digest(document),
            'captionCount': len(cues), 'status': 'not_applicable' if not cues else 'needs_revision' if warnings else 'unverified',
            'warnings': warnings, 'semantic': 'unverified', 'terms': 'unverified'}


def caption_delivery_reason(snapshot, receipt):
    document = snapshot.get('editDocument')
    if document is None:
        return None
    if not isinstance(document, dict) or not isinstance(document.get('captions'), list):
        return 'caption_quality_receipt_invalid'
    if not document['captions'] and 'captionOverlayPolicy' not in document:
        return None
    actual = receipt.get('caption_quality')
    try:
        expected = assess_rendered_captions(document)
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return 'caption_quality_receipt_invalid'
    if actual != expected:
        return 'caption_quality_receipt_invalid'
    if actual.get('sourceTextRouting', {}).get('status') == 'inspection_required':
        return 'caption_revision_required' if actual['status'] == 'needs_revision' else 'caption_quality_pending'
    if not document['captions']:
        return None
    # No semantic/factual evaluator currently produces an approved receipt.
    # An arbitrary "passed" status must not turn a technical render into delivery.
    return 'caption_revision_required' if actual['status'] == 'needs_revision' else 'caption_quality_pending'
