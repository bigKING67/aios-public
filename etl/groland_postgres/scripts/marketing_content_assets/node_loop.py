"""Continuous queue loop for the compute node: preview/cover processing or transcripts.

On the VPS these queues are drained by Prefect schedules; the compute node has no Prefect worker,
so it runs this loop and claims jobs at once while the VPS flows (with
CONTENT_WORKER_CLAIM_AFTER_SECONDS) only take what the node leaves waiting.

  python -m marketing_content_assets.node_loop processing|transcript [--once]

Temporary files go under CONTENT_PRODUCTION_WORK_DIR; for transcripts that directory must sit
inside the local ASR service's allowed root.
"""
from __future__ import annotations

import argparse
import os
import signal
import sys
import threading
from pathlib import Path

IDLE_SECONDS = 10
BATCH_LIMIT = 5
STOPPING = threading.Event()


def run_once(kind: str, temp_root: Path | None):
  if kind == 'processing':
    from .queue_processor import process_content_asset_jobs
    return process_content_asset_jobs(limit=BATCH_LIMIT, temp_root=temp_root)
  from .transcript_processor import process_content_asset_transcript_jobs
  return process_content_asset_transcript_jobs(limit=BATCH_LIMIT, temp_root=temp_root)


def main(argv=None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('kind', choices=('processing', 'transcript'))
  parser.add_argument('--once', action='store_true', help='drain at most one batch and exit')
  args = parser.parse_args(argv)
  work = (os.getenv('CONTENT_PRODUCTION_WORK_DIR') or '').strip()
  temp_root = Path(work).expanduser().resolve() if work else None
  if temp_root:
    temp_root.mkdir(parents=True, exist_ok=True)
  signal.signal(signal.SIGTERM, lambda *_: STOPPING.set())
  print(f'[node-loop] {args.kind} work={temp_root or "system temp"}', flush=True)
  while not STOPPING.is_set():
    try:
      stats = run_once(args.kind, temp_root)
    except Exception as error:  # noqa: BLE001 - keep the loop alive; the job row already holds the failure
      print(f'[node-loop] {args.kind} loop error: {type(error).__name__}', flush=True)
      stats = {'claimed': 0}
    if stats.get('claimed'):
      print(f'[node-loop] {args.kind} {stats}', flush=True)
    if args.once:
      return 0
    STOPPING.wait(0 if stats.get('claimed') else IDLE_SECONDS)
  return 0


if __name__ == '__main__':
  sys.exit(main())
