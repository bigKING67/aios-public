"""Framework and selling-point structure of a competitor film, in our own preset labels.

The same building blocks as AI 切段 on our originals, run on the staged competitor file before it is
deleted: framework v2 (`pipeline.run`, GPU node, local VLM + Lite review) for the framework segments,
local FunASR for the full timed transcript, then the `text` selling-point input over every framework
segment (scope `film`: a competitor's 实拍 and 街采 state selling points too, unlike our remix, which
splits only 混剪口播). Nothing is written to the segment tables; the result becomes the card's `framework` field.

`build` never raises: a node without `local-v2` yields `unavailable`, any other failure (including a
stopping worker) `failed` with a reason, and the card A result is kept either way.
"""
from concurrent.futures import ThreadPoolExecutor
import os
import re

from psycopg2.extras import RealDictCursor

from ..execution import Cancelled, renderer_env
from ..segment_suggestion_contract import merge_usage, preset_labels
from ..stage_timings import StageTimings
from .. import segment_transcript, selling_point_screen, selling_point_suggestion as points
from . import offline, selling_recovery

FRAMEWORK_PRESET = 'framework'
SELLING_POINT_PRESET = 'selling_point'
MAX_QUOTE_CHARS = 200


class Unavailable(RuntimeError):
    """This node cannot build a structure (no local-v2 provider, GPU or local ASR)."""


def active_preset(conn, preset_key):
    """(version, labels) of the newest active version of one preset."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT version, labels FROM ads.content_segment_presets
          WHERE preset_key=%s AND status='active' ORDER BY version DESC LIMIT 1""", (preset_key,))
        row = cur.fetchone()
    conn.commit()
    if not row:
        raise Unavailable(f'没有启用的 {preset_key} 预设')
    return row['version'], preset_labels(row['labels'])


def provider_from_env():
    from ..segment_suggestion_provider import provider_from_env as configured
    if (os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER') or '').strip() != 'local-v2':
        raise Unavailable('当前节点没有本地框架切段（local-v2）')
    if not segment_transcript.local_configured():
        raise Unavailable('当前节点没有本地口播转写')
    return configured()


def versions(framework_version, selling_point_version):
    """Recorded in the analysis input manifest, so a run with a new structure never reuses an old card."""
    from ..framework_v2 import pipeline
    return {'pipeline': pipeline.PIPELINE_VERSION, 'sellingPointPrompt': points.FILM_TEXT_PROMPT_VERSION,
            'presets': {'framework': framework_version, 'sellingPoint': selling_point_version}}


def _frames(segments, names):
    """Every framework segment in the shape the selling-point prompt and postprocess expect."""
    return [{'segment_id': str(index), 'start_ms': s['start_ms'], 'end_ms': s['end_ms'], 'label_key': s['label_key'],
             'label_name': names.get(s['label_key'], s['label_key'])} for index, s in enumerate(segments)]


def screen_from_shots(shot_rows):
    """On-screen text lines from the framework pipeline's own per-shot OCR (the film scope covers every
    shot), so the GPU does not read the frames a second time; None when the pipeline gave no shots."""
    if not shot_rows:
        return None
    from ..framework_v2 import rules
    rows = [{'start': row['start'], 'end': row['end'], 'ocr': row.get('ocr') or []} for row in shot_rows]
    return selling_point_screen.lines_for(rows, rules._standing_text, rules._is_standing)


def generate(source, proxy, duration_ms, framework, selling_point, provider, work, env, tick, *, timings=None,
             allow_retry=True):
    """(segments, selling_points, transcript, usage, problems) for one film.

    A failed transcript or selling-point call keeps the framework segments (and the script) and is
    recorded in `problems` (transcriptError / sellingPointError); a framework failure raises."""
    from ..framework_v2 import pipeline
    timings = timings or StageTimings()
    framework_keys = [label['key'] for label in framework]
    names = {label['key']: label['name'] for label in framework}
    stage = ['']
    with ThreadPoolExecutor(max_workers=1) as pool:
        asr_work = work / 'asr'
        asr_work.mkdir(exist_ok=True)
        asr = pool.submit(timings.call, 'asr_local', segment_transcript.transcribe_local,
                          source, duration_ms, env, tick, asr_work)
        evidence = {}
        segments, _summary, usage = timings.call('framework_total', pipeline.run, source, proxy, duration_ms,
                                                 framework_keys, provider, work, env, tick, stage,
                                                 evidence_sink=evidence.update, timings=timings)
        problems = {}
        try:
            transcript, _models = asr.result()
        except Cancelled as error:
            error.billed_usage = merge_usage(usage, getattr(error, 'billed_usage', None))
            raise
        except Exception as error:  # noqa: BLE001 - the framework segments stand without a script
            transcript, problems['transcriptError'] = [], f'{type(error).__name__}: {str(error)[:120]}'
    frames = _frames(segments, names)
    found = []
    if frames and transcript:
        try:
            outcome = _selling_points(source, proxy, frames, selling_point, transcript, evidence,
                                      provider, duration_ms, tick, timings, allow_retry=allow_retry)
            found = outcome.points
            usage = merge_usage(usage, outcome.usage)
            problems.update(outcome.metadata)
        except Cancelled as error:
            error.billed_usage = merge_usage(usage, getattr(error, 'billed_usage', None))
            raise
        except Exception as error:  # noqa: BLE001 - the framework segments and script stand without points
            usage = merge_usage(usage, getattr(error, 'usage', None))
            problems['sellingPointError'] = f'{type(error).__name__}: {str(error)[:120]}'
    return segments, found, transcript, usage, problems


def _selling_points(source, proxy, frames, selling_point, transcript, evidence, provider, duration_ms, tick, timings,
                    *, allow_retry=True):
    screen = timings.call('selling_screen_reuse', screen_from_shots, evidence.get('shots'))
    if screen is None:
        screen, _ = timings.call('selling_screen_fallback', selling_point_screen.screen_lines,
                                  source, proxy, frames, duration_ms, tick)
    return selling_recovery.generate(frames, selling_point, transcript, screen, provider, timings, tick,
                                     allow_retry=allow_retry)


def clean_quote(text):
    """The words alone: the model sometimes wraps them as 口播“…” or 字幕：“…”, and the page adds its own quotes."""
    text = re.sub(r'^(口播|字幕|屏幕文字|画面文字)\s*(?:[:：]\s*|(?=[“"「]))', '', (text or '').strip())
    whole = re.fullmatch(r'[“"「]([^“"「”"」]*)[”"」][。！？!?.]*', text)
    if whole:
        text = whole.group(1)
    return text.strip()[:MAX_QUOTE_CHARS]


def shape(segments, found, transcript, usage, framework, selling_point, recorded, problems=None):
    """The card's `framework` field (camelCase, like the rest of the host-added card fields)."""
    return {
        'status': 'ok', **recorded,
        **(problems or {}),
        'labels': {'framework': {label['key']: label['name'] for label in framework},
                   'sellingPoint': {label['key']: label['name'] for label in selling_point}},
        # JSONB reorders object keys; the preset order drives the label tones, as on 片段标注.
        'labelOrder': {'framework': [label['key'] for label in framework],
                       'sellingPoint': [label['key'] for label in selling_point]},
        'segments': [{'startMs': s['start_ms'], 'endMs': s['end_ms'], 'labelKey': s['label_key']} for s in segments],
        'sellingPoints': [{'startMs': p['start_ms'], 'endMs': p['end_ms'], 'labelKeys': p['label_keys'],
                           'segmentIndex': p['segment_index'], 'quote': clean_quote(p['quote'])} for p in found],
        'transcript': [list(row) for row in transcript or []],
        'costYuan': offline.cost(usage)['online_yuan'] if usage else 0.0,
        'usage': usage or {},
    }


def load_presets(conn):
    """((framework version, labels, selling-point version, labels), None), or (None, card field saying why
    not). The caller closes the connection right after: a build must not hold one through GPU work."""
    try:
        framework_version, framework = active_preset(conn, FRAMEWORK_PRESET)
        selling_point_version, selling_point = active_preset(conn, SELLING_POINT_PRESET)
    except Unavailable as error:
        return None, {'status': 'unavailable', 'reason': str(error)}
    except Exception as error:  # noqa: BLE001 - a structure problem never fails card A
        conn.rollback()
        return None, {'status': 'failed', 'reason': f'预设读取失败：{type(error).__name__}'}
    return (framework_version, framework, selling_point_version, selling_point), None


def build(presets, source, duration_sec, work, tick, provider_factory=provider_from_env, *, timings=None,
          allow_retry=True):
    """(card field, recorded versions or None) from `load_presets(conn)`; versions are recorded once a
    provider is ready."""
    timings = timings or StageTimings()
    loaded, problem = presets
    if problem:
        return problem, None
    framework_version, framework, selling_point_version, selling_point = loaded
    try:
        # Before `versions`: framework v2 imports need the GPU node's extra dependencies.
        provider = provider_factory()
        recorded = versions(framework_version, selling_point_version)
    except Unavailable as error:
        return {'status': 'unavailable', 'reason': str(error)}, None
    except Exception as error:  # noqa: BLE001
        return {'status': 'unavailable', 'reason': f'本地框架切段未就绪：{type(error).__name__}'}, None
    from ..segment_suggestion_provider import build_proxy
    try:
        env = renderer_env(work)
        duration_ms = int(duration_sec * 1000)
        proxy = timings.call('structure_proxy', build_proxy, source, work / 'structure-proxy.mp4', env, tick)
        *generated, problems = generate(source, proxy, duration_ms, framework, selling_point, provider, work, env, tick,
                                        timings=timings, allow_retry=allow_retry)
        return shape(*generated, framework, selling_point, recorded, problems), recorded
    except Cancelled as error:
        # The paid card A is still written; a stopping worker only skips the structure.
        usage = getattr(error, 'billed_usage', None)
        return {'status': 'failed', 'reason': 'worker 停止，未生成框架与脚本', **recorded,
                **({'costYuan': offline.cost(usage)['online_yuan'], 'usage': usage} if usage else {})}, recorded
    except Exception as error:  # noqa: BLE001
        usage = getattr(error, 'usage', None) or getattr(error, 'billed_usage', None)
        return {'status': 'failed', 'reason': f'{type(error).__name__}: {str(error)[:160]}', **recorded,
                **({'costYuan': offline.cost(usage)['online_yuan'], 'usage': usage} if usage else {})}, recorded
    finally:
        close = getattr(provider, 'close', None)
        if close:
            close()
