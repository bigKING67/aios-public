"""Route generated captions from frozen source/time identity, never OCR guesses."""
from .source_text_compatibility import source_offset

POLICY = 'preserve-source-picture-v1'


def annotate_overlay_ranges(document, cues):
    if 'captionOverlayPolicy' not in document:
        return cues
    if document['captionOverlayPolicy'] != POLICY:
        raise ValueError('unsupported caption overlay policy')
    clips = {c['id']: c for c in document['clips']}
    assets = {a['ref']: (a['assetVersionId'], a['sha256']) for a in document['assets']}
    video_tracks = {t['id'] for t in document['tracks'] if t['kind'] == 'video'}
    pictures = sorted((c for c in clips.values() if c['trackId'] in video_tracks),
                      key=lambda c: c['timeline']['startFrame'])
    originals = {c['id']: c for c in document['captions']}
    for cue in cues:
        anchor = originals[cue['id']]['anchor']
        source = clips[anchor['clipId']] if anchor['kind'] == 'source' else None
        render, preserve = [], []
        for picture in pictures:
            start = max(cue['startFrame'], picture['timeline']['startFrame'])
            end = min(cue['endFrame'], picture['timeline']['endFrame'])
            if start >= end:
                continue
            interval = {'startFrame': start, 'endFrame': end}
            same = (source is not None and assets[picture['assetRef']] == assets[source['assetRef']]
                    and source_offset(picture) == source_offset(source))
            target = preserve if same else render
            if target and target[-1]['endFrame'] == start:
                target[-1]['endFrame'] = end
            else:
                target.append(interval)
        cue['renderRanges'] = render
        cue['preservedSourceRanges'] = preserve
    return cues
