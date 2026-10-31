"""竞品单条拆解（卡 A）worker over competitor.analyses.

The API stages each original at competitor/raw/{aweme_id}.mp4 and queues a row with
its SHA-256. This worker verifies the staged file, runs the phase-0 card A pipeline
(`offline.analyze`: Seed 2.1 lite with native audio, strict json_schema, host
validation), adds the framework / selling-point structure in our preset labels with the
full timed transcript (`structure.build`, GPU node only), keeps 30 evenly spaced sample
frames and up to 5 segment-start frames (list covers) as evidence under
competitor/evidence/{analysis_id}/, writes the card, and deletes terminal staged originals (retains sources awaiting transport recovery). Opt-in: COMPETITOR_ANALYSIS_ENABLED=true; otherwise it idles and
leaves queued rows untouched. Provider failures are not retried automatically. While idle it
also refreshes the statistics snapshots and generates requested 总览 summaries (report_jobs).
COMPETITOR_ANALYSIS_CONCURRENCY (default 1) runs that many analyses at once on threads of one
process: card A overlaps with structure analysis, and the GPU stages share one OCR engine and the
local VLM admission locks with the AI 切段 worker.
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path

import psycopg2
import psycopg2.errors

from .connections import connect_pg
from marketing_content_assets.repository import connect_pg as connect_maintenance_pg
from marketing_content_assets.tos_storage import StorageUnavailable
from marketing_content_assets.worker_runtime import claim_after_seconds
from ..execution import Cancelled
from ..shot_catalog import probe
from ..stage_timings import StageTimings
from . import contract, enrichment, offline, queue, recovery, report_jobs, snapshots, structure
from . import taxonomy as tx
from .transport import StorageCircuit

ENABLED_ENV = 'COMPETITOR_ANALYSIS_ENABLED'
CONCURRENCY_ENV = 'COMPETITOR_ANALYSIS_CONCURRENCY'
MAX_CONCURRENCY = 8
STOP_JOIN_SECONDS = 50
IDLE_POLL_SECONDS = 10
HEARTBEAT_SECONDS = 30
EVIDENCE_FRAMES = 5
# The drawer's contact sheet: always this many frames, evenly spaced over the film. 720px keeps
# burned-in captions legible in the viewer at ~0.5 MB a film (320px was ~0.2 MB and blurred).
SAMPLE_FRAMES = 30
SAMPLE_HEIGHT = 720
# Same as asset covers: ffmpeg picks the WebP encoder from the extension.
FRAME_FORMAT = ('webp', 'image/webp')
# The settings phase 0 accepted for production (v9 card, online tier, native audio).
SETTINGS = {'fps': 1.0, 'hook_clip': True, 'hook_fps': 5.0, 'thinking': 'disabled', 'max_output': 12000,
            'transcripts': None, 'hook_audio': False, 'service_tier': None}

STOPPING = threading.Event()
STORAGE_CIRCUIT = StorageCircuit()


def enabled():
    return os.getenv(ENABLED_ENV, '').strip().lower() == 'true'


def concurrency():
    raw = (os.getenv(CONCURRENCY_ENV) or '1').strip()
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_CONCURRENCY:
        raise ValueError(f'{CONCURRENCY_ENV} must be an integer between 1 and {MAX_CONCURRENCY}')
    return int(raw)


def raw_key(aweme_id):
    return f'competitor/raw/{aweme_id}.mp4'


def evidence_prefix(analysis_id):
    return f'competitor/evidence/{analysis_id}'


def frame_times(card, duration_sec, limit=EVIDENCE_FRAMES):
    """Segment start times (deduplicated, inside the film), earliest first."""
    times = []
    for segment in sorted(card.get('segments') or [], key=lambda item: item.get('start_sec') or 0):
        start = segment.get('start_sec')
        if not isinstance(start, (int, float)) or start < 0 or start >= duration_sec:
            continue
        start = round(float(start), 2)
        if all(abs(start - existing) >= 0.5 for existing in times):
            times.append(start)
        if len(times) == limit:
            break
    return times


def sample_times(duration_sec, count=SAMPLE_FRAMES):
    """Centres of `count` equal slices of the film, so neither the first nor the last frame is black."""
    return [round(duration_sec * (index + 0.5) / count, 2) for index in range(count)] if duration_sec > 0 else []


def display_labels():
    return tx.display_labels()


def category_name(key):
    """The video's category column holds a display name (manual entries are free text); unknown stays empty."""
    name = tx.PRODUCT_CATEGORIES.get(key) if key and key != 'unknown' else None
    return name.split('（')[0] if name else None


def classify(issues, framework=None):
    """partial when host validation removed something; succeeded otherwise."""
    incomplete = framework is not None and (framework.get('status') != 'ok'
                                            or any(key.endswith('Error') for key in framework))
    return 'partial' if incomplete or any(issue[0] == 'error' for issue in issues) else 'succeeded'


def _frame(source, at, output, height, quality):
    # Never taller than the source: an upscaled frame costs storage without adding detail.
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(at), '-i', str(source), '-frames:v', '1',
                    '-vf', f"scale=-2:'min({height},ih)'", '-quality', str(quality), str(output)], check=True)


def extract_evidence(source, work, card, duration_sec):
    extension, content_type = FRAME_FORMAT
    items = []
    for kind, times, height, quality in (('frame', frame_times(card, duration_sec), 540, 75),
                                         ('sample', sample_times(duration_sec), SAMPLE_HEIGHT, 70)):
        for index, at in enumerate(times, start=1):
            name = f'{kind}-{index}.{extension}'
            frame = work / f'evidence-{name}'
            _frame(source, at, frame, height, quality)
            items.append({'kind': kind, 'startMs': int(at * 1000), 'endMs': int(at * 1000), 'path': frame,
                          'contentType': content_type, 'name': name})
    return items


class Heartbeat:
    """Keeps the lease alive through download, inference and delivery; records a lost lease."""

    def __init__(self, job):
        self.job, self.lost, self._stop = job, False, threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        # Borrow briefly per beat: a running job holds no pool slot between beats.
        while not self._stop.wait(HEARTBEAT_SECONDS):
            try:
                with connect_pg() as conn:
                    alive = queue.heartbeat(conn, self.job)
            except psycopg2.OperationalError:
                continue  # transient; the lease outlasts several missed beats
            if not alive:
                self.lost = True
                return

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *_exc):
        self._stop.set()
        self._thread.join(timeout=5)


def stopping_tick():
    if STOPPING.is_set():
        raise Cancelled('worker stopping')


def build_structure(source, work, duration_sec, provider_factory, cancel, *, timings=None, reuse=None,
                    presets=None, allow_retry=True):
    """The structure on its own connection and work dir, so it runs while card A waits on the provider."""
    def tick():
        if STOPPING.is_set() or cancel.is_set():
            raise Cancelled('worker stopping' if STOPPING.is_set() else 'card A failed')
    work.mkdir(exist_ok=True)
    if presets is None:
        with connect_pg() as conn:
            presets = structure.load_presets(conn)
    if reuse and reuse.framework:
        return recovery.rebuild_structure(reuse, presets, source, duration_sec, work, tick, provider_factory,
                                           timings, allow_retry=allow_retry)
    return structure.build(presets, source, duration_sec, work, tick, provider_factory, timings=timings,
                           allow_retry=allow_retry)


def measured_usage(usage, timings):
    return {**(usage or {}), 'performance': timings.snapshot('before_result_write')}


def fail(job, code, message, usage=None, cost_yuan=None, *, timings=None):
    usage = measured_usage(usage, timings) if timings is not None else usage
    with connect_pg() as conn:
        if timings is None:
            return queue.fail(conn, job, code, message, usage, cost_yuan)
        return timings.call('result_write', queue.fail, conn, job, code, message, usage, cost_yuan)


def process(job, storage, client, work, structure_provider=structure.provider_from_env, *, timings=None):
    """One analysis; DB operations borrow bounded pool slots, released before model/network work."""
    timings = timings or StageTimings()
    with Heartbeat(job) as beat:
        return _process(job, storage, client, work, structure_provider, timings, beat)


def _process(job, storage, client, work, structure_provider, timings, beat):
    source = work / 'source.mp4'
    timings.call('source_download', storage.download_file, raw_key(job['aweme_id']), source)
    if timings.call('source_verify', offline.sha256, source) != job['source_sha256']:
        ok = fail(job, 'source_changed', '暂存原片与排队时的校验值不一致，请重新发起分析', timings=timings)
        return 'failed' if ok else 'lease_lost'
    # Card A and the structure do not depend on each other; measure both rather than assuming their shares.
    duration_sec = timings.call('source_probe', probe, source, 'ffprobe')['durationMs'] / 1000
    if beat.lost or STOPPING.is_set():
        return 'lease_lost'
    with connect_pg() as conn:
        pending = queue.delivery_result(conn, job)
        if not pending:
            previous = queue.previous_result(conn, job)
            presets = structure.load_presets(conn) if previous else None
    if pending:
        return deliver(job, storage, source, work, pending, timings, beat, resumed=True)
    reuse = recovery.plan(previous, presets, duration_sec)
    allow_retry = job.get('requested_by') != recovery.AUTO_REPAIR_REQUESTER
    cancel = threading.Event()
    with ThreadPoolExecutor(max_workers=1) as pool:
        built = pool.submit(timings.call, 'structure_total', build_structure, source, work / 'structure',
                            duration_sec, structure_provider, cancel, timings=timings, reuse=reuse,
                            presets=presets, allow_retry=allow_retry)
        record = None
        try:
            record = (recovery.card_record(reuse, duration_sec) if reuse and reuse.core else
                      timings.call('card_total', offline.analyze, job['aweme_id'], source, work, SETTINGS, client,
                                   timings=timings, previous=previous))
        finally:
            # A failed card A stops the structure at its next tick; its billed calls still count.
            if record is None or record['status'] != 'ok':
                cancel.set()
            framework, recorded = built.result()
    if beat.lost:
        return 'lease_lost'
    cost_yuan = (record.get('cost') or {}).get('online_yuan')
    if framework.get('costYuan'):
        cost_yuan = round((cost_yuan or 0) + framework['costYuan'], 5)
    if record['status'] == 'provider_error':
        codes = ','.join(sorted({str(a.get('http') or a.get('type')) for a in record.get('error') or []}))
        ok = fail(job, 'provider_error', f'模型调用失败（{codes}），未自动重试', None, cost_yuan or None, timings=timings)
        return 'failed' if ok else 'lease_lost'
    if record['status'] != 'ok':
        ok = fail(job, 'invalid_response', '模型返回的卡片无法解析', record.get('usage'), cost_yuan, timings=timings)
        return 'failed' if ok else 'lease_lost'
    card, duration = record['card'], record['context']['duration_sec']
    if recorded:
        # The outcome is part of the input identity: re-running a card whose structure failed must not
        # collide with it on the reuse key (that rejected a paid re-run as duplicate_input).
        record['input_manifest'] = {**record['input_manifest'],
                                    'structure': {**recorded, 'status': framework['status'],
                                                  **({'partial': sorted(k for k in framework if k.endswith('Error'))}
                                                     if any(k.endswith('Error') for k in framework) else {})}}
    if reuse:
        record['usage'] = {**(record.get('usage') or {}), 'reuse': {
            'analysisId': reuse.row['analysis_id'], 'core': reuse.core, 'framework': reuse.framework}}
    evidence = list(reuse.row['evidence_objects']) if reuse and reuse.core else []
    product = card.get('product') or {}
    result = {
        'status': classify(record['issues'], framework), 'input_manifest_hash': queue.manifest_hash(record['input_manifest']),
        'model_id': record['model'], 'prompt_version': record['prompt_version'],
        'taxonomy_version': record['taxonomy_version'],
        'card': {**card, 'structure': record.get('structure'), 'labels': display_labels(), 'framework': framework},
        'host_errors': [{'severity': s, 'path': p, 'message': m} for s, p, m in record['issues']],
        'evidence_objects': evidence, 'usage': measured_usage(record.get('usage'), timings), 'cost_yuan': cost_yuan,
        'video': {'duration_seconds': duration, 'brand_name': product.get('brand'),
                  'product_category': category_name(product.get('category'))},
    }
    with connect_pg() as conn:
        if not queue.save_delivery(conn, job, result):
            return 'lease_lost'
    return deliver(job, storage, source, work, result, timings, beat)


def deliver(job, storage, source, work, result, timings, beat, *, resumed=False):
    if beat.lost or STOPPING.is_set():
        return 'lease_lost'
    # A reused complete evidence set does not need regeneration. A fresh checkpoint
    # has no evidence until every upload succeeds, so a partial upload is safely replayed
    # to the same deterministic object keys without calling any model.
    evidence = result['evidence_objects']
    if not evidence:
        extracted = timings.call('evidence_extract', extract_evidence, source, work,
                                 result['card'], result['video']['duration_seconds'])
        for item in extracted:
            if beat.lost or STOPPING.is_set():
                return 'lease_lost'
            key = f"{evidence_prefix(job['analysis_id'])}/{item['name']}"
            timings.call('evidence_upload', storage.upload_file, key, item['path'], item['contentType'])
            evidence.append({'kind': item['kind'], 'startMs': item['startMs'], 'endMs': item['endMs'],
                             'bucket': storage.config.bucket_for(key), 'objectKey': key,
                             'sha256': offline.sha256(item['path'])})
    usage = result['usage']
    if resumed:
        # Preserve the billed inference record and identify the later, unbilled delivery.
        usage = {**usage, 'deliveryRecovery': {'resumed': True, 'claimAttempt': job['attempt'],
                                             'performance': timings.snapshot('before_result_write')}}
    else:
        usage = measured_usage(usage, timings)
    result['usage'] = usage
    with connect_pg() as conn:
        try:
            ok = timings.call('result_write', queue.finish, conn, job, result)
        except psycopg2.errors.UniqueViolation:
            # Another video with byte-identical content already has this card.
            conn.rollback()
            ok = timings.call('result_write', queue.fail, conn, job, 'duplicate_input',
                              '同样的原片已有分析结果（可能是重发的视频）', result['usage'], result['cost_yuan'])
            return 'failed' if ok else 'lease_lost'
    return result['status'] if ok else 'lease_lost'


def process_one(storage_factory=None, client_factory=None):
    if not enabled():
        return {'status': 'disabled'}
    from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
    from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
    storage = (storage_factory or (lambda: TosStorageClient(TosStorageConfig.from_env())))()
    if not STORAGE_CIRCUIT.allowed(storage):
        return {'status': 'waiting_network'}
    with connect_pg() as conn:
        job = queue.claim(conn, claim_after_seconds())
    if job is None:
        return {'status': 'idle'}
    timings = StageTimings()
    status = 'lease_lost'
    try:
        client = (client_factory or (lambda: ArkResponsesClient(
            replace(ArkResponsesConfig.from_env(), timeout_seconds=600))))()
        # The work dir, not TMPDIR: the local VLM admission locks live under the system temp dir.
        with tempfile.TemporaryDirectory(prefix='competitor-', dir=os.getenv('CONTENT_PRODUCTION_WORK_DIR') or None) as tmp:
            status = process(job, storage, client, Path(tmp), timings=timings)
    except StorageUnavailable:
        STORAGE_CIRCUIT.trip(raw_key(job['aweme_id']))
        with connect_pg() as conn:
            status = queue.retry_storage(conn, job, {'transportFailure': timings.snapshot('before_result_write')})
    except psycopg2.OperationalError:
        # The commit may have succeeded remotely. Preserve source/checkpoint and let
        # the fenced lease recovery decide; never re-run an uncertain model request.
        print('[competitor-link] database unavailable; preserving staged source', flush=True)
        status = 'lease_lost'
    except Exception as error:  # noqa: BLE001 - the row must leave running with a reason
        ok = fail(job, 'worker_error', f'{type(error).__name__}: {str(error)[:300]}', timings=timings)
        status = 'failed' if ok else 'lease_lost'
    finally:
        try:
            if status in ('succeeded', 'partial', 'failed'):
                timings.call('source_cleanup', storage.delete_object, raw_key(job['aweme_id']))
        except Exception as error:  # noqa: BLE001 - a leftover staged file is logged, not fatal
            print(f"[competitor-worker] staged original not deleted for {job['aweme_id']}: {error}", flush=True)
        print('[competitor-performance] ' + json.dumps({'analysisId': job['analysis_id'], 'status': status,
              **timings.snapshot('after_cleanup')}, ensure_ascii=False), flush=True)
    print(f"[competitor-worker] {job['analysis_id']} {job['aweme_id']} -> {status}", flush=True)
    return {'status': status, 'analysis_id': job['analysis_id']}


def refresh_snapshots():
    """爆款分析 snapshots while the queue is idle: windows the page asked for on every tick, the full
    refresh after new results at most once a minute."""
    if snapshots.disallowed():
        return
    try:
        with connect_maintenance_pg() as conn:
            snapshots.maybe_process_requests(conn)
            if snapshots.due():
                snapshots.maybe_refresh(conn)
    except Exception as error:  # noqa: BLE001 - a database hiccup must not stop the worker loop
        print(f'[competitor-worker] snapshot refresh skipped: {type(error).__name__}: {str(error)[:200]}', flush=True)


def run_reports():
    """总览 AI summaries requested on the page, one per idle tick; never stops the worker loop."""
    if not enabled():
        return
    from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
    try:
        with connect_maintenance_pg() as conn:
            report_jobs.process_one(conn, lambda: ArkResponsesClient(ArkResponsesConfig.from_env()))
    except Exception as error:  # noqa: BLE001 - a database hiccup must not stop the worker loop
        print(f'[competitor-worker] report skipped: {type(error).__name__}: {str(error)[:200]}', flush=True)


def run_enrichments():
    """爆款拆解 text extraction, one per idle tick; queues nothing unless enrichment.SINCE_ENV is set."""
    if not enabled():
        return
    from marketing_content_assets.ark_responses import ArkResponsesClient, ArkResponsesConfig
    try:
        with connect_maintenance_pg() as conn:
            enrichment.process_one(conn, lambda: ArkResponsesClient(ArkResponsesConfig.from_env()))
    except Exception as error:  # noqa: BLE001 - a database hiccup must not stop the worker loop
        print(f'[competitor-worker] enrichment skipped: {type(error).__name__}: {str(error)[:200]}', flush=True)


def job_slot():
    """An extra slot: analyses only (snapshots and reports stay on the main loop); never exits on an error."""
    while not STOPPING.is_set():
        try:
            result = process_one()
        except Exception as error:  # noqa: BLE001 - a database hiccup backs off instead of killing the slot
            print(f'[competitor-worker] slot error: {type(error).__name__}: {str(error)[:200]}', flush=True)
            result = {'status': 'idle'}
        STOPPING.wait(IDLE_POLL_SECONDS if result['status'] in ('idle', 'disabled', 'waiting_network', 'queued') else 0.1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='process at most one analysis and exit')
    args = parser.parse_args(argv)
    signal.signal(signal.SIGTERM, lambda *_: STOPPING.set())
    slots = 1 if args.once else concurrency()
    print(f'[competitor-worker] prompt {contract.PROMPT_VERSION}, taxonomy {tx.TAXONOMY_VERSION}, '
          f'model {offline.MODEL}, enabled={enabled()}, slots={slots}', flush=True)
    if args.once:
        result = process_one()
        print(result, flush=True)
        return 0 if result['status'] in ('idle', 'succeeded', 'partial') else 1
    threads = [threading.Thread(target=job_slot, name=f'competitor-slot-{k}', daemon=True) for k in range(1, slots)]
    for thread in threads:
        thread.start()
    warned = False
    while not STOPPING.is_set():
        try:
            result = process_one()
        except Exception as error:
            # Database outages must not crash the primary slot while extra slots survive.
            print(f'[competitor-link] claim failed: {type(error).__name__}', flush=True)
            result = {'status': 'waiting_network'}
        if result['status'] == 'disabled' and not warned:
            print(f'[competitor-worker] {ENABLED_ENV} is not true; idling', flush=True)
            warned = True
        if result['status'] == 'idle':
            refresh_snapshots()
            run_reports()
            run_enrichments()
        STOPPING.wait(IDLE_POLL_SECONDS if result['status'] in ('idle', 'disabled', 'waiting_network', 'queued') else 0.1)
    # Let running slots finish inside systemd's stop timeout; a job still waiting on card A then
    # expires its lease and fails visibly instead of being cut mid-write.
    deadline = time.monotonic() + STOP_JOIN_SECONDS
    for thread in threads:
        thread.join(timeout=max(0.0, deadline - time.monotonic()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
