"""Local adapters around the real Worker; exact response tapes and bounded live calls."""
import ast
import copy
import hashlib
import json
import threading
import time
from dataclasses import replace
from pathlib import Path

from .execution import file_hash
from .segment_suggestion_provider import ArkSegmentProvider, ProviderResult, SuggestionError

MODEL = 'doubao-seed-2-1-lite-260915'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def response_hash(content, schema, thinking, temperature, reasoning_effort):
    # Compatible with verified historical tapes. Fixed wire settings are checked
    # against the archived provider implementation when importing those tapes.
    return digest(dict(model=MODEL, content=content, schema=schema, thinking=thinking,
                       temperature=temperature, reasoning_effort=reasoning_effort))


def decision_hash(questions, inputs):
    return hashlib.sha256(json.dumps(dict(model=MODEL, questions=questions,
        context=inputs.get('context'), proxySha256=file_hash(inputs['proxy']), fps=inputs['fps']),
        sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def method_contract(path):
    tree = ast.parse(path.read_text())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'ArkSegmentProvider')
    return {n.name: ast.dump(n, include_attributes=False) for n in cls.body
            if isinstance(n, ast.FunctionDef) and n.name in ('_request', 'decide')}


def load_cache(roots, film):
    cache, visited = {}, set()
    current = method_contract(Path(__file__).with_name('segment_suggestion_provider.py'))
    queue = list(roots)
    while queue:
        root = Path(queue.pop(0)).resolve()
        if root in visited:
            continue
        visited.add(root)
        work = root/film
        if not (work/'calls.json').is_file() or not (work/'run.json').is_file():
            continue
        manifest = json.loads((root/'manifest.json').read_text())
        run = json.loads((work/'run.json').read_text())
        if manifest.get('model') != MODEL or run.get('film') != film:
            raise ValueError('Cache model/film mismatch')
        provider_file = root/'segment_suggestion_provider.py'
        if not provider_file.is_file():
            raise ValueError('Cache lacks archived provider wire contract')
        contracts = method_contract(provider_file)
        records = json.loads((work/'calls.json').read_text())
        if not all(isinstance(c.get('requestHash'), str) and len(c['requestHash']) == 64 for c in records):
            raise ValueError('Legacy cache has no exact request hashes; reconstruct it first')
        if manifest.get('mode', '').startswith('offline archived-code') and not run.get('reconstructionComplete'):
            raise ValueError('Historical reconstruction did not reproduce the original run')
        grouped = {}
        for c in records:
            method = 'decide' if c.get('api') == 'systemone' else '_request'
            if ('payload' in c or c.get('code') == 'provider_incomplete') and contracts.get(method) == current.get(method):
                grouped.setdefault(c['requestHash'], []).append(dict(c, reusedFrom=str(work)))
        for key, values in grouped.items():
            cache.setdefault(key, values)
        parent = manifest.get('cacheSources', {}).get(film, manifest.get('cacheSource'))
        if parent:
            queue.append(root.parent/parent)
    return cache


class Budget:
    def __init__(self, maximum):
        self.maximum, self.used, self.lock = maximum, 0, threading.Lock()
        self.provider_failures = 0
        self.provider_unavailable = False

    def claim(self):
        with self.lock:
            if self.provider_unavailable:
                raise ValueError('Evaluation provider unavailable after three consecutive remote failures')
            if self.used >= self.maximum:
                raise ValueError('Evaluation new-call budget exhausted')
            self.used += 1

    def remote_result(self, error=None):
        with self.lock:
            if getattr(error,'code',None) in ('provider_error','provider_timeout'):
                self.provider_failures += 1
                self.provider_unavailable |= self.provider_failures >= 3
            elif error is None:
                self.provider_failures = 0


class RecordingProvider(ArkSegmentProvider):
    def __init__(self, work, roots, budget, live, per_film):
        self.work, self.budget, self.live, self.per_film = work, budget, live, per_film
        # Establish receipt storage before constructing a client or spending a
        # call budget. Standalone evidence probes may not have a worker folder.
        self.work.mkdir(parents=True, exist_ok=True)
        self.calls, self.new_calls = [], 0
        self.cache = load_cache(roots, work.name)
        if live:
            from marketing_content_assets.ark_responses import ArkResponsesConfig
            config = replace(ArkResponsesConfig.from_env(), model=MODEL)
            if config.base_url != 'https://ark.cn-beijing.volces.com/api/v3/responses':
                raise ValueError('Evaluation requires the ordinary Ark API endpoint')
            super().__init__(config)
        else:
            # No credential, client or network construction on the default path.
            self.model, self.fps, self.thinking, self.client = MODEL, 2.0, 'enabled', None

    def close(self):
        if self.client:
            super().close()

    def invoke(self, key, api, request, *, profile=None):
        cached = self.cache.get(key, [])
        if cached:
            row = copy.deepcopy(cached.pop(0))
            row.update(reused=True, api=api)
            if profile is not None:
                row['requestProfile'] = profile
            if row.get('code') == 'provider_incomplete' and 'payload' not in row:
                self.save(row)
                raise SuggestionError('provider_incomplete', 'Recorded incomplete response', row.get('usage'))
            result = ProviderResult(copy.deepcopy(row['payload']), copy.deepcopy(row['usage']), row['responseId'])
        else:
            if not self.live:
                raise ValueError('Offline exact request cache miss: ' + key)
            if self.new_calls >= self.per_film:
                raise ValueError('Per-film new-call budget exhausted')
            self.budget.claim()
            self.new_calls += 1
            row = dict(api=api, requestHash=key, reused=False)
            if profile is not None:
                row['requestProfile'] = profile
            started = time.monotonic()
            try:
                result = request()
                self.budget.remote_result()
                row.update(payload=copy.deepcopy(result.payload), usage=copy.deepcopy(result.usage),
                           responseId=result.response_id, providerSeconds=round(time.monotonic()-started, 6))
            except Exception as error:
                self.budget.remote_result(error)
                row.update(error=type(error).__name__, code=getattr(error, 'code', None),
                           usage=getattr(error, 'usage', None), providerSeconds=round(time.monotonic()-started, 6))
                self.save(row)
                raise
        self.save(row)
        return result

    def save(self, row):
        self.calls.append(row)
        (self.work/'calls.json').write_text(json.dumps(self.calls, ensure_ascii=False, indent=2))

    def _request(self, content, schema, thinking, *, temperature=.1, reasoning_effort=None):
        key = response_hash(content, schema, thinking, temperature, reasoning_effort)
        # Record only structure/settings, never media bytes, prompts or credentials.
        profile = dict(schemaFields=sorted(schema.get('properties', {})),
            inputTypes=[part['type'] for part in content], thinking=thinking,
            reasoningEffort=reasoning_effort, temperature=temperature)
        return self.invoke(key, 'responses', lambda: super(RecordingProvider, self)._request(
            content, schema, thinking, temperature=temperature, reasoning_effort=reasoning_effort),
            profile=profile)

    def decide(self, questions, **inputs):
        return self.invoke(decision_hash(questions, inputs), 'systemone',
                           lambda: super(RecordingProvider, self).decide(questions, **inputs),
                           profile=dict(schemaFields=sorted(questions), inputTypes=['input_video']))
