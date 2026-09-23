from __future__ import annotations

import json
import unittest
from pathlib import Path

import yaml


ETL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ETL_ROOT.parents[1]
MIGRATION = (
  ETL_ROOT
  / "sql"
  / "migrations"
  / "20260807_1330__harden_report_overview_dependency_watermarks.sql"
)


class ReportOverviewDependencyContractTest(unittest.TestCase):
  def test_migration_enforces_readiness_and_independent_source_watermarks(self) -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    self.assertIn("etl.assert_all_trade_overview_source_ready", sql)
    self.assertIn("v_overview_source_updated_at < p_source_updated_at", sql)
    self.assertIn(
      "PERFORM etl.assert_all_trade_overview_source_ready('taobao', v_trade_max_updated_at)",
      sql,
    )
    self.assertIn(
      "PERFORM etl.assert_all_trade_overview_source_ready('douyin', v_source_updated_at)",
      sql,
    )
    for column in (
      "last_trade_updated_at",
      "last_cost_updated_at",
      "last_platform_updated_at",
    ):
      self.assertIn(column, sql)
    for checkpoint in (
      "v_last_trade_updated_at IS NULL",
      "v_last_cost_updated_at IS NULL",
      "v_last_platform_updated_at IS NULL",
    ):
      self.assertIn(checkpoint, sql)
    self.assertNotIn("v_bootstrap", sql)
    self.assertIn("pg_advisory_xact_lock", sql)

  def test_deployment_schedules_follow_overview_main_and_catch_up_runs(self) -> None:
    manifest = yaml.safe_load(
      (ETL_ROOT / "prefect-deployments.yaml").read_text(encoding="utf-8")
    )
    by_name = {
      entry["deployment_name"]: entry
      for entry in manifest["deployments"]
      if entry["state"] == "active"
    }

    self.assertEqual(
      by_name["ads-01-overview-daily-inc"]["schedule"]["default"],
      "30,55 10,18 * * *",
    )
    self.assertEqual(
      by_name["ads-report-04-platform-week-metrics-inc"]["schedule"]["default"],
      "32,57 10,18 * * *",
    )
    self.assertEqual(
      by_name["ads-report-05-douyin-week-metrics-inc"]["schedule"]["default"],
      "33,58 10,18 * * *",
    )

    platform_script = (
      ETL_ROOT
      / "scripts"
      / "deploy_prefect_incremental_report_all_trade_week_platform_metrics.sh"
    ).read_text(encoding="utf-8")
    douyin_script = (
      ETL_ROOT
      / "scripts"
      / "deploy_prefect_incremental_report_douyin_trade_sale_metrics_week.sh"
    ).read_text(encoding="utf-8")
    self.assertIn('CRON="${CRON:-32,57 10,18 * * *}"', platform_script)
    self.assertIn('CRON="${CRON:-33,58 10,18 * * *}"', douyin_script)

  def test_dataops_catalog_matches_governed_manifest(self) -> None:
    config = json.loads(
      (REPO_ROOT / "backend-rust" / "src" / "dataops_config.json").read_text(
        encoding="utf-8"
      )
    )
    by_id = {pipeline["id"]: pipeline for pipeline in config["pipelines"]}

    self.assertEqual(
      by_id["ads_report_all_trade_week_platform_metrics_incremental"]["cron"],
      "32,57 10,18 * * *",
    )
    self.assertEqual(
      by_id["ads_report_douyin_trade_sale_metrics_week_incremental"]["cron"],
      "33,58 10,18 * * *",
    )

  def test_prefect_tasks_keep_bounded_retry_for_readiness_failures(self) -> None:
    platform_flow = (
      ETL_ROOT
      / "scripts"
      / "prefect_incremental_report_all_trade_week_platform_metrics.py"
    ).read_text(encoding="utf-8")
    douyin_flow = (
      ETL_ROOT
      / "scripts"
      / "prefect_incremental_report_douyin_trade_sale_metrics_week.py"
    ).read_text(encoding="utf-8")

    for source in (platform_flow, douyin_flow):
      self.assertIn("retries=2, retry_delay_seconds=120", source)


if __name__ == "__main__":
  unittest.main()
