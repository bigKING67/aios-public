from __future__ import annotations

import argparse
import json
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

from .repository import connect_pg
from .yuntu_archive import YuntuArchiveProcessor
from .yuntu_archive_repository import count_archive_statuses, requeue_failed


class WorkerPool:
  def __init__(self, *, concurrency: int, dry_run: bool = False) -> None:
    self.concurrency = max(1, concurrency)
    self.dry_run = dry_run
    self.stop_event = threading.Event()
    self.wake_event = threading.Event()
    self.threads: list[threading.Thread] = []

  def start(self) -> None:
    if self.dry_run:
      return
    for idx in range(self.concurrency):
      thread = threading.Thread(target=self._loop, name=f"yuntu-archive-worker-{idx + 1}", daemon=True)
      thread.start()
      self.threads.append(thread)

  def stop(self) -> None:
    self.stop_event.set()
    self.wake_event.set()
    for thread in self.threads:
      thread.join(timeout=5)

  def notify(self) -> None:
    self.wake_event.set()

  def _loop(self) -> None:
    processor = YuntuArchiveProcessor()
    while not self.stop_event.is_set():
      try:
        result = processor.process_one()
      except Exception as error:  # noqa: BLE001 - keep daemon workers alive on unexpected edge cases
        print(f"[yuntu-archive-worker] unexpected_error {type(error).__name__}: {error}", flush=True)
        self.wake_event.wait(timeout=2)
        self.wake_event.clear()
        continue
      if not result.processed:
        self.wake_event.wait(timeout=2)
        self.wake_event.clear()


class ArchiveRequestHandler(BaseHTTPRequestHandler):
  server_version = "YuntuArchiveServer/1.0"

  def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
    parsed = urlparse(self.path)
    if parsed.path == "/archive/yuntu-page-batch":
      return self._handle_page_batch()
    if parsed.path == "/archive/flush":
      return self._handle_flush()
    if parsed.path == "/archive/shutdown":
      return self._handle_shutdown()
    self._write_json(404, {"ok": False, "error": "not_found"})

  def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
    parsed = urlparse(self.path)
    if parsed.path == "/archive/status":
      return self._handle_status()
    self._write_json(404, {"ok": False, "error": "not_found"})

  def log_message(self, fmt: str, *args: Any) -> None:
    if getattr(self.server, "quiet", False):
      return
    super().log_message(fmt, *args)

  def _handle_page_batch(self) -> None:
    if not self._authorized():
      return self._write_json(401, {"ok": False, "error": "unauthorized"})
    try:
      payload = self._read_json_body()
      result = self.server.processor.enqueue_page_batch(payload)
      self.server.worker_pool.notify()
      return self._write_json(200, {"ok": True, **result})
    except Exception as error:  # noqa: BLE001 - API boundary reports compact error
      return self._write_json(400, {"ok": False, "error": f"{type(error).__name__}: {error}"})

  def _handle_status(self) -> None:
    if not self._authorized(allow_empty_token=True):
      return self._write_json(401, {"ok": False, "error": "unauthorized"})
    with connect_pg() as conn:
      statuses = count_archive_statuses(conn)
    return self._write_json(200, {
      "ok": True,
      "statusCounts": statuses,
      "pendingCount": statuses.get("queued", 0) + statuses.get("running", 0),
      "workerConcurrency": self.server.worker_pool.concurrency,
      "dryRun": self.server.worker_pool.dry_run,
    })

  def _handle_flush(self) -> None:
    if not self._authorized():
      return self._write_json(401, {"ok": False, "error": "unauthorized"})
    if self.server.worker_pool.dry_run:
      with connect_pg() as conn:
        statuses = count_archive_statuses(conn)
      return self._write_json(200, {
        "ok": True,
        "dryRun": True,
        "processed": 0,
        "statusCounts": statuses,
        "pendingCount": statuses.get("queued", 0) + statuses.get("running", 0),
      })
    limit = 0
    payload = self._read_json_body(default={})
    if isinstance(payload, dict):
      try:
        limit = int(payload.get("limit") or 0)
      except (TypeError, ValueError):
        limit = 0
    result = self.server.processor.process_until_idle(max_records=limit)
    return self._write_json(200, {"ok": True, **result})

  def _handle_shutdown(self) -> None:
    if not self._authorized():
      return self._write_json(401, {"ok": False, "error": "unauthorized"})
    self._write_json(200, {"ok": True, "message": "shutdown requested"})
    threading.Thread(target=self.server.shutdown, daemon=True).start()

  def _authorized(self, *, allow_empty_token: bool = False) -> bool:
    token = str(getattr(self.server, "token", "") or "")
    if not token:
      return allow_empty_token
    got = self.headers.get("X-Yuntu-Archive-Token", "")
    return got == token

  def _read_json_body(self, default: Any = None) -> Any:
    length = int(self.headers.get("Content-Length") or 0)
    if length <= 0:
      return default
    raw = self.rfile.read(length)
    return json.loads(raw.decode("utf-8"))

  def _write_json(self, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Yuntu-Archive-Token")
    self.end_headers()
    self.wfile.write(body)

  def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
    self.send_response(204)
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Yuntu-Archive-Token")
    self.end_headers()


class ArchiveHTTPServer(ThreadingHTTPServer):
  def __init__(self, server_address: tuple[str, int], token: str, concurrency: int, dry_run: bool, quiet: bool):
    super().__init__(server_address, ArchiveRequestHandler)
    self.token = token
    self.quiet = quiet
    self.processor = YuntuArchiveProcessor()
    self.worker_pool = WorkerPool(concurrency=concurrency, dry_run=dry_run)


def main() -> int:
  parser = argparse.ArgumentParser(description="Local Yuntu archive helper server.")
  parser.add_argument("--host", default=os.getenv("YUNTU_ARCHIVE_HOST", "127.0.0.1"))
  parser.add_argument("--port", type=int, default=int(os.getenv("YUNTU_ARCHIVE_PORT", "18740")))
  parser.add_argument("--token", default=os.getenv("YUNTU_ARCHIVE_TOKEN", ""))
  parser.add_argument("--concurrency", type=int, default=int(os.getenv("YUNTU_ARCHIVE_CONCURRENCY", "3")))
  parser.add_argument("--dry-run", action="store_true", help="enqueue only; do not run download/upload workers")
  parser.add_argument("--quiet", action="store_true")
  parser.add_argument("--requeue-failed", action="store_true")
  args = parser.parse_args()

  if not args.token:
    parser.error("--token or YUNTU_ARCHIVE_TOKEN is required")

  if args.requeue_failed:
    with connect_pg() as conn:
      requeue_failed(conn)

  server = ArchiveHTTPServer((args.host, args.port), args.token, args.concurrency, args.dry_run, args.quiet)
  server.worker_pool.start()

  def stop_server(_signum: int, _frame: Any) -> None:
    threading.Thread(target=server.shutdown, daemon=True).start()

  signal.signal(signal.SIGTERM, stop_server)
  signal.signal(signal.SIGINT, stop_server)
  print(
    json.dumps({
      "ok": True,
      "listening": f"http://{args.host}:{args.port}",
      "tokenRequired": bool(args.token),
      "concurrency": args.concurrency,
      "dryRun": args.dry_run,
    }, ensure_ascii=False),
    flush=True,
  )
  try:
    server.serve_forever()
  finally:
    server.worker_pool.stop()
    server.server_close()
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
