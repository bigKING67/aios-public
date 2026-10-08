"""Bounded MediaKit subtitle-erasure adapter on the shared client (no POST retries)."""
import urllib.request
from pathlib import Path

from .mediakit_client import MediaKitClient, MediaKitError, _NoRedirect, _https, _task_id  # noqa: F401

TOOL = 'erase-video-subtitle-pro'
MAX_BYTES = 200 * 1024 * 1024


class MediaKitErasure(MediaKitClient):
    def submit(self, source: Path, parameters: dict, check) -> str:
        check()
        if not 0 < source.stat().st_size <= MAX_BYTES:
            raise MediaKitError('MediaKit input exceeds the per-shot byte budget')
        upload = self._api('/api/v1/tools-sync/request-media-upload-url', {'tool_name': TOOL}).get('result')
        if not isinstance(upload, dict):
            raise MediaKitError('MediaKit upload response is missing')
        url = _https(upload.get('upload_url', ''))
        headers = {}
        for entry in upload.get('upload_headers', []):
            if isinstance(entry, str) and ':' in entry:
                key, value = entry.split(':', 1)
            elif isinstance(entry, dict):
                key = entry.get('key', entry.get('name', entry.get('header')))
                value = entry.get('value', entry.get('val'))
            else:
                raise MediaKitError('MediaKit returned invalid upload headers')
            if not isinstance(key, str) or not isinstance(value, str) or '\n' in key + value or '\r' in key + value:
                raise MediaKitError('MediaKit returned invalid upload headers')
            headers[key.strip()] = value.strip()
        method, file_id = upload.get('method') or 'PUT', upload.get('file_id')
        if method != 'PUT' or not isinstance(file_id, str) or not file_id:
            raise MediaKitError('MediaKit returned an unsupported upload contract')
        check()
        with self._open(urllib.request.Request(url, data=source.read_bytes(), headers=headers, method=method)):
            pass
        check()
        body = self._api('/api/v1/tools/' + TOOL, {**parameters, 'video_url': file_id})
        return _task_id(body.get('task_id'))

    def query(self, task_id: str) -> dict:
        state = self.task(task_id)
        result = {'status': state['status']}
        if state['status'] == 'completed':
            result['video_url'] = _https(state['result'].get('video_url', ''))
        return result

    def download(self, result: dict, target: Path, check):
        # Only a fresh, authenticated query can supply this ephemeral address.
        self.fetch(result['video_url'], target, check, MAX_BYTES)
