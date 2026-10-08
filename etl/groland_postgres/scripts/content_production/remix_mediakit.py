"""Framework remix rendered by AI MediaKit `multi-track-edit` instead of the local Chromium renderer.

The VPS worker only builds the declarative timeline, polls, downloads and then
reuses the existing loudness/encoding pass (video stream copied) and technical
inspection. One job execution submits exactly one timeline; a POST whose outcome
is unknown is retried with the byte-identical body, which MediaKit deduplicates
through `client_token` (verified 2026-09-30: identical body -> same task; any
body difference -> a new, billed task). A lease-expired job is failed by the
queue and never resumed, so no cross-execution task state is persisted.
See docs/autonomous-content-production/MEDIAKIT_RUNBOOK.md.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

from .execution import file_hash
from .mediakit_client import MediaKitClient, MediaKitError
from .output_profile import canvas
from .remix_normalization import FPS, probe
from .render_binding import MEDIAKIT_ENGINE

ENGINE = MEDIAKIT_ENGINE
ENGINE_ENV = "CONTENT_PRODUCTION_REMIX_ENGINE"
FRAMEWORK_REMIX = "framework_remix"
POLL_SECONDS = 5
SUBMIT_ATTEMPTS = 3
# Idempotent GETs (task state, result download) survive this many consecutive
# transport/5xx failures; the cross-border link to MediaKit is slow and flaky.
READ_ATTEMPTS = 5
PRESIGN_SECONDS = 6 * 3600
MAX_OUTPUT_BYTES = 4 * 1024 ** 3
VIDEO_CODEC = {"video_codec": "h264", "preset": "medium", "crf": 20, "audio_bitrate": 128}


def _int_env(name: str, default: int, low: int, high: int) -> int:
    raw = (os.getenv(name) or "").strip()
    value = int(raw) if raw else default
    if not low <= value <= high:
        raise ValueError(f"{name} must be within {low}..{high}")
    return value


def engine_from_env() -> str:
    value = (os.getenv(ENGINE_ENV) or "renderer").strip()
    if value not in ("renderer", "mediakit"):
        raise ValueError(f"{ENGINE_ENV} must be renderer or mediakit")
    return value


def applies(job: dict, link: dict | None) -> bool:
    """Caption-free framework remix clip snapshots (final and preview) when the engine switch says mediakit."""
    snapshot = job["snapshot"]
    return (link is not None and link.get("task_type") == FRAMEWORK_REMIX
            and snapshot.get("editDocument") is None and not snapshot.get("derivedAssets")
            and all(not str(clip.get("caption") or "").strip() for clip in snapshot["clips"])
            and engine_from_env() == "mediakit")


def timeline_ms(snapshot: dict) -> int:
    return sum(clip["endMs"] - clip["startMs"] for clip in snapshot["clips"])


def timeline_frames(snapshot: dict) -> int:
    """MediaKit places clips on a millisecond timeline and outputs round(total * fps) frames."""
    return round(timeline_ms(snapshot) * FPS / 1000)


def contain_box(width: int, height: int, target: dict) -> dict:
    """Aspect-preserving fit centred on the canvas (the renderer's `contain`), even-sized."""
    scale = min(target["width"] / width, target["height"] / height)
    box_w = max(2, round(width * scale / 2) * 2)
    box_h = max(2, round(height * scale / 2) * 2)
    return {"type": "transform", "pos_x": (target["width"] - box_w) // 2, "pos_y": (target["height"] - box_h) // 2,
            "width": box_w, "height": box_h}


def source_size(location: str, work: Path, lock_fd: int | None = None) -> tuple[int, int]:
    """Picture size read from the presigned source header (ffprobe range reads; no full download)."""
    videos = [s for s in probe(location, work, lock_fd=lock_fd)["streams"] if s.get("codec_type") == "video"]
    if not videos:
        raise ValueError("片段来源没有视频轨")
    return int(videos[0]["width"]), int(videos[0]["height"])


def build_timeline(snapshot: dict, urls: dict[str, str], sizes: dict[str, tuple[int, int]], target: dict) -> dict:
    elements, elapsed = [], 0
    for clip in snapshot["clips"]:
        asset = str(clip["assetId"])
        duration = clip["endMs"] - clip["startMs"]
        if duration < 1000 // FPS:
            raise ValueError("片段短于一帧")
        extra = [{"type": "trim", "start_time": clip["startMs"], "end_time": clip["endMs"]},
                 contain_box(*sizes[asset], target)]
        if clip["volume"] != 1:
            extra.append({"type": "a_volume", "volume": clip["volume"]})
        elements.append({"type": "video", "source": urls[asset], "target_time": [elapsed, elapsed + duration],
                         "extra": extra})
        elapsed += duration
    return {"track": [elements],
            "canvas": {"width": target["width"], "height": target["height"], "background_color": "#000000FF"},
            "output": {"format": "mp4", "fps": FPS, "codec": VIDEO_CODEC, "cover": {"disable_cover": True}}}


def client_token(job: dict) -> str:
    """Unique per execution (claim), stable across retries of the same POST inside it."""
    seed = f"{job['job_id']}|{job['revision']}|{job['preview']}|{job['claim_token']}"
    return "aios-" + hashlib.sha256(seed.encode()).hexdigest()[:59]


def submit(kit: MediaKitClient, body: dict, tick) -> str:
    """At most SUBMIT_ATTEMPTS identical POSTs; MediaKit returns the same task for the same token+body."""
    last = None
    for attempt in range(SUBMIT_ATTEMPTS):
        tick()
        try:
            return kit.submit_tool("multi-track-edit", body)
        except MediaKitError as error:
            last = error
            if "transport failed" not in str(error):
                raise
            time.sleep(2 * (attempt + 1))
    raise last


def _transient(error: MediaKitError) -> bool:
    text = str(error)
    return "transport failed" in text or "HTTP 5" in text


def read_with_retries(read, tick, task_id: str):
    """Retries an idempotent MediaKit read; the final error names the task for manual recovery."""
    for attempt in range(READ_ATTEMPTS):
        tick()
        try:
            return read()
        except MediaKitError as error:
            if not _transient(error) or attempt == READ_ATTEMPTS - 1:
                raise MediaKitError(f"{error}（云端任务 {task_id}）") from None
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def wait(kit: MediaKitClient, task_id: str, tick, timeout: int) -> dict:
    started = time.monotonic()
    while True:
        tick()
        state = read_with_retries(lambda: kit.task(task_id), tick, task_id)
        if state["status"] == "completed":
            return state["result"]
        if state["status"] in ("failed", "cancelled"):
            raise MediaKitError(f"云端合成失败（{state['status']} {state.get('errorCode') or ''}）".replace(" ）", "）"))
        if time.monotonic() - started > timeout:
            raise TimeoutError("云端合成超时")
        for _ in range(POLL_SECONDS):
            tick()
            time.sleep(1)


def previous_attempt(conn, job: dict) -> dict | None:
    """Cloud task of the newest failed attempt at the same project revision (last 24 hours)."""
    with conn.cursor() as cursor:
        cursor.execute("""SELECT receipt->'mediakit_attempt' FROM ads.content_production_jobs
          WHERE project_id=%s AND revision=%s AND preview=%s AND status='failed' AND job_id<>%s
            AND receipt ? 'mediakit_attempt' AND finished_at > NOW() - INTERVAL '24 hours'
          ORDER BY finished_at DESC LIMIT 1""",
                       (job["project_id"], job["revision"], job["preview"], job["job_id"]))
        row = cursor.fetchone()
    if not row:
        return None
    value = row[0] if not isinstance(row, dict) else next(iter(row.values()))
    return value if isinstance(value, dict) else None


def timeline_digest(body: dict) -> str:
    """Identity of a timeline without its per-attempt parts (signed source URLs, client token)."""
    public = json.loads(json.dumps({k: v for k, v in body.items() if k != "client_token"}))
    for element in public["track"][0]:
        element["source"] = "presigned-tos-get"
    return hashlib.sha256(json.dumps(public, sort_keys=True).encode()).hexdigest()


def _resumable(kit: MediaKitClient, resume: dict | None, digest: str, tick) -> tuple[str, dict | None] | None:
    """A previous attempt's cloud task for the identical timeline, if it is still usable.

    Returns (task_id, state) for a completed or still running task; None when there is
    nothing to reuse (different timeline, failed/expired task, or unreadable state).
    """
    if not resume or resume.get("timelineSha256") != digest or not resume.get("taskId"):
        return None
    task_id = str(resume["taskId"])
    try:
        state = read_with_retries(lambda: kit.task(task_id), tick, task_id)
    except MediaKitError:
        return None
    if state.get("status") in ("failed", "cancelled"):
        return None
    return task_id, state


def render(job: dict, storage, work: Path, preview: bool, tick,
           lock_fd: int | None = None, kit: MediaKitClient | None = None,
           resume: dict | None = None) -> tuple[Path, dict]:
    """Renders the frozen clip snapshot in the cloud; returns (video, receipt) like render_local.

    Sources are never downloaded to the worker: MediaKit reads presigned URLs and the
    worker only probes their headers for the picture size. `resume` is the cloud task of
    a failed earlier attempt (see `mediakit_attempt`); when it rendered the identical
    timeline and is completed or still running, it is reused instead of paying for a
    second synthesis. Any failure after submission carries `mediakit_attempt` so the
    worker can record it for that reuse.
    """
    snapshot = job["snapshot"]
    target = canvas(snapshot, preview)
    max_seconds = _int_env("CONTENT_PRODUCTION_MEDIAKIT_MAX_SECONDS", 600, 3, 3600)
    if timeline_ms(snapshot) > max_seconds * 1000:
        raise ValueError("成片超过云端合成时长上限")
    timeout = _int_env("CONTENT_PRODUCTION_MEDIAKIT_TIMEOUT_SECONDS", 1800, 60, 7200)
    kit = kit or MediaKitClient(os.getenv("AIOS_MEDIAKIT_API_KEY") or "")
    assets = {str(a["assetId"]): a for a in snapshot["assets"]}
    used = {str(clip["assetId"]) for clip in snapshot["clips"]}
    urls = {asset: storage.presign_get_url(assets[asset]["objectKey"], PRESIGN_SECONDS) for asset in sorted(used)}
    sizes = {asset: source_size(urls[asset], work, lock_fd) for asset in sorted(used)}
    token = client_token(job)
    body = {**build_timeline(snapshot, urls, sizes, target), "client_token": token}
    digest = timeline_digest(body)
    started = time.monotonic()
    reused = _resumable(kit, resume, digest, tick)
    task_id = reused[0] if reused else submit(kit, body, tick)
    try:
        state = reused[1] if reused else None
        if state and state.get("status") == "completed":
            result = state["result"]
        else:
            result = wait(kit, task_id, tick, timeout)
        folder = work / "mediakit"
        folder.mkdir(exist_ok=True)
        video = folder / "video.mp4"
        size = read_with_retries(lambda: kit.fetch(result.get("video_url", ""), video, tick, MAX_OUTPUT_BYTES),
                                 tick, task_id)
    except Exception as error:
        error.mediakit_attempt = {"taskId": task_id, "timelineSha256": digest}  # type: ignore[attr-defined]
        raise
    digest = file_hash(video)
    public_timeline = json.loads(json.dumps(body))
    for element in public_timeline["track"][0]:
        element["source"] = "presigned-tos-get"  # signed URLs never enter receipts
    receipt = {
        "status": "completed", "engine": ENGINE, "preview": preview,
        "assets": [{"id": "a" + asset.replace("-", ""), "sha256": assets[asset]["sha256"]}
                   for asset in (str(a["assetId"]) for a in snapshot["assets"])],
        "output": {"file": "video.mp4", "sha256": digest, "bytes": size, "video": True,
                   "width": target["width"], "height": target["height"]},
        "mediakit": {"tool": "multi-track-edit", "taskId": task_id, "clientToken": token,
                     "timelineSha256": digest, "reusedTask": bool(reused),
                     "elapsedSeconds": round(time.monotonic() - started, 1),
                     "resultDurationSeconds": result.get("duration"), "resultResolution": result.get("resolution"),
                     "timelineMs": timeline_ms(snapshot), "expectedFrames": timeline_frames(snapshot),
                     "timeline": public_timeline},
    }
    return video, receipt
