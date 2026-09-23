from __future__ import annotations

import importlib
import logging
import os
import shlex
import subprocess
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, Mock, call, patch

import yaml


def _decorator(*args, **kwargs):
  if args and callable(args[0]) and len(args) == 1 and not kwargs:
    return args[0]

  def _wrap(func):
    return func

  return _wrap


prefect_stub = types.ModuleType("prefect")
prefect_test_logger = logging.getLogger("prefect-test-list-rate-limit")
prefect_test_logger.disabled = True
prefect_stub.flow = _decorator
prefect_stub.task = _decorator
prefect_stub.get_run_logger = lambda: prefect_test_logger

psycopg2_stub = types.ModuleType("psycopg2")
psycopg2_extras_stub = types.ModuleType("psycopg2.extras")
psycopg2_extras_stub.RealDictCursor = object
psycopg2_extras_stub.execute_values = lambda *args, **kwargs: None
psycopg2_stub.extras = psycopg2_extras_stub

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))


def _load_industry_articles_with_stubs():
  module_names = ("prefect", "psycopg2", "psycopg2.extras")
  previous = {name: sys.modules.get(name) for name in module_names}
  sys.modules["prefect"] = prefect_stub
  sys.modules["psycopg2"] = psycopg2_stub
  sys.modules["psycopg2.extras"] = psycopg2_extras_stub
  sys.modules.pop("prefect_sync_marketing_industry_articles", None)
  try:
    return importlib.import_module("prefect_sync_marketing_industry_articles")
  finally:
    for name, module in previous.items():
      if module is None:
        sys.modules.pop(name, None)
      else:
        sys.modules[name] = module


industry_articles = _load_industry_articles_with_stubs()
from marketing_industry_articles.sync_config import SyncConfig  # noqa: E402


class MarketingIndustryArticleListRateLimitTest(unittest.TestCase):
  def test_wechat_freq_control_is_recognized_as_rate_limit(self) -> None:
    error = industry_articles.WechatDownloadApiError(
      "获取文章列表失败: ret=200013, msg=freq control"
    )

    self.assertEqual(industry_articles._rate_limit_wait_seconds(error, 8), 18)

  def test_article_list_rate_limit_retries_with_bounded_wait(self) -> None:
    client = Mock()
    rate_limit_error = industry_articles.WechatDownloadApiError(
      "获取文章列表失败: ret=200013, msg=freq control"
    )
    client.list_articles.side_effect = [
      rate_limit_error,
      rate_limit_error,
      ([{"link": "https://example.test/article"}], 1),
    ]

    with (
      patch.object(industry_articles, "_sleep_if_needed") as sleep_mock,
      patch.object(industry_articles, "get_run_logger", return_value=Mock()),
    ):
      articles, total = industry_articles._fetch_article_list_with_retry(
        client=client,
        fakeid="source-1",
        begin=0,
        count=20,
        max_attempts=5,
        rate_limit_buffer_seconds=8,
      )

    self.assertEqual(articles, [{"link": "https://example.test/article"}])
    self.assertEqual(total, 1)
    self.assertEqual(client.list_articles.call_count, 3)
    self.assertEqual(sleep_mock.call_args_list, [call(18), call(18)])

  def test_article_list_non_rate_limit_error_fails_without_retry(self) -> None:
    client = Mock()
    client.list_articles.side_effect = RuntimeError("upstream contract invalid")

    with patch.object(industry_articles, "_sleep_if_needed") as sleep_mock:
      with self.assertRaisesRegex(RuntimeError, "upstream contract invalid"):
        industry_articles._fetch_article_list_with_retry(
          client=client,
          fakeid="source-1",
          begin=0,
          count=20,
          max_attempts=5,
          rate_limit_buffer_seconds=8,
        )

    client.list_articles.assert_called_once()
    sleep_mock.assert_not_called()

  def test_source_sync_paces_first_list_request_between_sources(self) -> None:
    config = SyncConfig(
      api_base="https://example.test/api",
      page_size=20,
      max_pages_per_source=1,
      max_sources_per_run=1,
      lookback_days=45,
      sync_article_lists=True,
      fetch_full_content=False,
      backfill_missing_content=False,
      max_backfill_articles=12,
      cache_only_backfill=False,
      retry_permanent_failures=False,
      content_fetch_retries=5,
      list_fetch_attempts=1,
      rate_limit_buffer_seconds=8,
      request_sleep_seconds=15,
      timeout_seconds=90,
      rss_cache_db_path="/tmp/rss.db",
    )
    sources = [
      {"source_fakeid": "source-1"},
      {"source_fakeid": "source-2"},
      {"source_fakeid": "source-3"},
    ]
    results = [Mock(), Mock(), Mock()]

    with (
      patch.object(industry_articles, "_sync_one_source", side_effect=results) as sync_mock,
      patch.object(industry_articles, "_sleep_if_needed") as sleep_mock,
    ):
      observed = industry_articles._sync_sources(
        conn=Mock(),
        client=Mock(),
        sources=sources,
        config=config,
        run_id="run-1",
      )

    self.assertEqual(observed, results)
    self.assertEqual(sync_mock.call_count, 3)
    self.assertEqual(sleep_mock.call_args_list, [call(15), call(15)])

  def test_source_readiness_distinguishes_enabled_ready_and_deferred(self) -> None:
    now = datetime(2026, 8, 25, 8, 30, tzinfo=timezone.utc)
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [
      {
        "source_fakeid": "ready-source",
        "nickname": "Ready",
        "next_retry_at": None,
        "retry_ready": True,
      },
      {
        "source_fakeid": "deferred-source-1",
        "nickname": "Deferred 1",
        "next_retry_at": now + timedelta(minutes=20),
        "retry_ready": False,
      },
      {
        "source_fakeid": "deferred-source-2",
        "nickname": "Deferred 2",
        "next_retry_at": now + timedelta(minutes=10),
        "retry_ready": False,
      },
    ]

    readiness = industry_articles._source_readiness(connection)

    self.assertEqual(readiness.enabled_count, 3)
    self.assertEqual(readiness.deferred_count, 2)
    self.assertEqual(
      [item["source_fakeid"] for item in readiness.ready_sources],
      ["ready-source"],
    )
    self.assertEqual(readiness.earliest_retry_at, now + timedelta(minutes=10))
    executed_sql = cursor.execute.call_args.args[0]
    self.assertIn("WHERE source.enabled = TRUE", executed_sql)
    self.assertIn("sync_state.last_started_at ASC NULLS FIRST", executed_sql)
    self.assertNotIn("AND (source.next_retry_at", executed_sql)

  def test_source_sync_stops_fan_out_after_global_rate_limit(self) -> None:
    config = SyncConfig(
      api_base="https://example.test/api",
      page_size=20,
      max_pages_per_source=1,
      max_sources_per_run=1,
      lookback_days=45,
      sync_article_lists=True,
      fetch_full_content=False,
      backfill_missing_content=False,
      max_backfill_articles=12,
      cache_only_backfill=False,
      retry_permanent_failures=False,
      content_fetch_retries=5,
      list_fetch_attempts=1,
      rate_limit_buffer_seconds=8,
      request_sleep_seconds=15,
      timeout_seconds=90,
      rss_cache_db_path="/tmp/rss.db",
    )
    rate_limited = industry_articles.SourceSyncResult(
      source_fakeid="source-1",
      nickname="Source 1",
      last_error="获取文章列表失败: ret=200013, msg=freq control",
    )

    with (
      patch.object(industry_articles, "_sync_one_source", return_value=rate_limited) as sync_mock,
      patch.object(industry_articles, "_sleep_if_needed") as sleep_mock,
      patch.object(industry_articles, "get_run_logger", return_value=Mock()),
    ):
      observed = industry_articles._sync_sources(
        conn=Mock(),
        client=Mock(),
        sources=[
          {"source_fakeid": "source-1"},
          {"source_fakeid": "source-2"},
          {"source_fakeid": "source-3"},
        ],
        config=config,
        run_id="run-1",
      )

    self.assertEqual(observed, [rate_limited])
    sync_mock.assert_called_once()
    sleep_mock.assert_not_called()

  def test_all_deferred_sources_report_accurate_state_without_backfill(self) -> None:
    retry_at = datetime(2026, 8, 25, 9, 0, tzinfo=timezone.utc)
    client = Mock()
    client.get_status.return_value = {
      "authenticated": True,
      "loggedIn": True,
      "isExpired": False,
    }
    client.list_subscriptions.return_value = [{"fakeid": "source-1"}]
    connection = Mock()
    readiness = industry_articles.SourceReadiness(
      enabled_count=7,
      ready_sources=[],
      deferred_count=7,
      earliest_retry_at=retry_at,
    )

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(industry_articles, "_record_upstream_status"),
      patch.object(industry_articles, "_upsert_sources", return_value=7),
      patch.object(industry_articles, "_source_readiness", return_value=readiness),
      patch.object(industry_articles, "_sync_sources") as sync_mock,
      patch.object(industry_articles, "_backfill_missing_content") as backfill_mock,
    ):
      with self.assertRaisesRegex(
        RuntimeError,
        "retry-deferred; enabled_sources=7 deferred_sources=7",
      ):
        industry_articles.run_sync_task(
          sync_article_lists=True,
          backfill_missing_content=True,
          fetch_full_content=False,
        )

    sync_mock.assert_not_called()
    backfill_mock.assert_not_called()
    connection.close.assert_called_once()

  def test_zero_enabled_sources_remains_a_distinct_configuration_failure(self) -> None:
    client = Mock()
    client.get_status.return_value = {
      "authenticated": True,
      "loggedIn": True,
      "isExpired": False,
    }
    client.list_subscriptions.return_value = [{"fakeid": "source-1"}]
    connection = Mock()
    readiness = industry_articles.SourceReadiness(
      enabled_count=0,
      ready_sources=[],
      deferred_count=0,
      earliest_retry_at=None,
    )

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(industry_articles, "_record_upstream_status"),
      patch.object(industry_articles, "_upsert_sources", return_value=1),
      patch.object(industry_articles, "_source_readiness", return_value=readiness),
      patch.object(industry_articles, "_sync_sources") as sync_mock,
    ):
      with self.assertRaisesRegex(
        RuntimeError,
        "^no enabled marketing industry article sources$",
      ):
        industry_articles.run_sync_task(
          sync_article_lists=True,
          backfill_missing_content=False,
          fetch_full_content=False,
        )

    sync_mock.assert_not_called()
    connection.close.assert_called_once()

  def test_global_rate_limit_preserves_cause_and_skips_backfill(self) -> None:
    client = Mock()
    client.get_status.return_value = {
      "authenticated": True,
      "loggedIn": True,
      "isExpired": False,
    }
    client.list_subscriptions.return_value = [{"fakeid": "source-1"}]
    connection = Mock()
    readiness = industry_articles.SourceReadiness(
      enabled_count=7,
      ready_sources=[{"source_fakeid": f"source-{index}"} for index in range(1, 8)],
      deferred_count=0,
      earliest_retry_at=None,
    )
    rate_limited = industry_articles.SourceSyncResult(
      source_fakeid="source-1",
      nickname="Source 1",
      last_error="获取文章列表失败: ret=200013, msg=freq control",
    )

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(industry_articles, "_record_upstream_status"),
      patch.object(industry_articles, "_upsert_sources", return_value=7),
      patch.object(industry_articles, "_source_readiness", return_value=readiness),
      patch.object(
        industry_articles,
        "_sync_sources",
        return_value=[rate_limited],
      ) as sync_mock,
      patch.object(industry_articles, "_backfill_missing_content") as backfill_mock,
    ):
      with self.assertRaisesRegex(
        industry_articles.WechatDownloadApiError,
        (
          "globally rate limited .*attempted_sources=1 enabled_sources=7 "
          "ready_sources=7 run_source_limit=1 skipped_sources=6"
        ),
      ):
        industry_articles.run_sync_task(
          sync_article_lists=True,
          backfill_missing_content=True,
          fetch_full_content=False,
        )

    backfill_mock.assert_not_called()
    attempted_sources = sync_mock.call_args.args[2]
    self.assertEqual(
      [source["source_fakeid"] for source in attempted_sources],
      ["source-1"],
    )
    connection.close.assert_called_once()

  def test_successful_discovery_still_processes_only_one_ready_source(self) -> None:
    client = Mock()
    client.get_status.return_value = {
      "authenticated": True,
      "loggedIn": True,
      "isExpired": False,
    }
    client.list_subscriptions.return_value = [{"fakeid": "source-1"}]
    connection = Mock()
    readiness = industry_articles.SourceReadiness(
      enabled_count=7,
      ready_sources=[{"source_fakeid": f"source-{index}"} for index in range(1, 8)],
      deferred_count=0,
      earliest_retry_at=None,
    )
    succeeded = industry_articles.SourceSyncResult(
      source_fakeid="source-1",
      nickname="Source 1",
      listed_count=1,
      upserted_count=1,
    )

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(industry_articles, "_record_upstream_status"),
      patch.object(industry_articles, "_upsert_sources", return_value=7),
      patch.object(industry_articles, "_source_readiness", return_value=readiness),
      patch.object(industry_articles, "_sync_sources", return_value=[succeeded]) as sync_mock,
      patch.object(industry_articles, "_backfill_missing_content") as backfill_mock,
    ):
      summary = industry_articles.run_sync_task(
        sync_article_lists=True,
        backfill_missing_content=False,
        max_sources_per_run=1,
      )

    attempted_sources = sync_mock.call_args.args[2]
    self.assertEqual(
      [source["source_fakeid"] for source in attempted_sources],
      ["source-1"],
    )
    self.assertIn("来源数：7，已处理：1，失败来源：0", summary)
    backfill_mock.assert_not_called()
    connection.close.assert_called_once()

  def test_source_list_uses_independent_single_attempt_and_single_page_budget(self) -> None:
    config = SyncConfig(
      api_base="https://example.test/api",
      page_size=20,
      max_pages_per_source=1,
      max_sources_per_run=1,
      lookback_days=45,
      sync_article_lists=True,
      fetch_full_content=False,
      backfill_missing_content=False,
      max_backfill_articles=12,
      cache_only_backfill=False,
      retry_permanent_failures=False,
      content_fetch_retries=5,
      list_fetch_attempts=1,
      rate_limit_buffer_seconds=8,
      request_sleep_seconds=15,
      timeout_seconds=90,
      rss_cache_db_path="/tmp/rss.db",
    )
    listed = [{"link": "https://example.test/article", "title": "Article"}]

    with (
      patch.object(
        industry_articles,
        "_fetch_article_list_with_retry",
        return_value=(listed, 100),
      ) as list_mock,
      patch.object(industry_articles, "_upsert_articles", return_value=1),
      patch.object(industry_articles, "_mark_source_success"),
    ):
      result = industry_articles._sync_one_source(
        conn=Mock(),
        client=Mock(),
        source={"source_fakeid": "source-1", "nickname": "Source 1"},
        config=config,
        run_id="run-1",
      )

    self.assertEqual(result.listed_count, 1)
    list_mock.assert_called_once()
    self.assertEqual(list_mock.call_args.kwargs["max_attempts"], 1)

  def test_deployment_contract_uses_bounded_discovery_without_content_backfill(self) -> None:
    deploy_source = (
      SCRIPT_DIR / "deploy_prefect_marketing_industry_articles.sh"
    ).read_text(encoding="utf-8")

    self.assertIn(
      'MAX_PAGES_PER_SOURCE="${WECHAT_ARTICLE_MAX_PAGES_PER_SOURCE:-1}"',
      deploy_source,
    )
    self.assertIn(
      'MAX_SOURCES_PER_RUN="${WECHAT_ARTICLE_MAX_SOURCES_PER_RUN:-1}"',
      deploy_source,
    )
    self.assertIn(
      'LIST_FETCH_ATTEMPTS="${WECHAT_ARTICLE_LIST_FETCH_ATTEMPTS:-1}"',
      deploy_source,
    )
    self.assertIn('--param "max_sources_per_run=$MAX_SOURCES_PER_RUN"', deploy_source)
    self.assertIn('--param "list_fetch_attempts=$LIST_FETCH_ATTEMPTS"', deploy_source)
    self.assertIn(
      '"$DISCOVERY_CRON" \\\n'
      '  true \\\n'
      '  false \\',
      deploy_source,
    )

  def test_deployment_contract_keeps_provider_schedules_inactive(self) -> None:
    manifest = yaml.safe_load(
      (SCRIPT_DIR.parent / "prefect-deployments.yaml").read_text(encoding="utf-8")
    )
    entries = {
      item["deployment_name"]: item
      for item in manifest["deployments"]
      if item.get("deploy_group") == "marketing-industry"
    }

    self.assertFalse(
      entries["ads-21-marketing-industry-articles-inc"]["schedule"]["active"]
    )
    self.assertTrue(
      entries["ads-21-marketing-industry-articles-cache-sweep"]["schedule"]["active"]
    )
    self.assertFalse(
      entries["ads-21-marketing-industry-articles-content-retry"]["schedule"]["active"]
    )
    self.assertEqual(
      {
        name: (
          entry["schedule"]["clean_count"],
          entry["schedule"]["legacy_count"],
        )
        for name, entry in entries.items()
      },
      {
        "ads-21-marketing-industry-articles-inc": (1, 1),
        "ads-21-marketing-industry-articles-cache-sweep": (1, 1),
        "ads-21-marketing-industry-articles-content-retry": (1, 1),
      },
    )
    self.assertEqual(
      entries["ads-21-marketing-industry-articles-inc"]["watchdog"],
      {"success_slo_minutes": None, "future_run_lookahead_minutes": None},
    )
    self.assertEqual(
      entries["ads-21-marketing-industry-articles-content-retry"]["watchdog"],
      {"success_slo_minutes": None, "future_run_lookahead_minutes": None},
    )
    self.assertEqual(
      entries["ads-21-marketing-industry-articles-cache-sweep"]["watchdog"],
      {"success_slo_minutes": 180, "future_run_lookahead_minutes": 180},
    )

  def test_deploy_adapter_creates_inactive_provider_schedules_without_active_window(
    self,
  ) -> None:
    with tempfile.TemporaryDirectory(prefix="marketing-prefect-contract-") as raw_temp:
      temp = Path(raw_temp)
      marker = temp / "prefect-calls.log"
      probe = temp / "prefect"
      probe.write_text(
        "#!/usr/bin/env bash\n"
        f"printf '%s\\n' '---CALL---' \"$@\" >> {shlex.quote(str(marker))}\n",
        encoding="utf-8",
      )
      probe.chmod(0o755)
      environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("PREFECT_", "WECHAT_"))
      }
      environment.update({
        "PREFECT_BIN": str(probe),
        "PREFECT_HOME": str(temp / "prefect-home"),
        "UV_BIN": str(temp / "missing-uv"),
      })

      result = subprocess.run(
        ["bash", str(SCRIPT_DIR / "deploy_prefect_marketing_industry_articles.sh")],
        check=False,
        capture_output=True,
        env=environment,
        text=True,
      )
      raw_calls = marker.read_text(encoding="utf-8")

    self.assertEqual(result.returncode, 0, result.stderr)
    calls = [
      block.strip().splitlines()
      for block in raw_calls.split("---CALL---")
      if block.strip()
    ]
    self.assertEqual(len(calls), 5)

    def call_with(*needles: str) -> list[str]:
      return next(
        call_args
        for call_args in calls
        if all(needle in call_args for needle in needles)
      )

    discovery_deploy = call_with(
      "deploy",
      "ads-21-marketing-industry-articles-inc",
    )
    cache_sweep_deploy = call_with(
      "deploy",
      "ads-21-marketing-industry-articles-cache-sweep",
    )
    content_retry_deploy = call_with(
      "deploy",
      "ads-21-marketing-industry-articles-content-retry",
    )
    discovery_schedule = call_with(
      "create",
      "sync-marketing-industry-articles-flow/ads-21-marketing-industry-articles-inc",
    )
    content_retry_schedule = call_with(
      "create",
      "sync-marketing-industry-articles-flow/ads-21-marketing-industry-articles-content-retry",
    )

    self.assertNotIn("--cron", discovery_deploy)
    self.assertIn("--cron", cache_sweep_deploy)
    self.assertNotIn("--cron", content_retry_deploy)
    for schedule_call in (discovery_schedule, content_retry_schedule):
      self.assertIn("--no-active", schedule_call)
      self.assertIn("--replace", schedule_call)
      self.assertIn("--accept-yes", schedule_call)

    self.assertIn("17 8-22/2 * * *", discovery_schedule)
    self.assertIn("43 */6 * * *", content_retry_schedule)

  def test_prefect_task_uses_natural_schedule_instead_of_whole_task_retry(self) -> None:
    source = (
      SCRIPT_DIR / "prefect_sync_marketing_industry_articles.py"
    ).read_text(encoding="utf-8")

    self.assertIn('@task(name="sync-marketing-industry-articles", retries=0)', source)
    self.assertNotIn(
      '@task(name="sync-marketing-industry-articles", retries=1, retry_delay_seconds=120)',
      source,
    )

if __name__ == "__main__":
  unittest.main()
