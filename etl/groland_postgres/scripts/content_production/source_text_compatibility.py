"""Source-text inspection routing from validated frozen edits, not OCR guesses."""
from fractions import Fraction


def source_offset(clip):
    start = clip['sourceMap'][0]['sourceStart']
    return Fraction(start['num'], start['den']) - Fraction(clip['timeline']['startFrame'], 30)


def assess_source_text(document):
    """Only unchanged source/time plus unambiguous audio permits preservation.

    This does not prove text is present/correct or authorize erasure. No-caption
    intervals still need inspection: baked-in promotional text is independent
    of generated subtitle coverage.
    """
    tracks = {t['id']: t['kind'] for t in document['tracks']}
    assets = {a['ref']: a for a in document['assets']}
    audio = [c for c in document['clips'] if tracks[c['trackId']] == 'audio']
    routes = []
    for picture in sorted((c for c in document['clips'] if tracks[c['trackId']] == 'video'),
                          key=lambda c: c['timeline']['startFrame']):
        lo, hi = picture['timeline']['startFrame'], picture['timeline']['endFrame']
        boundaries = {lo, hi}
        for sound in audio:
            boundaries.update(max(lo, min(hi, sound['timeline'][k])) for k in ('startFrame', 'endFrame'))
        edges = sorted(boundaries)
        asset = assets[picture['assetRef']]
        for start, end in zip(edges, edges[1:]):
            active = [c for c in audio if c['timeline']['startFrame'] <= start and c['timeline']['endFrame'] >= end]
            reason = 'audio_reference_missing' if not active else 'audio_reference_ambiguous'
            preserve = False
            if len(active) == 1:
                sound = active[0]
                other = assets[sound['assetRef']]
                identical = (asset['assetVersionId'], asset['sha256']) == (other['assetVersionId'], other['sha256'])
                preserve = identical and source_offset(picture) == source_offset(sound)
                reason = 'same_source_same_time' if preserve else 'source_time_mismatch' if identical else 'different_source'
            source_start = source_offset(picture) + Fraction(start, 30)
            source_end = source_offset(picture) + Fraction(end, 30)
            routes.append({'clipId': picture['id'], 'assetVersionId': asset['assetVersionId'],
                           'sha256': asset['sha256'], 'startFrame': start, 'endFrame': end,
                           'sourceStart': {'num': source_start.numerator, 'den': source_start.denominator},
                           'sourceEnd': {'num': source_end.numerator, 'den': source_end.denominator},
                           'action': 'preserve_original' if preserve else 'inspect_source_text',
                           'reason': reason, 'textPresence': 'unverified', 'erasureAuthorized': False})
    pending = sum(r['endFrame'] - r['startFrame'] for r in routes if r['action'] == 'inspect_source_text')
    return {'schema': 'aios.source-text-routing.v1', 'status': 'inspection_required' if pending else 'original_preserved',
            'inspectionFrames': pending, 'routes': routes, 'deliveryApproved': False}
