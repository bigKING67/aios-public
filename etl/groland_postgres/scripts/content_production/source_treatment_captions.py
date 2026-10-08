"""Restore existing source-bound narration captions before freezing a treated edit."""
import copy
from fractions import Fraction

from .caption_quality import document_digest
from .edit_document import compile_document, resolve_caption_display


def _audio(document):
    tracks = {t['id']: t['kind'] for t in document['tracks']}
    clips = [c for c in document['clips'] if tracks[c['trackId']] == 'audio']
    if len(clips) != 1:
        raise ValueError('caption restoration requires one unambiguous narration clip')
    clip = clips[0]
    asset = next(a for a in document['assets'] if a['ref'] == clip['assetRef'])
    return clip, asset


def _range(clip):
    return tuple(Fraction(clip['sourceMap'][0][key]['num'], clip['sourceMap'][0][key]['den'])
                 for key in ('sourceStart', 'sourceEnd'))


def restore_narration_captions(document, bindings, media, reference, reference_bindings, reference_media):
    """Copy a host-owned frozen reference's text, source times and explicit style.

    This does not infer fonts, regenerate words, approve erasure or save a Run.
    Existing captions need a separate revision workflow; silence is not filled
    by stretching speech. The host owns reference authorization and provenance.
    """
    if 'captionRepair' in document or 'captionRepair' in reference:
        raise ValueError('freeze pending caption repairs before caption restoration')
    compile_document(document, bindings, media, 'Caption restoration target')
    compile_document(reference, reference_bindings, reference_media, 'Caption restoration reference')
    if document['captions']:
        raise ValueError('caption restoration cannot overwrite existing captions')
    narration, source = _audio(document)
    prior_narration, prior_source = _audio(reference)
    if (source['assetVersionId'], source['sha256']) != (prior_source['assetVersionId'], prior_source['sha256']):
        raise ValueError('caption reference is from a different frozen narration source')
    start, end = _range(narration)
    prior_start, prior_end = _range(prior_narration)
    if not prior_start <= start < end <= prior_end:
        raise ValueError('caption reference does not cover the target narration source range')
    restored = copy.deepcopy(document)
    restored['revision'] += 1
    restored['captionOverlayPolicy'] = 'preserve-source-picture-v1'
    if 'captionDisplayPolicy' in reference:
        restored['captionDisplayPolicy'] = reference['captionDisplayPolicy']
    else:
        restored.pop('captionDisplayPolicy', None)
    selected = []
    for cue in reference['captions']:
        anchor = cue['anchor']
        if anchor['kind'] != 'source' or anchor['clipId'] != prior_narration['id']:
            continue  # Titles and captions on other tracks are not narration.
        lo, hi = (Fraction(anchor[key]['num'], anchor[key]['den']) for key in ('sourceStart', 'sourceEnd'))
        if hi <= start or lo >= end:
            continue
        if lo < start or hi > end:
            raise ValueError('target narration cuts through an existing caption; revise the edit boundary')
        if cue['stylePreset'] != 'source-style-v1':
            raise ValueError('caption reference requires explicit source style; no default style substitution')
        item = copy.deepcopy(cue)
        item['anchor']['clipId'] = narration['id']
        restored['captions'].append(item)
        selected.append(cue['id'])
    if not selected:
        raise ValueError('caption reference contains no narration captions in the target range')
    compile_document(restored, bindings, media, 'Caption restoration candidate')
    display = resolve_caption_display(restored)
    return restored, {'schema': 'aios.source-text-caption-restoration.v1',
        'baseDocumentSha256': document_digest(document), 'documentSha256': document_digest(restored),
        'referenceDocumentSha256': document_digest(reference), 'sourceVersion': source['assetVersionId'],
        'sourceSha256': source['sha256'], 'captionIds': selected,
        'renderedCaptionIds': [c['id'] for c in display if c['renderRanges']],
        'styleSource': 'explicit_reference_parameters', 'fontIdentity': 'unverified',
        'textAndSourceTimesUnchanged': True, 'deliveryApproved': False}
