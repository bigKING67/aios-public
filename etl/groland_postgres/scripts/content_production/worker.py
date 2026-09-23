from __future__ import annotations

import argparse
import json
import signal
import os
import tempfile
import time
from pathlib import Path

from marketing_content_assets.repository import connect_pg
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig
from .execution import Cancelled, file_hash, render_local, verify_module
from .queue import claim, finish, heartbeat, verify_sources


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


def process_one(module: Path, work_root: Path) -> dict:
    if os.getenv("CONTENT_PRODUCTION_ENABLED") != "true":
        raise RuntimeError("CONTENT_PRODUCTION_ENABLED 未启用")
    verify_module(module)
    storage = TosStorageClient(TosStorageConfig.from_env())
    with connect_pg() as conn:
        job = claim(conn)
        if not job:
            return {"status": "idle"}
        stage, last_beat = "准备原片", 0.0
        def tick():
            nonlocal last_beat
            if time.monotonic() - last_beat >= 2:
                heartbeat(conn, job, stage)
                last_beat = time.monotonic()
        try:
            verify_sources(conn, job["snapshot"], storage.config.bucket)
            with tempfile.TemporaryDirectory(prefix="content-production-", dir=work_root) as temporary:
                work = Path(temporary).resolve()
                media = {}
                for index, asset in enumerate(job["snapshot"]["assets"]):
                    target = work / f"source-{index}.mp4"
                    download(storage, asset["objectKey"], target, asset["sha256"], tick)
                    media[asset["assetId"]] = target
                stage = "渲染预览" if job["preview"] else "渲染成片"
                video, receipt = render_local(module, job["snapshot"], media, str(job["project_id"]), work, job["preview"], tick)
                heartbeat(conn, job, "保存成片")
                verify_sources(conn, job["snapshot"], storage.config.bucket)
                key = f"production/{job['project_id']}/{job['job_id']}/video.mp4"
                # Refresh lease during upload too; large uploads cannot be reclaimed mid-write.
                import threading
                upload_error = []
                def upload():
                    try:
                        storage.upload_file(key, video, "video/mp4")
                    except Exception:
                        upload_error.append(True)
                thread = threading.Thread(target=upload, daemon=True)
                thread.start()
                while thread.is_alive():
                    thread.join(1)
                    heartbeat(conn, job, "保存成片")
                if upload_error:
                    raise RuntimeError("成片存储失败")
                receipt["host_revision"] = job["revision"]
                receipt["host_project_id"] = str(job["project_id"])
                if not finish(conn, job, "completed", key=key, receipt=receipt):
                    return {"jobId": str(job["job_id"]), "status": "cancelled"}
                return {"jobId": str(job["job_id"]), "status": "completed"}
        except Cancelled:
            conn.rollback()
            finish(conn, job, "cancelled")
            return {"jobId": str(job["job_id"]), "status": "cancelled"}
        except Exception as error:
            conn.rollback()
            # Do not persist exception repr: HTTP/DB exceptions may contain signed URLs/credentials.
            finish(conn, job, "failed", error="制作失败：请检查源素材、模块版本及 worker 运行环境")
            return {"jobId": str(job["job_id"]), "status": "failed", "errorType": type(error).__name__}


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
