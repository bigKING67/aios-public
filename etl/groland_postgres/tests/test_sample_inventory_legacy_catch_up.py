from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sample_inventory.catch_up_legacy import (  # noqa: E402
  READONLY_ACK,
  WRITE_ACK,
  GitState,
  database_identity_sha256,
  validate_apply_guard,
  validate_database_verify_guard,
)
from sample_inventory.legacy_catch_up_database import verify_catch_up_database_state  # noqa: E402
from sample_inventory.legacy_model import LegacyValidationError  # noqa: E402


def apply_args() -> argparse.Namespace:
  return argparse.Namespace(
    confirm_catch_up=True,
    expected_git_sha="a" * 40,
    expected_db_name="sample_inventory_fixture",
    expected_db_identity_sha256="b" * 64,
    expected_baseline_batch_id=1,
    expected_overlay_sha256="c" * 64,
  )


def clean_git_state() -> GitState:
  return GitState(
    branch="main",
    head="a" * 40,
    origin_main="a" * 40,
    dirty=False,
  )


def test_database_identity_hash_is_stable_and_field_delimited() -> None:
  assert database_identity_sha256("database", "127.0.0.1", "5432") == database_identity_sha256(
    "database", "127.0.0.1", "5432"
  )
  assert database_identity_sha256("database1", "27.0.0.1", "5432") != database_identity_sha256(
    "database", "127.0.0.1", "5432"
  )


def test_apply_guard_rejects_before_database_driver_use(monkeypatch: pytest.MonkeyPatch) -> None:
  args = apply_args()
  args.confirm_catch_up = False
  monkeypatch.delenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_WRITE_ACK", raising=False)
  monkeypatch.delenv("DATABASE_URL", raising=False)

  with pytest.raises(LegacyValidationError, match="confirm-catch-up"):
    validate_apply_guard(args, git_state=clean_git_state())


def test_apply_guard_requires_clean_git_database_and_baseline_pins(monkeypatch: pytest.MonkeyPatch) -> None:
  args = apply_args()
  monkeypatch.setenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_WRITE_ACK", WRITE_ACK)
  monkeypatch.setenv("DATABASE_URL", "postgresql://fixture.invalid/sample_inventory_fixture")

  assert validate_apply_guard(args, git_state=clean_git_state()).endswith("/sample_inventory_fixture")

  with pytest.raises(LegacyValidationError, match="clean main"):
    validate_apply_guard(args, git_state=GitState(**{**clean_git_state().__dict__, "dirty": True}))

  args.expected_baseline_batch_id = 0
  with pytest.raises(LegacyValidationError, match="baseline-batch-id"):
    validate_apply_guard(args, git_state=clean_git_state())


def test_apply_guard_requires_exact_overlay_pin(monkeypatch: pytest.MonkeyPatch) -> None:
  args = apply_args()
  args.expected_overlay_sha256 = None
  monkeypatch.setenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_WRITE_ACK", WRITE_ACK)
  monkeypatch.setenv("DATABASE_URL", "postgresql://fixture.invalid/sample_inventory_fixture")

  with pytest.raises(LegacyValidationError, match="expected-overlay-sha256"):
    validate_apply_guard(args, git_state=clean_git_state())


def test_database_verify_guard_requires_readonly_ack_and_identity(monkeypatch: pytest.MonkeyPatch) -> None:
  args = apply_args()
  monkeypatch.setenv("DATABASE_URL", "postgresql://fixture.invalid/sample_inventory_fixture")
  monkeypatch.delenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_ALLOW_LIVE_READONLY", raising=False)

  with pytest.raises(LegacyValidationError, match="ALLOW_LIVE_READONLY"):
    validate_database_verify_guard(args)

  monkeypatch.setenv("AIOS_SAMPLE_INVENTORY_CATCH_UP_ALLOW_LIVE_READONLY", READONLY_ACK)
  assert validate_database_verify_guard(args).endswith("/sample_inventory_fixture")


def test_database_verifier_rejects_invalid_overlay_hash_before_querying() -> None:
  class NoQueryCursor:
    def execute(self, *_args: object, **_kwargs: object) -> None:
      raise AssertionError("invalid overlay hash must fail before database access")

  with pytest.raises(LegacyValidationError, match="overlay SHA-256 is invalid"):
    verify_catch_up_database_state(
      NoQueryCursor(),
      plan=None,  # type: ignore[arg-type]
      expected_baseline_batch_id=1,
      expected_overlay_sha256="ABC",
      lock_rows=False,
    )
