"""Run-owned treated media in immutable snapshots, never replacement raw assets."""
import math
import re

from .caption_quality import document_digest


def validate_derived_assets(snapshot, project_id):
    derived = snapshot.get('derivedAssets', [])
    if not isinstance(derived, list) or len(derived) > 30:
        raise ValueError('invalid derived asset list')
    document = snapshot.get('editDocument')
    if derived and not isinstance(document, dict):
        raise ValueError('derived assets require an edit document')
    seen = set()
    for item in derived:
        if not isinstance(item, dict) or set(item) != {
            'assetVersionId', 'objectKey', 'sha256', 'durationMs', 'parentAssetId',
            'parentSha256', 'requestSha256', 'treatmentRequest', 'baseProjectRevision', 'providerTaskId',
        }:
            raise ValueError('invalid derived asset binding')
        digest, request = item['sha256'], item['treatmentRequest']
        if not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('invalid derived media digest')
        if not isinstance(request, dict) or document_digest(request) != item['requestSha256']:
            raise ValueError('derived treatment provenance changed')
        if not isinstance(item['providerTaskId'], str) or not re.fullmatch('[A-Za-z0-9_-]{1,128}', item['providerTaskId']):
            raise ValueError('invalid treatment provider task identity')
        if (item['assetVersionId'] != 'treated-' + digest[:48] or item['assetVersionId'] in seen
                or item['objectKey'] != f"production/{project_id}/treatments/{item['requestSha256']}/{digest}.mp4"
                or type(item['baseProjectRevision']) is not int or item['baseProjectRevision'] < 1
                or type(request.get('frames')) is not int or not 1 <= request['frames'] <= 300
                or type(item['durationMs']) is not int or item['durationMs'] != math.ceil(request['frames'] * 1000 / 30)):
            raise ValueError('derived media identity or range is invalid')
        parent = next((a for a in snapshot['assets'] if a['assetId'] == item['parentAssetId']), None)
        if (parent is None or parent['sha256'] != item['parentSha256']
                or request.get('source', {}).get('sha256') != parent['sha256']
                or request['source'].get('assetVersionId') != f"{parent['assetId']}-{parent['sha256'][:16]}"):
            raise ValueError('derived media parent differs from the frozen source')
        asset = next((a for a in document['assets'] if a['assetVersionId'] == item['assetVersionId']), None)
        tracks = {t['id']: t['kind'] for t in document['tracks']}
        clips = [c for c in document['clips'] if asset and c['assetRef'] == asset['ref']]
        if (asset is None or asset['sha256'] != digest or len(clips) != 1
                or clips[0]['id'] != request.get('clipId') or tracks[clips[0]['trackId']] != 'video'
                or clips[0]['audioPolicy'] != 'mute' or clips[0]['timeline'] != request.get('timeline')
                or clips[0]['sourceMap'] != [{'startFrame': 0, 'endFrame': request['frames'],
                    'sourceStart': {'num': 0, 'den': 30}, 'sourceEnd': {'num': request['frames'], 'den': 30}}]
                or document.get('captionOverlayPolicy') != 'preserve-source-picture-v1'):
            raise ValueError('derived media is not the frozen treated picture slot')
        seen.add(item['assetVersionId'])
    return derived


def document_bindings(snapshot):
    bindings = {f"{a['assetId']}-{a['sha256'][:16]}": {
        'sha256': a['sha256'], 'durationMs': a['durationMs']} for a in snapshot['assets']}
    for asset in snapshot.get('derivedAssets', []):
        bindings[asset['assetVersionId']] = {'sha256': asset['sha256'], 'durationMs': asset['durationMs']}
    return bindings


def document_media(snapshot, media):
    files = {f"{a['assetId']}-{a['sha256'][:16]}": media[a['assetId']] for a in snapshot['assets']}
    for asset in snapshot.get('derivedAssets', []):
        files[asset['assetVersionId']] = media[asset['assetVersionId']]
    return files
