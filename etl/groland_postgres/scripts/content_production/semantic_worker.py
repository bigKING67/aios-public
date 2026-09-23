"""Dedicated source-bound semantic worker; model calls require explicit API consent."""
import argparse
from dataclasses import replace
import json
import os
from pathlib import Path
import signal
import tempfile
import time

from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from .execution import Cancelled, renderer_env
from .queue import verify_sources
from .worker import download
from .shot_catalog import probe, run
from .shot_semantic_contract import PROMPT_VERSION, digest, read_bounded
from .shot_semantics import analyze_frame
from .semantic_queue import claim, heartbeat, finish


def describe(conn, job, storage, work, client_factory=None):
    snapshot = job['snapshot']
    source = snapshot['assets'][0]
    clips = snapshot['clips']
    if not 1 <= len(clips) <= 12 or len({c['id'] for c in clips}) != len(clips):
        raise ValueError('Invalid selected shots')
    last_beat = 0.0
    def tick():
        nonlocal last_beat
        if time.monotonic() - last_beat >= 1:
            heartbeat(conn, job, '下载原片')
            last_beat = time.monotonic()
    verify_sources(conn, snapshot, storage.config.bucket)
    local = work / 'source.mp4'
    download(storage, source['objectKey'], local, source['sha256'], tick)
    env = renderer_env(work)
    metadata = probe(local, 'ffprobe', env=env)
    if abs(metadata['durationMs'] - source['durationMs']) > 1:
        raise ValueError('Source duration changed')
    frames = []
    for i, clip in enumerate(clips):
        start, end = clip['startMs'], clip['endMs']
        if (clip['assetId'] != source['assetId'] or not 0 <= start < end <= metadata['durationMs']
            or end - start < 250 or clip['id'] != digest(f"{source['sha256']}:{start}:{end}".encode())[:24]):
            raise ValueError('Invalid source-bound shot')
        heartbeat(conn, job, '提取代表帧')
        at = (start + end) // 2
        frame = work / f'{i}.jpg'
        run(['ffmpeg', '-nostdin', '-xerror', '-v', 'error', '-ss', f'{at / 1000:.3f}', '-i', str(local),
             '-map', f"0:{metadata['streamIndex']}", '-frames:v', '1', '-vf', 'scale=480:480:force_original_aspect_ratio=decrease',
             '-q:v', '3', str(frame)], timeout=30, env=env)
        data = read_bounded(frame, 2 * 1024 * 1024)
        if not data.startswith(b'\xff\xd8\xff') or not data.endswith(b'\xff\xd9'):
            raise ValueError('Invalid extracted JPEG')
        frames.append((clip, at, data))
    if client_factory is None:
        # Bound connect/read inactivity below the lease; expired tokens cannot publish. No retries.
        config = replace(ArkResponsesConfig.from_env(), timeout_seconds=60)
        client_factory = lambda: ArkResponsesClient(config)
    client = client_factory()
    results = []
    try:
        for i, (clip, at, data) in enumerate(frames):
            verify_sources(conn, snapshot, storage.config.bucket)
            heartbeat(conn, job, f'分析代表帧 {i + 1}/{len(frames)}')
            observation = analyze_frame(client, data)
            heartbeat(conn, job, '校验模型结果')
            claims = [text for key, value in observation.items() if key != 'reuseIdeas'
                      for text in (value if isinstance(value, list) else [value])]
            results.append({'shotId': clip['id'], 'startMs': clip['startMs'], 'endMs': clip['endMs'],
                            'requestedAtMs': at, 'frameSha256': digest(data), 'observation': observation,
                            'searchText': '\n'.join(claims)})
    finally:
        client.session.close()
    verify_sources(conn, snapshot, storage.config.bucket)
    return {'basis': 'representative-frame-only', 'model': client.config.model, 'promptVersion': PROMPT_VERSION,
            'assetId': source['assetId'], 'rawSha256': source['sha256'], 'shots': results}


def process_one(root, client_factory=None):
    if os.getenv('CONTENT_PRODUCTION_ENABLED') != 'true' or os.getenv('CONTENT_PRODUCTION_SEMANTICS_ENABLED') != 'true':
        raise RuntimeError('Semantic worker is disabled')
    storage = TosStorageClient(TosStorageConfig.from_env())
    with connect_pg() as conn:
        job = claim(conn)
        if not job:
            return {'status': 'idle'}
        try:
            with tempfile.TemporaryDirectory(prefix='semantic-', dir=root) as folder:
                result = describe(conn, job, storage, Path(folder), client_factory)
                completed = finish(conn, job, 'completed', result)
                return {'jobId': str(job['job_id']), 'status': 'completed' if completed else 'cancelled'}
        except Cancelled:
            conn.rollback()
            finish(conn, job, 'cancelled')
            return {'jobId': str(job['job_id']), 'status': 'cancelled'}
        except Exception as error:
            conn.rollback()
            finish(conn, job, 'failed')
            return {'jobId': str(job['job_id']), 'status': 'failed', 'errorType': type(error).__name__}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    root = Path(os.environ['CONTENT_PRODUCTION_WORK_DIR']).resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    stopping = False
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
        raise Cancelled('Worker stopping')
    signal.signal(signal.SIGTERM, stop)
    try:
        while not stopping:
            result = process_one(root)
            print(json.dumps(result), flush=True)
            if args.once:
                break
            time.sleep(5 if result['status'] == 'idle' else 0.1)
    except (Cancelled, KeyboardInterrupt):
        return


if __name__ == '__main__':
    main()
