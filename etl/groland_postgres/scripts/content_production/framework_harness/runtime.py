"""Exact request tapes shared by baseline, GEPA and paired fresh repetitions."""
import fcntl
import threading
import time
from pathlib import Path

from ..execution import file_hash
from ..framework_eval_runtime import MODEL, digest
from ..segment_suggestion_provider import ArkSegmentProvider, ProviderResult
from .artifacts import read, write


class ReplayMiss(RuntimeError):
    pass


class Tape:
    def __init__(self, root, ledger, *, live=False, provider=None, namespace='search'):
        self.root, self.ledger, self.live = root/namespace, ledger, live
        self.provider = provider
        self.calls = []
        self.provider_lock = threading.Lock()

    def review(self, prompt, schema, *, proxy=None, fps=2, thinking='disabled', kind='review'):
        from .. import segment_suggestion_provider
        from marketing_content_assets import ark_responses
        contract = [file_hash(Path(p)) for p in (segment_suggestion_provider.__file__, ark_responses.__file__)]
        profile = dict(model=MODEL, prompt=prompt, schema=schema,
                       mediaSha256=file_hash(proxy) if proxy else None, fps=fps if proxy else None,
                       thinking=thinking, temperature=0, maxOutputTokens=8192, store=False, contract=contract)
        key = digest(profile)
        locks = self.root/'.locks'
        locks.mkdir(parents=True, exist_ok=True)
        with (locks/key).open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            return self._invoke(profile, key, prompt, schema, proxy, fps, thinking, kind)

    def _invoke(self, profile, key, prompt, schema, proxy, fps, thinking, kind):
        path = self.root/(key + '.json')
        if path.exists():
            record = read(path)
            if (record['requestHash'] != key or digest(record['request']) != key or
                    record['responseHash'] != digest(record['result'])):
                raise ValueError('Response tape integrity mismatch')
            result = record['result']
            self.calls.append(dict(requestHash=key, reused=True, kind=kind, usage=result['usage']))
            return ProviderResult(result['payload'], result['usage'], result['responseId'])
        if not self.live:
            raise ReplayMiss('No exact response for this prompt/media/model/settings')
        with self.provider_lock:
            if self.provider is None:
                self.provider = ArkSegmentProvider()
        if self.provider.model != MODEL:
            raise ValueError('Harness model is fixed to the current Lite model')
        config = getattr(self.provider, 'config', None)
        if config is not None and config.base_url != 'https://ark.cn-beijing.volces.com/api/v3/responses':
            raise ValueError('Harness endpoint is fixed to the current Ark Responses service')
        call = self.ledger.reserve(kind, key)
        started = time.monotonic()
        row = dict(call=call, kind=kind, requestHash=key, reused=False)
        try:
            result = self.provider.review(prompt, schema, proxy=proxy, fps=fps, thinking=thinking)
        except Exception as error:
            row.update(error=type(error).__name__, code=getattr(error, 'code', None),
                       usage=getattr(error, 'usage', None), seconds=time.monotonic()-started)
            write(self.root.parent/'failed-calls'/f'{call}.json', row)
            self.calls.append(row)
            raise
        response = dict(payload=result.payload, usage=result.usage, responseId=result.response_id)
        row.update(usage=result.usage, seconds=time.monotonic()-started)
        write(path, dict(request=profile, responseHash=digest(response), result=response, **row))
        self.calls.append(row)
        return result

    def close(self):
        if self.provider is not None:
            self.provider.close()
