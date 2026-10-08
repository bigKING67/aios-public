"""Pre-freeze caption generation. Host persists a new revision using optimistic locking."""
import copy
import math
from fractions import Fraction

from .caption_quality import document_digest
from .caption_revision import revise_captions
from .edit_document import compile_document
from .semantic_captions import plan_semantic_captions


def prepare_captioned_document(document, bindings, media, asr_receipt, *, narration_clip_id,
                               target_revision, call_model, model, protected_terms=(), revision_calls=0):
    """Return a new document and provenance; never mutate/save a frozen revision.

    asr_receipt is host-owned, not a model/client assertion: the host must bind its
    result to the verified source hash when ASR completes. No personal ASR files
    or arbitrary URL fetching occurs here. The caller owns model authorization.
    """
    if type(target_revision) is not int or target_revision != document['revision'] + 1:
        raise ValueError('caption preparation requires the next document revision')
    if type(revision_calls) is not int or not 0 <= revision_calls <= 3:
        raise ValueError('caption revision call budget must be 0..3')
    compile_document(document, bindings, media, 'Caption preparation preflight')
    if document['captions']:
        raise ValueError('existing captions require an explicit revision workflow')
    tracks = {track['id']: track['kind'] for track in document['tracks']}
    audio = [clip for clip in document['clips'] if tracks[clip['trackId']] == 'audio']
    if len(audio) != 1 or audio[0]['id'] != narration_clip_id:
        raise ValueError('caption preparation currently requires one explicit narration track')
    clip = audio[0]
    asset = next(a for a in document['assets'] if a['ref'] == clip['assetRef'])
    if not isinstance(asr_receipt, dict) or (asr_receipt.get('assetVersionId'), asr_receipt.get('sourceSha256')) != (asset['assetVersionId'], asset['sha256']):
        raise ValueError('ASR source hash or version does not match narration')
    # Source-map times are rational; ASR clock is integer ms. Reject clipped words
    # in the planner, never stretch or fabricate their times to fit the edit.
    mapping = clip['sourceMap'][0]
    start, end = mapping['sourceStart'], mapping['sourceEnd']
    begin_ms = math.ceil(Fraction(start['num'] * 1000, start['den']))
    end_ms = math.floor(Fraction(end['num'] * 1000, end['den']))
    options = dict(call_model=call_model, model=model, clip_id=clip['id'],
                   asset_version_id=asset['assetVersionId'], source_start_ms=begin_ms, source_end_ms=end_ms,
                   asr_origin_ms=asr_receipt.get('originMs', 0), protected_terms=protected_terms)
    plan = plan_semantic_captions(asr_receipt['result'], **options)
    prepared = copy.deepcopy(document)
    prepared['revision'] = target_revision
    prepared['captions'] = plan['captions']
    prepared['captionDisplayPolicy'] = 'source-hold-v1'
    plan = revise_captions(asr_receipt['result'], plan, max_calls=revision_calls,
                          display_document=prepared, **options)
    prepared['captions'] = plan['captions']
    compile_document(prepared, bindings, media, 'Caption preparation result')
    return {'document': prepared, 'captionPlan': plan,
            'baseDocumentSha256': document_digest(document),
            'documentSha256': document_digest(prepared),
            'sourceSha256': asset['sha256'], 'sourceVersion': asset['assetVersionId'],
            'status': 'needs_revision' if plan['warnings'] else 'generated',
            'deliveryReady': False}
