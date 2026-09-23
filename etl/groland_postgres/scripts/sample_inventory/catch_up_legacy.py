#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
  sys.path.insert(0, str(SCRIPT_ROOT))

from sample_inventory.legacy_catch_up_database import (  # noqa: E402
  LegacyCatchUpResult,
  import_chained_catch_up_in_transaction,
  import_catch_up_in_transaction,
  verify_chained_catch_up_database_state,
  verify_catch_up_database_state,
)
from sample_inventory.legacy_delta import (  # noqa: E402
  LegacyCatchUpPlan,
  build_legacy_catch_up_plan,
  validate_catch_up_cutover,
)
from sample_inventory.legacy_model import (  # noqa: E402
  LegacyValidationError,
  SHANGHAI_TZ,
  SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  load_legacy_import_plan,
)


WRITE_ACK = "catch-up-sample-inventory-v1"
READONLY_ACK = "1"
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
GIT_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


@dataclass(frozen=True)
class GitState:
  branch: str
  head: str
  origin_main: str
  dirty: bool


@dataclass(frozen=True)
class ChainedCatchUpPlans:
  parent_cumulative: LegacyCatchUpPlan
  cumulative: LegacyCatchUpPlan
  stage: LegacyCatchUpPlan
  expected_parent_batch_id: int


def parse_cutover_at(value: str) -> datetime:
  try:
    parsed = datetime.fromisoformat(value)
  except ValueError as error:
    raise argparse.ArgumentTypeError("cutover-at must be an ISO-8601 timestamp") from error
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=SHANGHAI_TZ)
  return parsed


def _git(repo_root: Path, *args: str) -> str:
  result = subprocess.run(
    ["git", *args],
    cwd=repo_root,
    check=True,
    capture_output=True,
    text=True,
  )
  return result.stdout.strip()


def read_git_state(repo_root: Path) -> GitState:
  return GitState(
    branch=_git(repo_root, "branch", "--show-current"),
    head=_git(repo_root, "rev-parse", "HEAD"),
    origin_main=_git(repo_root, "rev-parse", "origin/main"),
    dirty=bool(_git(repo_root, "status", "--porcelain=v1")),
  )


def database_identity_sha256(database_name: str, server_address: str, server_port: str) -> str:
  return hashlib.sha256(f"{database_name}\0{server_address}\0{server_port}".encode("utf-8")).hexdigest()


def validate_apply_guard(args: argparse.Namespace, *, git_state: GitState) -> str:
  if not args.confirm_catch_up:
    raise LegacyValidationError("--apply requires --confirm-catch-up")
  if os.environ.get("AIOS_SAMPLE_INVENTORY_CATCH_UP_WRITE_ACK") != WRITE_ACK:
    raise LegacyValidationError(
      "AIOS_SAMPLE_INVENTORY_CATCH_UP_WRITE_ACK must equal catch-up-sample-inventory-v1"
    )
  expected_git_sha = (args.expected_git_sha or "").strip()
  if not GIT_SHA_PATTERN.fullmatch(expected_git_sha):
    raise LegacyValidationError("--apply requires a valid --expected-git-sha")
  if git_state.branch != "main" or git_state.dirty:
    raise LegacyValidationError("--apply requires a clean main worktree")
  if git_state.head != expected_git_sha or git_state.origin_main != expected_git_sha:
    raise LegacyValidationError("Git HEAD, origin/main, and expected SHA must match")
  expected_db_name = (args.expected_db_name or "").strip()
  if not expected_db_name:
    raise LegacyValidationError("--apply requires --expected-db-name")
  expected_identity_sha256 = (args.expected_db_identity_sha256 or "").strip()
  if not SHA256_PATTERN.fullmatch(expected_identity_sha256):
    raise LegacyValidationError("--apply requires a valid --expected-db-identity-sha256")
  if not isinstance(args.expected_baseline_batch_id, int) or args.expected_baseline_batch_id <= 0:
    raise LegacyValidationError("--apply requires a positive --expected-baseline-batch-id")
  if getattr(args, "parent_input", None) is not None and (
    not isinstance(getattr(args, "expected_parent_batch_id", None), int)
    or args.expected_parent_batch_id <= 0
  ):
    raise LegacyValidationError("chained --apply requires a positive --expected-parent-batch-id")
  expected_overlay_sha256 = (args.expected_overlay_sha256 or "").strip()
  if not SHA256_PATTERN.fullmatch(expected_overlay_sha256):
    raise LegacyValidationError("--apply requires a valid --expected-overlay-sha256")
  database_url = os.environ.get("DATABASE_URL", "").strip()
  if not database_url:
    raise LegacyValidationError("DATABASE_URL is required for --apply")
  return database_url


def validate_database_verify_guard(args: argparse.Namespace) -> str:
  if os.environ.get("AIOS_SAMPLE_INVENTORY_CATCH_UP_ALLOW_LIVE_READONLY") != READONLY_ACK:
    raise LegacyValidationError(
      "--verify-database requires AIOS_SAMPLE_INVENTORY_CATCH_UP_ALLOW_LIVE_READONLY=1"
    )
  if not (args.expected_db_name or "").strip():
    raise LegacyValidationError("--verify-database requires --expected-db-name")
  if not SHA256_PATTERN.fullmatch((args.expected_db_identity_sha256 or "").strip()):
    raise LegacyValidationError("--verify-database requires a valid --expected-db-identity-sha256")
  if not isinstance(args.expected_baseline_batch_id, int) or args.expected_baseline_batch_id <= 0:
    raise LegacyValidationError("--verify-database requires a positive --expected-baseline-batch-id")
  if getattr(args, "parent_input", None) is not None and (
    not isinstance(getattr(args, "expected_parent_batch_id", None), int)
    or args.expected_parent_batch_id <= 0
  ):
    raise LegacyValidationError(
      "chained --verify-database requires a positive --expected-parent-batch-id"
    )
  database_url = os.environ.get("DATABASE_URL", "").strip()
  if not database_url:
    raise LegacyValidationError("DATABASE_URL is required for --verify-database")
  return database_url


def _read_database_identity(cursor: Any) -> tuple[str, str]:
  cursor.execute(
    """
    SELECT
      current_database(),
      COALESCE(inet_server_addr()::TEXT, 'local'),
      COALESCE(inet_server_port()::TEXT, 'local')
    """
  )
  database_name, server_address, server_port = (
    str(value) for value in cursor.fetchone()
  )
  return database_name, database_identity_sha256(database_name, server_address, server_port)


def verify_catch_up_database(
  *,
  database_url: str,
  expected_database_name: str,
  expected_database_identity_sha256: str,
  expected_baseline_batch_id: int,
  plan: LegacyCatchUpPlan,
) -> dict[str, object]:
  import psycopg2

  connection = psycopg2.connect(database_url, connect_timeout=10)
  try:
    connection.set_session(isolation_level="SERIALIZABLE", readonly=True, autocommit=False)
    with connection.cursor() as cursor:
      cursor.execute("SET LOCAL lock_timeout = '1s'")
      cursor.execute("SET LOCAL statement_timeout = '30s'")
      database_name, identity_sha256 = _read_database_identity(cursor)
      if database_name != expected_database_name or identity_sha256 != expected_database_identity_sha256:
        raise LegacyValidationError("database identity differs from the explicit verified pin")
      cursor.execute("SHOW transaction_read_only")
      if str(cursor.fetchone()[0]) != "on":
        raise LegacyValidationError("database verification transaction is not read-only")
      cursor.execute("SELECT txid_current_if_assigned()::TEXT")
      if cursor.fetchone()[0] is not None:
        raise LegacyValidationError("database verification assigned a transaction ID before inspection")
      _, existing_batch_id, overlay = verify_catch_up_database_state(
        cursor,
        plan=plan,
        expected_baseline_batch_id=expected_baseline_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
      cursor.execute("SELECT txid_current_if_assigned()::TEXT")
      if cursor.fetchone()[0] is not None:
        raise LegacyValidationError("database verification unexpectedly assigned a transaction ID")
    connection.rollback()
    return {
      "status": "already_applied" if existing_batch_id is not None else "ready_for_apply",
      "databaseName": database_name,
      "databaseIdentitySha256": identity_sha256,
      "overlay": overlay.summary,
      "policy": {
        "databaseWrites": False,
        "transactionIdAssigned": False,
        "rolledBack": True,
        "businessRowsEmitted": False,
      },
    }
  except Exception:
    connection.rollback()
    raise
  finally:
    connection.close()


def verify_chained_catch_up_database(
  *,
  database_url: str,
  expected_database_name: str,
  expected_database_identity_sha256: str,
  expected_baseline_batch_id: int,
  plans: ChainedCatchUpPlans,
) -> dict[str, object]:
  import psycopg2

  connection = psycopg2.connect(database_url, connect_timeout=10)
  try:
    connection.set_session(isolation_level="SERIALIZABLE", readonly=True, autocommit=False)
    with connection.cursor() as cursor:
      cursor.execute("SET LOCAL lock_timeout = '1s'")
      cursor.execute("SET LOCAL statement_timeout = '30s'")
      database_name, identity_sha256 = _read_database_identity(cursor)
      if database_name != expected_database_name or identity_sha256 != expected_database_identity_sha256:
        raise LegacyValidationError("database identity differs from the explicit verified pin")
      cursor.execute("SHOW transaction_read_only")
      if str(cursor.fetchone()[0]) != "on":
        raise LegacyValidationError("database verification transaction is not read-only")
      cursor.execute("SELECT txid_current_if_assigned()::TEXT")
      if cursor.fetchone()[0] is not None:
        raise LegacyValidationError("database verification assigned a transaction ID before inspection")
      _, existing_batch_id, overlay = verify_chained_catch_up_database_state(
        cursor,
        parent_cumulative_plan=plans.parent_cumulative,
        cumulative_plan=plans.cumulative,
        stage_plan=plans.stage,
        expected_baseline_batch_id=expected_baseline_batch_id,
        expected_parent_batch_id=plans.expected_parent_batch_id,
        expected_overlay_sha256=None,
        lock_rows=False,
      )
      cursor.execute("SELECT txid_current_if_assigned()::TEXT")
      if cursor.fetchone()[0] is not None:
        raise LegacyValidationError("database verification unexpectedly assigned a transaction ID")
    connection.rollback()
    return {
      "status": "already_applied" if existing_batch_id is not None else "ready_for_apply",
      "databaseName": database_name,
      "databaseIdentitySha256": identity_sha256,
      "parentImportBatchId": plans.expected_parent_batch_id,
      "overlay": overlay.summary,
      "policy": {
        "databaseWrites": False,
        "transactionIdAssigned": False,
        "rolledBack": True,
        "businessRowsEmitted": False,
      },
    }
  except Exception:
    connection.rollback()
    raise
  finally:
    connection.close()


def apply_catch_up(
  *,
  database_url: str,
  expected_database_name: str,
  expected_database_identity_sha256: str,
  expected_baseline_batch_id: int,
  expected_overlay_sha256: str,
  plan: LegacyCatchUpPlan,
  source_git_sha: str,
  cutover_at: datetime,
) -> LegacyCatchUpResult:
  import psycopg2

  connection = psycopg2.connect(database_url, connect_timeout=10)
  try:
    connection.set_session(isolation_level="SERIALIZABLE", readonly=False, autocommit=False)
    with connection.cursor() as cursor:
      cursor.execute("SET LOCAL lock_timeout = '10s'")
      cursor.execute("SET LOCAL statement_timeout = '120s'")
      database_name, identity_sha256 = _read_database_identity(cursor)
      if database_name != expected_database_name or identity_sha256 != expected_database_identity_sha256:
        raise LegacyValidationError("database identity differs from the explicit verified pin")
      result = import_catch_up_in_transaction(
        cursor,
        plan=plan,
        source_git_sha=source_git_sha,
        cutover_at=cutover_at,
        expected_baseline_batch_id=expected_baseline_batch_id,
        expected_overlay_sha256=expected_overlay_sha256,
      )
    connection.commit()
    return result
  except Exception:
    connection.rollback()
    raise
  finally:
    connection.close()


def apply_chained_catch_up(
  *,
  database_url: str,
  expected_database_name: str,
  expected_database_identity_sha256: str,
  expected_baseline_batch_id: int,
  expected_overlay_sha256: str,
  plans: ChainedCatchUpPlans,
  source_git_sha: str,
  cutover_at: datetime,
) -> LegacyCatchUpResult:
  import psycopg2

  connection = psycopg2.connect(database_url, connect_timeout=10)
  try:
    connection.set_session(isolation_level="SERIALIZABLE", readonly=False, autocommit=False)
    with connection.cursor() as cursor:
      cursor.execute("SET LOCAL lock_timeout = '10s'")
      cursor.execute("SET LOCAL statement_timeout = '120s'")
      database_name, identity_sha256 = _read_database_identity(cursor)
      if database_name != expected_database_name or identity_sha256 != expected_database_identity_sha256:
        raise LegacyValidationError("database identity differs from the explicit verified pin")
      result = import_chained_catch_up_in_transaction(
        cursor,
        parent_cumulative_plan=plans.parent_cumulative,
        cumulative_plan=plans.cumulative,
        stage_plan=plans.stage,
        source_git_sha=source_git_sha,
        cutover_at=cutover_at,
        expected_baseline_batch_id=expected_baseline_batch_id,
        expected_parent_batch_id=plans.expected_parent_batch_id,
        expected_overlay_sha256=expected_overlay_sha256,
      )
    connection.commit()
    return result
  except Exception:
    connection.rollback()
    raise
  finally:
    connection.close()


def build_chained_plans(
  args: argparse.Namespace,
  *,
  baseline: Any,
  final: Any,
) -> ChainedCatchUpPlans | None:
  chain_values = (
    args.parent_input,
    args.expected_parent_sha256,
    args.expected_parent_batch_id,
  )
  if all(value is None for value in chain_values):
    return None
  if any(value is None for value in chain_values):
    raise LegacyValidationError(
      "chained catch-up requires --parent-input, --expected-parent-sha256, and --expected-parent-batch-id"
    )
  if not isinstance(args.expected_parent_batch_id, int) or args.expected_parent_batch_id <= 0:
    raise LegacyValidationError("chained catch-up requires a positive --expected-parent-batch-id")
  parent = load_legacy_import_plan(
    args.parent_input,
    args.expected_parent_sha256,
    supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
  )
  return ChainedCatchUpPlans(
    parent_cumulative=build_legacy_catch_up_plan(baseline, parent),
    cumulative=build_legacy_catch_up_plan(baseline, final),
    stage=build_legacy_catch_up_plan(parent, final),
    expected_parent_batch_id=args.expected_parent_batch_id,
  )


def chained_summary(plans: ChainedCatchUpPlans) -> dict[str, object]:
  summary: dict[str, object] = dict(plans.stage.summary)
  for key in ("finalOnHand", "finalReserved", "finalAvailable"):
    summary[key] = plans.cumulative.summary[key]
  summary["parentImportBatchId"] = plans.expected_parent_batch_id
  summary["cumulative"] = plans.cumulative.summary
  return summary


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(
    description="Validate or apply a frozen legacy sample inventory JSON delta."
  )
  parser.add_argument("--baseline-input", type=Path, required=True)
  parser.add_argument("--expected-baseline-sha256", required=True)
  parser.add_argument("--input", type=Path, required=True)
  parser.add_argument("--expected-sha256", required=True)
  parser.add_argument("--parent-input", type=Path)
  parser.add_argument("--expected-parent-sha256")
  parser.add_argument("--expected-parent-batch-id", type=int)
  parser.add_argument("--cutover-at", type=parse_cutover_at, required=True)
  mode = parser.add_mutually_exclusive_group(required=True)
  mode.add_argument("--dry-run", action="store_true")
  mode.add_argument("--verify-database", action="store_true")
  mode.add_argument("--apply", action="store_true")
  parser.add_argument("--expected-git-sha")
  parser.add_argument("--expected-db-name")
  parser.add_argument("--expected-db-identity-sha256")
  parser.add_argument("--expected-baseline-batch-id", type=int)
  parser.add_argument("--expected-overlay-sha256")
  parser.add_argument("--confirm-catch-up", action="store_true")
  return parser


def main(argv: list[str] | None = None) -> int:
  args = build_parser().parse_args(argv)
  repo_root = Path(__file__).resolve().parents[4]
  try:
    baseline = load_legacy_import_plan(args.baseline_input, args.expected_baseline_sha256)
    final = load_legacy_import_plan(
      args.input,
      args.expected_sha256,
      supported_outbound_statuses=SUPPORTED_CATCH_UP_OUTBOUND_STATUSES,
    )
    chained_plans = build_chained_plans(args, baseline=baseline, final=final)
    plan = chained_plans.stage if chained_plans is not None else build_legacy_catch_up_plan(baseline, final)
    output_summary = chained_summary(chained_plans) if chained_plans is not None else plan.summary
    validate_catch_up_cutover(plan, args.cutover_at)
    if args.dry_run:
      print(json.dumps({"mode": "dry-run", **output_summary}, ensure_ascii=False, sort_keys=True))
      return 0

    if args.verify_database:
      database_url = validate_database_verify_guard(args)
      if chained_plans is None:
        verification = verify_catch_up_database(
          database_url=database_url,
          expected_database_name=args.expected_db_name,
          expected_database_identity_sha256=args.expected_db_identity_sha256,
          expected_baseline_batch_id=args.expected_baseline_batch_id,
          plan=plan,
        )
      else:
        verification = verify_chained_catch_up_database(
          database_url=database_url,
          expected_database_name=args.expected_db_name,
          expected_database_identity_sha256=args.expected_db_identity_sha256,
          expected_baseline_batch_id=args.expected_baseline_batch_id,
          plans=chained_plans,
        )
      print(json.dumps({
        "mode": "verify-database",
        **output_summary,
        **verification,
      }, ensure_ascii=False, sort_keys=True))
      return 0

    git_state = read_git_state(repo_root)
    database_url = validate_apply_guard(args, git_state=git_state)
    if chained_plans is None:
      result = apply_catch_up(
        database_url=database_url,
        expected_database_name=args.expected_db_name,
        expected_database_identity_sha256=args.expected_db_identity_sha256,
        expected_baseline_batch_id=args.expected_baseline_batch_id,
        expected_overlay_sha256=args.expected_overlay_sha256,
        plan=plan,
        source_git_sha=git_state.head,
        cutover_at=args.cutover_at,
      )
    else:
      result = apply_chained_catch_up(
        database_url=database_url,
        expected_database_name=args.expected_db_name,
        expected_database_identity_sha256=args.expected_db_identity_sha256,
        expected_baseline_batch_id=args.expected_baseline_batch_id,
        expected_overlay_sha256=args.expected_overlay_sha256,
        plans=chained_plans,
        source_git_sha=git_state.head,
        cutover_at=args.cutover_at,
      )
    print(
      json.dumps(
        {
          "mode": "apply",
          "status": result.status,
          "importBatchId": result.import_batch_id,
          "overlaySha256": result.overlay_sha256,
          **output_summary,
        },
        ensure_ascii=False,
        sort_keys=True,
      )
    )
    return 0
  except (LegacyValidationError, OSError, subprocess.SubprocessError) as error:
    print(f"sample inventory catch-up rejected: {error}", file=sys.stderr)
    return 2
  except Exception as error:
    print(f"sample inventory catch-up failed: {error.__class__.__name__}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
