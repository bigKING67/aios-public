"""Resource sampling for the isolated batch; never imports personal env files."""
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import threading
import time


def validate_fixture_targets(database: str, redis: str) -> None:
    from urllib.parse import urlsplit
    db, cache = urlsplit(database), urlsplit(redis)
    if (db.scheme != "postgresql" or db.hostname != "127.0.0.1"
            or db.path != "/content_production_e2e" or not db.port
            or cache.scheme != "redis" or cache.hostname != "127.0.0.1" or not cache.port):
        raise ValueError("only the disposable loopback content_production_e2e database and Redis are allowed")


def run_measured_fixture(root: Path, env: dict, output: Path, timeout: int, batch: bool) -> int:
    sys.path.insert(0, str(root / "etl/groland_postgres/scripts"))
    from content_production.benchmark import tree_rss_bytes
    samples = {"scope": "sampled Mac process-tree RSS, shared pages counted; excludes Docker DB/Redis; not cgroup peak",
               "host": platform.platform(), "logicalCpus": os.cpu_count(),
               "peakProcessTreeRssBytes": 0, "samples": 0, "missedSamples": 0}
    stop = threading.Event()
    def monitor():
        while not stop.is_set():
            if (output / "batch-started.json").exists() and not (output / "batch-report.json").exists():
                try:
                    rows = subprocess.run(["ps", "-axo", "pid=,ppid=,rss="], capture_output=True, text=True, check=True, timeout=2).stdout
                    samples["peakProcessTreeRssBytes"] = max(samples["peakProcessTreeRssBytes"], tree_rss_bytes(os.getpid(), rows))
                    samples["samples"] += 1
                except (OSError, ValueError, subprocess.SubprocessError):
                    samples["missedSamples"] += 1
            stop.wait(0.5)
    watcher = threading.Thread(target=monitor, daemon=True)
    if batch:
        watcher.start()
    command = ["bash", "scripts/backend-rust/cargo-with-cache.sh", "test", "real_http_worker_render_and_signed_delivery", "--", "--ignored", "--nocapture"]
    process = subprocess.Popen(command, cwd=root, env=env, start_new_session=True)
    code = 1
    try:
        code = process.wait(timeout=timeout)
        return code
    finally:
        # This process group belongs entirely to this isolated fixture, including
        # worker descendants. Preserve every unrelated user/service process.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=45)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=45)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                os.killpg(process.pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.1)
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        stop.set()
        if batch:
            watcher.join(timeout=3)
            samples["fixtureExitCode"] = code
            (output / "batch-resources.json").write_text(json.dumps(samples, indent=2))
            report_path = output / "batch-report.json"
            if report_path.exists():
                report = json.loads(report_path.read_text())
                def distribution(key):
                    values = sorted(row[key] for row in report["results"] if key in row)
                    if not values:
                        return {"count":0}
                    import math
                    return {"count":len(values), "min":values[0], "p50":values[math.ceil(len(values)*0.5)-1], "p95":values[math.ceil(len(values)*0.95)-1], "max":values[-1]}
                summary = {"planned":report["planned"], "passed":report["passed"], "failed":report["failed"], "wallSeconds":report["wallSeconds"],
                           "endToEndSeconds":distribution("endToEndSeconds"), "workerInvocationSeconds":distribution("workerInvocationSeconds"),
                           "queueUntilInvocationSeconds":distribution("queueUntilInvocationSeconds"),
                           "timingScope":"queue stops at Python worker invocation, before actual DB claim; invocation includes startup/download/render/inspect/upload/reconcile",
                           "maxWorkspaceObservedBytes":max((row.get("workspace", {}).get("peakObservedBytes",0) for row in report["results"]), default=0),
                           "resources":samples}
                (output / "batch-summary.json").write_text(json.dumps(summary, indent=2))
            if code:
                (output / "fixture-failed.json").write_text(json.dumps({"status":"failed", "planned":int(env["CONTENT_PRODUCTION_TEST_BATCH_COUNT"]), "exitCode":code, "scope":"all requested cases remain in denominator"}, indent=2))
