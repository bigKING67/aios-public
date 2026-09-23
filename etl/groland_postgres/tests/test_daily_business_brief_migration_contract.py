from __future__ import annotations

import sys
from pathlib import Path


ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))

from daily_business_brief.repository import PostgresBriefRepository  # noqa: E402


MIGRATION = (
  ETL_ROOT
  / "sql"
  / "migrations"
  / "20260825_1200__create_daily_business_brief_delivery_ledger.sql"
)


def test_delivery_ledger_migration_has_at_most_once_production_contract() -> None:
  sql = MIGRATION.read_text(encoding="utf-8")

  assert "CREATE TABLE IF NOT EXISTS dataops.daily_business_brief_deliveries" in sql
  assert "delivery_channel IN ('test', 'production')" in sql
  assert "status IN ('sending', 'sent', 'failed', 'uncertain')" in sql
  assert "uq_daily_business_brief_production_date" in sql
  assert "WHERE delivery_channel = 'production'" in sql
  assert "attempt_count >= 1" in sql
  assert "status = 'sending' AND completed_at IS NULL" in sql
  assert "status <> 'sending' AND completed_at IS NOT NULL" in sql


def test_repository_reservation_matches_partial_unique_index_inference() -> None:
  import inspect

  source = inspect.getsource(PostgresBriefRepository.reserve_production)

  assert "ON CONFLICT (brief_date)" in source
  assert "WHERE delivery_channel = 'production'" in source
  assert "DO NOTHING" in source
  assert "FOR UPDATE" in source


def test_repository_only_retries_definite_failed_production_rows() -> None:
  import inspect

  source = inspect.getsource(PostgresBriefRepository._reuse_or_block_production)

  assert "status is not DeliveryStatus.FAILED" in source
  assert "status = 'sending'" in source
  assert "attempt_count = attempt_count + 1" in source
  assert "completed_at = NULL" in source
