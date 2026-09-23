from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch


ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))

import prefect_dashboard_ads_freshness_check as freshness  # noqa: E402
import prefect_incremental_all_trade_overview as overview  # noqa: E402
from daily_business_brief.trigger import DailyBriefTriggerResult  # noqa: E402


def _task_function(task_or_function):
  return getattr(task_or_function, "fn", task_or_function)


class OverviewSourceReadinessTest(unittest.TestCase):
  def test_default_readiness_window_covers_late_morning_sources(self) -> None:
    self.assertEqual(overview.OVERVIEW_SOURCE_READY_TIMEOUT_SECONDS, 15 * 60)

  def test_parse_source_readiness_normalizes_known_missing_platforms(self) -> None:
    target_date, missing_platforms = overview._parse_source_readiness(
      '{"targetDate":"2026-08-24","missingPlatforms":["wx","jd","wx"]}'
    )

    self.assertEqual(target_date, "2026-08-24")
    self.assertEqual(missing_platforms, ["jd", "wx"])

  def test_parse_source_readiness_rejects_unknown_platform(self) -> None:
    with self.assertRaisesRegex(RuntimeError, "unknown platforms: unknown"):
      overview._parse_source_readiness(
        '{"targetDate":"2026-08-24","missingPlatforms":["unknown"]}'
      )

  def test_wait_for_source_readiness_polls_until_every_platform_exists(self) -> None:
    logger = Mock()
    with (
      patch.object(overview, "get_run_logger", return_value=logger),
      patch.object(
        overview,
        "run_psql",
        side_effect=[
          '{"targetDate":"2026-08-24","missingPlatforms":["wx"]}',
          '{"targetDate":"2026-08-24","missingPlatforms":[]}',
        ],
      ) as run_psql,
      patch.object(overview.time, "monotonic", side_effect=[100.0, 100.0]),
      patch.object(overview.time, "sleep") as sleep,
    ):
      result = _task_function(overview.wait_for_overview_source_readiness)(
        timeout_seconds=10,
        poll_seconds=2,
      )

    self.assertEqual(result, "2026-08-24")
    self.assertEqual(run_psql.call_count, 2)
    sleep.assert_called_once_with(2.0)
    logger.warning.assert_called_once()
    logger.info.assert_called_once()

  def test_wait_for_source_readiness_fails_closed_at_deadline(self) -> None:
    with (
      patch.object(overview, "get_run_logger", return_value=Mock()),
      patch.object(
        overview,
        "run_psql",
        return_value='{"targetDate":"2026-08-24","missingPlatforms":["wx"]}',
      ),
      patch.object(overview.time, "monotonic", side_effect=[100.0, 111.0]),
    ):
      with self.assertRaisesRegex(
        RuntimeError,
        "target_date=2026-08-24 missing_platforms=wx",
      ):
        _task_function(overview.wait_for_overview_source_readiness)(
          timeout_seconds=10,
          poll_seconds=2,
        )

  def test_normal_flow_checks_readiness_before_refresh(self) -> None:
    call_order = []

    def mark_readiness() -> str:
      call_order.append("readiness")
      return "2026-08-24"

    def mark_refresh(*, fallback_window_days: int) -> str:
      call_order.append(f"refresh:{fallback_window_days}")
      return ""

    with (
      patch.object(
        overview,
        "wait_for_overview_source_readiness",
        side_effect=mark_readiness,
      ),
      patch.object(
        overview,
        "run_incremental_refresh",
        side_effect=mark_refresh,
      ),
      patch.object(
        overview,
        "build_incremental_summary",
        return_value=(["no changes"], False, False),
      ),
      patch.object(overview, "_safe_send_notification"),
      patch.object(overview, "get_run_logger", return_value=Mock()),
      patch.object(
        overview,
        "trigger_daily_business_brief_after_ads_ready",
      ) as trigger_daily_brief,
    ):
      _task_function(overview.incremental_refresh_all_trade_overview_flow)(
        fallback_window_days=7,
      )

    self.assertEqual(call_order, ["readiness", "refresh:7"])
    trigger_daily_brief.assert_not_called()

  def test_enabled_flow_triggers_brief_only_after_refresh(self) -> None:
    call_order = []

    def mark_readiness() -> str:
      call_order.append("source-ready")
      return "2026-08-30"

    def mark_refresh(*, fallback_window_days: int) -> str:
      call_order.append(f"refresh:{fallback_window_days}")
      return ""

    def mark_trigger(*, target_date: str) -> dict:
      call_order.append(f"trigger:{target_date}")
      return {"status": "created"}

    with (
      patch.object(
        overview,
        "wait_for_overview_source_readiness",
        side_effect=mark_readiness,
      ),
      patch.object(overview, "run_incremental_refresh", side_effect=mark_refresh),
      patch.object(
        overview,
        "build_incremental_summary",
        return_value=(["updated"], True, False),
      ),
      patch.object(
        overview,
        "trigger_daily_business_brief_after_ads_ready",
        side_effect=mark_trigger,
      ),
      patch.object(overview, "_safe_send_notification"),
      patch.object(overview, "get_run_logger", return_value=Mock()),
    ):
      _task_function(overview.incremental_refresh_all_trade_overview_flow)(
        fallback_window_days=7,
        trigger_daily_brief="true",
      )

    self.assertEqual(
      call_order,
      ["source-ready", "refresh:7", "trigger:2026-08-30"],
    )

  def test_normal_flow_does_not_refresh_when_readiness_fails(self) -> None:
    refresh = Mock()
    trigger_daily_brief = Mock()
    with (
      patch.object(
        overview,
        "wait_for_overview_source_readiness",
        side_effect=RuntimeError("missing wx"),
      ),
      patch.object(overview, "run_incremental_refresh", refresh),
      patch.object(
        overview,
        "trigger_daily_business_brief_after_ads_ready",
        trigger_daily_brief,
      ),
      patch.object(overview, "_safe_send_notification"),
    ):
      with self.assertRaisesRegex(RuntimeError, "missing wx"):
        _task_function(overview.incremental_refresh_all_trade_overview_flow)()

    refresh.assert_not_called()
    trigger_daily_brief.assert_not_called()

  def test_ads_ready_trigger_calls_dataops_api_after_ledger_is_empty(self) -> None:
    with (
      patch.object(overview, "get_run_logger", return_value=Mock()),
      patch.object(
        overview,
        "run_psql",
        side_effect=[
          '{"targetDate":"2026-08-30","missingPlatforms":[]}',
          "{}",
        ],
      ) as run_psql,
      patch.object(
        overview,
        "request_daily_brief_trigger",
        return_value=DailyBriefTriggerResult(
          status="created",
          flow_run_id="flow-run-id",
          flow_run_name="flow-run-name",
        ),
      ) as request_trigger,
    ):
      result = _task_function(
        overview.trigger_daily_business_brief_after_ads_ready
      )(target_date="2026-08-30")

    self.assertEqual(result["status"], "created")
    self.assertEqual(result["targetDate"], "2026-08-30")
    self.assertEqual(run_psql.call_count, 2)
    request_trigger.assert_called_once_with(target_date=date(2026, 8, 30))

  def test_ads_missing_platform_fails_before_ledger_or_api(self) -> None:
    with (
      patch.object(overview, "get_run_logger", return_value=Mock()),
      patch.object(
        overview,
        "run_psql",
        return_value=(
          '{"targetDate":"2026-08-30","missingPlatforms":["jd","wx"]}'
        ),
      ) as run_psql,
      patch.object(
        overview,
        "request_daily_brief_trigger",
      ) as request_trigger,
    ):
      with self.assertRaisesRegex(
        RuntimeError,
        "missing_platforms=jd,wx",
      ):
        _task_function(overview.trigger_daily_business_brief_after_ads_ready)(
          target_date="2026-08-30"
        )

    run_psql.assert_called_once()
    request_trigger.assert_not_called()

  def test_existing_production_ledger_suppresses_automatic_trigger(self) -> None:
    for ledger_status in ("sending", "sent", "failed", "uncertain"):
      with self.subTest(ledger_status=ledger_status):
        with (
          patch.object(overview, "get_run_logger", return_value=Mock()),
          patch.object(
            overview,
            "run_psql",
            side_effect=[
              '{"targetDate":"2026-08-30","missingPlatforms":[]}',
              (
                '{"deliveryId":7,"status":"'
                f'{ledger_status}","attemptCount":1}}'
              ),
            ],
          ),
          patch.object(
            overview,
            "request_daily_brief_trigger",
          ) as request_trigger,
        ):
          result = _task_function(
            overview.trigger_daily_business_brief_after_ads_ready
          )(target_date="2026-08-30")

        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["ledgerStatus"], ledger_status)
        request_trigger.assert_not_called()


class OverviewFreshnessContractTest(unittest.TestCase):
  def test_freshness_sql_checks_each_overview_platform_independently(self) -> None:
    sql = freshness._build_freshness_sql(date(2026, 8, 24))

    self.assertIn("overview_source_status AS", sql)
    self.assertIn("'overview:' || src.platform AS pipeline", sql)
    self.assertIn("a.platform = src.platform", sql)
    self.assertIn("state.platform = src.platform", sql)
    self.assertNotIn("COALESCE(SUM(rows_0430), 0)", sql)

  def test_wx_missing_from_ads_is_reported_as_stale(self) -> None:
    details, has_ads_stale, has_ods_missing = (
      _task_function(freshness.build_freshness_summary)(rows=[{
        "pipeline": "overview:wx",
        "status": "ads_stale_after_ods",
        "targetDate": "2026-08-24",
        "odsRows": 1,
        "adsRows": 0,
        "odsMaxDate": "2026-08-24",
        "adsMaxDate": "2026-08-23",
        "lastRefreshAt": "2026-08-25 10:30:01",
      }])
    )

    self.assertTrue(has_ads_stale)
    self.assertFalse(has_ods_missing)
    self.assertIn("overview:wx: ads_stale_after_ods", details[0])

  def test_sql_parity_guard_rejects_missing_overview_rows(self) -> None:
    sql = (ETL_ROOT / "tests" / "sql" / "all_trade_overview_check.sql").read_text(
      encoding="utf-8"
    )

    self.assertEqual(sql.count("FULL OUTER JOIN ("), 3)
    self.assertGreaterEqual(sql.count('src.trade_date IS NULL'), 3)
    self.assertGreaterEqual(sql.count('t."date" IS NULL'), 3)
    self.assertIn("WHERE platform = 'wx'", sql)


if __name__ == "__main__":
  unittest.main()
