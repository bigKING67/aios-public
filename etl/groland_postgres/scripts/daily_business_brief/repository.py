from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Dict, Mapping, Sequence

import psycopg2
from psycopg2.extras import RealDictCursor

from prefect_ops_utils import _resolve_pg_connection_config

from .models import (
  BriefRecord,
  DeliveryOutcome,
  DeliveryReservation,
  DeliveryStatus,
  ReadinessIssue,
  SUPPORTED_PLATFORMS,
)


ConnectionFactory = Callable[[], Any]


@dataclass(frozen=True)
class SourceTableConfig:
  table_name: str
  date_column: str
  gmv_column: str
  shop_id_column: str = "shop_id"
  filters: tuple[tuple[str, Any], ...] = ()


SOURCE_TABLES: Mapping[str, SourceTableConfig] = {
  "douyin": SourceTableConfig(
    "ods.douyin_trade_sale_raw",
    "stat_date",
    "trade_amount",
    filters=(("carrier_type", "全部"), ("promotion_period", "不限")),
  ),
  "taobao": SourceTableConfig(
    "ods.taobao_trade_sale_raw",
    "stat_date",
    "pay_amount",
  ),
  "wx": SourceTableConfig(
    "ods.wx_trade_sale_raw",
    "stat_date",
    "total_deal_amount",
  ),
  "xhs": SourceTableConfig(
    "ods.xhs_trade_sale_raw",
    "stat_date",
    "pay_amount",
  ),
  "jd": SourceTableConfig("ods.jd_trade_sale_raw", "stat_date", "gmv"),
}


def default_connection_factory():
  host, port, user, password, database = _resolve_pg_connection_config()
  return psycopg2.connect(
    host=host,
    port=port,
    user=user,
    password=password,
    dbname=database,
    connect_timeout=20,
  )


def _to_float(value: Any) -> float:
  if value is None:
    return 0.0
  if isinstance(value, (int, float, Decimal)):
    return float(value)
  return float(str(value))


def _to_date(value: Any) -> date:
  if isinstance(value, datetime):
    return value.date()
  if isinstance(value, date):
    return value
  return date.fromisoformat(str(value))


def normalize_overview_row(row: Mapping[str, Any]) -> BriefRecord:
  return BriefRecord(
    record_date=_to_date(row["date"]),
    platform=str(row.get("platform") or "").strip().lower(),
    gmv=_to_float(row.get("gmv")),
    gsv=_to_float(row.get("gsv")),
    refund_amount_pay_time=_to_float(row.get("refund_amount_pay_time")),
    order_count=_to_float(row.get("order_count")),
  )


class PostgresBriefRepository:
  def __init__(self, connection_factory: ConnectionFactory = default_connection_factory):
    self._connection_factory = connection_factory

  def fetch_records(
    self,
    *,
    start_date: date,
    end_date: date,
  ) -> list[BriefRecord]:
    connection = self._connection_factory()
    try:
      with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
          """
          SELECT
            "date" AS date,
            platform,
            gmv,
            gsv,
            order_count,
            refund_amount_pay_time
          FROM ads.all_trade_overview
          WHERE "date" BETWEEN %s AND %s
            AND platform = ANY(%s)
          ORDER BY "date" ASC, platform ASC
          """,
          (start_date, end_date, list(SUPPORTED_PLATFORMS)),
        )
        rows = cursor.fetchall()
      connection.rollback()
      return [normalize_overview_row(row) for row in rows]
    finally:
      connection.close()

  def find_readiness_issues(
    self,
    *,
    target_date: date,
    records: Sequence[BriefRecord],
    required_shop_ids_by_platform: Mapping[str, Sequence[str]],
  ) -> list[ReadinessIssue]:
    target_records = [
      record for record in records if record.record_date == target_date
    ]
    by_platform = {record.platform: record for record in target_records}
    connection = self._connection_factory()
    try:
      issues: list[ReadinessIssue] = []
      with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        for platform in SUPPORTED_PLATFORMS:
          record = by_platform.get(platform)
          if record is None or record.gmv <= 0:
            issues.extend(
              self._classify_platform_readiness(
                cursor=cursor,
                platform=platform,
                target_date=target_date,
                ads_record=record,
              )
            )

        for platform, configured_ids in required_shop_ids_by_platform.items():
          normalized_platform = str(platform).strip().lower()
          source = SOURCE_TABLES.get(normalized_platform)
          expected_ids = {
            str(shop_id).strip()
            for shop_id in configured_ids
            if str(shop_id or "").strip()
          }
          if source is None or not expected_ids:
            continue
          present_ids = self._query_source_shop_ids(
            cursor,
            source,
            target_date,
          )
          missing_ids = tuple(sorted(expected_ids - present_ids))
          if missing_ids:
            issues.append(ReadinessIssue(
              platform=normalized_platform,
              issue_type="source_shop_missing",
              source_table=source.table_name,
              missing_shop_ids=missing_ids,
              message=(
                f"{source.table_name} platform={normalized_platform} "
                f"date={target_date} missing_shop_ids={','.join(missing_ids)}"
              ),
            ))
      connection.rollback()
      return issues
    finally:
      connection.close()

  def _classify_platform_readiness(
    self,
    *,
    cursor: Any,
    platform: str,
    target_date: date,
    ads_record: BriefRecord | None,
  ) -> list[ReadinessIssue]:
    source = SOURCE_TABLES[platform]
    source_rows, source_gmv = self._query_source_summary(
      cursor,
      source,
      target_date,
    )
    if ads_record is None:
      if source_rows <= 0:
        issue_type = "source_missing"
        message = f"{source.table_name} platform={platform} date={target_date} is missing"
      else:
        issue_type = "ads_missing"
        message = (
          f"ads.all_trade_overview platform={platform} date={target_date} is missing "
          f"while source_rows={source_rows}"
        )
      return [ReadinessIssue(
        platform=platform,
        issue_type=issue_type,
        source_table=source.table_name,
        message=message,
      )]

    if source_rows <= 0:
      return [ReadinessIssue(
        platform=platform,
        issue_type="source_missing",
        source_table=source.table_name,
        message=f"{source.table_name} platform={platform} date={target_date} is missing",
      )]
    if source_gmv > 0:
      return [ReadinessIssue(
        platform=platform,
        issue_type="ads_gmv_mismatch",
        source_table=source.table_name,
        message=(
          f"ads.all_trade_overview platform={platform} date={target_date} "
          f"gmv={ads_record.gmv:.2f} while source_gmv={source_gmv:.2f}"
        ),
      )]
    return []

  @staticmethod
  def _source_conditions(
    source: SourceTableConfig,
    target_date: date,
  ) -> tuple[str, tuple[Any, ...]]:
    conditions = [f"{source.date_column} = %s"]
    values: list[Any] = [target_date]
    for column, value in source.filters:
      conditions.append(f"{column} = %s")
      values.append(value)
    return " AND ".join(conditions), tuple(values)

  def _query_source_summary(
    self,
    cursor: Any,
    source: SourceTableConfig,
    target_date: date,
  ) -> tuple[int, float]:
    conditions, values = self._source_conditions(source, target_date)
    cursor.execute(
      f"""
      SELECT
        COUNT(*) AS row_count,
        COALESCE(SUM({source.gmv_column}), 0) AS gmv_sum
      FROM {source.table_name}
      WHERE {conditions}
      """,
      values,
    )
    row = cursor.fetchone() or {}
    return int(row.get("row_count", 0) or 0), _to_float(row.get("gmv_sum"))

  def _query_source_shop_ids(
    self,
    cursor: Any,
    source: SourceTableConfig,
    target_date: date,
  ) -> set[str]:
    conditions, values = self._source_conditions(source, target_date)
    cursor.execute(
      f"""
      SELECT DISTINCT {source.shop_id_column} AS shop_id
      FROM {source.table_name}
      WHERE {conditions}
        AND {source.shop_id_column} IS NOT NULL
      """,
      values,
    )
    return {
      str(row.get("shop_id") or "").strip()
      for row in cursor.fetchall()
      if str(row.get("shop_id") or "").strip()
    }

  def create_test_attempt(
    self,
    *,
    target_date: date,
    card_sha256: str,
    flow_run_id: str,
    flow_run_name: str,
  ) -> DeliveryReservation:
    connection = self._connection_factory()
    try:
      with connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
          cursor.execute(
            """
            INSERT INTO dataops.daily_business_brief_deliveries (
              brief_date,
              delivery_channel,
              status,
              card_sha256,
              flow_run_id,
              flow_run_name,
              attempt_count,
              started_at,
              updated_at
            )
            VALUES (%s, 'test', 'sending', %s, %s, %s, 1, NOW(), NOW())
            RETURNING id, status, attempt_count
            """,
            (target_date, card_sha256, flow_run_id or None, flow_run_name or None),
          )
          row = cursor.fetchone()
      return DeliveryReservation(
        should_send=True,
        delivery_id=int(row["id"]),
        status=DeliveryStatus(str(row["status"])),
        attempt_count=int(row["attempt_count"]),
      )
    finally:
      connection.close()

  def reserve_production(
    self,
    *,
    target_date: date,
    card_sha256: str,
    flow_run_id: str,
    flow_run_name: str,
  ) -> DeliveryReservation:
    connection = self._connection_factory()
    try:
      with connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
          cursor.execute(
            """
            SELECT id, status, attempt_count
            FROM dataops.daily_business_brief_deliveries
            WHERE brief_date = %s
              AND delivery_channel = 'production'
            FOR UPDATE
            """,
            (target_date,),
          )
          existing = cursor.fetchone()
          if existing is not None:
            return self._reuse_or_block_production(
              cursor=cursor,
              existing=existing,
              card_sha256=card_sha256,
              flow_run_id=flow_run_id,
              flow_run_name=flow_run_name,
            )

          cursor.execute(
            """
            INSERT INTO dataops.daily_business_brief_deliveries (
              brief_date,
              delivery_channel,
              status,
              card_sha256,
              flow_run_id,
              flow_run_name,
              attempt_count,
              started_at,
              updated_at
            )
            VALUES (%s, 'production', 'sending', %s, %s, %s, 1, NOW(), NOW())
            ON CONFLICT (brief_date)
              WHERE delivery_channel = 'production'
              DO NOTHING
            RETURNING id, status, attempt_count
            """,
            (target_date, card_sha256, flow_run_id or None, flow_run_name or None),
          )
          inserted = cursor.fetchone()
          if inserted is not None:
            return DeliveryReservation(
              should_send=True,
              delivery_id=int(inserted["id"]),
              status=DeliveryStatus(str(inserted["status"])),
              attempt_count=int(inserted["attempt_count"]),
            )

          cursor.execute(
            """
            SELECT id, status, attempt_count
            FROM dataops.daily_business_brief_deliveries
            WHERE brief_date = %s
              AND delivery_channel = 'production'
            """,
            (target_date,),
          )
          raced = cursor.fetchone()
          if raced is None:
            raise RuntimeError("production reservation conflict produced no ledger row")
          return DeliveryReservation(
            should_send=False,
            delivery_id=int(raced["id"]),
            status=DeliveryStatus(str(raced["status"])),
            attempt_count=int(raced["attempt_count"]),
            reason=f"production date already reserved with status={raced['status']}",
          )
    finally:
      connection.close()

  @staticmethod
  def _reuse_or_block_production(
    *,
    cursor: Any,
    existing: Mapping[str, Any],
    card_sha256: str,
    flow_run_id: str,
    flow_run_name: str,
  ) -> DeliveryReservation:
    status = DeliveryStatus(str(existing["status"]))
    if status is not DeliveryStatus.FAILED:
      return DeliveryReservation(
        should_send=False,
        delivery_id=int(existing["id"]),
        status=status,
        attempt_count=int(existing["attempt_count"]),
        reason=f"production date already reserved with status={status.value}",
      )

    cursor.execute(
      """
      UPDATE dataops.daily_business_brief_deliveries
      SET status = 'sending',
          card_sha256 = %s,
          flow_run_id = %s,
          flow_run_name = %s,
          attempt_count = attempt_count + 1,
          started_at = NOW(),
          completed_at = NULL,
          error_code = NULL,
          error_detail = NULL,
          updated_at = NOW()
      WHERE id = %s
        AND status = 'failed'
      RETURNING id, status, attempt_count
      """,
      (
        card_sha256,
        flow_run_id or None,
        flow_run_name or None,
        int(existing["id"]),
      ),
    )
    updated = cursor.fetchone()
    if updated is None:
      raise RuntimeError("failed production reservation changed unexpectedly")
    return DeliveryReservation(
      should_send=True,
      delivery_id=int(updated["id"]),
      status=DeliveryStatus(str(updated["status"])),
      attempt_count=int(updated["attempt_count"]),
      reason="retrying definite failed delivery",
    )

  def finalize_delivery(
    self,
    *,
    delivery_id: int,
    outcome: DeliveryOutcome,
  ) -> None:
    if outcome.status not in {
      DeliveryStatus.SENT,
      DeliveryStatus.FAILED,
      DeliveryStatus.UNCERTAIN,
    }:
      raise ValueError(f"cannot finalize delivery with status={outcome.status.value}")
    connection = self._connection_factory()
    try:
      with connection:
        with connection.cursor() as cursor:
          cursor.execute(
            """
            UPDATE dataops.daily_business_brief_deliveries
            SET status = %s,
                error_code = %s,
                error_detail = %s,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
              AND status = 'sending'
            """,
            (
              outcome.status.value,
              outcome.error_code,
              outcome.error_detail,
              delivery_id,
            ),
          )
          if cursor.rowcount != 1:
            raise RuntimeError(
              f"delivery id={delivery_id} was not in sending state during finalize"
            )
    finally:
      connection.close()
