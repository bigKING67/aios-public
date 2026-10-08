"""Local render measurements; no database, model, storage upload or capacity certification."""
from __future__ import annotations

import argparse
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re
import resource
import signal
import subprocess
import threading
import time
import uuid

from .execution import Cancelled, file_hash, render_local, verify_module
from .inspection import inspect_output


def load_cases(manifest: Path) -> tuple[list[dict], str]:
    raw = manifest.read_bytes()
    data = json.loads(raw)
    cases = data.get("cases")
    if data.get("schema") != "aios.local-render-benchmark.v1" or not isinstance(cases, list) or not 1 <= len(cases) <= 50:
        raise ValueError("expected a benchmark manifest with 1–50 cases")
    names, verified = set(), {}
    for case in cases:
        name = case["name"]
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", name) or name in names:
            raise ValueError("case names must be unique safe identifiers")
        names.add(name)
        snapshot = case["snapshot"]
        if snapshot["aspect"] not in ("portrait", "landscape", "square") or not 1 <= len(snapshot["assets"]) <= 10:
            raise ValueError("invalid aspect or source count")
        asset_ids = [asset["assetId"] for asset in snapshot["assets"]]
        if len(set(asset_ids)) != len(asset_ids) or set(case["media"]) != set(asset_ids):
            raise ValueError("source mapping must exactly match unique snapshot assets")
        for asset in snapshot["assets"]:
            source = Path(case["media"][asset["assetId"]]).resolve(strict=True)
            if not source.is_file() or source.stat().st_size > 1024 ** 3:
                raise ValueError("source must be a local file no larger than 1 GiB")
            key = (str(source), asset["sha256"])
            if key not in verified:
                if file_hash(source) != asset["sha256"]:
                    raise ValueError("source digest mismatch")
                verified[key] = True
            case["media"][asset["assetId"]] = str(source)
        clips = snapshot["clips"]
        if not 1 <= len(clips) <= 100:
            raise ValueError("expected 1–100 clips")
        for clip in clips:
            start, end = clip["startMs"], clip["endMs"]
            if (type(start) is not int or type(end) is not int or not 0 <= start < end <= 1800000
                    or (end - start) * 30 // 1000 < 1 or clip["assetId"] not in asset_ids):
                raise ValueError("invalid source clip range")
        if sum(c["endMs"] - c["startMs"] for c in clips) > 120000:
            raise ValueError("benchmark output cannot exceed 120 seconds")
    return cases, hashlib.sha256(raw).hexdigest()


def tree_rss_bytes(root_pid: int, rows: str) -> int:
    processes = [tuple(map(int, line.split())) for line in rows.splitlines() if line.strip()]
    owned = {root_pid}
    while True:
        found = {pid for pid, parent, _rss in processes if parent in owned}
        if found <= owned:
            break
        owned.update(found)
    return sum(rss * 1024 for pid, _parent, rss in processes if pid in owned)


def sample_resources(stop: threading.Event, result: dict) -> None:
    while not stop.is_set():
        try:
            rows = subprocess.run(["ps", "-axo", "pid=,ppid=,rss="], capture_output=True,
                                  text=True, check=True, timeout=2).stdout
            result["peakProcessTreeRssBytes"] = max(result["peakProcessTreeRssBytes"], tree_rss_bytes(os.getpid(), rows))
            result["samples"] += 1
        except (OSError, ValueError, subprocess.SubprocessError):
            result["missedSamples"] += 1
        stop.wait(0.25)


def run_case(case: dict, module: Path, output: Path, submitted: float,
             cancelled: threading.Event, timeout: int) -> dict:
    started = time.monotonic()
    result = {"name": case["name"], "status": "failed", "queueSeconds": started - submitted,
              "sourceHashes": {a["assetId"]: a["sha256"] for a in case["snapshot"]["assets"]}}
    work = output / case["name"]
    work.mkdir(mode=0o700)
    def tick():
        if cancelled.is_set():
            raise Cancelled("local benchmark cancelled")
        if time.monotonic() - started > timeout:
            raise TimeoutError("local benchmark case timed out")
    try:
        tick()
        media = {key: Path(value) for key, value in case["media"].items()}
        # Revalidate at execution, not just before waiting for a slot.
        for asset in case["snapshot"]["assets"]:
            if file_hash(media[asset["assetId"]]) != asset["sha256"]:
                raise ValueError("source changed while queued")
        render_start = time.monotonic()
        video, receipt = render_local(module, case["snapshot"], media, str(uuid.uuid4()), work, False, tick)
        result["renderSeconds"] = time.monotonic() - render_start
        inspection_start = time.monotonic()
        inspection = inspect_output(video, case["snapshot"], False, receipt, tick)
        result.update(status="passed", inspectionSeconds=time.monotonic() - inspection_start,
                      inspection=inspection, outputBytes=video.stat().st_size,
                      artifact=str(video.relative_to(output)))
    except Cancelled:
        result["status"] = "cancelled"
    except Exception as error:
        # Exception strings may expose local paths or inherited provider details.
        result["errorType"] = type(error).__name__
    result.update(executionSeconds=time.monotonic() - started,
                  endToEndSeconds=time.monotonic() - submitted)
    (work / "measurement.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def version(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=10)
    return result.stdout.splitlines()[0][:300]


def benchmark(manifest: Path, module: Path, output: Path, slots: int, timeout: int = 1800) -> dict:
    if slots not in (1, 2) or not 1 <= timeout <= 3600:
        raise ValueError("slots must be 1 or 2; timeout must be 1–3600 seconds")
    cases, manifest_digest = load_cases(manifest)
    verify_module(module)
    environment = {"os": platform.system(), "release": platform.release(), "architecture": platform.machine(),
                   "logicalCpus": os.cpu_count(), "python": platform.python_version(),
                   "node": version([os.getenv("CONTENT_PRODUCTION_NODE", "node"), "--version"]),
                   "ffmpeg": version(["ffmpeg", "-version"])}
    lock = json.loads(Path(__file__).with_name("creative-craft.lock.json").read_text())
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    stop, cancelled = threading.Event(), threading.Event()
    metrics = {"peakProcessTreeRssBytes": 0, "samples": 0, "missedSamples": 0,
               "scope": "sampled process-tree RSS, includes shared pages and measurement overhead; not cgroup peak"}
    previous_handlers = {}
    if threading.current_thread() is threading.main_thread():
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[sig] = signal.signal(sig, lambda *_args: cancelled.set())
    monitor = threading.Thread(target=sample_resources, args=(stop, metrics), daemon=True)
    usage_start = resource.getrusage(resource.RUSAGE_CHILDREN)
    started, started_at = time.monotonic(), datetime.now(timezone.utc).isoformat()
    results = []
    monitor.start()
    try:
        with ThreadPoolExecutor(max_workers=slots) as pool:
            futures = [pool.submit(run_case, case, module, output, started, cancelled, timeout) for case in cases]
            for future in as_completed(futures):
                results.append(future.result())
    finally:
        stop.set()
        monitor.join(timeout=3)
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
    wall = time.monotonic() - started
    usage_end = resource.getrusage(resource.RUSAGE_CHILDREN)
    order = {case["name"]: i for i, case in enumerate(cases)}
    results.sort(key=lambda row: order[row["name"]])
    counts = {status: sum(row["status"] == status for row in results) for status in ("passed", "failed", "cancelled")}
    report = {"schema": "aios.local-render-measurement.v1", "scope": "local_render_only", "startedAt": started_at,
              "manifestSha256": manifest_digest, "engine": lock["engine"], "engineVersion": lock["engine_version"],
              "environment": environment, "slots": slots, "planned": len(cases), "counts": counts,
              "batchWallSeconds": wall, "childCpuSeconds": usage_end.ru_utime + usage_end.ru_stime - usage_start.ru_utime - usage_start.ru_stime,
              "resources": metrics, "cases": results,
              "unverified": ["model planning", "downloads/uploads", "target host", "creative quality", "50 qualified videos/day"]}
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="new private directory; existing paths are rejected")
    parser.add_argument("--slots", type=int, choices=(1, 2), default=1)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    report = benchmark(args.manifest.resolve(), args.module.resolve(), args.output.resolve(), args.slots, args.timeout)
    print(json.dumps({"scope": report["scope"], "planned": report["planned"], "counts": report["counts"], "batchWallSeconds": report["batchWallSeconds"]}))
    raise SystemExit(0 if report["counts"]["passed"] == report["planned"] else 1)


if __name__ == "__main__":
    main()
