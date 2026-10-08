"""Disposable Rust integration helper: real DB, queue and Worker permission HTTP."""
import hashlib
import json
import os
from pathlib import Path
import shutil
from types import SimpleNamespace
from unittest.mock import patch

import psycopg2
from content_production import caption_preflight_worker as worker


def main():
    payload = json.loads(os.environ['AIOS_CAPTION_BRIDGE_FIXTURE'])
    calls = 0
    def model(name, messages):
        nonlocal calls
        assert name == 'fixture'
        calls += 1
        assert calls <= 3
        parts = messages[1]['content']
        dense = [p for p in parts if p['type'] == 'input_text' and p['text'].startswith('待判断帧')]
        if dense:
            return {'samples': [{'frame': int(p['text'].split()[1].split('，')[0]), 'groupId': 'g0'} for p in dense]}
        frames = [int(p['text'].split()[1].split('，')[0]) for p in parts if p['type'] == 'input_text']
        return {'samples': [{'frame': f, 'visibility': 'readable', 'lines': [payload.get('text', '原片字幕')], 'appearance': 'fixture'} for f in frames]}
    def download(storage, key, target, expected, tick):
        tick()
        assert key == payload.get('objectKey', 'bridge.mp4')
        source = Path(payload['media'])
        assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
        shutil.copyfile(source, target)
        tick()
    env = {'CONTENT_PRODUCTION_ENABLED': 'true', 'CONTENT_PRODUCTION_RUNS_ENABLED': 'true',
           'AIOS_CAPTION_PREFLIGHT_ENABLED': 'true', 'AIOS_VISUAL_REVIEW_MODEL': 'fixture',
           'AIOS_CAPTION_PREFLIGHT_API_BASE_URL': payload['base'], 'CONTENT_PRODUCTION_WORK_MIN_FREE_BYTES': '1'}
    storage = SimpleNamespace(session=SimpleNamespace(close=lambda: None))
    with patch.dict(os.environ, env), patch.object(worker, 'connect_pg', lambda: psycopg2.connect(os.environ['CONTENT_PRODUCTION_TEST_DATABASE_URL'])), \
         patch.object(worker, 'provider', return_value=model), patch.object(worker, 'TosStorageConfig'), \
         patch.object(worker, 'TosStorageClient', return_value=storage), patch.object(worker, 'download', download):
        result = worker.process_one(Path(payload['work']))
        assert result['status'] == 'candidates_observed' and result['callsReserved'] == 3
        assert worker.process_one(Path(payload['work'])) == {'status': 'idle'}
    assert calls == 3
    print(json.dumps({'calls': calls, 'secondConsumption': 'idle', 'result': result}))


if __name__ == '__main__':
    main()
