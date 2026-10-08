from __future__ import annotations

import argparse
import json
import signal
import os
import time
from pathlib import Path

from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from .execution import Cancelled, file_hash, render_local, verify_module
from .queue import claim, finish, heartbeat, verify_sources
from . import run_bridge
from .inspection import inspect_output
from .output_profile import canvas, profile_name
from .workspace import RenderWorkspace, WorkspaceLimit
from .render_document import render_snapshot_document
from .selected_semantic_review import review_job as review_selected_semantics
from .selected_source_quality import review as review_selected_sources
from .caption_worker import review_job
from .caption_candidate_render import render_candidate
from .render_binding import require_binding, RenderBindingMismatch
from .derived_assets import validate_derived_assets
from .treatment_visual_worker import review_job as review_treated_render
from .remix_normalization import Settings as RemixSettings, finalize as finalize_remix_output, measure_clips, measure_rendered_clips
from . import remix_mediakit
from .mediakit_client import MediaKitError

FRAMEWORK_REMIX = "framework_remix"


def remix_normalization_applies(job: dict, link: dict | None) -> bool:
    """Only final framework remix renders (legacy clip snapshots) get loudness/encoding normalization."""
    return (link is not None and link.get("task_type") == FRAMEWORK_REMIX and not job["preview"]
            and job["snapshot"].get("editDocument") is None)


def download(storage, key: str, destination: Path, expected: str, tick) -> None:
    # URL comes only from the configured TOS signer, never from project/user JSON.
    url = storage.presign_get_url(key)
    size, started = 0, time.monotonic()
    with storage.session.get(url, stream=True, timeout=(10, 30), allow_redirects=False) as response:
        if response.status_code != 200:
            raise RuntimeError(f"原片读取失败 HTTP {response.status_code}")
        with destination.open("xb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                size += len(chunk)
                if size > 1024 ** 3 or time.monotonic() - started > 1800:
                    raise RuntimeError("原片超过下载大小或时间限制")
                tick()
                stream.write(chunk)
    if file_hash(destination) != expected:
        raise RuntimeError("原片摘要不匹配，拒绝渲染")


def upload_with_heartbeat(storage, key, video, tick):
    # Only the main thread touches the lease/DB; in-flight uploads may leave orphans.
    import threading
    errors = []
    def upload():
        try:
            storage.upload_file(key, video, "video/mp4")
        except Exception:
            errors.append(True)
    thread = threading.Thread(target=upload, daemon=True)
    thread.start()
    while thread.is_alive():
        thread.join(1)
        tick()
    tick()
    if errors:
        raise RuntimeError("成片存储失败")


def process_one(module: Path, work_root: Path) -> dict:
    if os.getenv("CONTENT_PRODUCTION_ENABLED") != "true":
        raise RuntimeError("CONTENT_PRODUCTION_ENABLED 未启用")
    verify_module(module)
    storage = TosStorageClient(TosStorageConfig.from_env())
    with RenderWorkspace(work_root) as workspace, connect_pg() as conn:
        run_bridge.reconcile(conn)
        job = claim(conn)
        if not job:
            run_bridge.reconcile(conn)
            return {"status": "idle"}
        link = run_bridge.linkage(conn, job)
        stage, last_beat = "准备原片", 0.0
        def tick():
            nonlocal last_beat
            workspace.check()
            if time.monotonic() - last_beat >= 2:
                heartbeat(conn, job, stage)
                last_beat = time.monotonic()
        try:
            require_binding(job["snapshot"], required=link is not None)
            derived = validate_derived_assets(job["snapshot"], str(job["project_id"]))
            canvas(job["snapshot"])
            verify_sources(conn, job["snapshot"], storage.config.bucket)
            cloud = remix_mediakit.applies(job, link)
            with workspace.job() as work:
                media = {}
                # The cloud path reads presigned sources directly; nothing is downloaded here.
                for index, asset in enumerate([] if cloud else job["snapshot"]["assets"]):
                    target = work / f"source-{index}.mp4"
                    download(storage, asset["objectKey"], target, asset["sha256"], tick)
                    workspace.check(force=True)
                    media[asset["assetId"]] = target
                for index, asset in enumerate(derived):
                    target = work / f"derived-{index}.mp4"
                    download(storage, asset["objectKey"], target, asset["sha256"], tick)
                    workspace.check(force=True)
                    media[asset["assetVersionId"]] = target
                remix = remix_normalization_applies(job, link)
                if remix and not cloud:
                    stage = "测量片段响度"
                    remix_settings = RemixSettings.from_env()
                    remix_clips = measure_clips(job["snapshot"], media, remix_settings, work, tick, workspace.lock_fd)
                stage = "渲染预览" if job["preview"] else "渲染成片"
                if cloud:
                    stage = "云端合成预览" if job["preview"] else "云端合成成片"
                    video, receipt = remix_mediakit.render(job, storage, work, job["preview"], tick,
                                                           workspace.lock_fd,
                                                           resume=remix_mediakit.previous_attempt(conn, job))
                    if remix:
                        stage = "测量片段响度"
                        remix_settings = RemixSettings.from_env()
                        remix_clips = measure_rendered_clips(video, job["snapshot"], remix_settings, work, tick,
                                                             workspace.lock_fd)
                elif job["snapshot"].get("editDocument") is not None:
                    video, receipt = render_snapshot_document(module, job["snapshot"], media, work, job["preview"], tick, workspace.lock_fd)
                else:
                    video, receipt = render_local(module, job["snapshot"], media, str(job["project_id"]), work, job["preview"], tick, workspace.lock_fd)
                if remix:
                    stage = "统一成片音频与编码"
                    workspace.check(force=True)
                    video, receipt = finalize_remix_output(video, receipt, job["snapshot"], remix_clips,
                                                           remix_settings, work, tick, workspace.lock_fd,
                                                           copy_video=cloud)
                    workspace.check(force=True)
                if job["snapshot"].get("editDocument") is None and (link or profile_name(job["snapshot"]) != "legacy_v1"):
                    stage = "检查成片"
                    receipt["host_inspection"] = inspect_output(video, job["snapshot"], job["preview"], receipt, tick, workspace.lock_fd)
                if link and not job["preview"]:
                    stage = "检查最终采用片段"
                    selected_review = review_selected_sources(job["snapshot"], media, video, receipt, work, tick, workspace.lock_fd)
                    if selected_review is not None:
                        receipt["host_selected_source_quality"] = selected_review
                if link:
                    receipt["host_run_id"] = str(link["run_id"])
                    receipt["host_execution_version"] = link["execution_version"]
                    receipt["host_plan_revision"] = link["plan_revision"]
                    stage = "复检处理画面"
                    visual_review = review_treated_render(conn, job, link, media, video, receipt, work, tick,
                        lambda: verify_sources(conn, job["snapshot"], storage.config.bucket))
                    if visual_review is not None:
                        receipt["host_visual_review"] = visual_review
                    stage = "复核最终选段语义"
                    selected_semantics = review_selected_semantics(conn, job, link, video, receipt, work, tick,
                        lambda: verify_sources(conn, job["snapshot"], storage.config.bucket))
                    if selected_semantics is not None:
                        receipt["host_selected_semantic_review"] = selected_semantics
                    stage = "审查字幕"
                    heartbeat(conn, job, stage)
                    verify_sources(conn, job["snapshot"], storage.config.bucket)
                    caption_review = review_job(conn, job, media, tick)
                    if caption_review is not None:
                        receipt["host_caption_review"] = caption_review
                        if os.getenv("AIOS_CAPTION_RENDER_CANDIDATE") == "true":
                            stage = "渲染字幕候选"
                            heartbeat(conn, job, stage)
                            verify_sources(conn, job["snapshot"], storage.config.bucket)
                            try:
                                rendered = render_candidate(module, job["snapshot"], media, work,
                                    caption_review, tick, workspace.lock_fd)
                                if rendered is not None:
                                    candidate_video, candidate_receipt = rendered
                                    workspace.check(force=True)
                                    heartbeat(conn, job, "保存字幕候选")
                                    verify_sources(conn, job["snapshot"], storage.config.bucket)
                                    candidate_key = f"production/{job['project_id']}/{job['job_id']}/caption-candidate.mp4"
                                    upload_with_heartbeat(storage, candidate_key, candidate_video, tick)
                                    candidate_receipt["outputObjectKey"] = candidate_key
                                    caption_review["candidateRender"] = candidate_receipt
                                    caption_review["candidateRendered"] = True
                            except (Cancelled, WorkspaceLimit):
                                raise
                            except Exception as error:
                                caption_review["candidateRender"] = {"status": "failed",
                                    "errorType": type(error).__name__, "deliveryApproved": False}
                stage = "保存成片"
                workspace.check(force=True)
                receipt["host_workspace"] = workspace.receipt()
                heartbeat(conn, job, stage)
                verify_sources(conn, job["snapshot"], storage.config.bucket)
                key = f"production/{job['project_id']}/{job['job_id']}/video.mp4"
                upload_with_heartbeat(storage, key, video, tick)
                receipt["host_revision"] = job["revision"]
                receipt["host_project_id"] = str(job["project_id"])
                verify_sources(conn, job["snapshot"], storage.config.bucket)
                if not finish(conn, job, "completed", key=key, receipt=receipt):
                    return {"jobId": str(job["job_id"]), "status": "not_published"}
                return {"jobId": str(job["job_id"]), "status": "completed"}
        except Cancelled:
            conn.rollback()
            accepted = finish(conn, job, "cancelled")
            return {"jobId": str(job["job_id"]), "status": "cancelled" if accepted else "not_published"}
        except Exception as error:
            conn.rollback()
            # Do not persist exception repr: HTTP/DB exceptions may contain signed URLs/credentials.
            message = str(error) if isinstance(error, (WorkspaceLimit, RenderBindingMismatch)) else (
                ((str(error) if str(error).startswith("云端合成") else "云端合成失败：" + str(error)[:160])
                 if isinstance(error, (MediaKitError, TimeoutError))
                 else "云端合成失败：请检查 MediaKit 配置、源素材链接与任务状态")
                if stage in ("云端合成成片", "云端合成预览") else (
                "成片技术检查未通过：请检查时长、格式、来源回执与可解码性" if stage == "检查成片"
                else "框架混剪响度测量或统一编码失败：请检查源音频、输出配置与 worker 的 ffmpeg"
                if stage in ("测量片段响度", "统一成片音频与编码")
                else "制作失败：请检查源素材、模块版本及 worker 运行环境"))
            attempt = getattr(error, "mediakit_attempt", None)
            # Keep the cloud task of a failed synthesis so a retry can reuse it instead of paying again.
            accepted = finish(conn, job, "failed", error=message,
                              receipt={"mediakit_attempt": attempt} if attempt else None)
            return {"jobId": str(job["job_id"]), "status": "failed" if accepted else "not_published", "errorType": type(error).__name__}
        finally:
            conn.rollback()
            run_bridge.reconcile(conn)


def main() -> None:
    module = os.environ.get("CREATIVE_CRAFT_PRODUCTION_DIR", "")
    workspace = os.environ.get("CONTENT_PRODUCTION_WORK_DIR", "")
    if not module or not workspace:
        raise RuntimeError("需配置 CREATIVE_CRAFT_PRODUCTION_DIR 与 CONTENT_PRODUCTION_WORK_DIR")
    parser = argparse.ArgumentParser(description="Independent content production worker")
    parser.add_argument("--once", action="store_true", help="consume at most one job then exit")
    args = parser.parse_args()
    work_root = Path(workspace).resolve()
    work_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    stopping = False
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
        raise Cancelled("worker 正在停止")
    signal.signal(signal.SIGTERM, stop)
    try:
        while True:
            result = process_one(Path(module).resolve(), work_root)
            print(json.dumps(result), flush=True)
            if args.once or stopping:
                break
            time.sleep(5 if result["status"] == "idle" else 0.1)
    except (Cancelled, KeyboardInterrupt):
        return


if __name__ == "__main__":
    main()
