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
class QianchuanAllDomainPerformanceRefreshResult:
  asset_id: Optional[str]
  start_date: Optional[str]
  end_date: Optional[str]
  dry_run: bool = False
  product_daily_rows: int = 0
  live_daily_rows: int = 0
  live_acceptance_rows: int = 0
  summary_rows: int = 0
  thin_projection_rows: int = 0

  def to_dict(self) -> dict:
    return {
      "assetId": self.asset_id,
      "startDate": self.start_date,
      "endDate": self.end_date,
      "dryRun": self.dry_run,
      "productDailyRows": self.product_daily_rows,
      "liveDailyRows": self.live_daily_rows,
      "liveAcceptanceRows": self.live_acceptance_rows,
      "summaryRows": self.summary_rows,
      "thinProjectionRows": self.thin_projection_rows,
    }


def refresh_qianchuan_all_domain_performance(
  *,
  asset_id: str | None = None,
  start_date: str | None = None,
  end_date: str | None = None,
  dry_run: bool = False,
) -> QianchuanAllDomainPerformanceRefreshResult:
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
          product_daily_rows,
          live_daily_rows,
          live_acceptance_rows,
          summary_rows,
          thin_projection_rows
        FROM ads.refresh_marketing_content_qianchuan_all_domain_performance(%s, %s, %s)
        """,
        (normalized_asset_id, normalized_start_date, normalized_end_date),
      )
      row = cur.fetchone() or {}
    if dry_run:
      conn.rollback()
    else:
      conn.commit()

  return QianchuanAllDomainPerformanceRefreshResult(
    asset_id=str(normalized_asset_id) if normalized_asset_id else None,
    start_date=normalized_start_date,
    end_date=normalized_end_date,
    dry_run=dry_run,
    product_daily_rows=int(row.get("product_daily_rows") or 0),
    live_daily_rows=int(row.get("live_daily_rows") or 0),
    live_acceptance_rows=int(row.get("live_acceptance_rows") or 0),
    summary_rows=int(row.get("summary_rows") or 0),
    thin_projection_rows=int(row.get("thin_projection_rows") or 0),
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
  parser = argparse.ArgumentParser(description="刷新千川全域素材表现快照与诊断基础数据")
  parser.add_argument("--asset-id", default="", help="可选：只刷新单条内容资产 UUID")
  parser.add_argument("--start-date", default="", help="可选：刷新起始日期 YYYY-MM-DD")
  parser.add_argument("--end-date", default="", help="可选：刷新结束日期 YYYY-MM-DD")
  parser.add_argument("--dry-run", action="store_true", help="执行并回滚，用于校验影响行数")
  return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = build_arg_parser()
  args = parser.parse_args(argv)
  result = refresh_qianchuan_all_domain_performance(
    asset_id=args.asset_id or None,
    start_date=args.start_date or None,
    end_date=args.end_date or None,
    dry_run=args.dry_run,
  ).to_dict()
  print(json.dumps(result, ensure_ascii=False, indent=2))
  return 0
