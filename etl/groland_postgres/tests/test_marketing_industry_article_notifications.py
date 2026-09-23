from __future__ import annotations

import importlib
import logging
import os
import sqlite3
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch


def _decorator(*args, **kwargs):
  if args and callable(args[0]) and len(args) == 1 and not kwargs:
    return args[0]

  def _wrap(func):
    return func

  return _wrap


prefect_stub = types.ModuleType("prefect")
prefect_test_logger = logging.getLogger("prefect-test")
prefect_test_logger.disabled = True
prefect_stub.flow = _decorator
prefect_stub.task = _decorator
prefect_stub.get_run_logger = lambda: prefect_test_logger

psycopg2_stub = types.ModuleType("psycopg2")
psycopg2_extras_stub = types.ModuleType("psycopg2.extras")
psycopg2_extras_stub.RealDictCursor = object
psycopg2_extras_stub.execute_values = lambda *args, **kwargs: None
psycopg2_stub.extras = psycopg2_extras_stub

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))


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
from prefect_sync_marketing_industry_articles import (  # noqa: E402
  CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL,
  ContentBackfillResult,
  FAILURE_INCIDENT_KEY,
  LOGIN_EXPIRED_REASON_KEY,
  SOURCE_SYNC_INCIDENT_SCOPE,
  _build_failure_incident_state,
  _build_summary,
  _build_login_expired_failure_state,
  _build_login_expired_recovery_detail_lines,
  _clear_login_expired_recovery_state,
  _has_pending_failure_recovery,
  _has_success_notification_issue,
  _has_pending_login_expired_recovery,
  _is_login_expired_reason,
  _mark_failure_notification_sent,
  _mark_login_expired_notification_sent,
  _read_notification_state,
  _resolve_notification_mode,
  _write_notification_state,
)


class MarketingIndustryArticleNotificationTest(unittest.TestCase):
  NOTIFICATION_ENV_KEYS = (
    "WECHAT_ARTICLE_NOTIFY_MODE",
    "MARKETING_INDUSTRY_ARTICLES_NOTIFY_MODE",
    "WECHAT_ARTICLE_NOTIFICATION_STATE_PATH",
    "WECHAT_ARTICLE_FAILURE_ALERT_REPEAT_SECONDS",
  )

  def _restore_env(self, snapshot: dict[str, str | None]) -> None:
    for key, value in snapshot.items():
      if value is None:
        os.environ.pop(key, None)
      else:
        os.environ[key] = value

  def _collect_success_notifications(
    self,
    detail_lines: list[str],
    notify_mode: str | None = None,
    clear_notify_modes: bool = False,
  ) -> list[dict]:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = (
        str(Path(tmp_dir) / "notification-state.json")
      )
      if clear_notify_modes:
        os.environ.pop("WECHAT_ARTICLE_NOTIFY_MODE", None)
        os.environ.pop("MARKETING_INDUSTRY_ARTICLES_NOTIFY_MODE", None)
      elif notify_mode is not None:
        os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = notify_mode
        os.environ.pop("MARKETING_INDUSTRY_ARTICLES_NOTIFY_MODE", None)

      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=detail_lines,
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

    return sent_payloads

  def _collect_failure_and_success_notifications(self, notify_mode: str) -> list[dict]:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = notify_mode
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = (
        str(Path(tmp_dir) / "notification-state.json")
      )
      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_failure_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="失败",
          reason="upstream unavailable",
          detail_lines=[],
          webhook_url="https://example.test/webhook",
        )
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=["来源数：7，已处理：7，失败来源：1"],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

    return sent_payloads

  def test_first_login_expired_failure_sends_alert(self) -> None:
    now = datetime(2026, 6, 14, 1, 9, tzinfo=timezone.utc)
    decision = _build_login_expired_failure_state(
      state={},
      reason="wechat-download-api login expired or unavailable, expire_at=2026-06-01T05:59:14+00:00",
      now=now,
      repeat_seconds=86400,
    )

    self.assertTrue(decision.should_send)
    self.assertEqual(decision.suppressed_count, 0)
    self.assertTrue(_has_pending_login_expired_recovery(decision.state))

  def test_repeated_login_expired_failure_is_suppressed_until_repeat_window(self) -> None:
    first_seen_at = datetime(2026, 6, 14, 1, 9, tzinfo=timezone.utc)
    next_seen_at = first_seen_at + timedelta(hours=1)
    state = _mark_login_expired_notification_sent(
      _build_login_expired_failure_state(
        state={},
        reason="wechat-download-api login expired or unavailable",
        now=first_seen_at,
        repeat_seconds=86400,
      ).state,
      first_seen_at,
    )

    decision = _build_login_expired_failure_state(
      state=state,
      reason="wechat-download-api login expired or unavailable",
      now=next_seen_at,
      repeat_seconds=86400,
    )

    self.assertFalse(decision.should_send)
    self.assertEqual(decision.suppressed_count, 1)

  def test_generic_failure_incident_handles_repeat_reminder_and_change(self) -> None:
    first_seen_at = datetime(2026, 8, 25, 8, 29, tzinfo=timezone.utc)
    reason = (
      "wechat-download-api article list sync globally rate limited "
      "(ret=200013, freq control); attempted_sources=1 enabled_sources=7 skipped_sources=6"
    )
    first = _build_failure_incident_state(
      state={},
      reason=reason,
      now=first_seen_at,
      repeat_seconds=86400,
    )
    sent_state = _mark_failure_notification_sent(first.state, first.scope, first_seen_at)
    repeated = _build_failure_incident_state(
      state=sent_state,
      reason=reason,
      now=first_seen_at + timedelta(hours=1),
      repeat_seconds=86400,
    )
    reminder = _build_failure_incident_state(
      state=repeated.state,
      reason=reason,
      now=first_seen_at + timedelta(hours=25),
      repeat_seconds=86400,
    )
    changed = _build_failure_incident_state(
      state=repeated.state,
      reason="upstream contract invalid",
      now=first_seen_at + timedelta(hours=2),
      repeat_seconds=86400,
    )

    self.assertTrue(first.should_send)
    self.assertTrue(first.is_new_incident)
    self.assertFalse(repeated.should_send)
    self.assertFalse(repeated.is_new_incident)
    self.assertEqual(repeated.suppressed_count, 1)
    self.assertTrue(reminder.should_send)
    self.assertFalse(reminder.is_new_incident)
    self.assertTrue(changed.should_send)
    self.assertTrue(changed.is_new_incident)
    self.assertEqual(changed.suppressed_count, 0)

  def test_failure_incident_scopes_do_not_overwrite_each_other(self) -> None:
    now = datetime(2026, 8, 25, 8, 29, tzinfo=timezone.utc)
    source_incident = _build_failure_incident_state(
      state={},
      reason="wechat-download-api globally rate limited ret=200013",
      now=now,
      repeat_seconds=86400,
    )
    state = _mark_failure_notification_sent(
      source_incident.state,
      source_incident.scope,
      now,
    )
    cache_incident = _build_failure_incident_state(
      state=state,
      reason="RSS cache unavailable",
      now=now + timedelta(minutes=1),
      repeat_seconds=86400,
    )
    state = _mark_failure_notification_sent(
      cache_incident.state,
      cache_incident.scope,
      now + timedelta(minutes=1),
    )
    repeated_source = _build_failure_incident_state(
      state=state,
      reason="wechat-download-api globally rate limited ret=200013",
      now=now + timedelta(hours=1),
      repeat_seconds=86400,
    )

    self.assertEqual(
      set(state[FAILURE_INCIDENT_KEY]),
      {SOURCE_SYNC_INCIDENT_SCOPE, "cache"},
    )
    self.assertFalse(repeated_source.should_send)
    self.assertFalse(repeated_source.is_new_incident)

  def test_generic_failure_wrapper_deduplicates_and_source_success_recovers(self) -> None:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}
    reason = (
      "wechat-download-api article list sync globally rate limited "
      "(ret=200013, freq control); attempted_sources=1 enabled_sources=7 skipped_sources=6"
    )

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = str(state_path)
      os.environ["WECHAT_ARTICLE_FAILURE_ALERT_REPEAT_SECONDS"] = "86400"
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = "errors"
      industry_articles.send_feishu_notification = fake_sender
      try:
        for _ in range(2):
          industry_articles._send_failure_notification(
            title="营销行业资讯同步通知",
            table_name="ads.marketing_industry_articles",
            action="sync marketing industry articles",
            status="失败",
            reason=reason,
            detail_lines=[],
            webhook_url="https://example.test/webhook",
          )

        pending_state = _read_notification_state(state_path)
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=[
            "来源数：7，已处理：1，失败来源：0",
            "列表文章：20，写入/更新：20，正文补取：0",
            "正文回填：尝试 1，成功 0，失败 1，剩余待重试缺正文 1",
          ],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

      recovered_state = _read_notification_state(state_path)

    self.assertTrue(_has_pending_failure_recovery(pending_state))
    self.assertEqual(
      pending_state[FAILURE_INCIDENT_KEY][SOURCE_SYNC_INCIDENT_SCOPE]["suppressed_count"],
      1,
    )
    self.assertEqual(len(sent_payloads), 2)
    self.assertIn("同步故障已恢复", sent_payloads[1]["detail_lines"][0])
    self.assertFalse(_has_pending_failure_recovery(recovered_state))

  def test_zero_processed_success_does_not_clear_source_sync_incident(self) -> None:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      now = datetime(2026, 8, 25, 8, 29, tzinfo=timezone.utc)
      pending = _build_failure_incident_state(
        state={},
        reason="wechat-download-api globally rate limited ret=200013",
        now=now,
        repeat_seconds=86400,
      )
      _write_notification_state(
        state_path,
        _mark_failure_notification_sent(pending.state, pending.scope, now),
      )
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = str(state_path)
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = "errors"
      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=[
            "来源数：7，已处理：0，失败来源：0",
            "正文回填：尝试 1，成功 1，失败 0，剩余待重试缺正文 0",
          ],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

      retained_state = _read_notification_state(state_path)

    self.assertEqual(sent_payloads, [])
    self.assertTrue(_has_pending_failure_recovery(retained_state))

  def test_login_expired_failure_sends_again_after_repeat_window(self) -> None:
    first_seen_at = datetime(2026, 6, 14, 1, 9, tzinfo=timezone.utc)
    next_seen_at = first_seen_at + timedelta(hours=25)
    state = _mark_login_expired_notification_sent(
      _build_login_expired_failure_state(
        state={},
        reason="wechat-download-api login expired or unavailable",
        now=first_seen_at,
        repeat_seconds=86400,
      ).state,
      first_seen_at,
    )

    decision = _build_login_expired_failure_state(
      state=state,
      reason="wechat-download-api login expired or unavailable",
      now=next_seen_at,
      repeat_seconds=86400,
    )

    self.assertTrue(decision.should_send)
    self.assertEqual(decision.suppressed_count, 0)

  def test_success_builds_recovery_detail_and_clears_pending_state(self) -> None:
    now = datetime(2026, 6, 14, 1, 9, tzinfo=timezone.utc)
    state = _build_login_expired_failure_state(
      state={},
      reason="wechat-download-api login expired or unavailable",
      now=now,
      repeat_seconds=86400,
    ).state
    state[LOGIN_EXPIRED_REASON_KEY]["suppressed_count"] = 2

    detail_lines = _build_login_expired_recovery_detail_lines(state, ["upserted=3"])
    cleared_state = _clear_login_expired_recovery_state(state)

    self.assertIn("登录态已恢复", detail_lines[0])
    self.assertIn("2 次", detail_lines[2])
    self.assertIn("upserted=3", detail_lines)
    self.assertFalse(_has_pending_login_expired_recovery(cleared_state))

  def test_notification_state_round_trips_json_file(self) -> None:
    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      state = {
        "version": 1,
        LOGIN_EXPIRED_REASON_KEY: {
          "pending_recovery": True,
          "last_reason": "wechat-download-api login expired or unavailable",
        },
      }

      _write_notification_state(state_path, state)
      loaded_state = _read_notification_state(state_path)

    self.assertEqual(loaded_state, state)

  def test_login_expired_reason_detection_is_specific(self) -> None:
    self.assertTrue(
      _is_login_expired_reason("wechat-download-api login expired or unavailable, expire_at=x")
    )
    self.assertFalse(_is_login_expired_reason("wechat-download-api has no subscriptions"))

  def test_default_success_notification_mode_is_errors(self) -> None:
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS[:2]}
    os.environ.pop("WECHAT_ARTICLE_NOTIFY_MODE", None)
    os.environ.pop("MARKETING_INDUSTRY_ARTICLES_NOTIFY_MODE", None)
    try:
      self.assertEqual(_resolve_notification_mode(), "errors")
    finally:
      self._restore_env(snapshot)

  def test_success_notification_skipped_by_default_without_issue_or_recovery(self) -> None:
    sent_payloads = self._collect_success_notifications(
      [
        "来源数：7，已处理：7，失败来源：0",
        "列表文章：348，写入/更新：348，正文补取：0",
        "正文回填：尝试 0，成功 0，失败 0，剩余待重试缺正文 84",
      ],
      clear_notify_modes=True,
    )
    self.assertEqual(sent_payloads, [])

  def test_backfill_summary_separates_retryable_and_non_retryable_backlog(self) -> None:
    lines = _build_summary(
      results=[],
      source_count=7,
      backfill_result=ContentBackfillResult(
        attempted_count=0,
        fetched_count=0,
        failed_count=0,
        remaining_count=36,
        permanent_unreadable_count=79,
        deferred_failed_count=7,
      ),
    )

    self.assertIn("正文回填：尝试 0，成功 0，失败 0，剩余待重试缺正文 36", lines)
    self.assertIn("不可读正文：79（已排除默认重试）", lines)
    self.assertIn("其他未列入默认重试失败：7", lines)
    self.assertFalse(_has_success_notification_issue(lines))

  def test_cache_only_backfill_does_not_require_upstream_login(self) -> None:
    connection = Mock()
    client = Mock()
    backfill = ContentBackfillResult(
      attempted_count=3,
      fetched_count=2,
      remaining_count=1,
    )

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(
        industry_articles,
        "_backfill_missing_content",
        return_value=backfill,
      ) as backfill_mock,
    ):
      summary = industry_articles.run_sync_task(
        sync_article_lists=False,
        backfill_missing_content=True,
        cache_only_backfill=True,
        max_backfill_articles=3,
      )

    client.get_status.assert_not_called()
    client.list_subscriptions.assert_not_called()
    backfill_mock.assert_called_once()
    self.assertTrue(backfill_mock.call_args.kwargs["cache_only"])
    self.assertEqual(summary[0], CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL)
    self.assertIn("正文回填：尝试 3，成功 2，失败 0，剩余待重试缺正文 1", summary)
    connection.close.assert_called_once()

  def test_rss_cache_reader_uses_stable_immutable_readonly_snapshot(self) -> None:
    with TemporaryDirectory() as tmp_dir:
      cache_path = Path(tmp_dir) / "rss cache.db"
      with sqlite3.connect(cache_path) as cache_conn:
        cache_conn.execute(
          "CREATE TABLE articles (link TEXT NOT NULL, plain_content TEXT)"
        )
        cache_conn.execute(
          "INSERT INTO articles (link, plain_content) VALUES (?, ?)",
          ("https://example.test/article", "x" * 100),
        )

      original_connect = industry_articles.rss_cache_store.sqlite3.connect
      with patch.object(
        industry_articles.rss_cache_store.sqlite3,
        "connect",
        wraps=original_connect,
      ) as connect_mock:
        urls = industry_articles._cached_content_urls(str(cache_path), strict=True)

    self.assertEqual(urls, {"https://example.test/article"})
    cache_uri = connect_mock.call_args.args[0]
    self.assertTrue(cache_uri.startswith("file:"))
    self.assertIn("mode=ro", cache_uri)
    self.assertIn("immutable=1", cache_uri)
    self.assertTrue(connect_mock.call_args.kwargs["uri"])

  def test_cache_only_scan_fails_closed_for_invalid_snapshot(self) -> None:
    with TemporaryDirectory() as tmp_dir:
      cache_path = Path(tmp_dir) / "rss.db"
      cache_path.write_text("not a sqlite database", encoding="utf-8")

      with self.assertRaisesRegex(
        industry_articles.RssCacheReadError,
        "RSS cache url scan failed",
      ):
        industry_articles._cached_content_urls(str(cache_path), strict=True)

  def test_cache_only_backfill_propagates_cache_preflight_failure(self) -> None:
    with patch.object(
      industry_articles,
      "_missing_content_articles",
      side_effect=industry_articles.RssCacheReadError("cache unavailable"),
    ) as missing_mock:
      with self.assertRaisesRegex(
        industry_articles.RssCacheReadError,
        "cache unavailable",
      ):
        industry_articles._backfill_missing_content(
          conn=Mock(),
          client=Mock(),
          max_articles=3,
          sleep_seconds=0,
          content_fetch_retries=1,
          rate_limit_buffer_seconds=0,
          rss_cache_db_path="/missing/rss.db",
          cache_only=True,
          retry_permanent_failures=False,
        )

    self.assertTrue(missing_mock.call_args.kwargs["strict_cache"])

  def test_cache_only_success_does_not_claim_login_recovery(self) -> None:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = "errors"
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = str(state_path)
      pending_state = _build_login_expired_failure_state(
        state={},
        reason="wechat-download-api login expired or unavailable",
        now=datetime(2026, 8, 6, 13, 0, tzinfo=timezone.utc),
        repeat_seconds=86400,
      ).state
      _write_notification_state(state_path, pending_state)
      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=[
            CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL,
            "正文回填：尝试 3，成功 2，失败 0，剩余待重试缺正文 1",
          ],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

      retained_state = _read_notification_state(state_path)

    self.assertEqual(sent_payloads, [])
    self.assertTrue(_has_pending_login_expired_recovery(retained_state))

  def test_cache_only_success_recovers_cache_incident_but_keeps_login_pending(self) -> None:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS}

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      now = datetime(2026, 8, 25, 8, 29, tzinfo=timezone.utc)
      login_state = _build_login_expired_failure_state(
        state={},
        reason="wechat-download-api login expired or unavailable",
        now=now,
        repeat_seconds=86400,
      ).state
      pending_state = _mark_login_expired_notification_sent(login_state, now)
      cache_incident = _build_failure_incident_state(
        state=pending_state,
        reason="RSS cache unavailable",
        now=now,
        repeat_seconds=86400,
      )
      pending_state = _mark_failure_notification_sent(
        cache_incident.state,
        cache_incident.scope,
        now,
      )
      self.assertTrue(cache_incident.should_send)
      _write_notification_state(state_path, pending_state)

      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = str(state_path)
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = "errors"
      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=[
            CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL,
            "正文回填：尝试 1，成功 1，失败 0，剩余待重试缺正文 0",
          ],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

      retained_state = _read_notification_state(state_path)

    self.assertEqual(len(sent_payloads), 1)
    self.assertIn("同步故障已恢复", sent_payloads[0]["detail_lines"][0])
    self.assertTrue(_has_pending_login_expired_recovery(retained_state))
    self.assertFalse(_has_pending_failure_recovery(retained_state))

  def test_api_backfill_still_fails_closed_on_expired_login(self) -> None:
    connection = Mock()
    client = Mock()
    client.get_status.return_value = {
      "authenticated": False,
      "loggedIn": False,
      "isExpired": True,
      "expireTime": 1786021200000,
    }

    with (
      patch.object(industry_articles, "WechatDownloadClient", return_value=client),
      patch.object(industry_articles, "_connect_pg", return_value=connection),
      patch.object(industry_articles, "_record_upstream_status") as status_mock,
      patch.object(industry_articles, "_backfill_missing_content") as backfill_mock,
    ):
      with self.assertRaisesRegex(RuntimeError, "login expired or unavailable"):
        industry_articles.run_sync_task(
          sync_article_lists=False,
          backfill_missing_content=True,
          cache_only_backfill=False,
        )

    client.get_status.assert_called_once()
    client.list_subscriptions.assert_not_called()
    status_mock.assert_called_once()
    backfill_mock.assert_not_called()
    connection.close.assert_called_once()

  def test_success_notification_all_mode_sends_normal_success(self) -> None:
    sent_payloads = self._collect_success_notifications(
      ["来源数：7，已处理：7，失败来源：0"],
      notify_mode="all",
    )
    self.assertEqual(len(sent_payloads), 1)

  def test_success_notification_errors_mode_sends_issue_summary(self) -> None:
    sent_payloads = self._collect_success_notifications(
      ["来源数：7，已处理：7，失败来源：1"],
      notify_mode="errors",
    )
    self.assertEqual(len(sent_payloads), 1)
    self.assertTrue(_has_success_notification_issue(sent_payloads[0]["detail_lines"]))

  def test_notification_off_mode_suppresses_failure_and_success(self) -> None:
    self.assertEqual(self._collect_failure_and_success_notifications("off"), [])

  def test_notification_wrappers_accept_webhook_url_and_clear_recovery_state(self) -> None:
    sent_payloads = []
    original_sender = industry_articles.send_feishu_notification
    snapshot = {
      **{key: os.environ.get(key) for key in self.NOTIFICATION_ENV_KEYS},
      "WECHAT_ARTICLE_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS": os.environ.get(
        "WECHAT_ARTICLE_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS"
      ),
    }

    def fake_sender(**kwargs):
      sent_payloads.append(kwargs)
      return True

    with TemporaryDirectory() as tmp_dir:
      state_path = Path(tmp_dir) / "notification-state.json"
      os.environ["WECHAT_ARTICLE_NOTIFICATION_STATE_PATH"] = str(state_path)
      os.environ["WECHAT_ARTICLE_LOGIN_EXPIRED_ALERT_REPEAT_SECONDS"] = "86400"
      os.environ["WECHAT_ARTICLE_NOTIFY_MODE"] = "errors"
      industry_articles.send_feishu_notification = fake_sender
      try:
        industry_articles._send_failure_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="失败",
          reason="wechat-download-api login expired or unavailable",
          detail_lines=[],
          webhook_url="https://example.test/webhook",
        )
        industry_articles._send_failure_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="失败",
          reason="wechat-download-api login expired or unavailable",
          detail_lines=[],
          webhook_url="https://example.test/webhook",
        )
        industry_articles._send_success_notification(
          title="营销行业资讯同步通知",
          table_name="ads.marketing_industry_articles",
          action="sync marketing industry articles",
          status="成功",
          reason="",
          detail_lines=["upserted=3"],
          webhook_url="https://example.test/webhook",
        )
      finally:
        industry_articles.send_feishu_notification = original_sender
        self._restore_env(snapshot)

      loaded_state = _read_notification_state(state_path)

    self.assertEqual(len(sent_payloads), 2)
    self.assertEqual(sent_payloads[0]["webhook_url"], "https://example.test/webhook")
    self.assertIn("登录态已恢复", sent_payloads[1]["detail_lines"][0])
    self.assertFalse(_has_pending_login_expired_recovery(loaded_state))


if __name__ == "__main__":
  unittest.main()
