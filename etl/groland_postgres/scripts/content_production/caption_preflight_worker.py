"""Opt-in source-caption preflight worker; no rendering, adoption or paid retries."""
import argparse
import copy
import json
import os
from pathlib import Path
import signal
import time

from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from .caption_preflight_api import WorkerPermissionClient, consume_api_preflight
from .execution import Cancelled
from .semantic_captions import chat_completion_callback
from .source_caption_reference import SCHEMA
from .source_caption_groups import response_schema
from .worker import download
from .workspace import RenderWorkspace


def provider(model, base_url, api_key):
    # One transport for both stages; stage validators still enforce the precise
    # frame set and frozen group IDs. No prompt-text heuristics or repair calls.
    schema = copy.deepcopy(SCHEMA)
    samples = schema['properties']['samples']
    samples['maxItems'] = 32
    groups = response_schema({'groups': [{'id': f'g{i}'} for i in range(4)]})
    samples['items'] = {'anyOf': [samples['items'], groups['properties']['samples']['items']]}
    call = chat_completion_callback(base_url=base_url, api_key=api_key, model=model,
                                    protocol='responses', response_schema=schema)
    def dispatch(requested_model, messages):
        if requested_model != model:
            raise ValueError('caption preflight model differs from configured model')
        return call(messages)
    return dispatch


class BoundedPermissions:
    def __init__(self, client, model, limit, tick):
        self.client, self.model, self.limit, self.tick = client, model, limit, tick

    def check(self, job, owner, snapshot):
        self.tick()
        request = job['metadata']['caption_request']
        if (request['model'] != self.model or type(request['maxCalls']) is not int
                or not 3 <= request['maxCalls'] <= self.limit):
            raise ValueError('caption preflight exceeds worker model or call policy')
        self.client.check(job, owner, snapshot)


def process_one(root):
    if any(os.getenv(key) != 'true' for key in (
            'CONTENT_PRODUCTION_ENABLED', 'CONTENT_PRODUCTION_RUNS_ENABLED', 'AIOS_CAPTION_PREFLIGHT_ENABLED')):
        raise RuntimeError('caption preflight worker disabled')
    limit = int(os.getenv('AIOS_CAPTION_PREFLIGHT_MAX_CALLS', '3'))
    if not 3 <= limit <= 7:
        raise ValueError('caption preflight limit must be 3..7')
    model = os.getenv('AIOS_VISUAL_REVIEW_MODEL', '')
    callback = provider(model, os.getenv('AIOS_VISUAL_REVIEW_BASE_URL', ''),
                        os.getenv('AIOS_VISUAL_REVIEW_API_KEY', ''))
    permission_client = WorkerPermissionClient(os.environ['AIOS_CAPTION_PREFLIGHT_API_BASE_URL'])
    storage = TosStorageClient(TosStorageConfig.from_env())
    try:
        with RenderWorkspace(root) as workspace, connect_pg() as conn, workspace.job() as directory:
            permissions = BoundedPermissions(permission_client, model, limit, workspace.check)
            def download_source(source, target, check):
                last_check = 0.0
                def tick():
                    nonlocal last_check
                    workspace.check()
                    if time.monotonic() - last_check >= 1:
                        check()
                        last_check = time.monotonic()
                download(storage, source['objectKey'], target, source['sha256'], tick)
            report = consume_api_preflight(conn, storage, directory, permissions=permissions,
                                          call_model=callback, download_source=download_source)
            return {'status': 'idle'} if report is None else {
                'status': report['status'], 'candidateCount': len(report['candidates']),
                'callsReserved': report['callsReserved'], 'deliveryApproved': False}
    finally:
        storage.session.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    root = Path(os.environ['CONTENT_PRODUCTION_WORK_DIR']) / 'caption-preflight'
    def stop(_signal, _frame):
        raise Cancelled('caption preflight worker stopping')
    signal.signal(signal.SIGTERM, stop)
    try:
        while True:
            try:
                result = process_one(root)
            except Cancelled:
                raise
            except Exception as error:
                # Never print a job dict, capability, provider response or URL.
                result = {'status': 'failed', 'errorType': type(error).__name__}
            print(json.dumps(result), flush=True)
            if args.once:
                if result['status'] == 'failed':
                    raise SystemExit(1)
                return
            time.sleep(5 if result['status'] in ('idle', 'failed') else .1)
    except (Cancelled, KeyboardInterrupt):
        return


if __name__ == '__main__':
    main()
