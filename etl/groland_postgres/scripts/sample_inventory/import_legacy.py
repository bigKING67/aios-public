#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
  sys.path.insert(0, str(SCRIPT_ROOT))

from sample_inventory.legacy_database import import_plan_in_transaction
from sample_inventory.legacy_model import (
  LegacyValidationError,
  SHANGHAI_TZ,
  load_legacy_import_plan,
)


WRITE_ACK = "import-sample-inventory-v1"


def parse_cutover_at(value: str) -> datetime:
  try:
    parsed = datetime.fromisoformat(value)
  except ValueError as error:
    raise argparse.ArgumentTypeError("cutover-at must be an ISO-8601 timestamp") from error
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=SHANGHAI_TZ)
  return parsed


def current_git_sha(repo_root: Path) -> str:
  result = subprocess.run(
    ["git", "rev-parse", "HEAD"],
    cwd=repo_root,
    check=True,
    capture_output=True,
    text=True,
  )
  return result.stdout.strip()


def validate_apply_guard(args: argparse.Namespace, *, actual_git_sha: str) -> str:
  if not args.confirm_import:
    raise LegacyValidationError("--apply requires --confirm-import")
  if os.environ.get("AIOS_SAMPLE_INVENTORY_IMPORT_WRITE_ACK") != WRITE_ACK:
    raise LegacyValidationError(
      "AIOS_SAMPLE_INVENTORY_IMPORT_WRITE_ACK must equal import-sample-inventory-v1"
    )
  expected_git_sha = (args.expected_git_sha or "").strip()
  if not expected_git_sha:
    raise LegacyValidationError("--apply requires --expected-git-sha")
  if expected_git_sha != actual_git_sha:
    raise LegacyValidationError(
      f"Git SHA mismatch: expected {expected_git_sha}, got {actual_git_sha}"
    )
  expected_db_name = (args.expected_db_name or "").strip()
  if not expected_db_name:
    raise LegacyValidationError("--apply requires --expected-db-name")
  database_url = os.environ.get("DATABASE_URL", "").strip()
  if not database_url:
    raise LegacyValidationError("DATABASE_URL is required for --apply")
  return database_url


def _redacted_database_target(database_url: str) -> str:
  parsed = urlparse(database_url)
  database_name = parsed.path.lstrip("/") or "unknown"
  host = parsed.hostname or "unknown"
  port = parsed.port or 5432
  return f"{host}:{port}/{database_name}"


def apply_import(
  *,
  database_url: str,
  expected_db_name: str,
  plan: object,
  git_sha: str,
  cutover_at: datetime,
) -> int:
  import psycopg2

  connection = psycopg2.connect(database_url, connect_timeout=10)
  try:
    connection.autocommit = False
    with connection.cursor() as cursor:
      cursor.execute("SET LOCAL lock_timeout = '10s'")
      cursor.execute("SET LOCAL statement_timeout = '120s'")
      cursor.execute("SELECT current_database()")
      actual_db_name = str(cursor.fetchone()[0])
      if actual_db_name != expected_db_name:
        raise LegacyValidationError(
          f"database name mismatch: expected {expected_db_name}, got {actual_db_name}"
        )
      batch_id = import_plan_in_transaction(
        cursor,
        plan=plan,
        source_git_sha=git_sha,
        cutover_at=cutover_at,
      )
    connection.commit()
    return batch_id
  except Exception:
    connection.rollback()
    raise
  finally:
    connection.close()


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(
    description="Validate or import the legacy sample inventory JSON snapshot."
  )
  parser.add_argument("--input", type=Path, required=True)
  parser.add_argument("--expected-sha256", required=True)
  parser.add_argument("--expected-git-sha")
  parser.add_argument("--expected-db-name")
  parser.add_argument("--cutover-at", type=parse_cutover_at, required=True)
  mode = parser.add_mutually_exclusive_group(required=True)
  mode.add_argument("--dry-run", action="store_true")
  mode.add_argument("--apply", action="store_true")
  parser.add_argument("--confirm-import", action="store_true")
  return parser


def main(argv: list[str] | None = None) -> int:
  args = build_parser().parse_args(argv)
  repo_root = Path(__file__).resolve().parents[4]
  try:
    plan = load_legacy_import_plan(args.input, args.expected_sha256)
    if args.dry_run:
      print(json.dumps({"mode": "dry-run", **plan.summary}, ensure_ascii=False, sort_keys=True))
      return 0

    git_sha = current_git_sha(repo_root)
    database_url = validate_apply_guard(args, actual_git_sha=git_sha)
    print(
      json.dumps(
        {
          "mode": "apply",
          "target": _redacted_database_target(database_url),
          "expectedDatabase": args.expected_db_name,
          "sourceSha256": plan.source_sha256,
          "gitSha": git_sha,
        },
        ensure_ascii=False,
        sort_keys=True,
      )
    )
    batch_id = apply_import(
      database_url=database_url,
      expected_db_name=args.expected_db_name,
      plan=plan,
      git_sha=git_sha,
      cutover_at=args.cutover_at,
    )
    print(json.dumps({"status": "succeeded", "importBatchId": batch_id}, sort_keys=True))
    return 0
  except (LegacyValidationError, OSError, subprocess.SubprocessError) as error:
    print(f"sample inventory import rejected: {error}", file=sys.stderr)
    return 2
  except Exception as error:
    print(f"sample inventory import failed: {error.__class__.__name__}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
