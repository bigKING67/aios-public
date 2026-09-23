#!/usr/bin/env bash
set -euo pipefail

log_path="${HOME}/.codex/logs/frontend_preflight_events.jsonl"
max_bytes="${FRONTEND_PREFLIGHT_LOG_MAX_BYTES:-5242880}"
keep="${FRONTEND_PREFLIGHT_LOG_KEEP:-14}"
max_age_days="${FRONTEND_PREFLIGHT_LOG_MAX_AGE_DAYS:-30}"
compress="${FRONTEND_PREFLIGHT_LOG_COMPRESS:-0}"
quiet="0"

usage() {
  cat <<'EOF'
Usage:
  bash ~/.codex/tools/frontend_preflight_log_rotate.sh \
    [--log-path <path>] \
    [--max-bytes <bytes>] \
    [--keep <count>] \
    [--max-age-days <days>] \
    [--compress] \
    [--quiet]

Behavior:
  - If log file size exceeds max-bytes, rotate to <log>.<UTC timestamp>.
  - Keeps the newest <count> rotated files and deletes older ones.
  - Optionally deletes rotated files older than max-age-days.
  - Optionally compresses rotated files with gzip.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log-path)
      log_path="${2-}"
      shift 2
      ;;
    --max-bytes)
      max_bytes="${2-}"
      shift 2
      ;;
    --keep)
      keep="${2-}"
      shift 2
      ;;
    --max-age-days)
      max_age_days="${2-}"
      shift 2
      ;;
    --compress)
      compress="1"
      shift
      ;;
    --quiet)
      quiet="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${log_path}" != /* ]]; then
  echo "--log-path must be absolute: ${log_path}" >&2
  exit 2
fi

if ! [[ "${max_bytes}" =~ ^[0-9]+$ ]] || [[ "${max_bytes}" -le 0 ]]; then
  echo "--max-bytes must be a positive integer: ${max_bytes}" >&2
  exit 2
fi

if ! [[ "${keep}" =~ ^[0-9]+$ ]] || [[ "${keep}" -lt 1 ]]; then
  echo "--keep must be an integer >= 1: ${keep}" >&2
  exit 2
fi

if ! [[ "${max_age_days}" =~ ^[0-9]+$ ]]; then
  echo "--max-age-days must be an integer >= 0: ${max_age_days}" >&2
  exit 2
fi

if [[ "${compress}" != "0" && "${compress}" != "1" ]]; then
  echo "--compress must be a flag (no value)." >&2
  exit 2
fi

python3 - "${log_path}" "${max_bytes}" "${keep}" "${max_age_days}" "${compress}" "${quiet}" <<'PY'
import fcntl
import gzip
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import time

log_path = Path(sys.argv[1])
max_bytes = int(sys.argv[2])
keep = int(sys.argv[3])
max_age_days = int(sys.argv[4])
compress = sys.argv[5] == "1"
quiet = sys.argv[6] == "1"

log_path.parent.mkdir(parents=True, exist_ok=True)
lock_path = Path(str(log_path) + ".lock")

rotated_path: Path | None = None

with lock_path.open("a+", encoding="utf-8") as lock_fp:
    fcntl.flock(lock_fp.fileno(), fcntl.LOCK_EX)

    if log_path.exists() and log_path.stat().st_size > max_bytes:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        nano = f"{time.time_ns() % 1_000_000_000:09d}"
        base = Path(f"{log_path}.{stamp}{nano}Z.{os.getpid()}")
        rotated_path = base
        idx = 1
        while rotated_path.exists():
            rotated_path = Path(f"{base}.{idx}")
            idx += 1

        log_path.rename(rotated_path)
        if compress:
            gz_path = Path(str(rotated_path) + ".gz")
            with rotated_path.open("rb") as src, gzip.open(gz_path, "wb") as dst:
                dst.writelines(src)
            rotated_path.unlink()
            rotated_path = gz_path

        log_path.touch()

    rotated_files = sorted(
        log_path.parent.glob(log_path.name + ".20*Z*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    for stale in rotated_files[keep:]:
        try:
            stale.unlink()
        except FileNotFoundError:
            pass

    if max_age_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        for candidate in rotated_files[:keep]:
            try:
                mtime = datetime.fromtimestamp(candidate.stat().st_mtime, tz=timezone.utc)
            except FileNotFoundError:
                continue
            if mtime < cutoff:
                try:
                    candidate.unlink()
                except FileNotFoundError:
                    pass

if not quiet and rotated_path is not None:
    print(f"Rotated frontend preflight log: {rotated_path}")
PY
