"""Map authorized cached excerpt observations into original source coordinates.

This adapter binds inputs; it does not certify model timing, geometry or absence.
The host validates cached artifact provenance and the source file separately.
"""
import copy

from marketing_content_assets.visible_text_contract import validate
from .caption_quality import document_digest


def record_from_excerpt(asset, manifest, result, *, input_sha256):
    if (manifest.get('sourceSha256') != asset['sha256']
            or manifest.get('inputSha256') != input_sha256):
        raise ValueError('analysis excerpt does not match source and input bindings')
    start, end, origin = (manifest.get(k) for k in ('sourceStartMs', 'sourceEndMs', 'inputTimeOriginMs'))
    if (any(type(v) is not int for v in (start, end, origin))
            or not 0 <= start < end or origin < 0):
        raise ValueError('invalid analysis excerpt time mapping')
    # Cropped/rotated inputs require an explicit coordinate transform, not guesses.
    if manifest.get('geometry') != 'uniform scale to 720px width; no crop':
        raise ValueError('unsupported analysis excerpt geometry')
    observed = validate(result['analysis']['video_understanding']['visible_text'])
    mapped = copy.deepcopy(observed)
    for item in mapped['observations']:
        if not origin <= item['start_ms'] < item['end_ms'] <= origin + end - start:
            raise ValueError('visible text falls outside analyzed excerpt')
        item['start_ms'] += start - origin
        item['end_ms'] += start - origin
    return {'assetVersionId': asset['assetVersionId'], 'sourceSha256': asset['sha256'],
        'visibleText': mapped, 'analysisEvidence': {
            'manifestSha256': document_digest(manifest), 'resultSha256': document_digest(result),
            'inputSha256': input_sha256, 'sourceStartMs': start, 'sourceEndMs': end,
            'timeMapping': 'sourceStartMs + observationMs - inputTimeOriginMs',
            'geometry': 'normalized_xywh_uniform_scale_no_crop',
            'precision': 'model_estimate', 'textFreeVerified': False}}
