"""Shared AI MediaKit HTTP client; no POST retries or credential-bearing receipts.

The API key is sent only to the fixed MediaKit API host. Upload and product
URLs never carry it, and redirects are refused so it cannot be forwarded.
See docs/autonomous-content-production/MEDIAKIT_RUNBOOK.md.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = 'https://mediakit.cn-beijing.volces.com'
TERMINAL_FAILURES = ('failed', 'canceled', 'cancelled')


class MediaKitError(RuntimeError):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _https(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise MediaKitError('MediaKit returned an invalid HTTPS media address')
    return url


def _task_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        raise MediaKitError('MediaKit returned an invalid task ID')
    return value


class MediaKitClient:
    def __init__(self, api_key: str):
        if not isinstance(api_key, str) or not api_key.strip() or any(c.isspace() for c in api_key):
            raise ValueError('AIOS_MEDIAKIT_API_KEY is missing or invalid')
        self._key = api_key
        # Never forward API credentials to redirect targets. Media URLs have no API key.
        self._opener = urllib.request.build_opener(_NoRedirect())

    def _open(self, request):
        try:
            return self._opener.open(request, timeout=60)
        except urllib.error.HTTPError as exc:
            raise MediaKitError(f'MediaKit HTTP {exc.code}') from None
        except (OSError, ValueError):
            raise MediaKitError('MediaKit transport failed; inspect saved task state') from None

    def _api(self, path, payload=None, *, terminal_errors=False):
        request = urllib.request.Request(BASE + path,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={'Authorization': 'Bearer ' + self._key, 'Content-Type': 'application/json'})
        with self._open(request) as response:
            raw = response.read(65537)
        try:
            if len(raw) > 65536:
                raise ValueError()
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            raise MediaKitError('MediaKit returned an invalid response') from None
        if body.get('success') is False and not (terminal_errors and body.get('status') in TERMINAL_FAILURES):
            code = (body.get('error') or {}).get('code') if isinstance(body.get('error'), dict) else None
            raise MediaKitError('MediaKit rejected the request' + (f' ({str(code)[:64]})' if code else ''))
        return body

    def submit_tool(self, tool: str, payload: dict) -> str:
        """One POST, never retried here; pass `client_token` in payload to make a resubmission idempotent."""
        if not re.fullmatch(r'[a-z0-9-]{1,64}', tool):
            raise ValueError('invalid MediaKit tool name')
        return _task_id(self._api('/api/v1/tools/' + tool, payload).get('task_id'))

    def task(self, task_id: str) -> dict:
        """Normalized task state: status plus the raw result dict when completed."""
        body = self._api('/api/v1/tasks/' + _task_id(task_id), terminal_errors=True)
        if body.get('task_id', task_id) != task_id:
            raise MediaKitError('MediaKit returned a different task ID')
        status = body.get('status')
        if status == 'canceled':
            status = 'cancelled'
        if status not in ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled'):
            raise MediaKitError('MediaKit returned an unknown task status')
        state = {'status': status}
        if status == 'completed':
            result = body.get('result')
            state['result'] = result if isinstance(result, dict) else {}
        elif status in ('failed', 'cancelled'):
            error = body.get('error') if isinstance(body.get('error'), dict) else {}
            state['errorCode'] = str(error.get('code') or '')[:64]
        return state

    def fetch(self, url: str, target: Path, check, max_bytes: int) -> int:
        """Downloads a product URL without the API key; refuses empty or oversized media."""
        check()
        request = urllib.request.Request(_https(url))
        size = 0
        with self._open(request) as response, target.open('xb') as stream:
            while chunk := response.read(1024 * 1024):
                check()
                size += len(chunk)
                if size > max_bytes:
                    raise MediaKitError('MediaKit output exceeds the byte budget')
                stream.write(chunk)
        if not size:
            raise MediaKitError('MediaKit returned empty media')
        return size
