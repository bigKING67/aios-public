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
    """Run media with the shared local budget, preserving execution deadlines."""
    from .local_media_budget import media_slot
    with media_slot(command, tick, timeout) as bounded:
        return _run_media(bounded, env, tick, timeout, stderr, poll_seconds)


def _run_media(command, env, tick, timeout, stderr=subprocess.DEVNULL, poll_seconds=1.0):
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

    def suggest(self, proxy, prompt, schema, duration_ms, *, reasoning_effort=None):
        self.calls.append({'proxy': str(proxy), 'prompt': prompt, 'schema': schema, 'durationMs': duration_ms})
        if self.error:
            raise self.error
        payload = self.payload
        if payload is None:
            properties = schema['properties']['segments']['items']['properties']
            multiple = 'label_keys' in properties
            keys = properties['label_keys']['items']['enum'] if multiple else properties['label_key']['enum']
            count = min(len(keys), 3)
            step = duration_ms / 1000 / count
            payload = {'segments': [{'start_sec': round(i * step, 3), 'end_sec': round((i + 1) * step, 3),
                                     'label_key': keys[i], 'confidence': 0.5, 'reason': '本地模拟结果，非模型判断'}
                                    for i in range(count)]}
            if multiple:
                for segment in payload['segments']:
                    segment['label_keys'] = [segment.pop('label_key')]
                    segment.update(framework_index=0, continues_previous=False, quote='本地模拟引用')
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

    def suggest(self, proxy, prompt, schema, duration_ms, *, reasoning_effort=None):
        data = base64.b64encode(proxy.read_bytes()).decode()
        return self._request([
            {'type': 'input_video', 'video_url': f'data:video/mp4;base64,{data}', 'fps': self.fps},
            {'type': 'input_text', 'text': prompt}], schema, self.thinking, reasoning_effort=reasoning_effort)

    def review(self, prompt, schema, *, proxy=None, boards=(), audio=None, audio_samples=(), thinking='disabled', fps=.2, reasoning_effort=None):
        """Bounded visual/audio audit on the same Lite model; no model fallback."""
        if self.model != 'doubao-seed-2-1-lite-260915':
            raise SuggestionError('invalid_config', '框架视觉核验仅支持 doubao-seed-2.1-lite')
        if audio_samples and (audio is not None or proxy is not None or boards):
            raise ValueError('Independent voice comparison must contain only labelled audio samples')
        content = []
        if proxy is not None:
            content.append({'type': 'input_video', 'video_url': 'data:video/mp4;base64,' +
                            base64.b64encode(proxy.read_bytes()).decode(), 'fps': fps})
        if audio is not None:
            content.append({'type': 'input_audio', 'audio_url': 'data:audio/wav;base64,' +
                            base64.b64encode(audio.read_bytes()).decode()})
        for name, sample in audio_samples:
            content.extend([{'type': 'input_text', 'text': name},
                            {'type': 'input_audio', 'audio_url': 'data:audio/wav;base64,' +
                             base64.b64encode(sample.read_bytes()).decode()}])
        for board in boards:
            content.append({'type': 'input_image', 'image_url': 'data:image/jpeg;base64,' +
                            base64.b64encode(board.read_bytes()).decode(), 'detail': 'high'})
        content.append({'type': 'input_text', 'text': prompt})
        return self._request(content, schema, thinking, temperature=0, reasoning_effort=reasoning_effort)

    def _request(self, content, schema, thinking, *, temperature=.1, reasoning_effort=None):
        from marketing_content_assets.ark_responses import extract_output_text
        request = {
            'model': self.model,
            'input': [{'role': 'user', 'content': content}],
            'max_output_tokens': 8192, 'thinking': {'type': thinking}, 'temperature': temperature, 'store': False,
            'text': {'format': {'type': 'json_schema', 'name': 'content_segment_suggestions', 'strict': True, 'schema': schema}},
        }
        if reasoning_effort is not None:
            if reasoning_effort not in ('minimal', 'low', 'medium', 'high') or (
                    thinking == 'disabled' and reasoning_effort != 'minimal'):
                raise ValueError('Invalid reasoning effort for the requested thinking mode')
            request['reasoning'] = {'effort': reasoning_effort}
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

    def decide(self, questions, *, proxy, fps=2, context=None):
        """One beta decision call on the ordinary Ark account; never retried."""
        if (self.model != 'doubao-seed-2-1-lite-260915'
                or self.config.base_url != 'https://ark.cn-beijing.volces.com/api/v3/responses'):
            raise SuggestionError('invalid_config', '组合核验仅支持普通方舟 API 的 doubao-seed-2.1-lite')
        if proxy.stat().st_size > max_proxy_bytes() or not .2 <= fps <= 5:
            raise ValueError('Invalid decision media size or fps')
        body = dict(model=self.model, questions=questions, state=[dict(type='video', fps=fps,
            video_url='data:video/mp4;base64,' + base64.b64encode(proxy.read_bytes()).decode())])
        if context is not None:
            body['state'].append(dict(type='text', text=context))
        usage = {}
        try:
            response = self.client.session.post('https://ark.cn-beijing.volces.com/api/v1/systemone',
                headers={'Authorization': 'Bearer ' + self.config.api_key, 'Content-Type': 'application/json',
                         'ark-beta-systemone-api': 'true'},
                data=json.dumps(body, ensure_ascii=False).encode('utf-8'), timeout=self.config.timeout_seconds)
            payload = response.json()
            if isinstance(payload, dict) and isinstance(payload.get('usage'), dict):
                usage = dict(payload['usage'])
                # System One currently reports input/output but omits total.
                # Preserve billable usage through the shared Worker accumulator.
                if 'total_tokens' not in usage and all(type(usage.get(k)) is int and usage[k] >= 0
                        for k in ('input_tokens', 'output_tokens')):
                    usage['total_tokens'] = usage['input_tokens'] + usage['output_tokens']
            if response.status_code >= 400:
                raise SuggestionError('provider_error', f'组合核验调用失败（HTTP {response.status_code}）', usage)
        except SuggestionError:
            raise
        except Exception as error:
            raise SuggestionError('provider_error',
                f'组合核验调用失败（{provider_error_kind(error)}）；调用可能已计费，请检查后手动重新发起', usage) from error
        if not isinstance(payload, dict) or payload.get('model') != self.model or not isinstance(payload.get('answers'), dict):
            raise SuggestionError('invalid_response', '组合核验返回结构或模型不符', usage)
        return ProviderResult(payload['answers'], usage, str(payload.get('id') or '')[:200])

    def close(self):
        self.client.session.close()


def provider_error_kind(error):
    """Error class plus HTTP status when present; never the message, which may echo the request."""
    match = re.search(r'HTTP (\d{3})', str(error))
    return type(error).__name__ + (f' HTTP {match.group(1)}' if match else '')


class LocalV2SegmentProvider(ArkSegmentProvider):
    """Framework v2 on a GPU node: local VLM shot facts + rules, bounded Lite review via `review()`.

    Only framework presets use the v2 pipeline; selling-point presets keep the Ark path. The Lite
    review is billable, so the same live flag and Seed 2.1 Lite model are required.
    """

    name = 'local-v2'

    def __init__(self, config=None):
        super().__init__(config)
        if self.model != 'doubao-seed-2-1-lite-260915':
            raise ValueError('local-v2 review requires doubao-seed-2-1-lite-260915')
        self.vlm_model = (os.getenv('FRAMEWORK_V2_VLM_MODEL') or 'qwen3.5-4b').strip()
        # Node prerequisites are checked before claiming, so a misconfigured node leaves jobs queued.
        from .framework_v2 import local_vlm, mouth, persons
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError('local-v2 requires a CUDA GPU for OCR')
        persons._models()
        mouth.check()
        local_vlm.LocalVlm()

    def request_settings(self):
        return {**super().request_settings(), 'pipeline': 'framework-v2', 'localVlmModel': self.vlm_model}


def provider_from_env():
    """`ark` (default) needs the explicit live flag; `mock` writes clearly labelled fake suggestions;
    `local-v2` runs the framework v2 pipeline on a GPU node."""
    choice = (os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER') or 'ark').strip()
    if choice == 'mock':
        return MockSegmentProvider()
    if choice == 'ark':
        return ArkSegmentProvider()
    if choice == 'local-v2':
        return LocalV2SegmentProvider()
    raise ValueError('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER must be ark, mock or local-v2')
