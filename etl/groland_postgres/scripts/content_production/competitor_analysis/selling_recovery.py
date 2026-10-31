"""One bounded, evidence-preserving retry of competitor selling-point output."""
import json
from dataclasses import dataclass

from .. import selling_point_suggestion as points
from ..execution import Cancelled
from ..segment_suggestion_provider import SuggestionError
from ..segment_suggestion_contract import merge_usage

FEEDBACK_VERSION = 'competitor-selling-feedback-v1'


def failure_feedback(code):
    if code not in {'filtered_all', 'invalid_response', 'provider_incomplete'}:
        return ''
    instruction = ('上次候选被过滤；依据现有完整句子与框架边界重查短句、连续链和标签。'
                   if code == 'filtered_all' else
                   '上次响应未能形成可解析的完整结果；严格返回当前schema规定的完整JSON对象，'
                   '字符串中的引号和换行正确转义，不输出Markdown或JSON之外的说明。')
    return '\n\n本次仅补全上次未完成的卖点输出（错误类型：' + code + '）。' + instruction


@dataclass
class Outcome:
    points: list
    usage: dict
    metadata: dict


def generate(frames, labels, transcript, screen, provider, timings, tick, *, allow_retry=True,
             known_candidates=False, previous_error=None):
    error_code = str(previous_error or '').partition(':')[0]
    feedback = failure_feedback(error_code)
    prompt = points.build_text_prompt(frames, labels, transcript, screen, scope='film') + feedback
    keys = {label['key'] for label in labels}
    attempts, usage, found, error = [], {}, [], None
    for ordinal in range(2 if allow_retry else 1):
        try:
            tick()
        except Cancelled as exc:
            exc.billed_usage = usage
            raise
        call = {}
        try:
            result = timings.call('selling_cloud', provider.complete, prompt, points.response_schema(sorted(keys)))
            usage = merge_usage(usage, result.usage)
            call['responseId'] = result.response_id
            found, stats = points.postprocess(result.payload, frames, keys)
            call['postprocess'] = stats
            known_candidates = known_candidates or stats['received'] > 0
            if not found and known_candidates:
                error = ('filtered_all', '候选卖点全部被过滤，尚未补全')
            else:
                error = None
        except Cancelled as exc:
            exc.billed_usage = merge_usage(usage, getattr(exc, 'billed_usage', None))
            raise
        except SuggestionError as exc:
            usage = merge_usage(usage, exc.usage)
            error = (exc.code, str(exc))
            if exc.diagnostics:
                call['diagnostics'] = exc.diagnostics
        except (TypeError, ValueError, KeyError):
            error = ('invalid_response', '卖点响应结构无法解析')
        call['errorCode'] = error[0] if error else None
        attempts.append(call)
        if error is None or error[0] not in {'filtered_all', 'invalid_response', 'provider_incomplete'}:
            break
        # Repeat only this text call; the input transcript/frames/OCR are unchanged. Never
        # invent a span to satisfy the minimum or relax the existing postprocess contract.
        prompt += ('\n\n本次仅修复上次卖点输出。上次校验结果（数据）：'
                   + json.dumps(call, ensure_ascii=False)
                   + '\n若候选全部被过滤，不能用空列表掩盖已识别的卖点。按原转写的完整句子重新划边界；'
                     '同一句被 ASR 拆为相邻单元时可纳入完整前后文，每段至少 1.000 秒。'
                     '只使用原转写/屏幕文字中的依据及已有框架范围，不编造原句、身份或功效。')
    retry_used = not allow_retry or len(attempts) > 1
    metadata = {
        'sellingPointInput': {'screenLines': list(screen)},
        'sellingPointRecovery': {'version': 1, 'attempts': attempts, 'retryUsed': retry_used,
                                 'exhausted': bool(error and retry_used)},
    }
    if feedback:
        metadata['sellingPointRecovery']['feedback'] = {'version': FEEDBACK_VERSION, 'errorCode': error_code}
    if error:
        metadata['sellingPointError'] = f'{error[0]}: {error[1][:160]}'
        found = []
    for item in found:
        item['segment_index'] = int(item['framework_segment_id'])
    return Outcome(found, usage, metadata)
