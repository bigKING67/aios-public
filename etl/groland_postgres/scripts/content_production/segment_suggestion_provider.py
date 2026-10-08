"""Proxy media and model providers for AI 切段打标.

`ArkSegmentProvider` performs a billable Ark Responses call and refuses to
construct unless CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE=1 is set explicitly, so
tests and scripts never reach the provider by default. `MockSegmentProvider`
returns a fixed payload for tests and local UI walkthroughs.
"""
import base64
import json
import os
import re
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, replace

LIVE_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE'
PROXY_SETTINGS = {'shortSide': 360, 'fps': 15, 'videoCodec': 'h264', 'crf': 30,
                  'audio': 'aac-48k-mono', 'transport': 'base64-data-url'}


class SuggestionError(RuntimeError):
    """Terminal failure with a machine-readable code; the message stays generic."""

    def __init__(self, code, message, usage=None):
        super().__init__(message)
        self.code = code
        self.usage = usage


def live_calls_allowed():
    return os.getenv(LIVE_ENV) == '1'


def _env_float(name, default, low, high):
    raw = (os.getenv(name) or '').strip()
    value = float(raw) if raw else default
    if not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}')
    return value


def max_proxy_bytes():
    return int(_env_float('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_MAX_PROXY_MB', 20, 1, 60) * 1024 * 1024)


def run_media(command, env, tick, timeout, stderr=subprocess.DEVNULL, poll_seconds=1.0):
    """Runs one FFmpeg command in its own process group while `tick` keeps the lease alive.

    Returns the exit code; raises TimeoutError after `timeout` seconds. The whole
    process group is terminated on timeout or when `tick` raises (cancellation).
    """
    proc = subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL, stderr=stderr, start_new_session=True)
    started = time.monotonic()
    try:
        while proc.poll() is None:
            tick()
            if time.monotonic() - started > timeout:
                raise TimeoutError('media command timed out')
            time.sleep(poll_seconds)
        return proc.returncode
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=10)


def build_proxy(source, output, env, tick, timeout=900):
    """Low-bitrate proxy with audio (optional stream); FFmpeg output never reaches logs."""
    scale = "scale=w='if(gt(iw,ih),-2,360)':h='if(gt(iw,ih),360,-2)'"
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-map', '0:v:0', '-map', '0:a:0?',
               '-vf', scale, '-r', '15', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', str(output)]
    try:
        code = run_media(command, env, tick, timeout)
    except TimeoutError as error:
        raise SuggestionError('proxy_failed', '代理视频生成超时') from error
    if code:
        raise SuggestionError('proxy_failed', '代理视频生成失败')
    return output


def call_with_ticks(function, tick, deadline_seconds):
    """Runs a blocking provider call in a thread while the caller keeps its lease alive."""
    values, errors = [], []

    def dispatch():
        try:
            values.append(function())
        except BaseException as error:  # noqa: BLE001 - re-raised on the caller thread
            errors.append(error)
    thread = threading.Thread(target=dispatch, daemon=True)
    thread.start()
    deadline = time.monotonic() + deadline_seconds
    while thread.is_alive():
        thread.join(1)
        tick()
        if time.monotonic() > deadline:
            raise SuggestionError('provider_timeout', '模型响应超时；调用可能已计费，请检查后手动重新发起')
    if errors:
        raise errors[0]
    return values[0]


@dataclass(frozen=True)
class ProviderResult:
    payload: dict
    usage: dict
    response_id: str


class MockSegmentProvider:
    """Deterministic provider. Without a payload it splits the video evenly across preset labels."""

    name = 'mock'
    model = 'mock-segment-provider'

    def __init__(self, payload=None, error=None):
        self.payload, self.error, self.calls = payload, error, []

    def request_settings(self):
        return {'provider': self.name, 'proxy': PROXY_SETTINGS}

    def suggest(self, proxy, prompt, schema, duration_ms):
        self.calls.append({'proxy': str(proxy), 'prompt': prompt, 'schema': schema, 'durationMs': duration_ms})
        if self.error:
            raise self.error
        payload = self.payload
        if payload is None:
            keys = schema['properties']['segments']['items']['properties']['label_key']['enum']
            count = min(len(keys), 3)
            step = duration_ms / 1000 / count
            payload = {'segments': [{'start_sec': round(i * step, 3), 'end_sec': round((i + 1) * step, 3),
                                     'label_key': keys[i], 'confidence': 0.5, 'reason': '本地模拟结果，非模型判断'}
                                    for i in range(count)]}
        return ProviderResult(payload=payload, usage={'mock': True}, response_id='')


class ArkSegmentProvider:
    """Billable Ark Responses call with json_schema strict; never retried."""

    name = 'ark'

    def __init__(self, config=None):
        if not live_calls_allowed():
            raise RuntimeError(f'Live AI 切段 calls require {LIVE_ENV}=1')
        from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
        base = config or ArkResponsesConfig.from_env()
        # Bound one call below the provider deadline; the worker keeps the lease meanwhile.
        self.config = replace(base, timeout_seconds=min(base.timeout_seconds, 600))
        self.client = ArkResponsesClient(self.config)
        self.model = self.config.model
        self.fps = _env_float('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_FPS', 2.0, 0.2, 5.0)
        self.thinking = (os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_THINKING') or 'disabled').strip()
        if self.thinking not in {'disabled', 'enabled'}:
            raise ValueError('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_THINKING must be disabled or enabled')

    def request_settings(self):
        return {'provider': self.name, 'fps': self.fps, 'thinking': self.thinking, 'temperature': 0.1,
                'maxOutputTokens': 8192, 'jsonSchemaStrict': True, 'store': False, 'proxy': PROXY_SETTINGS}

    def suggest(self, proxy, prompt, schema, duration_ms):
        from marketing_content_assets.ark_responses import extract_output_text
        data = base64.b64encode(proxy.read_bytes()).decode()
        request = {
            'model': self.model,
            'input': [{'role': 'user', 'content': [
                {'type': 'input_video', 'video_url': f'data:video/mp4;base64,{data}', 'fps': self.fps},
                {'type': 'input_text', 'text': prompt}]}],
            'max_output_tokens': 8192, 'thinking': {'type': self.thinking}, 'temperature': 0.1, 'store': False,
            'text': {'format': {'type': 'json_schema', 'name': 'content_segment_suggestions', 'strict': True, 'schema': schema}},
        }
        try:
            response = self.client._post(request)
        except Exception as error:
            # Provider diagnostics may echo request data; keep only the error type and HTTP status.
            raise SuggestionError('provider_error', f'模型调用失败（{provider_error_kind(error)}）；调用可能已计费，请检查后手动重新发起') from error
        usage = response.get('usage') if isinstance(response.get('usage'), dict) else {}
        if response.get('status') not in (None, 'completed'):
            raise SuggestionError('provider_incomplete', '模型未完成输出', usage)
        try:
            payload = json.loads(extract_output_text(response))
        except Exception as error:
            raise SuggestionError('invalid_response', '模型返回无法解析', usage) from error
        return ProviderResult(payload=payload, usage=usage, response_id=str(response.get('id') or '')[:200])

    def close(self):
        self.client.session.close()


def provider_error_kind(error):
    """Error class plus HTTP status when present; never the message, which may echo the request."""
    match = re.search(r'HTTP (\d{3})', str(error))
    return type(error).__name__ + (f' HTTP {match.group(1)}' if match else '')


def provider_from_env():
    """`ark` (default) needs the explicit live flag; `mock` writes clearly labelled fake suggestions."""
    choice = (os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER') or 'ark').strip()
    if choice == 'mock':
        return MockSegmentProvider()
    if choice == 'ark':
        return ArkSegmentProvider()
    raise ValueError('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER must be ark or mock')
