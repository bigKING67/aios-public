"""Explicit local frame analysis and evidence-bound keyword clip lookup."""
import argparse
import base64
import json
import os
from pathlib import Path
import tempfile

from .shot_semantic_contract import (
    SCHEMA, PROMPT_VERSION, PROMPT, digest, frame_bytes, load_catalog,
    observation_schema, read_bounded, validate_observation,
)


def analyze_frame(client, data):
    from marketing_content_assets.ark_responses import extract_output_text
    response = client._post({
        'model': client.config.model,
        'input': [{'role': 'user', 'content': [
            {'type': 'input_image', 'image_url': 'data:image/jpeg;base64,' + base64.b64encode(data).decode(), 'detail': 'auto'},
            {'type': 'input_text', 'text': PROMPT}]}],
        'max_output_tokens': 1600, 'thinking': {'type': 'disabled'}, 'temperature': 0, 'store': False,
        'text': {'format': {'type': 'json_schema', 'name': 'shot_frame_observation', 'strict': True, 'schema': observation_schema()}},
    })
    if response.get('status') != 'completed':
        raise ValueError('Provider response is not completed')
    return validate_observation(json.loads(extract_output_text(response)))


def publish(path, result):
    # Atomic no-clobber publication; failure leaves no partial successful sidecar.
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.shot-semantic-', delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write((json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode())
            stream.flush()
            os.fsync(stream.fileno())
            os.link(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def analyze(catalog_path, shot_ids, output, *, confirmed, client_factory=None):
    if not confirmed:
        raise ValueError('Explicit frame upload and model cost confirmation required')
    if output.exists() or output.is_symlink() or not output.parent.is_dir():
        raise ValueError('Output must be a new file in an existing directory')
    if not 1 <= len(shot_ids) <= 12 or len(set(shot_ids)) != len(shot_ids):
        raise ValueError('Select 1–12 unique shots per explicit batch')
    catalog, catalog_hash = load_catalog(catalog_path)
    selected = [shot for shot in catalog['shots'] if shot['shotId'] in shot_ids]
    if len(selected) != len(shot_ids):
        raise ValueError('Unknown shot IDs')
    # Validate all local inputs before any billable call; send the exact hashed bytes.
    frames = [frame_bytes(catalog_path.parent, shot) for shot in selected]
    if client_factory is None:
        from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
        client_factory = lambda: ArkResponsesClient(ArkResponsesConfig.from_env())
    client = client_factory()
    try:
        observations = [analyze_frame(client, data) for data in frames]
    finally:
        client.session.close()
    if load_catalog(catalog_path)[1] != catalog_hash:
        raise ValueError('Catalog changed during analysis')
    for shot, data in zip(selected, frames):
        if frame_bytes(catalog_path.parent, shot) != data:
            raise ValueError('Frame changed during analysis')
    result = {
        'schema': SCHEMA, 'basis': 'representative-frame-only', 'catalogSha256': catalog_hash,
        'assetId': catalog['assetId'], 'rawSha256': catalog['rawSha256'], 'promptVersion': PROMPT_VERSION,
        'model': client.config.model, 'coverage': 'selected-shots',
        'shots': [{**{key: shot[key] for key in ('shotId', 'startMs', 'endMs')},
                   'frameSha256': shot['representativeFrame']['sha256'],
                   'requestedAtMs': shot['representativeFrame']['requestedAtMs'],
                   'observation': observation} for shot, observation in zip(selected, observations)],
    }
    publish(output, result)
    return result


def search(catalog_path, semantics_path, query):
    """Literal keyword matching over visible claims; never rank reuse suggestions as facts."""
    if not isinstance(query, str) or not query.strip() or len(query) > 120:
        raise ValueError('Query must have 1–120 characters')
    catalog, catalog_hash = load_catalog(catalog_path)
    result = json.loads(read_bounded(semantics_path, 1024 * 1024))
    if (result['schema'] != SCHEMA or result['basis'] != 'representative-frame-only'
        or result['catalogSha256'] != catalog_hash or result['assetId'] != catalog['assetId']
        or result['rawSha256'] != catalog['rawSha256'] or result['promptVersion'] != PROMPT_VERSION
        or result['coverage'] != 'selected-shots' or not isinstance(result['model'], str) or not result['model'].strip()):
        raise ValueError('Semantic source or version mismatch')
    originals = {shot['shotId']: shot for shot in catalog['shots']}
    entries = result['shots']
    if not isinstance(entries, list) or not 1 <= len(entries) <= 12:
        raise ValueError('Invalid semantic shot count')
    hits, seen = [], set()
    for entry in entries:
        shot = originals.get(entry['shotId'])
        if shot is None or entry['shotId'] in seen:
            raise ValueError('Unknown or duplicate semantic shot')
        seen.add(entry['shotId'])
        frame = shot['representativeFrame']
        expected = (shot['startMs'], shot['endMs'], frame['sha256'], frame['requestedAtMs'])
        if (entry['startMs'], entry['endMs'], entry['frameSha256'], entry['requestedAtMs']) != expected:
            raise ValueError('Semantic evidence mismatch')
        frame_bytes(catalog_path.parent, shot)
        observation = validate_observation(entry['observation'])
        evidence = []
        for field, value in observation.items():
            if field == 'reuseIdeas':
                continue
            for claim in value if isinstance(value, list) else [value]:
                if query.strip().casefold() in claim.casefold():
                    evidence.append({'field': field, 'text': claim})
        if evidence:
            hits.append({'assetId': catalog['assetId'], 'rawSha256': catalog['rawSha256'],
                         **{key: entry[key] for key in ('shotId', 'startMs', 'endMs', 'frameSha256', 'requestedAtMs')},
                         'evidence': evidence, 'reuseIdeas': observation['reuseIdeas'],
                         'model': result['model'], 'promptVersion': result['promptVersion']})
    return {'basis': 'representative-frame-keyword', 'notice': '模型单帧描述，非完整动作或质量证明；播放原片复核。', 'items': hits}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    build = commands.add_parser('analyze')
    build.add_argument('--catalog', type=Path, required=True)
    build.add_argument('--shot-id', action='append', required=True)
    build.add_argument('--output', type=Path, required=True)
    build.add_argument('--confirm-model-upload', action='store_true')
    lookup = commands.add_parser('search')
    lookup.add_argument('--catalog', type=Path, required=True)
    lookup.add_argument('--semantics', type=Path, required=True)
    lookup.add_argument('--query', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'analyze':
            result = analyze(args.catalog, args.shot_id, args.output, confirmed=args.confirm_model_upload)
            print(json.dumps({'status': 'completed', 'shots': len(result['shots'])}))
        else:
            print(json.dumps(search(args.catalog, args.semantics, args.query), ensure_ascii=False))
    except Exception as error:
        # Provider diagnostics may contain private image text or credentials; do not echo them.
        parser.exit(1, f'Shot semantics failed ({type(error).__name__}); no successful output published by this invocation.\n')


if __name__ == '__main__':
    main()
