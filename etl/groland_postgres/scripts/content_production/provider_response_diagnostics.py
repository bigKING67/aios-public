"""Small, content-free diagnostics for a failed structured provider response."""
import hashlib
import json
import re


def describe(response, text, error=None):
    response_id = response.get('id')
    status = response.get('status')
    result = {'version': 1, 'status': status if status in (
        'completed', 'incomplete', 'failed', 'cancelled', 'in_progress', 'queued', None) else 'other'}
    if isinstance(response_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', response_id):
        result['responseId'] = response_id
    if text is not None:
        result.update(outputChars=len(text), outputSha256=hashlib.sha256(text.encode()).hexdigest())
    if error is not None:
        result['errorType'] = type(error).__name__
        if isinstance(error, json.JSONDecodeError):
            result.update(jsonLine=error.lineno, jsonColumn=error.colno, jsonPosition=error.pos)
    return result
