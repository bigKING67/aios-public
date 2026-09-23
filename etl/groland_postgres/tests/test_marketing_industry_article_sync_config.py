from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from marketing_industry_articles.sync_config import resolve_sync_config  # noqa: E402


class MarketingIndustryArticleSyncConfigTest(unittest.TestCase):
  def _resolve(self, **overrides):
    values = {
      "api_base": None,
      "page_size": None,
      "max_pages_per_source": None,
      "max_sources_per_run": None,
      "lookback_days": None,
      "sync_article_lists": None,
      "fetch_full_content": None,
      "backfill_missing_content": None,
      "max_backfill_articles": None,
      "cache_only_backfill": None,
      "retry_permanent_failures": None,
      "content_fetch_retries": None,
      "list_fetch_attempts": None,
      "rate_limit_buffer_seconds": None,
      "request_sleep_seconds": None,
      "timeout_seconds": None,
      "rss_cache_db_path": None,
    }
    values.update(overrides)
    return resolve_sync_config(**values)

  def test_defaults_match_the_deployed_flow_contract(self) -> None:
    with patch.dict(os.environ, {}, clear=True):
      config = self._resolve()

    self.assertEqual(config.api_base, "https://wechatrss.52671314.xyz/api")
    self.assertEqual(config.page_size, 20)
    self.assertEqual(config.max_pages_per_source, 1)
    self.assertEqual(config.max_sources_per_run, 1)
    self.assertEqual(config.lookback_days, 45)
    self.assertTrue(config.sync_article_lists)
    self.assertFalse(config.fetch_full_content)
    self.assertEqual(config.content_fetch_retries, 3)
    self.assertEqual(config.list_fetch_attempts, 1)
    self.assertEqual(config.timeout_seconds, 30)

  def test_explicit_values_win_and_api_base_is_normalized(self) -> None:
    with patch.dict(
      os.environ,
      {
        "WECHAT_ARTICLE_PAGE_SIZE": "99",
        "WECHAT_ARTICLE_FETCH_FULL_CONTENT": "true",
      },
      clear=True,
    ):
      config = self._resolve(
        api_base="https://example.test/api/",
        page_size=10,
        fetch_full_content=False,
        request_sleep_seconds=0.5,
      )

    self.assertEqual(config.api_base, "https://example.test/api")
    self.assertEqual(config.page_size, 10)
    self.assertFalse(config.fetch_full_content)
    self.assertEqual(config.request_sleep_seconds, 0.5)

  def test_environment_values_keep_existing_bounds_and_aliases(self) -> None:
    with patch.dict(
      os.environ,
      {
        "WECHAT_RSS_API_BASE": "https://rss.example.test/root/",
        "WECHAT_ARTICLE_PAGE_SIZE": "999",
        "WECHAT_ARTICLE_MAX_PAGES_PER_SOURCE": "0",
        "WECHAT_ARTICLE_MAX_SOURCES_PER_RUN": "999",
        "WECHAT_ARTICLE_LIST_FETCH_ATTEMPTS": "0",
        "WECHAT_ARTICLE_SYNC_ARTICLE_LISTS": "off",
        "WECHAT_ARTICLE_RATE_LIMIT_BUFFER_SECONDS": "75",
        "WECHAT_ARTICLE_TIMEOUT_SECONDS": "1",
      },
      clear=True,
    ):
      config = self._resolve()

    self.assertEqual(config.api_base, "https://rss.example.test/root")
    self.assertEqual(config.page_size, 100)
    self.assertEqual(config.max_pages_per_source, 1)
    self.assertEqual(config.max_sources_per_run, 100)
    self.assertEqual(config.list_fetch_attempts, 1)
    self.assertFalse(config.sync_article_lists)
    self.assertEqual(config.rate_limit_buffer_seconds, 60)
    self.assertEqual(config.timeout_seconds, 5)

  def test_list_attempt_budget_is_independent_from_content_retry_budget(self) -> None:
    with patch.dict(
      os.environ,
      {
        "WECHAT_ARTICLE_CONTENT_FETCH_RETRIES": "9",
        "WECHAT_ARTICLE_LIST_FETCH_ATTEMPTS": "1",
      },
      clear=True,
    ):
      config = self._resolve()

    self.assertEqual(config.content_fetch_retries, 9)
    self.assertEqual(config.list_fetch_attempts, 1)


if __name__ == "__main__":
  unittest.main()
