"""Independent AI 切段打标 worker: explicit jobs only, no automatic retries.

Enable with CONTENT_AI_STUDIO_ENABLED=true and
CONTENT_AI_STUDIO_SEGMENT_SUGGEST_ENABLED=true. The default `ark` provider
additionally requires CONTENT_AI_STUDIO_SEGMENT_SUGGEST_LIVE=1 and is checked
before any job is claimed, so a misconfigured worker leaves jobs queued. A
long-running worker that is disabled or has no usable provider logs one warning
per distinct reason and idles (no claim, no job writes) instead of crashing into
a restart loop; `--once` exits non-zero with the reason instead.

Prompt version: CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROMPT_VERSION (default
segment-suggest-v4; v1-v3 stay selectable for A/B). v2-v4 embed local
shot-cut statistics from the proxy (see segment_shot_hints); v1 never runs the
detector so its prompt stays identical to earlier evaluations.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sys
import tempfile
import threading
import time

import psycopg2
import psycopg2.errors

from marketing_content_assets.repository import connect_pg
from .execution import Cancelled, file_hash, renderer_env
from .segment_suggestion_contract import (
    DEFAULT_MIN_SEGMENT_MS, DEFAULT_PROMPT_VERSION, PROMPT_V1, PROMPT_V5, build_prompt, degenerate_label, job_labels, label_absorb_targets, label_bridges, label_minimums,
    merge_usage, postprocess, preset_labels, prompt_version_from_env, snap_boundaries, snap_points,
    response_schema, PROMPT_V13, PROMPT_V15, PROMPT_V16, PROMPT_V17, finalize_framework_segments,
)
from . import segment_covers, segment_shot_hints, segment_transcript, selling_point_suggestion, selling_point_boundaries, framework_shot_verifier
from .segment_suggestion_provider import (
    SuggestionError, build_proxy, call_with_ticks, max_proxy_bytes, provider_from_env,
)
from .segment_suggestion_queue import claim, confirmed_frames, fail, heartbeat, load_source, publish, record_request
from .shot_catalog import probe
from .worker import download

LOCAL_SOURCE_ENV = 'CONTENT_AI_STUDIO_SEGMENT_LOCAL_SOURCE_DIR'
COVERS_ENV = 'CONTENT_AI_STUDIO_SEGMENT_COVERS'
IDLE_POLL_SECONDS = 5
UNAVAILABLE_EXIT_CODE = 2


class WorkerUnavailable(RuntimeError):
    """Configuration prevents claiming jobs; queued jobs are left untouched."""


class TosSource:
    """Production source: signed TOS GET of the raw object, hash-verified."""

    def __init__(self):
        from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
        self.storage = TosStorageClient(TosStorageConfig.from_env())

    def fetch(self, source, expected_sha256, destination, tick):
        if source['bucket'] != self.storage.config.bucket:
            raise SuggestionError('source_unavailable', '原片不在当前存储桶')
        download(self.storage, source['objectKey'], destination, expected_sha256, tick)


class LocalSource:
    """Local-only fixture source: `<root>/<raw_object_key>`, never outside root, hash-verified."""

    def __init__(self, root):
        self.root = Path(root).resolve()

    def fetch(self, source, expected_sha256, destination, tick):
        key = Path(source['objectKey'])
        candidate = self.root / key
        # Relative keys only; the resolved file must stay under root and the leaf must not be a symlink.
        path = candidate.resolve()
        if (key.is_absolute() or '..' in key.parts or candidate.is_symlink()
                or self.root not in path.parents or not path.is_file()):
            raise SuggestionError('source_unavailable', '本地原片不存在')
        tick()
        shutil.copyfile(path, destination)
        if file_hash(destination) != expected_sha256:
            raise SuggestionError('source_changed', '原片摘要不匹配')


def source_from_env():
    root = os.getenv(LOCAL_SOURCE_ENV)
    return LocalSource(root) if root else TosSource()


def ensure_enabled():
    if os.getenv('CONTENT_AI_STUDIO_ENABLED') != 'true' or os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_ENABLED') != 'true':
        raise WorkerUnavailable('AI segment suggestion worker is disabled '
                                '(CONTENT_AI_STUDIO_ENABLED/CONTENT_AI_STUDIO_SEGMENT_SUGGEST_ENABLED must be true)')


def _configured(factory, what):
    """Builds a provider/source; configuration errors become WorkerUnavailable (message only, no values)."""
    try:
        return factory()
    except (RuntimeError, ValueError) as error:
        raise WorkerUnavailable(f'{what} unavailable: {type(error).__name__}: {str(error)[:200]}') from error


def min_segment_ms():
    raw = (os.getenv('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_MIN_MS') or '').strip()
    value = int(raw) if raw else DEFAULT_MIN_SEGMENT_MS
    if not 0 <= value <= 60000:
        raise ValueError('CONTENT_AI_STUDIO_SEGMENT_SUGGEST_MIN_MS must be 0–60000')
    return value


def suggest_config():
    """Validated before claiming, so a bad setting leaves jobs queued instead of failing them."""
    version = prompt_version_from_env()
    shots = segment_shot_hints.settings_from_env()
    # v1 is the frozen A/B baseline: it never runs the detector, embeds statistics or snaps boundaries.
    return {'minMs': min_segment_ms(), 'promptVersion': version,
            'snap': segment_shot_hints.snap_enabled_from_env() and version != PROMPT_V1,
            'shots': {**shots, 'enabled': False} if version == PROMPT_V1 else shots}


HEARTBEAT_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_HEARTBEAT_SECONDS'
DIMENSIONS_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_DIMENSIONS'
FALLBACK_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_FALLBACK_AFTER_SECONDS'
CONCURRENCY_ENV = 'CONTENT_AI_STUDIO_SEGMENT_SUGGEST_CONCURRENCY'
PRESET_DIMENSIONS = {'framework', 'picture', 'custom', 'selling_point'}
MAX_CONCURRENCY = 8
STOPPING = threading.Event()


def heartbeat_seconds():
    """Minimum interval between heartbeats; a remote node over a relay uses ~15s. Must stay well
    inside the 2-minute lease."""
    value = float(os.getenv(HEARTBEAT_ENV) or 1)
    if not 1 <= value <= 60:
        raise ValueError(f'{HEARTBEAT_ENV} must be between 1 and 60 seconds')
    return value


def concurrency():
    """Jobs one worker process runs at once (default 1). Extra jobs run on threads that share the
    process, so a GPU node keeps one CUDA context while one job decodes or waits on a model call."""
    raw = (os.getenv(CONCURRENCY_ENV) or '1').strip()
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_CONCURRENCY:
        raise ValueError(f'{CONCURRENCY_ENV} must be an integer between 1 and {MAX_CONCURRENCY}')
    return int(raw)


def claim_filter_from_env():
    """Unset means claim every job (current behaviour)."""
    raw = (os.getenv(DIMENSIONS_ENV) or '').strip()
    dimensions = [item.strip() for item in raw.split(',') if item.strip()]
    if not set(dimensions) <= PRESET_DIMENSIONS:
        raise ValueError(f'{DIMENSIONS_ENV} must list preset dimensions: {", ".join(sorted(PRESET_DIMENSIONS))}')
    fallback = (os.getenv(FALLBACK_ENV) or '').strip()
    if fallback and not dimensions:
        raise ValueError(f'{FALLBACK_ENV} needs {DIMENSIONS_ENV}')
    if fallback and (not fallback.isdigit() or int(fallback) < 0):
        raise ValueError(f'{FALLBACK_ENV} must be a non-negative integer')
    return {'dimensions': dimensions or None, 'fallback_after_seconds': int(fallback) if fallback else None}


def _shot_hint(proxy, duration_ms, shots, env, tick, work):
    hint, summary = segment_shot_hints.detect(proxy, duration_ms, shots, env, tick, work / 'scene-detect.log')
    if summary.get('warning'):
        # Advisory input only: continue with a prompt that says no statistics are available.
        print(json.dumps({'status': 'warning', 'warning': summary['warning'], 'errorType': summary.get('errorType')}),
              file=sys.stderr, flush=True)
    return hint, summary


def _snap(segments, local, min_ms, env, tick, work, *, prefer_nearest=False):
    """Frame-accurate boundary calibration on the original; a failed boundary keeps its position."""
    cuts, failed, gap_repairs = {}, 0, []
    for index, boundary in snap_points(segments):
        try:
            cuts[boundary] = segment_shot_hints.refine_cuts(local, boundary, env, tick, work / 'refine.log',
                **({'after_ms':800} if prefer_nearest else {}))
            offer_transition = (segments[index]['label_key']=='street_interview'
                                and segments[index+1]['label_key']=='promotion')
            if (prefer_nearest and not cuts[boundary]
                    and (segments[index]['end_ms'] < segments[index+1]['start_ms'] or offer_transition)):
                # Flash/dissolve transitions can fall below the hard-cut
                # threshold. Repair a real coverage gap from their observed
                # onset, never by silently assigning the unobserved interval.
                from .framework_boundary_reconcile import transition_onset
                observed = segment_shot_hints.refine_cuts(local, boundary, env, tick,
                    work/'refine-gap.log', after_ms=800, threshold=.02)
                onset = transition_onset(observed)
                if onset is not None:
                    cuts[boundary] = [onset]
                    gap_repairs.append(dict(boundary_ms=boundary, observed_onset_ms=onset[0],
                                            reason='offer_transition' if offer_transition else 'coverage_gap'))
        except (ValueError, OSError):
            failed += 1
    snapped, shifts = snap_boundaries(segments, cuts, min_ms, prefer_nearest=prefer_nearest)
    return snapped, {'enabled': True, 'boundaries': len(cuts) + failed, 'snapped': len(shifts),
                     'failed': failed, 'shiftsMs': shifts, 'gapRepairs': gap_repairs}


def suggest(conn, job, provider, fetcher, work, **options):
    """Runs one job; any failure after a model call carries the usage already billed."""
    billed = {}
    try:
        return _suggest(conn, job, provider, fetcher, work, billed=billed, **options)
    except SuggestionError as error:
        if error.usage is None:
            error.usage = billed.get('usage')
        raise
    except Exception as error:
        error.billed_usage = billed.get('usage')
        raise


def _suggest(conn, job, provider, fetcher, work, *, billed, min_ms, proxy_limit, deadline_seconds=900,
             prompt_version=None, shots=None, snap=False):
    prompt_version = prompt_version or DEFAULT_PROMPT_VERSION
    shots = shots or {'enabled': False, 'threshold': segment_shot_hints.DEFAULT_THRESHOLD,
                      'windowSeconds': segment_shot_hints.DEFAULT_WINDOW_SECONDS}
    if prompt_version == PROMPT_V1:
        shots, snap = {**shots, 'enabled': False}, False
    stage = ['下载原片']
    last_beat = [0.0]

    def tick():
        if STOPPING.is_set():
            raise Cancelled('worker stopping')
        if time.monotonic() - last_beat[0] >= heartbeat_seconds():
            heartbeat(conn, job, stage[0])
            last_beat[0] = time.monotonic()
    source = load_source(conn, job)
    try:
        # Prompt, schema enum and post-processing all use only this job's candidate labels.
        labels = job_labels(preset_labels(source['labels']), job.get('request_settings'))
    except ValueError as error:
        raise SuggestionError('invalid_request', '候选标签与分类预设不一致，请重新发起切段') from error
    label_keys = [label['key'] for label in labels]
    if prompt_version in (PROMPT_V15, PROMPT_V16, PROMPT_V17) and source.get('presetDimension') != selling_point_suggestion.DIMENSION:
        try:
            framework_shot_verifier.validate_provider(provider)
        except ValueError as error:
            raise SuggestionError('invalid_config', str(error)) from error
    local = work / 'source.mp4'
    fetcher.fetch(source, job['source_content_hash'], local, tick)
    env = renderer_env(work)
    try:
        probed_ms = probe(local, 'ffprobe', env=env)['durationMs']
    except ValueError as error:
        raise SuggestionError('source_unreadable', '原片无法解析') from error
    duration_ms = min(probed_ms, source['durationMs']) if source['durationMs'] else probed_ms
    stage[0] = '生成代理视频'
    proxy = build_proxy(local, work / 'proxy.mp4', env, tick)
    proxy_bytes = proxy.stat().st_size
    if proxy_bytes > proxy_limit:
        raise SuggestionError('proxy_too_large', '原片过长，代理视频超过模型输入上限')
    points = source.get('presetDimension') == selling_point_suggestion.DIMENSION
    if provider.name == 'local-v2' and not points:
        return _suggest_v2(conn, job, provider, fetcher, source, local, proxy, duration_ms, label_keys, env, work,
                           tick, stage, billed)
    transcript, transcript_settings, transcript_summary = None, None, None
    if points:
        # Selling points use a separate conservative check after model postprocessing.
        frames = confirmed_frames(conn, job)
        if not frames:
            raise SuggestionError('framework_required', '请先确认这条原片的框架段，再生成卖点建议')
        voiceover = selling_point_suggestion.voiceover_frames(frames)
        if not voiceover:
            raise SuggestionError('voiceover_required', '这条原片没有已确认的混剪口播段；卖点只在混剪口播中拆解')
        prompt_version, shots, snap = selling_point_suggestion.PROMPT_VERSION, {**shots, 'enabled': False}, False
        hint, shot_summary = None, {'status': 'skipped'}
        transcript, transcript_settings, transcript_summary = segment_transcript.resolve_cached(
            conn, job['asset_id'], job['source_content_hash'])
        prompt = selling_point_suggestion.build_prompt(voiceover, labels, transcript)
        schema = selling_point_suggestion.response_schema(label_keys)
    else:
        stage[0] = '镜头切点统计'
        hint, shot_summary = _shot_hint(proxy, duration_ms, shots, env, tick, work)
        if prompt_version == PROMPT_V5:
            stage[0] = '口播转写'
            transcript, transcript_settings, transcript_summary = segment_transcript.resolve(
                conn, job['asset_id'], job['source_content_hash'], local, duration_ms, env, tick, work)
        prompt = build_prompt(source['presetName'], labels, prompt_version, hint,
                              **({'transcript': transcript} if prompt_version == PROMPT_V5 else {}))
        schema = response_schema(labels, prompt_version)
    settings = {**provider.request_settings(), 'labelKeys': label_keys, 'minSegmentMs': min_ms, 'proxyBytes': proxy_bytes,
                'proxySha256': file_hash(proxy), 'durationMs': duration_ms, 'promptVersion': prompt_version,
                'promptSha256': hashlib.sha256(prompt.encode()).hexdigest(),
                'shotDetection': {'enabled': shots['enabled'], 'threshold': shots['threshold'],
                                  'windowSeconds': shots['windowSeconds'], 'hintIncluded': hint is not None}}
    suggestion_options = {'reasoning_effort': 'medium'} if prompt_version in (PROMPT_V16, PROMPT_V17) else {}
    if suggestion_options:
        settings['reasoningEffort'] = 'medium'
    if transcript_settings:
        settings['transcript'] = transcript_settings
    if points:
        settings['sellingPointBoundaries'] = {'policy': selling_point_boundaries.POLICY, 'speechMode': 'cache_only',
                                            'maxMoveMs': selling_point_boundaries.MAX_MOVE_MS}
    load_source(conn, job)
    record_request(conn, job, provider.model, prompt_version, settings)
    stage[0] = '等待模型结果'
    initial_completion_repair = False
    try:
        result = call_with_ticks(lambda: provider.suggest(proxy, prompt, schema, duration_ms, **suggestion_options), tick, deadline_seconds)
    except SuggestionError as first_error:
        if (prompt_version != PROMPT_V17 or first_error.code != 'provider_incomplete'
                or provider.model != 'doubao-seed-2-1-lite-260915'
                or getattr(provider, 'thinking', None) != 'enabled'):
            raise
        # One bounded completion repair after reasoning exhausted the output
        # budget. Same model and evidence; never retry transport/account errors.
        billed['usage'] = first_error.usage
        try:
            result = call_with_ticks(lambda: provider.review(prompt, schema, proxy=proxy,
                fps=provider.fps, thinking='disabled'), tick, deadline_seconds)
        except SuggestionError as second_error:
            second_error.usage = merge_usage(first_error.usage, second_error.usage)
            raise
        from dataclasses import replace
        result = replace(result, usage=merge_usage(first_error.usage, result.usage))
        initial_completion_repair = True
    usage, retry = result.usage, None
    if initial_completion_repair:
        settings['initialCompletionRepair'] = 'same_lite_thinking_disabled'
    billed['usage'] = usage
    collapsed = None if points else degenerate_label(result.payload, label_keys, duration_ms)
    if collapsed:
        # One automatic retry; the second answer is used either way and both calls are billed.
        stage[0] = '模型结果单一，重新分析'
        heartbeat(conn, job, stage[0])
        first_response = result.response_id
        try:
            result = call_with_ticks(lambda: provider.suggest(proxy, prompt, schema, duration_ms, **suggestion_options), tick, deadline_seconds)
        except SuggestionError as error:
            error.usage = merge_usage(usage, error.usage)
            raise
        usage = merge_usage(usage, result.usage)
        billed['usage'] = usage
        retry = {'label': collapsed, 'firstResponseId': first_response,
                 'stillDegenerate': degenerate_label(result.payload, label_keys, duration_ms) is not None}
    payload, verification = result.payload, None
    if prompt_version in (PROMPT_V15, PROMPT_V16, PROMPT_V17):
        stage[0] = '核对人物与素材连续性'

        def account_usage(additional):
            nonlocal usage
            usage = merge_usage(usage, additional)
            billed['usage'] = usage
            return usage

        try:
            payload, verification = framework_shot_verifier.verify(
                payload, local, proxy, duration_ms, set(label_keys), work / 'framework-audit',
                env, tick, provider, deadline_seconds, account_usage,
                **({'continuity': True, **({'editorial': True} if prompt_version == PROMPT_V17 else {})}
                   if prompt_version in (PROMPT_V16, PROMPT_V17) else {}))
        except ValueError as error:
            raise SuggestionError('invalid_response', '画面复核证据不完整，未写入建议', usage) from error
    stage[0] = '写入建议片段'
    heartbeat(conn, job, stage[0])
    try:
        if points:
            segments, stats = selling_point_suggestion.postprocess(result.payload, voiceover, set(label_keys))
            stats['frameworkSegments'], stats['voiceoverSegments'] = len(frames), len(voiceover)
            # The boundary check reviews every framework edge; index into the full list.
            position = {frame['segment_id']: index for index, frame in enumerate(frames)}
            for segment in segments:
                segment['framework_index'] = position[segment['framework_segment_id']]
        else:
            segments, stats = postprocess(payload, duration_ms, set(label_keys), min_ms, label_minimums(labels),
                                          label_absorb_targets(labels), label_bridges(labels), version=prompt_version)
    except ValueError as error:
        raise SuggestionError('invalid_response', '模型返回结构无效', usage) from error
    snap_summary = {'enabled': False}
    if points:
        stage[0] = '核对卖点口播与镜头边界'
        heartbeat(conn, job, stage[0])
        segments, stats['sellingPointBoundaries'] = selling_point_boundaries.calibrate(
            segments, frames, transcript, local, duration_ms, env, tick, work)
        stage[0] = '写入建议片段'
    if snap and len(segments) > 1:
        stage[0] = '校准切点'
        heartbeat(conn, job, stage[0])
        segments, snap_summary = _snap(segments, local, min_ms, env, tick, work, prefer_nearest=prompt_version==PROMPT_V17)
        stage[0] = '写入建议片段'
    if prompt_version in (PROMPT_V13, PROMPT_V15):
        segments, corrections = finalize_framework_segments(segments)
        stats['postSnapDurationCorrections'] = corrections
        stats['kept'] = len(segments)
    if prompt_version in (PROMPT_V16, PROMPT_V17):
        from .framework_window_audit import finalize
        segments, corrections = finalize(segments, verification)
        stats['postSnapDurationCorrections'] = corrections
        if prompt_version == PROMPT_V17:
            from .framework_boundary_reconcile import reconcile, close_terminal_frame
            segments, stats['frameworkBoundaryReconcile'] = reconcile(segments, verification.get('windows', []))
            segments, terminal = close_terminal_frame(segments, duration_ms, local, env, tick)
            if terminal:
                stats['frameworkBoundaryReconcile']['corrections'].append(terminal)
            # Editorial attachment must not hide source boundaries from the
            # snapping/reconciliation stages. It changes labels only.
            from .framework_isolated_attachment import verify_final
            try:
                segments = verify_final(segments, proxy, work/'framework-audit'/'isolated-attachment',
                    tick, provider, deadline_seconds, account_usage, verification)
            except ValueError as error:
                raise SuggestionError('invalid_response', '短推荐归属证据不完整，未写入建议', usage) from error
        stats['kept'] = len(segments)
    summary = {'promptVersion': prompt_version, 'provider': provider.name, 'responseId': result.response_id,
               'labelKeys': label_keys, 'shotDetection': shot_summary, 'boundarySnap': snap_summary, **stats}
    if retry:
        summary['degenerateRetry'] = retry
    if verification is not None:
        summary['frameworkVerification'] = verification
    if transcript_summary:
        summary['transcript'] = transcript_summary
    return _publish(conn, job, source, segments, provider.model, provider.name, summary, usage, fetcher, local, work, env)


def _publish(conn, job, source, segments, model, provider_name, summary, usage, fetcher, local, work, env):
    inserted = []
    for attempt in range(2):
        try:
            published = publish(conn, job, source, segments, model=model, provider=provider_name,
                                summary=summary, usage=usage, inserted=inserted)
            break
        except psycopg2.errors.DeadlockDetected:
            # A concurrent studio confirm/edit on the same asset; publish rolled back
            # and wrote nothing, so one retry cannot double-insert or re-bill.
            if attempt:
                raise
            inserted.clear()
    storage = getattr(fetcher, 'storage', None)
    if published and inserted and storage is not None and os.getenv(COVERS_ENV, '1') != '0':
        # Covers from the already downloaded original; the idle sweep retries anything missed.
        try:
            segment_covers.cover_from_file(conn, storage, local, inserted, work, env=env)
        except Exception:  # noqa: BLE001 - the job already succeeded
            conn.rollback()
    return published


def _suggest_v2(conn, job, provider, fetcher, source, local, proxy, duration_ms, label_keys, env, work, tick, stage, billed):
    """Framework v2 on a GPU node: rules over local VLM facts, bounded Lite review, same publish contract."""
    from .framework_v2 import pipeline
    model = f'{provider.vlm_model}+{provider.model}'
    settings = {**provider.request_settings(), 'labelKeys': label_keys, 'durationMs': duration_ms,
                'proxySha256': file_hash(proxy), 'promptVersion': pipeline.PIPELINE_VERSION}
    # ASR supplies later selling-point jobs, not this visual pipeline's inputs.
    # Record the visual request before any billable call; attach ASR before publish.
    with segment_transcript.local_in_background(conn, job['asset_id'], job['source_content_hash'], local,
                                                duration_ms, env, tick, work) as transcript:
        record_request(conn, job, model, pipeline.PIPELINE_VERSION, settings)
        segments, summary, usage = pipeline.run(local, proxy, duration_ms, label_keys, provider, work, env, tick, stage)
        billed['usage'] = usage
        if segment_transcript.local_configured():
            stage[0] = '等待口播转写'
        transcript_settings, transcript_summary = transcript()
        if transcript_settings:
            settings = {**settings, 'transcript': transcript_settings}
            record_request(conn, job, model, pipeline.PIPELINE_VERSION, settings)
    summary = {**summary, 'provider': provider.name, 'labelKeys': label_keys,
               **({'transcript': transcript_summary} if transcript_summary else {})}
    load_source(conn, job)
    return _publish(conn, job, source, segments, model, provider.name, summary, usage, fetcher, local, work, env)



def cover_storage():
    """TOS client for segment covers; None when disabled or on a local fixture source."""
    if os.getenv(COVERS_ENV, '1') == '0' or os.getenv(LOCAL_SOURCE_ENV):
        return None
    from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
    return TosStorageClient(TosStorageConfig.from_env())


def sweep_covers(root, storage):
    """Idle-time segment covers; never raises into the job loop."""
    try:
        with connect_pg() as conn, tempfile.TemporaryDirectory(prefix='segment-cover-', dir=root) as folder:
            return segment_covers.sweep(conn, storage, Path(folder), env=renderer_env(Path(folder)))
    except Exception as error:  # noqa: BLE001 - covers are best effort
        return {'covered': 0, 'failed': 0, 'error': type(error).__name__}


def process_one(root, provider_factory=provider_from_env, source_factory=source_from_env):
    ensure_enabled()
    # Constructed before claiming: a missing live flag or config leaves jobs queued.
    provider = _configured(provider_factory, 'segment suggestion provider')
    try:
        config = _configured(suggest_config, 'segment suggestion settings')
        if config['promptVersion'] in (PROMPT_V15, PROMPT_V16, PROMPT_V17):
            _configured(lambda: framework_shot_verifier.validate_provider(provider), 'framework verification provider')
        fetcher = _configured(source_factory, 'segment suggestion source')
        claim_filter = _configured(claim_filter_from_env, 'segment suggestion claim filter')
        _configured(heartbeat_seconds, 'segment suggestion heartbeat')
        with connect_pg() as conn:
            job = claim(conn, **claim_filter)
            if not job:
                return {'status': 'idle'}
            outcome = {'jobId': str(job['job_id'])}
            try:
                with tempfile.TemporaryDirectory(prefix='segment-suggest-', dir=root) as folder:
                    published = suggest(conn, job, provider, fetcher, Path(folder), min_ms=config['minMs'],
                                        proxy_limit=max_proxy_bytes(), prompt_version=config['promptVersion'],
                                        shots=config['shots'], snap=config['snap'])
                return {**outcome, 'status': 'succeeded' if published else 'cancelled'}
            except Cancelled:
                conn.rollback()
                return {**outcome, 'status': 'cancelled'}
            except SuggestionError as error:
                conn.rollback()
                fail(conn, job, error.code, str(error), error.usage)
                return {**outcome, 'status': 'failed', 'errorCode': error.code}
            except Exception as error:
                conn.rollback()
                fail(conn, job, 'internal_error', '切段任务执行失败，请检查 worker 环境后手动重新发起',
                     getattr(error, 'billed_usage', None))
                return {**outcome, 'status': 'failed', 'errorCode': 'internal_error', 'errorType': type(error).__name__}
    finally:
        close = getattr(provider, 'close', None)
        if close:
            close()


def _job_slot(root):
    """An extra job slot: jobs only. The main loop reports configuration and database state and runs
    the cover sweep; a slot backs off quietly on the same conditions and never exits on a job error."""
    while not STOPPING.is_set():
        try:
            result = process_one(root)
        except (psycopg2.OperationalError, WorkerUnavailable):
            STOPPING.wait(IDLE_POLL_SECONDS)
            continue
        except Exception as error:
            print(json.dumps({'status': 'slot_error', 'errorType': type(error).__name__}), file=sys.stderr, flush=True)
            STOPPING.wait(IDLE_POLL_SECONDS)
            continue
        if result['status'] != 'idle':
            print(json.dumps(result), flush=True)
        STOPPING.wait(IDLE_POLL_SECONDS if result['status'] == 'idle' else 0.1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    root_env = os.environ.get('CONTENT_PRODUCTION_WORK_DIR')
    if not root_env:
        raise RuntimeError('CONTENT_PRODUCTION_WORK_DIR is required')
    root = Path(root_env).resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        slots = 1 if args.once else concurrency()
    except ValueError as error:
        print(f'segment suggestion worker not started: {error}', file=sys.stderr, flush=True)
        raise SystemExit(UNAVAILABLE_EXIT_CODE) from None
    STOPPING.clear()
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
        STOPPING.set()
        raise Cancelled('worker stopping')
    signal.signal(signal.SIGTERM, stop)
    threads = [threading.Thread(target=_job_slot, args=(root,), name=f'segment-slot-{k}', daemon=True)
               for k in range(1, slots)]
    for thread in threads:
        thread.start()
    unavailable = None
    try:
        covers = cover_storage()
    except (RuntimeError, ValueError) as error:
        covers = None
        print(json.dumps({'status': 'covers_unavailable', 'warning': type(error).__name__}), file=sys.stderr, flush=True)
    try:
        while not stopping:
            try:
                result = process_one(root)
            except psycopg2.OperationalError as error:
                # Database unreachable: back off instead of exiting into a restart loop;
                # a claimed job (if any) fails by lease expiry, never by a second model call.
                if args.once:
                    raise
                print(json.dumps({'status': 'database_unavailable', 'warning': type(error).__name__}),
                      file=sys.stderr, flush=True)
                time.sleep(IDLE_POLL_SECONDS)
                continue
            except WorkerUnavailable as error:
                if args.once:
                    print(f'segment suggestion worker not started: {error}', file=sys.stderr, flush=True)
                    raise SystemExit(UNAVAILABLE_EXIT_CODE) from None
                if str(error) != unavailable:
                    unavailable = str(error)
                    print(json.dumps({'status': 'unavailable', 'warning': unavailable}, ensure_ascii=False),
                          file=sys.stderr, flush=True)
                time.sleep(IDLE_POLL_SECONDS)
                continue
            if unavailable is not None:
                unavailable = None
                print(json.dumps({'status': 'available'}), file=sys.stderr, flush=True)
            print(json.dumps(result), flush=True)
            if args.once:
                break
            if result['status'] == 'idle' and covers is not None:
                swept = sweep_covers(root, covers)
                if swept['covered'] or swept['failed'] or swept.get('error'):
                    print(json.dumps({'status': 'covers', **swept}), flush=True)
                if swept['covered']:
                    continue  # more may be pending; skip the idle wait
            time.sleep(IDLE_POLL_SECONDS if result['status'] == 'idle' else 0.1)
    except (Cancelled, KeyboardInterrupt):
        return
    finally:
        # Slots see STOPPING at their next tick; a job still inside a model call is left to lease expiry.
        STOPPING.set()
        for thread in threads:
            thread.join(timeout=30)


if __name__ == '__main__':
    main()
