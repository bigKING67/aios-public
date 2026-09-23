from __future__ import annotations

import argparse
import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Sequence

import psycopg2.extras

from .repository import connect_pg


@dataclass
class PerformanceRollupResult:
  start_date: Optional[str]
  end_date: Optional[str]
  dry_run: bool = False
  asset_id: Optional[str] = None
  daily_upserted_rows: int = 0
  lifetime_upserted_rows: int = 0
  asset_snapshot_updated_rows: int = 0
  first_stat_date: Optional[str] = None
  last_stat_date: Optional[str] = None

  def to_dict(self) -> dict:
    return {
      "assetId": self.asset_id,
      "startDate": self.start_date,
      "endDate": self.end_date,
      "dryRun": self.dry_run,
      "dailyUpsertedRows": self.daily_upserted_rows,
      "lifetimeUpsertedRows": self.lifetime_upserted_rows,
      "assetSnapshotUpdatedRows": self.asset_snapshot_updated_rows,
      "firstStatDate": self.first_stat_date,
      "lastStatDate": self.last_stat_date,
    }


def refresh_marketing_content_performance_rollups(
  *,
  asset_id: str | None = None,
  start_date: str | None = None,
  end_date: str | None = None,
  dry_run: bool = False,
) -> PerformanceRollupResult:
  normalized_asset_id = _normalize_uuid(asset_id)
  normalized_start_date = _normalize_date(start_date)
  normalized_end_date = _normalize_date(end_date)
  if normalized_start_date and normalized_end_date and normalized_start_date > normalized_end_date:
    raise ValueError("--start-date cannot be later than --end-date")

  with connect_pg() as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      cur.execute(
        """
        SELECT
          daily_rows,
          lifetime_rows,
          asset_snapshot_rows,
          first_stat_date::TEXT AS first_stat_date,
          last_stat_date::TEXT AS last_stat_date
        FROM ads.refresh_marketing_content_asset_performance(%s, %s, %s)
        """,
        (normalized_asset_id, normalized_start_date, normalized_end_date),
      )
      row = cur.fetchone() or {}
    if dry_run:
      conn.rollback()
    else:
      conn.commit()

  return PerformanceRollupResult(
    asset_id=str(normalized_asset_id) if normalized_asset_id else None,
    start_date=normalized_start_date,
    end_date=normalized_end_date,
    dry_run=dry_run,
    daily_upserted_rows=int(row.get("daily_rows") or 0),
    lifetime_upserted_rows=int(row.get("lifetime_rows") or 0),
    asset_snapshot_updated_rows=int(row.get("asset_snapshot_rows") or 0),
    first_stat_date=row.get("first_stat_date"),
    last_stat_date=row.get("last_stat_date"),
  )


def _normalize_uuid(value: str | None) -> Optional[uuid.UUID]:
  if value is None:
    return None
  normalized = value.strip()
  if not normalized:
    return None
  try:
    return uuid.UUID(normalized)
  except ValueError as error:
    raise ValueError(f"asset_id 不是合法 UUID: {value}") from error


def _normalize_date(value: str | None) -> Optional[str]:
  if value is None:
    return None
  normalized = value.strip()
  if not normalized:
    return None
  try:
    return datetime.strptime(normalized, "%Y-%m-%d").date().isoformat()
  except ValueError as error:
    raise ValueError(f"日期格式应为 YYYY-MM-DD: {value}") from error


def build_arg_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="刷新内容资产表现 DWS 汇总和 ADS 快照")
  parser.add_argument("--asset-id", default="", help="可选：只刷新单条内容资产 UUID")
  parser.add_argument("--start-date", default="", help="可选：刷新起始日期 YYYY-MM-DD")
  parser.add_argument("--end-date", default="", help="可选：刷新结束日期 YYYY-MM-DD")
  parser.add_argument("--dry-run", action="store_true", help="执行并回滚，用于校验影响行数")
  return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = build_arg_parser()
  args = parser.parse_args(argv)
  result = refresh_marketing_content_performance_rollups(
    asset_id=args.asset_id or None,
    start_date=args.start_date or None,
    end_date=args.end_date or None,
    dry_run=args.dry_run,
  ).to_dict()
  print(json.dumps(result, ensure_ascii=False, indent=2))
  return 0
