from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


DEFAULT_API_BASE = "https://wechatrss.52671314.xyz/api"
DEFAULT_PAGE_SIZE = 20
DEFAULT_MAX_PAGES_PER_SOURCE = 1
DEFAULT_MAX_SOURCES_PER_RUN = 1
DEFAULT_LOOKBACK_DAYS = 45
DEFAULT_REQUEST_SLEEP_SECONDS = 2.0
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_MAX_BACKFILL_ARTICLES = 50
DEFAULT_CONTENT_FETCH_RETRIES = 3
DEFAULT_LIST_FETCH_ATTEMPTS = 1
DEFAULT_RATE_LIMIT_BUFFER_SECONDS = 3.0
DEFAULT_RSS_CACHE_DB_PATH = "/opt/docker/compose/wechat-download-api/data/rss.db"


@dataclass
class SyncConfig:
  api_base: str
  page_size: int
  max_pages_per_source: int
  max_sources_per_run: int
  lookback_days: int
  sync_article_lists: bool
  fetch_full_content: bool
  backfill_missing_content: bool
  max_backfill_articles: int
  cache_only_backfill: bool
  retry_permanent_failures: bool
  content_fetch_retries: int
  list_fetch_attempts: int
  rate_limit_buffer_seconds: float
  request_sleep_seconds: float
  timeout_seconds: int
  rss_cache_db_path: str


def read_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    value = int(raw)
  except ValueError:
    return default
  return max(minimum, min(maximum, value))


def _read_float_env(name: str, default: float, minimum: float, maximum: float) -> float:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    value = float(raw)
  except ValueError:
    return default
  return max(minimum, min(maximum, value))


def _read_bool_env(name: str, default: bool) -> bool:
  raw = (os.getenv(name) or "").strip().lower()
  if not raw:
    return default
  return raw in ("1", "true", "yes", "y", "on")


def resolve_sync_config(
  api_base: Optional[str],
  page_size: Optional[int],
  max_pages_per_source: Optional[int],
  max_sources_per_run: Optional[int],
  lookback_days: Optional[int],
  sync_article_lists: Optional[bool],
  fetch_full_content: Optional[bool],
  backfill_missing_content: Optional[bool],
  max_backfill_articles: Optional[int],
  cache_only_backfill: Optional[bool],
  retry_permanent_failures: Optional[bool],
  content_fetch_retries: Optional[int],
  list_fetch_attempts: Optional[int],
  rate_limit_buffer_seconds: Optional[float],
  request_sleep_seconds: Optional[float],
  timeout_seconds: Optional[int],
  rss_cache_db_path: Optional[str],
) -> SyncConfig:
  return SyncConfig(
    api_base=(
      api_base
      or os.getenv("WECHAT_DOWNLOAD_API_BASE")
      or os.getenv("WECHAT_RSS_API_BASE")
      or DEFAULT_API_BASE
    ).rstrip("/"),
    page_size=page_size
    or read_int_env("WECHAT_ARTICLE_PAGE_SIZE", DEFAULT_PAGE_SIZE, 1, 100),
    max_pages_per_source=max_pages_per_source
    or read_int_env(
      "WECHAT_ARTICLE_MAX_PAGES_PER_SOURCE",
      DEFAULT_MAX_PAGES_PER_SOURCE,
      1,
      50,
    ),
    max_sources_per_run=max_sources_per_run
    or read_int_env(
      "WECHAT_ARTICLE_MAX_SOURCES_PER_RUN",
      DEFAULT_MAX_SOURCES_PER_RUN,
      1,
      100,
    ),
    lookback_days=lookback_days
    or read_int_env("WECHAT_ARTICLE_LOOKBACK_DAYS", DEFAULT_LOOKBACK_DAYS, 1, 3650),
    sync_article_lists=(
      sync_article_lists
      if sync_article_lists is not None
      else _read_bool_env("WECHAT_ARTICLE_SYNC_ARTICLE_LISTS", True)
    ),
    fetch_full_content=(
      fetch_full_content
      if fetch_full_content is not None
      else _read_bool_env("WECHAT_ARTICLE_FETCH_FULL_CONTENT", False)
    ),
    backfill_missing_content=(
      backfill_missing_content
      if backfill_missing_content is not None
      else _read_bool_env("WECHAT_ARTICLE_BACKFILL_MISSING_CONTENT", False)
    ),
    max_backfill_articles=max_backfill_articles
    or read_int_env(
      "WECHAT_ARTICLE_MAX_BACKFILL_ARTICLES",
      DEFAULT_MAX_BACKFILL_ARTICLES,
      1,
      5000,
    ),
    cache_only_backfill=(
      cache_only_backfill
      if cache_only_backfill is not None
      else _read_bool_env("WECHAT_ARTICLE_CACHE_ONLY_BACKFILL", False)
    ),
    retry_permanent_failures=(
      retry_permanent_failures
      if retry_permanent_failures is not None
      else _read_bool_env("WECHAT_ARTICLE_RETRY_PERMANENT_FAILURES", False)
    ),
    content_fetch_retries=content_fetch_retries
    or read_int_env(
      "WECHAT_ARTICLE_CONTENT_FETCH_RETRIES",
      DEFAULT_CONTENT_FETCH_RETRIES,
      1,
      10,
    ),
    list_fetch_attempts=list_fetch_attempts
    or read_int_env(
      "WECHAT_ARTICLE_LIST_FETCH_ATTEMPTS",
      DEFAULT_LIST_FETCH_ATTEMPTS,
      1,
      10,
    ),
    rate_limit_buffer_seconds=(
      rate_limit_buffer_seconds
      if rate_limit_buffer_seconds is not None
      else _read_float_env(
        "WECHAT_ARTICLE_RATE_LIMIT_BUFFER_SECONDS",
        DEFAULT_RATE_LIMIT_BUFFER_SECONDS,
        0,
        60,
      )
    ),
    request_sleep_seconds=(
      request_sleep_seconds
      if request_sleep_seconds is not None
      else _read_float_env(
        "WECHAT_ARTICLE_REQUEST_SLEEP_SECONDS",
        DEFAULT_REQUEST_SLEEP_SECONDS,
        0,
        60,
      )
    ),
    timeout_seconds=timeout_seconds
    or read_int_env("WECHAT_ARTICLE_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS, 5, 300),
    rss_cache_db_path=(
      rss_cache_db_path
      or os.getenv("WECHAT_RSS_CACHE_DB_PATH")
      or DEFAULT_RSS_CACHE_DB_PATH
    ),
  )
