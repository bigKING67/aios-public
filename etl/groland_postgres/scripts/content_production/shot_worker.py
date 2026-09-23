"""Independent raw-video extraction worker; no model calls or thumbnail uploads."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from .execution import Cancelled, renderer_env
from .queue import verify_sources
from .worker import download
from .shot_queue import claim, heartbeat, finish


def extract(source, binding, work, tick):
    env = renderer_env(work)
    env['PYTHONPATH'] = str(Path(__file__).resolve().parents[1])
    output = work / 'catalog'
    command = [sys.executable, '-m', 'content_production.shot_catalog', '--source', str(source), '--asset-id', str(binding['assetId']),
               '--expected-sha256', binding['sha256'], '--output', str(output)]
    with (work / 'extract.log').open('wb') as log:
        proc = subprocess.Popen(command, env=env, stdout=log, stderr=log, start_new_session=True)
        started = time.monotonic()
        try:
            while proc.poll() is None:
                tick()
                if time.monotonic() - started > 900:
                    raise TimeoutError('extraction timed out')
                time.sleep(1)
            if proc.returncode:
                raise RuntimeError('extraction CLI failed')
            tick()
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=10)
    catalog = json.loads((output / 'catalog.json').read_text())
    if catalog['rawSha256'] != binding['sha256'] or abs(catalog['source']['durationMs'] - binding['durationMs']) > 1:
        raise ValueError('extracted identity/duration differs from asset')
    return {'source': binding, 'clips': [{'id': shot['shotId'], 'assetId': str(binding['assetId']), 'startMs': shot['startMs'],
            'endMs': shot['endMs'], 'caption': '', 'volume': 1.0} for shot in catalog['shots']]}


def process_one(work_root):
    if os.getenv('CONTENT_PRODUCTION_ENABLED') != 'true' or os.getenv('CONTENT_PRODUCTION_SHOT_EXTRACTION_ENABLED') != 'true':
        raise RuntimeError('shot extraction is disabled')
    storage = TosStorageClient(TosStorageConfig.from_env())
    with connect_pg() as conn:
        job = claim(conn)
        if not job:
            return {'status': 'idle'}
        stage, last_beat = '下载原片', 0.0
        def tick():
            nonlocal last_beat
            if time.monotonic() - last_beat >= 1:
                heartbeat(conn, job, stage)
                last_beat = time.monotonic()
        try:
            verify_sources(conn, job['snapshot'], storage.config.bucket)
            binding = job['snapshot']['assets'][0]
            with tempfile.TemporaryDirectory(prefix='shot-extraction-', dir=work_root) as folder:
                work = Path(folder)
                source = work / 'source.mp4'
                download(storage, binding['objectKey'], source, binding['sha256'], tick)
                stage = '检测边界与提取代表帧'
                stored = extract(source, binding, work, tick)
                heartbeat(conn, job, '保存镜头目录')
                verify_sources(conn, job['snapshot'], storage.config.bucket)
                completed = finish(conn, job, 'completed', stored)
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
    root = os.environ.get('CONTENT_PRODUCTION_WORK_DIR')
    if not root:
        raise RuntimeError('CONTENT_PRODUCTION_WORK_DIR is required')
    work_root = Path(root).resolve()
    work_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    stopping = False
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
        raise Cancelled('worker stopping')
    signal.signal(signal.SIGTERM, stop)
    try:
        while not stopping:
            result = process_one(work_root)
            print(json.dumps(result), flush=True)
            if args.once:
                break
            time.sleep(5 if result['status'] == 'idle' else 0.1)
    except (Cancelled, KeyboardInterrupt):
        return


if __name__ == '__main__':
    main()
