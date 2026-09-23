from __future__ import annotations

import hashlib
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import psycopg2
import psycopg2.extras
import requests
from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from prefect_ops_utils import (  # noqa: E402
  DEFAULT_FEISHU_WEBHOOK_URL,
  _resolve_pg_connection_config,
  send_feishu_notification,
)
from marketing_industry_articles.sync_config import (  # noqa: E402
  SyncConfig,
  resolve_sync_config as _resolve_config,
)
from marketing_industry_articles import rss_cache as rss_cache_store  # noqa: E402
from marketing_industry_articles.notification_state import (  # noqa: E402
  CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL,
  FAILURE_INCIDENT_KEY,
  LOGIN_EXPIRED_REASON_KEY,
  SOURCE_SYNC_INCIDENT_SCOPE,
  _build_failure_incident_state,
  _build_failure_recovery_detail_lines,
  _build_login_expired_failure_state,
  _build_login_expired_recovery_detail_lines,
  _clear_failure_recovery_state,
  _clear_login_expired_recovery_state,
  _eligible_failure_recovery_scopes,
  _empty_notification_state,
  _has_pending_failure_recovery,
  _has_pending_login_expired_recovery,
  _has_success_notification_issue,
  _is_login_expired_reason,
  _is_rate_limit_reason,
  _mark_failure_notification_sent,
  _mark_login_expired_notification_sent,
  _read_notification_state,
  _resolve_failure_alert_repeat_seconds,
  _resolve_login_expired_alert_repeat_seconds,
  _resolve_notification_mode,
  _resolve_notification_state_path,
  _write_notification_state,
)
from marketing_industry_articles.rss_cache import RssCacheReadError  # noqa: E402


MIN_READABLE_PLAIN_CONTENT_CHARS = 80
UNREADABLE_ARTICLE_CONTENT_ERROR = "article content response has insufficient readable text"
UNREADABLE_CACHED_CONTENT_ERROR = "cached article content has insufficient readable text"
PERMANENT_UNREADABLE_CONTENT_ERRORS = (
  UNREADABLE_ARTICLE_CONTENT_ERROR,
  UNREADABLE_CACHED_CONTENT_ERROR,
)


@dataclass
class SourceSyncResult:
  source_fakeid: str
  nickname: str
  listed_count: int = 0
  upserted_count: int = 0
  content_fetched_count: int = 0
  skipped_old_count: int = 0
  failed_count: int = 0
  last_error: str = ""


@dataclass
class ContentBackfillResult:
  attempted_count: int = 0
  fetched_count: int = 0
  failed_count: int = 0
  remaining_count: int = 0
  permanent_unreadable_count: int = 0
  deferred_failed_count: int = 0
  sample_errors: List[str] = field(default_factory=list)


@dataclass
class SourceReadiness:
  enabled_count: int
  ready_sources: List[Dict[str, Any]]
  deferred_count: int
  earliest_retry_at: Optional[datetime]


class WechatDownloadApiError(RuntimeError):
  pass


class WechatDownloadClient:
  def __init__(self, api_base: str, timeout_seconds: int):
    self.api_base = api_base.rstrip("/")
    self.timeout_seconds = timeout_seconds
    self.session = requests.Session()

  def get_status(self) -> Dict[str, Any]:
    return self._get_json("/admin/status")

  def list_subscriptions(self) -> List[Dict[str, Any]]:
    payload = self._get_json("/rss/subscriptions")
    if not payload.get("success"):
      raise WechatDownloadApiError(payload.get("error") or "list subscriptions failed")
    data = payload.get("data")
    if not isinstance(data, list):
      raise WechatDownloadApiError("subscriptions response data is not a list")
    return [item for item in data if isinstance(item, dict)]

  def list_articles(self, fakeid: str, begin: int, count: int) -> Tuple[List[Dict[str, Any]], int]:
    payload = self._get_json(
      "/public/articles",
      params={"fakeid": fakeid, "begin": begin, "count": count},
    )
    if not payload.get("success"):
      raise WechatDownloadApiError(payload.get("error") or "list articles failed")
    data = payload.get("data")
    if not isinstance(data, dict):
      raise WechatDownloadApiError("articles response data is not an object")
    articles = data.get("articles")
    if not isinstance(articles, list):
      raise WechatDownloadApiError("articles response items is not a list")
    total = _safe_int(data.get("total"), 0)
    return [item for item in articles if isinstance(item, dict)], total

  def fetch_article_content(self, article_url: str) -> Dict[str, Any]:
    payload = self._post_json("/article", {"url": article_url})
    if not payload.get("success"):
      raise WechatDownloadApiError(payload.get("error") or "fetch article content failed")
    data = payload.get("data")
    if not isinstance(data, dict):
      raise WechatDownloadApiError("article content response data is not an object")
    return data

  def _get_json(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = f"{self.api_base}{path}"
    response = self.session.get(url, params=params, timeout=self.timeout_seconds)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
      raise WechatDownloadApiError(f"GET {path} returned non-object JSON")
    return data

  def _post_json(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{self.api_base}{path}"
    response = self.session.post(url, json=payload, timeout=self.timeout_seconds)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
      raise WechatDownloadApiError(f"POST {path} returned non-object JSON")
    return data


def _safe_int(value: Any, default: int = 0) -> int:
  try:
    return int(value)
  except (TypeError, ValueError):
    return default


def _timestamp_to_datetime(value: Any, milliseconds: bool = False) -> Optional[datetime]:
  parsed = _safe_int(value, 0)
  if parsed <= 0:
    return None
  if milliseconds:
    parsed = parsed / 1000
  return datetime.fromtimestamp(parsed, tz=timezone.utc)


def _datetime_to_iso(value: Optional[datetime]) -> Optional[str]:
  if value is None:
    return None
  return value.isoformat()


def _date_to_iso(value: Optional[datetime]) -> Optional[str]:
  if value is None:
    return None
  return value.date().isoformat()


def _clean_text(value: Any, max_len: Optional[int] = None) -> str:
  if value is None:
    return ""
  cleaned = str(value).replace("\x00", "").strip()
  if max_len and len(cleaned) > max_len:
    return cleaned[:max_len]
  return cleaned


def _content_hash(content: str) -> str:
  if not content:
    return ""
  return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _has_readable_plain_content(content: str) -> bool:
  return len(_clean_text(content)) >= MIN_READABLE_PLAIN_CONTENT_CHARS


def _normalize_image_list(value: Any) -> List[str]:
  if not isinstance(value, list):
    return []
  return [_clean_text(item, 2000) for item in value if _clean_text(item)]


def _connect_pg():
  pg_host, pg_port, pg_user, pg_password, pg_database = _resolve_pg_connection_config()
  return psycopg2.connect(
    host=pg_host,
    port=pg_port,
    user=pg_user,
    password=pg_password,
    dbname=pg_database,
    connect_timeout=20,
  )


def _execute_values(cursor, sql: str, rows: Sequence[Tuple[Any, ...]]) -> None:
  if not rows:
    return
  psycopg2.extras.execute_values(cursor, sql, rows, page_size=100)


def _upsert_sources(conn, subscriptions: Sequence[Dict[str, Any]]) -> int:
  rows: List[Tuple[Any, ...]] = []
  for index, item in enumerate(subscriptions):
    fakeid = _clean_text(item.get("fakeid"), 200)
    if not fakeid:
      continue
    rows.append(
      (
        fakeid,
        _clean_text(item.get("nickname"), 300),
        _clean_text(item.get("alias"), 300),
        _clean_text(item.get("head_img"), 2000),
        _clean_text(item.get("category_name"), 200) or None,
        index,
        _safe_int(item.get("article_count"), 0),
        _safe_int(item.get("historical_count"), 0),
        _datetime_to_iso(_timestamp_to_datetime(item.get("last_poll"))),
        _datetime_to_iso(_timestamp_to_datetime(item.get("created_at"))),
        _clean_text(item.get("rss_url"), 2000) or None,
        _clean_text(item.get("historical_rss_url"), 2000) or None,
      )
    )
  with conn.cursor() as cursor:
    _execute_values(
      cursor,
      """
      INSERT INTO ads.marketing_industry_article_sources (
        source_fakeid,
        nickname,
        alias,
        head_img_url,
        category_name,
        display_order,
        upstream_article_count,
        upstream_historical_count,
        upstream_last_poll_at,
        upstream_created_at,
        upstream_rss_url,
        upstream_historical_rss_url
      )
      VALUES %s
      ON CONFLICT (source_fakeid)
      DO UPDATE SET
        nickname = EXCLUDED.nickname,
        alias = EXCLUDED.alias,
        head_img_url = EXCLUDED.head_img_url,
        category_name = EXCLUDED.category_name,
        display_order = EXCLUDED.display_order,
        upstream_article_count = EXCLUDED.upstream_article_count,
        upstream_historical_count = EXCLUDED.upstream_historical_count,
        upstream_last_poll_at = EXCLUDED.upstream_last_poll_at,
        upstream_created_at = COALESCE(
          ads.marketing_industry_article_sources.upstream_created_at,
          EXCLUDED.upstream_created_at
        ),
        upstream_rss_url = EXCLUDED.upstream_rss_url,
        upstream_historical_rss_url = EXCLUDED.upstream_historical_rss_url,
        last_synced_at = NOW(),
        updated_at = NOW()
      """,
      rows,
    )
  conn.commit()
  return len(rows)


def _record_upstream_status(
  conn,
  api_base: str,
  status: Dict[str, Any],
  error: Optional[Exception] = None,
) -> None:
  authenticated = bool(status.get("authenticated")) if not error else False
  logged_in = bool(status.get("loggedIn")) if not error else False
  is_expired = bool(status.get("isExpired")) if not error else False
  expires_at = _timestamp_to_datetime(status.get("expireTime"), milliseconds=True)
  login_status = "ok"
  if error:
    login_status = "unavailable"
  elif is_expired or not authenticated or not logged_in:
    login_status = "expired"

  with conn.cursor() as cursor:
    cursor.execute(
      """
      INSERT INTO etl.marketing_industry_article_upstream_status (
        status_key,
        api_base,
        authenticated,
        logged_in,
        is_expired,
        login_status,
        login_expires_at,
        last_checked_at,
        last_error,
        updated_at
      )
      VALUES (
        'wechat_download_api',
        %s,
        %s,
        %s,
        %s,
        %s,
        %s,
        NOW(),
        %s,
        NOW()
      )
      ON CONFLICT (status_key)
      DO UPDATE SET
        api_base = EXCLUDED.api_base,
        authenticated = EXCLUDED.authenticated,
        logged_in = EXCLUDED.logged_in,
        is_expired = EXCLUDED.is_expired,
        login_status = EXCLUDED.login_status,
        login_expires_at = EXCLUDED.login_expires_at,
        last_checked_at = EXCLUDED.last_checked_at,
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
      """,
      (
        api_base,
        authenticated,
        logged_in,
        is_expired,
        login_status,
        _datetime_to_iso(expires_at),
        str(error)[:2000] if error else None,
      ),
    )
  conn.commit()


def _source_readiness(conn) -> SourceReadiness:
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
    cursor.execute(
      """
      SELECT
        source.source_fakeid,
        source.nickname,
        source.alias,
        source.source_priority,
        source.last_success_at,
        source.next_retry_at,
        (source.next_retry_at IS NULL OR source.next_retry_at <= NOW()) AS retry_ready
      FROM ads.marketing_industry_article_sources AS source
      LEFT JOIN etl.marketing_industry_article_sync_state AS sync_state
        ON sync_state.source_fakeid = source.source_fakeid
      WHERE source.enabled = TRUE
      ORDER BY
        sync_state.last_started_at ASC NULLS FIRST,
        source.display_order ASC,
        source.nickname ASC,
        source.source_fakeid ASC
      """
    )
    rows = [dict(row) for row in cursor.fetchall()]

  ready_sources: List[Dict[str, Any]] = []
  deferred_retry_times: List[datetime] = []
  for row in rows:
    retry_ready = bool(row.pop("retry_ready", False))
    if retry_ready:
      ready_sources.append(row)
      continue
    next_retry_at = row.get("next_retry_at")
    if isinstance(next_retry_at, datetime):
      deferred_retry_times.append(next_retry_at)

  return SourceReadiness(
    enabled_count=len(rows),
    ready_sources=ready_sources,
    deferred_count=len(rows) - len(ready_sources),
    earliest_retry_at=min(deferred_retry_times) if deferred_retry_times else None,
  )


def _existing_content_urls(conn, source_fakeid: str, urls: Sequence[str]) -> set[str]:
  if not urls:
    return set()
  with conn.cursor() as cursor:
    cursor.execute(
      """
      SELECT article_url
      FROM ads.marketing_industry_articles
      WHERE source_fakeid = %s
        AND article_url = ANY(%s)
        AND content_status = 'content_fetched'
        AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) >= %s
        AND is_deleted = FALSE
      """,
      (source_fakeid, list(urls), MIN_READABLE_PLAIN_CONTENT_CHARS),
    )
    return {row[0] for row in cursor.fetchall()}


def _upsert_articles(
  conn,
  source: Dict[str, Any],
  articles: Sequence[Dict[str, Any]],
  fetch_source: str = "api_list",
) -> int:
  rows: List[Tuple[Any, ...]] = []
  source_fakeid = source["source_fakeid"]
  source_nickname = _clean_text(source.get("nickname"), 300)
  source_alias = _clean_text(source.get("alias"), 300)
  source_priority = _clean_text(source.get("source_priority"), 20) or "normal"

  for article in articles:
    title = _clean_text(article.get("title"), 1000)
    article_url = _clean_text(article.get("link") or article.get("article_url"), 2000)
    if not title or not article_url:
      continue

    update_time = _timestamp_to_datetime(article.get("update_time") or article.get("publish_time"))
    create_time = _timestamp_to_datetime(article.get("create_time"))
    publish_time = update_time or create_time
    plain_content = _clean_text(article.get("plain_content"))
    content_html = _clean_text(article.get("content"))
    content_status = article.get("content_status") or (
      "content_fetched" if _has_readable_plain_content(plain_content) else "list_only"
    )
    if content_status == "content_fetched" and not _has_readable_plain_content(plain_content):
      content_status = "list_only"
    images = _normalize_image_list(article.get("images"))

    rows.append(
      (
        source_fakeid,
        source_nickname,
        source_alias,
        _clean_text(article.get("aid"), 200),
        title,
        _clean_text(article.get("digest"), 2000),
        article_url,
        _clean_text(article.get("cover") or article.get("cover_url"), 2000),
        _clean_text(article.get("author"), 500),
        _datetime_to_iso(publish_time),
        _date_to_iso(publish_time),
        _datetime_to_iso(update_time),
        _datetime_to_iso(create_time),
        content_html,
        plain_content,
        psycopg2.extras.Json(images),
        _content_hash(plain_content or content_html),
        content_status,
        _clean_text(article.get("content_fetch_error"), 2000) or None,
        fetch_source,
        source_priority,
        _datetime_to_iso(datetime.now(timezone.utc)) if content_status == "content_fetched" else None,
      )
    )

  with conn.cursor() as cursor:
    _execute_values(
      cursor,
      """
      INSERT INTO ads.marketing_industry_articles (
        source_fakeid,
        source_nickname,
        source_alias,
        aid,
        title,
        digest,
        article_url,
        cover_url,
        author,
        publish_time,
        publish_date,
        update_time,
        create_time,
        content_html,
        plain_content,
        images,
        content_hash,
        content_status,
        content_fetch_error,
        fetch_source,
        source_priority_snapshot,
        last_content_fetched_at
      )
      VALUES %s
      ON CONFLICT (source_fakeid, article_url)
      DO UPDATE SET
        source_nickname = EXCLUDED.source_nickname,
        source_alias = EXCLUDED.source_alias,
        aid = COALESCE(NULLIF(EXCLUDED.aid, ''), ads.marketing_industry_articles.aid),
        title = EXCLUDED.title,
        digest = EXCLUDED.digest,
        cover_url = EXCLUDED.cover_url,
        author = COALESCE(NULLIF(EXCLUDED.author, ''), ads.marketing_industry_articles.author),
        publish_time = COALESCE(EXCLUDED.publish_time, ads.marketing_industry_articles.publish_time),
        publish_date = COALESCE(EXCLUDED.publish_date, ads.marketing_industry_articles.publish_date),
        update_time = COALESCE(EXCLUDED.update_time, ads.marketing_industry_articles.update_time),
        create_time = COALESCE(EXCLUDED.create_time, ads.marketing_industry_articles.create_time),
        content_html = CASE
          WHEN EXCLUDED.content_html <> '' THEN EXCLUDED.content_html
          ELSE ads.marketing_industry_articles.content_html
        END,
        plain_content = CASE
          WHEN EXCLUDED.plain_content <> '' THEN EXCLUDED.plain_content
          ELSE ads.marketing_industry_articles.plain_content
        END,
        images = CASE
          WHEN jsonb_array_length(EXCLUDED.images) > 0 THEN EXCLUDED.images
          ELSE ads.marketing_industry_articles.images
        END,
        content_hash = CASE
          WHEN EXCLUDED.content_hash <> '' THEN EXCLUDED.content_hash
          ELSE ads.marketing_industry_articles.content_hash
        END,
        content_status = CASE
          WHEN EXCLUDED.content_status = 'content_fetched' THEN EXCLUDED.content_status
          WHEN ads.marketing_industry_articles.content_status = 'content_fetched'
            THEN ads.marketing_industry_articles.content_status
          WHEN EXCLUDED.content_status = 'list_only'
            AND ads.marketing_industry_articles.content_status = 'content_failed'
            THEN ads.marketing_industry_articles.content_status
          ELSE EXCLUDED.content_status
        END,
        content_fetch_error = CASE
          WHEN EXCLUDED.content_status = 'content_fetched' THEN NULL
          WHEN EXCLUDED.content_fetch_error IS NOT NULL THEN EXCLUDED.content_fetch_error
          WHEN EXCLUDED.content_status = 'list_only' THEN ads.marketing_industry_articles.content_fetch_error
          ELSE ads.marketing_industry_articles.content_fetch_error
        END,
        fetch_source = CASE
          WHEN EXCLUDED.content_status = 'list_only'
            AND ads.marketing_industry_articles.content_status IN ('content_fetched', 'content_failed')
            THEN ads.marketing_industry_articles.fetch_source
          ELSE EXCLUDED.fetch_source
        END,
        source_priority_snapshot = EXCLUDED.source_priority_snapshot,
        last_content_fetched_at = COALESCE(
          EXCLUDED.last_content_fetched_at,
          ads.marketing_industry_articles.last_content_fetched_at
        ),
        fetched_at = NOW(),
        updated_at = NOW(),
        is_deleted = FALSE
      """,
      rows,
    )
  conn.commit()
  return len(rows)


def _mark_source_success(
  conn,
  source_fakeid: str,
  run_id: str,
  last_seen_article: Optional[Dict[str, Any]],
) -> None:
  last_seen_url = None
  last_seen_publish_time = None
  if last_seen_article:
    last_seen_url = _clean_text(last_seen_article.get("link") or last_seen_article.get("article_url"), 2000)
    last_seen_publish_time = _timestamp_to_datetime(
      last_seen_article.get("update_time") or last_seen_article.get("publish_time")
    ) or _timestamp_to_datetime(last_seen_article.get("create_time"))

  with conn.cursor() as cursor:
    cursor.execute(
      """
      INSERT INTO etl.marketing_industry_article_sync_state (
        source_fakeid,
        last_seen_publish_time,
        last_seen_article_url,
        last_run_id,
        last_started_at,
        last_success_at,
        last_error_at,
        last_error,
        consecutive_failures,
        updated_at
      )
      VALUES (%s, %s, %s, %s, NOW(), NOW(), NULL, NULL, 0, NOW())
      ON CONFLICT (source_fakeid)
      DO UPDATE SET
        last_seen_publish_time = COALESCE(EXCLUDED.last_seen_publish_time, etl.marketing_industry_article_sync_state.last_seen_publish_time),
        last_seen_article_url = COALESCE(EXCLUDED.last_seen_article_url, etl.marketing_industry_article_sync_state.last_seen_article_url),
        last_run_id = EXCLUDED.last_run_id,
        last_started_at = EXCLUDED.last_started_at,
        last_success_at = EXCLUDED.last_success_at,
        last_error_at = NULL,
        last_error = NULL,
        consecutive_failures = 0,
        updated_at = NOW()
      """,
      (source_fakeid, _datetime_to_iso(last_seen_publish_time), last_seen_url, run_id),
    )
    cursor.execute(
      """
      UPDATE ads.marketing_industry_article_sources
      SET
        last_success_at = NOW(),
        last_error_at = NULL,
        last_error = NULL,
        consecutive_failures = 0,
        next_retry_at = NULL,
        updated_at = NOW()
      WHERE source_fakeid = %s
      """,
      (source_fakeid,),
    )
  conn.commit()


def _mark_source_failure(conn, source_fakeid: str, run_id: str, error: Exception) -> None:
  message = str(error)[:2000]
  with conn.cursor() as cursor:
    cursor.execute(
      """
      INSERT INTO etl.marketing_industry_article_sync_state (
        source_fakeid,
        last_run_id,
        last_started_at,
        last_error_at,
        last_error,
        consecutive_failures,
        updated_at
      )
      VALUES (%s, %s, NOW(), NOW(), %s, 1, NOW())
      ON CONFLICT (source_fakeid)
      DO UPDATE SET
        last_run_id = EXCLUDED.last_run_id,
        last_started_at = EXCLUDED.last_started_at,
        last_error_at = NOW(),
        last_error = EXCLUDED.last_error,
        consecutive_failures = etl.marketing_industry_article_sync_state.consecutive_failures + 1,
        updated_at = NOW()
      """,
      (source_fakeid, run_id, message),
    )
    cursor.execute(
      """
      UPDATE ads.marketing_industry_article_sources
      SET
        last_error_at = NOW(),
        last_error = %s,
        consecutive_failures = consecutive_failures + 1,
        next_retry_at = CASE
          WHEN consecutive_failures + 1 >= 3 THEN NOW() + INTERVAL '30 minutes'
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE source_fakeid = %s
      """,
      (message, source_fakeid),
    )
  conn.commit()


def _sleep_if_needed(seconds: float) -> None:
  if seconds > 0:
    time.sleep(seconds)


def _rate_limit_wait_seconds(error: Exception, buffer_seconds: float) -> Optional[float]:
  message = str(error)
  if not _is_rate_limit_reason(message):
    return None
  match = re.search(r"(\d+(?:\.\d+)?)\s*秒", message)
  wait_seconds = float(match.group(1)) if match else 10.0
  return max(1.0, wait_seconds + buffer_seconds)


def _fetch_article_list_with_retry(
  client: WechatDownloadClient,
  fakeid: str,
  begin: int,
  count: int,
  max_attempts: int,
  rate_limit_buffer_seconds: float,
) -> Tuple[List[Dict[str, Any]], int]:
  attempts = max(1, max_attempts)
  last_error: Optional[Exception] = None
  for attempt in range(1, attempts + 1):
    try:
      return client.list_articles(fakeid=fakeid, begin=begin, count=count)
    except Exception as error:
      last_error = error
      wait_seconds = _rate_limit_wait_seconds(error, rate_limit_buffer_seconds)
      if wait_seconds is None or attempt >= attempts:
        raise
      get_run_logger().warning(
        "Wechat article list rate limited; waiting %.1fs before retry %s/%s",
        wait_seconds,
        attempt + 1,
        attempts,
      )
      _sleep_if_needed(wait_seconds)

  raise WechatDownloadApiError(str(last_error) if last_error else "list articles failed")


def _fetch_article_content_with_retry(
  client: WechatDownloadClient,
  article_url: str,
  max_attempts: int,
  rate_limit_buffer_seconds: float,
) -> Dict[str, Any]:
  attempts = max(1, max_attempts)
  last_error: Optional[Exception] = None
  for attempt in range(1, attempts + 1):
    try:
      return client.fetch_article_content(article_url)
    except Exception as error:
      last_error = error
      wait_seconds = _rate_limit_wait_seconds(error, rate_limit_buffer_seconds)
      if wait_seconds is None or attempt >= attempts:
        raise
      get_run_logger().warning(
        "Wechat article content rate limited; waiting %.1fs before retry %s/%s",
        wait_seconds,
        attempt + 1,
        attempts,
      )
      _sleep_if_needed(wait_seconds)

  raise WechatDownloadApiError(str(last_error) if last_error else "fetch article content failed")


def _should_skip_old_article(article: Dict[str, Any], lookback_days: int) -> bool:
  publish_time = _timestamp_to_datetime(article.get("update_time") or article.get("create_time"))
  if publish_time is None:
    return False
  age_seconds = datetime.now(timezone.utc).timestamp() - publish_time.timestamp()
  return age_seconds > lookback_days * 86400


def _fetch_content_for_new_articles(
  conn,
  client: WechatDownloadClient,
  source_fakeid: str,
  articles: List[Dict[str, Any]],
  sleep_seconds: float,
  content_fetch_retries: int,
  rate_limit_buffer_seconds: float,
) -> Tuple[List[Dict[str, Any]], int, int]:
  urls = [_clean_text(article.get("link"), 2000) for article in articles]
  existing_content_urls = _existing_content_urls(conn, source_fakeid, urls)
  enriched: List[Dict[str, Any]] = []
  fetched_count = 0
  failed_count = 0

  for article in articles:
    article_url = _clean_text(article.get("link"), 2000)
    if not article_url or article_url in existing_content_urls:
      enriched.append(article)
      continue

    try:
      _sleep_if_needed(sleep_seconds)
      content = _fetch_article_content_with_retry(
        client=client,
        article_url=article_url,
        max_attempts=content_fetch_retries,
        rate_limit_buffer_seconds=rate_limit_buffer_seconds,
      )
      merged = dict(article)
      merged["content"] = _clean_text(content.get("content"))
      merged["plain_content"] = _clean_text(content.get("plain_content"))
      if not _has_readable_plain_content(merged["plain_content"]):
        raise WechatDownloadApiError(UNREADABLE_ARTICLE_CONTENT_ERROR)
      merged["images"] = content.get("images") if isinstance(content.get("images"), list) else []
      merged["author"] = _clean_text(content.get("author")) or _clean_text(article.get("author"))
      if content.get("publish_time"):
        merged["update_time"] = content.get("publish_time")
      merged["content_status"] = "content_fetched"
      enriched.append(merged)
      fetched_count += 1
    except Exception as error:
      failed = dict(article)
      failed["content_status"] = "content_failed"
      failed["content_fetch_error"] = str(error)[:2000]
      enriched.append(failed)
      failed_count += 1

  return enriched, fetched_count, failed_count


def _cached_content_urls(cache_db_path: str, *, strict: bool = False) -> set[str]:
  try:
    return rss_cache_store.cached_content_urls(
      cache_db_path,
      MIN_READABLE_PLAIN_CONTENT_CHARS,
    )
  except RssCacheReadError as error:
    if strict:
      raise
    get_run_logger().warning("%s", error)
    return set()


def _missing_content_articles(
  conn,
  limit: int,
  cache_db_path: str,
  retry_permanent_failures: bool,
  strict_cache: bool = False,
) -> List[Dict[str, Any]]:
  cached_urls = _cached_content_urls(cache_db_path, strict=strict_cache)
  with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
    cursor.execute(
      """
      SELECT
        id,
        source_fakeid,
        source_nickname,
        title,
        article_url,
        content_status
      FROM ads.marketing_industry_articles
      WHERE is_deleted = FALSE
        AND BTRIM(article_url) <> ''
        AND (
          content_status = 'list_only'
          OR (
            content_status = 'content_fetched'
            AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) < %s
          )
          OR (
            content_status = 'content_failed'
            AND (
              %s
              OR content_fetch_error LIKE 'Rate limited:%%'
              OR content_fetch_error ILIKE '%%超时%%'
              OR content_fetch_error LIKE '触发微信安全验证%%'
              OR content_fetch_error ILIKE '%%登录%%'
            )
          )
        )
      ORDER BY
        CASE WHEN article_url = ANY(%s) THEN 0 ELSE 1 END,
        CASE
          WHEN content_status = 'content_fetched'
            AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) < %s
            THEN 0
          ELSE 1
        END,
        CASE
          WHEN content_status = 'content_failed'
            AND content_fetch_error LIKE 'Rate limited:%%'
            THEN 0
          ELSE 1
        END,
        CASE WHEN content_status = 'list_only' THEN 0 ELSE 1 END,
        publish_time DESC NULLS LAST,
        id DESC
      LIMIT %s
      """,
      (
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        retry_permanent_failures,
        list(cached_urls),
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        limit,
      ),
    )
    return [dict(row) for row in cursor.fetchall()]


def _count_content_backlog(
  conn,
  retry_permanent_failures: bool,
) -> Tuple[int, int, int]:
  with conn.cursor() as cursor:
    cursor.execute(
      """
      WITH article_flags AS (
        SELECT
          content_status = 'content_failed' AS is_content_failed,
          content_status = 'content_failed'
            AND content_fetch_error = ANY(%s) AS is_permanent_unreadable,
          (
            content_status = 'list_only'
            OR (
              content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) < %s
            )
            OR (
              content_status = 'content_failed'
              AND (
                %s
                OR content_fetch_error LIKE 'Rate limited:%%'
                OR content_fetch_error ILIKE '%%超时%%'
                OR content_fetch_error LIKE '触发微信安全验证%%'
                OR content_fetch_error ILIKE '%%登录%%'
              )
            )
          ) AS is_retryable_missing
        FROM ads.marketing_industry_articles
        WHERE is_deleted = FALSE
          AND BTRIM(article_url) <> ''
      )
      SELECT
        COUNT(*) FILTER (WHERE is_retryable_missing) AS retryable_missing_count,
        COUNT(*) FILTER (WHERE is_permanent_unreadable) AS permanent_unreadable_count,
        COUNT(*) FILTER (
          WHERE is_content_failed
            AND NOT is_retryable_missing
            AND NOT is_permanent_unreadable
        ) AS deferred_failed_count
      FROM article_flags
      """,
      (
        list(PERMANENT_UNREADABLE_CONTENT_ERRORS),
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        retry_permanent_failures,
      ),
    )
    row = cursor.fetchone()
    return int(row[0]), int(row[1]), int(row[2])


def _is_permanent_unreadable_content_error(error: Exception) -> bool:
  return str(error).strip() in PERMANENT_UNREADABLE_CONTENT_ERRORS


def _mark_article_content_fetched(
  conn,
  article_id: int,
  content: Dict[str, Any],
) -> None:
  content_html = _clean_text(content.get("content"))
  plain_content = _clean_text(content.get("plain_content"))
  if not _has_readable_plain_content(plain_content):
    raise WechatDownloadApiError(UNREADABLE_ARTICLE_CONTENT_ERROR)

  images = _normalize_image_list(content.get("images"))
  publish_time = _timestamp_to_datetime(content.get("publish_time"))
  with conn.cursor() as cursor:
    cursor.execute(
      """
      UPDATE ads.marketing_industry_articles
      SET
        author = COALESCE(NULLIF(%s, ''), author),
        publish_time = COALESCE(%s, publish_time),
        publish_date = COALESCE(%s, publish_date),
        update_time = COALESCE(%s, update_time),
        content_html = %s,
        plain_content = %s,
        images = CASE WHEN %s THEN %s ELSE images END,
        content_hash = %s,
        content_status = 'content_fetched',
        content_fetch_error = NULL,
        fetch_source = 'api_article',
        last_content_fetched_at = NOW(),
        fetched_at = NOW(),
        updated_at = NOW(),
        is_deleted = FALSE
      WHERE id = %s
      """,
      (
        _clean_text(content.get("author"), 500),
        _datetime_to_iso(publish_time),
        _date_to_iso(publish_time),
        _datetime_to_iso(publish_time),
        content_html,
        plain_content,
        bool(images),
        psycopg2.extras.Json(images),
        _content_hash(plain_content or content_html),
        article_id,
      ),
    )
  conn.commit()


def _mark_article_content_failed(conn, article_id: int, error: Exception) -> None:
  with conn.cursor() as cursor:
    cursor.execute(
      """
      UPDATE ads.marketing_industry_articles
      SET
        content_status = CASE
          WHEN content_status = 'content_fetched'
            AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) >= %s
            THEN content_status
          ELSE 'content_failed'
        END,
        content_fetch_error = CASE
          WHEN content_status = 'content_fetched'
            AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) >= %s
            THEN content_fetch_error
          ELSE %s
        END,
        fetch_source = CASE
          WHEN content_status = 'content_fetched'
            AND CHAR_LENGTH(BTRIM(COALESCE(plain_content, ''))) >= %s
            THEN fetch_source
          ELSE 'api_article'
        END,
        fetched_at = NOW(),
        updated_at = NOW()
      WHERE id = %s
      """,
      (
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        str(error)[:2000],
        MIN_READABLE_PLAIN_CONTENT_CHARS,
        article_id,
      ),
    )
  conn.commit()


def _fetch_cached_article_content(
  cache_db_path: str,
  article_url: str,
  *,
  strict: bool = False,
) -> Optional[Dict[str, Any]]:
  try:
    return rss_cache_store.fetch_cached_article_content(
      cache_db_path,
      article_url,
      MIN_READABLE_PLAIN_CONTENT_CHARS,
    )
  except RssCacheReadError as error:
    if strict:
      raise
    get_run_logger().warning("%s", error)
    return None


def _mark_article_content_fetched_from_cache(
  conn,
  article_id: int,
  content: Dict[str, Any],
) -> None:
  content_html = _clean_text(content.get("content"))
  plain_content = _clean_text(content.get("plain_content"))
  if not _has_readable_plain_content(plain_content):
    raise WechatDownloadApiError(UNREADABLE_CACHED_CONTENT_ERROR)

  publish_time = _timestamp_to_datetime(content.get("publish_time"))
  with conn.cursor() as cursor:
    cursor.execute(
      """
      UPDATE ads.marketing_industry_articles
      SET
        author = COALESCE(NULLIF(%s, ''), author),
        publish_time = COALESCE(%s, publish_time),
        publish_date = COALESCE(%s, publish_date),
        update_time = COALESCE(%s, update_time),
        content_html = %s,
        plain_content = %s,
        content_hash = %s,
        content_status = 'content_fetched',
        content_fetch_error = NULL,
        fetch_source = 'rss_fallback',
        last_content_fetched_at = NOW(),
        fetched_at = NOW(),
        updated_at = NOW(),
        is_deleted = FALSE
      WHERE id = %s
      """,
      (
        _clean_text(content.get("author"), 500),
        _datetime_to_iso(publish_time),
        _date_to_iso(publish_time),
        _datetime_to_iso(publish_time),
        content_html,
        plain_content,
        _content_hash(plain_content or content_html),
        article_id,
      ),
    )
  conn.commit()


def _backfill_missing_content(
  conn,
  client: WechatDownloadClient,
  max_articles: int,
  sleep_seconds: float,
  content_fetch_retries: int,
  rate_limit_buffer_seconds: float,
  rss_cache_db_path: str,
  cache_only: bool,
  retry_permanent_failures: bool,
) -> ContentBackfillResult:
  logger = get_run_logger()
  result = ContentBackfillResult()
  candidates = _missing_content_articles(
    conn,
    max_articles,
    rss_cache_db_path,
    retry_permanent_failures,
    strict_cache=cache_only,
  )

  for index, article in enumerate(candidates, start=1):
    article_id = int(article["id"])
    article_url = _clean_text(article.get("article_url"), 2000)
    title = _clean_text(article.get("title"), 120)
    result.attempted_count += 1
    try:
      cached_content = _fetch_cached_article_content(
        rss_cache_db_path,
        article_url,
        strict=cache_only,
      )
      if cached_content:
        _mark_article_content_fetched_from_cache(conn, article_id, cached_content)
        result.fetched_count += 1
        continue
      if cache_only:
        continue

      _sleep_if_needed(sleep_seconds)
      content = _fetch_article_content_with_retry(
        client=client,
        article_url=article_url,
        max_attempts=content_fetch_retries,
        rate_limit_buffer_seconds=rate_limit_buffer_seconds,
      )
      _mark_article_content_fetched(conn, article_id, content)
      result.fetched_count += 1
    except Exception as error:
      if cache_only and isinstance(error, RssCacheReadError):
        raise
      _mark_article_content_failed(conn, article_id, error)
      result.failed_count += 1
      if len(result.sample_errors) < 5:
        error_label = "不可读正文" if _is_permanent_unreadable_content_error(error) else "正文失败"
        result.sample_errors.append(f"{error_label}：{title}: {str(error)[:160]}")

    if index % 10 == 0 or index == len(candidates):
      logger.info(
        "Backfilled article content progress: %s/%s fetched=%s failed=%s",
        index,
        len(candidates),
        result.fetched_count,
        result.failed_count,
      )

  (
    result.remaining_count,
    result.permanent_unreadable_count,
    result.deferred_failed_count,
  ) = _count_content_backlog(conn, retry_permanent_failures)
  return result


def _sync_one_source(
  conn,
  client: WechatDownloadClient,
  source: Dict[str, Any],
  config: SyncConfig,
  run_id: str,
) -> SourceSyncResult:
  source_fakeid = str(source["source_fakeid"])
  result = SourceSyncResult(
    source_fakeid=source_fakeid,
    nickname=_clean_text(source.get("nickname"), 300),
  )
  last_seen_article: Optional[Dict[str, Any]] = None

  try:
    for page_index in range(config.max_pages_per_source):
      begin = page_index * config.page_size
      _sleep_if_needed(config.request_sleep_seconds if page_index > 0 else 0)
      articles, total = _fetch_article_list_with_retry(
        client=client,
        fakeid=source_fakeid,
        begin=begin,
        count=config.page_size,
        max_attempts=config.list_fetch_attempts,
        rate_limit_buffer_seconds=config.rate_limit_buffer_seconds,
      )
      if page_index == 0 and articles:
        last_seen_article = articles[0]
      if not articles:
        break

      active_articles = []
      for article in articles:
        if _should_skip_old_article(article, config.lookback_days):
          result.skipped_old_count += 1
          continue
        active_articles.append(article)

      result.listed_count += len(active_articles)
      if config.fetch_full_content:
        active_articles, fetched_count, failed_count = _fetch_content_for_new_articles(
          conn=conn,
          client=client,
          source_fakeid=source_fakeid,
          articles=active_articles,
          sleep_seconds=config.request_sleep_seconds,
          content_fetch_retries=config.content_fetch_retries,
          rate_limit_buffer_seconds=config.rate_limit_buffer_seconds,
        )
        result.content_fetched_count += fetched_count
        result.failed_count += failed_count

      result.upserted_count += _upsert_articles(conn, source, active_articles)
      if begin + config.page_size >= total:
        break
      if result.skipped_old_count > 0 and not active_articles:
        break

    _mark_source_success(conn, source_fakeid, run_id, last_seen_article)
    return result
  except Exception as error:
    result.last_error = str(error)
    result.failed_count += 1
    _mark_source_failure(conn, source_fakeid, run_id, error)
    return result


def _sync_sources(
  conn,
  client: WechatDownloadClient,
  sources: Sequence[Dict[str, Any]],
  config: SyncConfig,
  run_id: str,
) -> List[SourceSyncResult]:
  results: List[SourceSyncResult] = []
  for index, source in enumerate(sources):
    if index > 0:
      _sleep_if_needed(config.request_sleep_seconds)
    result = _sync_one_source(conn, client, source, config, run_id)
    results.append(result)
    if result.last_error and _is_rate_limit_reason(result.last_error):
      get_run_logger().warning(
        (
          "Global WeChat frequency control confirmed; stopping source fan-out "
          "after attempted_sources=%s remaining_sources=%s"
        ),
        len(results),
        len(sources) - len(results),
      )
      break
  return results


def _build_summary(
  results: Sequence[SourceSyncResult],
  source_count: int,
  backfill_result: Optional[ContentBackfillResult] = None,
) -> List[str]:
  listed = sum(item.listed_count for item in results)
  upserted = sum(item.upserted_count for item in results)
  content_fetched = sum(item.content_fetched_count for item in results)
  failed_sources = [item for item in results if item.last_error]
  lines = [
    f"来源数：{source_count}，已处理：{len(results)}，失败来源：{len(failed_sources)}",
    f"列表文章：{listed}，写入/更新：{upserted}，正文补取：{content_fetched}",
  ]
  if backfill_result:
    lines.append(
      "正文回填："
      f"尝试 {backfill_result.attempted_count}，"
      f"成功 {backfill_result.fetched_count}，"
      f"失败 {backfill_result.failed_count}，"
      f"剩余待重试缺正文 {backfill_result.remaining_count}"
    )
    if backfill_result.permanent_unreadable_count > 0:
      lines.append(f"不可读正文：{backfill_result.permanent_unreadable_count}（已排除默认重试）")
    if backfill_result.deferred_failed_count > 0:
      lines.append(f"其他未列入默认重试失败：{backfill_result.deferred_failed_count}")
    for sample_error in backfill_result.sample_errors:
      lines.append(f"正文失败样例：{sample_error}")
  for item in failed_sources[:5]:
    lines.append(f"{item.nickname or item.source_fakeid} 失败：{item.last_error[:160]}")
  return lines


def _safe_send_notification(**kwargs) -> bool:
  try:
    return send_feishu_notification(**kwargs, raise_on_error=False)
  except Exception as notify_err:
    get_run_logger().warning(f"Feishu notification failed: {notify_err}")
    return False


def _send_failure_notification(
  title: str,
  table_name: str,
  action: str,
  status: str,
  reason: str,
  detail_lines: Sequence[str],
  webhook_url: Optional[str] = None,
) -> None:
  logger = get_run_logger()
  notification_mode = _resolve_notification_mode()
  if notification_mode == "off":
    logger.warning(
      "Marketing industry article failure notification skipped by notify_mode=off; reason=%s",
      (reason or "")[:220],
    )
    return

  resolved_webhook_url = webhook_url or DEFAULT_FEISHU_WEBHOOK_URL
  if not _is_login_expired_reason(reason):
    state_path = _resolve_notification_state_path()
    now = datetime.now(timezone.utc)
    try:
      state = _read_notification_state(state_path)
      decision = _build_failure_incident_state(
        state=state,
        reason=reason,
        now=now,
        repeat_seconds=_resolve_failure_alert_repeat_seconds(),
      )
      if not decision.should_send:
        _write_notification_state(state_path, decision.state)
        logger.warning(
          (
            "Marketing industry article failure notification suppressed; "
            "suppressed_count=%s last_sent_at=%s state_path=%s"
          ),
          decision.suppressed_count,
          _datetime_to_iso(decision.last_sent_at),
          state_path,
        )
        return

      sent = _safe_send_notification(
        title=title,
        table_name=table_name,
        action=action,
        status=status,
        reason=reason,
        detail_lines=detail_lines,
        webhook_url=resolved_webhook_url,
      )
      next_state = (
        _mark_failure_notification_sent(decision.state, decision.scope, now)
        if sent
        else decision.state
      )
      _write_notification_state(state_path, next_state)
    except Exception as throttle_error:
      logger.warning(
        "Failure notification throttle failed, fallback to direct alert: %s",
        throttle_error,
      )
      _safe_send_notification(
        title=title,
        table_name=table_name,
        action=action,
        status=status,
        reason=reason,
        detail_lines=detail_lines,
        webhook_url=resolved_webhook_url,
      )
    return

  state_path = _resolve_notification_state_path()
  now = datetime.now(timezone.utc)
  try:
    state = _read_notification_state(state_path)
    decision = _build_login_expired_failure_state(
      state=state,
      reason=reason,
      now=now,
      repeat_seconds=_resolve_login_expired_alert_repeat_seconds(),
    )
    if not decision.should_send:
      _write_notification_state(state_path, decision.state)
      logger.warning(
        (
          "Marketing industry article login-expired notification suppressed; "
          "suppressed_count=%s last_sent_at=%s state_path=%s"
        ),
        decision.suppressed_count,
        _datetime_to_iso(decision.last_sent_at),
        state_path,
      )
      return

    sent = _safe_send_notification(
      title=title,
      table_name=table_name,
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=resolved_webhook_url,
    )
    next_state = (
      _mark_login_expired_notification_sent(decision.state, now)
      if sent
      else decision.state
    )
    _write_notification_state(state_path, next_state)
  except Exception as throttle_error:
    logger.warning(
      "Login-expired notification throttle failed, fallback to direct alert: %s",
      throttle_error,
    )
    _safe_send_notification(
      title=title,
      table_name=table_name,
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=resolved_webhook_url,
    )


def _send_success_notification(
  title: str,
  table_name: str,
  action: str,
  status: str,
  reason: str,
  detail_lines: Sequence[str],
  webhook_url: Optional[str] = None,
) -> None:
  logger = get_run_logger()
  notification_mode = _resolve_notification_mode()
  if notification_mode == "off":
    logger.info("Marketing industry article success notification skipped by notify_mode=off.")
    return

  state_path = _resolve_notification_state_path()
  resolved_webhook_url = webhook_url or DEFAULT_FEISHU_WEBHOOK_URL
  notification_detail_lines = list(detail_lines)
  cache_only_upstream_unverified = CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL in detail_lines
  has_issue = _has_success_notification_issue(detail_lines)
  has_pending_login_recovery = False
  failure_recovery_scopes: List[str] = []
  state = _empty_notification_state()

  try:
    state = _read_notification_state(state_path)
    has_pending_login_recovery = (
      not cache_only_upstream_unverified
      and _has_pending_login_expired_recovery(state)
    )
    failure_recovery_scopes = _eligible_failure_recovery_scopes(
      state,
      detail_lines,
    )
    if has_pending_login_recovery:
      notification_detail_lines = _build_login_expired_recovery_detail_lines(
        state,
        notification_detail_lines,
      )
    if failure_recovery_scopes:
      notification_detail_lines = _build_failure_recovery_detail_lines(
        state,
        failure_recovery_scopes,
        notification_detail_lines,
      )
    if (
      cache_only_upstream_unverified
      and _has_pending_login_expired_recovery(state)
    ):
      logger.info("Cache-only success does not prove login recovery; state remains pending.")
  except Exception as state_error:
    logger.warning("Notification recovery state read failed: %s", state_error)

  has_pending_recovery = has_pending_login_recovery or bool(failure_recovery_scopes)
  if notification_mode == "errors" and not has_pending_recovery and not has_issue:
    logger.info("Marketing industry article success notification skipped by notify_mode=errors.")
    return

  sent = _safe_send_notification(
    title=title,
    table_name=table_name,
    action=action,
    status=status,
    reason=reason,
    detail_lines=notification_detail_lines,
    webhook_url=resolved_webhook_url,
  )

  if not has_pending_recovery:
    return
  if not sent:
    logger.warning("Recovery notification was not sent; state remains pending.")
    return

  try:
    next_state = state
    if has_pending_login_recovery:
      next_state = _clear_login_expired_recovery_state(next_state)
    if failure_recovery_scopes:
      next_state = _clear_failure_recovery_state(next_state, failure_recovery_scopes)
    _write_notification_state(state_path, next_state)
  except Exception as state_error:
    logger.warning("Notification recovery state clear failed: %s", state_error)


@task(name="sync-marketing-industry-articles", retries=0)
def run_sync_task(
  api_base: Optional[str] = None,
  page_size: Optional[int] = None,
  max_pages_per_source: Optional[int] = None,
  max_sources_per_run: Optional[int] = None,
  lookback_days: Optional[int] = None,
  sync_article_lists: Optional[bool] = None,
  fetch_full_content: Optional[bool] = None,
  backfill_missing_content: Optional[bool] = None,
  max_backfill_articles: Optional[int] = None,
  cache_only_backfill: Optional[bool] = None,
  retry_permanent_failures: Optional[bool] = None,
  content_fetch_retries: Optional[int] = None,
  list_fetch_attempts: Optional[int] = None,
  rate_limit_buffer_seconds: Optional[float] = None,
  request_sleep_seconds: Optional[float] = None,
  timeout_seconds: Optional[int] = None,
  rss_cache_db_path: Optional[str] = None,
) -> List[str]:
  logger = get_run_logger()
  config = _resolve_config(
    api_base=api_base,
    page_size=page_size,
    max_pages_per_source=max_pages_per_source,
    max_sources_per_run=max_sources_per_run,
    lookback_days=lookback_days,
    sync_article_lists=sync_article_lists,
    fetch_full_content=fetch_full_content,
    backfill_missing_content=backfill_missing_content,
    max_backfill_articles=max_backfill_articles,
    cache_only_backfill=cache_only_backfill,
    retry_permanent_failures=retry_permanent_failures,
    content_fetch_retries=content_fetch_retries,
    list_fetch_attempts=list_fetch_attempts,
    rate_limit_buffer_seconds=rate_limit_buffer_seconds,
    request_sleep_seconds=request_sleep_seconds,
    timeout_seconds=timeout_seconds,
    rss_cache_db_path=rss_cache_db_path,
  )
  logger.info(
    (
      "Sync marketing industry articles from %s page_size=%s max_pages=%s "
      "max_sources_per_run=%s list_fetch_attempts=%s "
      "lookback_days=%s fetch_full_content=%s backfill_missing_content=%s "
      "sync_article_lists=%s max_backfill=%s cache_only_backfill=%s "
      "retry_permanent_failures=%s content_fetch_retries=%s rate_limit_buffer=%s"
    ),
    config.api_base,
    config.page_size,
    config.max_pages_per_source,
    config.max_sources_per_run,
    config.list_fetch_attempts,
    config.lookback_days,
    config.fetch_full_content,
    config.backfill_missing_content,
    config.sync_article_lists,
    config.max_backfill_articles,
    config.cache_only_backfill,
    config.retry_permanent_failures,
    config.content_fetch_retries,
    config.rate_limit_buffer_seconds,
  )

  client = WechatDownloadClient(config.api_base, config.timeout_seconds)
  run_id = os.getenv("PREFECT__FLOW_RUN_ID") or datetime.now(timezone.utc).isoformat()
  conn = _connect_pg()
  try:
    requires_upstream = config.sync_article_lists or (
      config.backfill_missing_content and not config.cache_only_backfill
    )
    upserted_sources = 0
    if requires_upstream:
      try:
        status = client.get_status()
        _record_upstream_status(conn, config.api_base, status)
      except Exception as error:
        _record_upstream_status(conn, config.api_base, {}, error)
        raise

      if not status.get("authenticated") or not status.get("loggedIn") or status.get("isExpired"):
        expire_at = _timestamp_to_datetime(status.get("expireTime"), milliseconds=True)
        raise RuntimeError(
          "wechat-download-api login expired or unavailable"
          + (f", expire_at={expire_at.isoformat()}" if expire_at else "")
        )

      subscriptions = client.list_subscriptions()
      if not subscriptions:
        raise RuntimeError("wechat-download-api has no subscriptions")
      upserted_sources = _upsert_sources(conn, subscriptions)
    else:
      logger.info("Cache-only article backfill skips WeChat upstream authentication and subscriptions.")

    results: List[SourceSyncResult] = []
    source_count = upserted_sources
    if config.sync_article_lists:
      readiness = _source_readiness(conn)
      source_count = readiness.enabled_count
      if readiness.enabled_count == 0:
        raise RuntimeError("no enabled marketing industry article sources")
      if not readiness.ready_sources:
        earliest_retry_at = _datetime_to_iso(readiness.earliest_retry_at) or "unknown"
        raise RuntimeError(
          "all enabled marketing industry article sources are retry-deferred; "
          f"enabled_sources={readiness.enabled_count} "
          f"deferred_sources={readiness.deferred_count} "
          f"earliest_retry_at={earliest_retry_at}"
        )
      selected_sources = readiness.ready_sources[:config.max_sources_per_run]
      logger.info(
        "Bounded discovery selected_sources=%s ready_sources=%s enabled_sources=%s",
        len(selected_sources),
        len(readiness.ready_sources),
        readiness.enabled_count,
      )
      results = _sync_sources(conn, client, selected_sources, config, run_id)
      if any(_is_rate_limit_reason(item.last_error) for item in results):
        raise WechatDownloadApiError(
          "wechat-download-api article list sync globally rate limited "
          "(ret=200013, freq control); "
          f"attempted_sources={len(results)} "
          f"enabled_sources={readiness.enabled_count} "
          f"ready_sources={len(readiness.ready_sources)} "
          f"run_source_limit={config.max_sources_per_run} "
          f"skipped_sources={readiness.enabled_count - len(results)}"
        )
    backfill_result = None
    if config.backfill_missing_content:
      backfill_result = _backfill_missing_content(
        conn=conn,
        client=client,
        max_articles=config.max_backfill_articles,
        sleep_seconds=config.request_sleep_seconds,
        content_fetch_retries=config.content_fetch_retries,
        rate_limit_buffer_seconds=config.rate_limit_buffer_seconds,
        rss_cache_db_path=config.rss_cache_db_path,
        cache_only=config.cache_only_backfill,
        retry_permanent_failures=config.retry_permanent_failures,
      )

    summary = _build_summary(results, source_count, backfill_result)
    if not requires_upstream:
      summary.insert(0, CACHE_ONLY_UPSTREAM_UNVERIFIED_DETAIL)
    for line in summary:
      logger.info(line)
    if results and all(item.last_error for item in results):
      raise RuntimeError("all marketing industry article sources failed")
    return summary
  finally:
    conn.close()


@flow(name="sync-marketing-industry-articles-flow")
def sync_marketing_industry_articles_flow(
  api_base: Optional[str] = None,
  page_size: Optional[int] = None,
  max_pages_per_source: Optional[int] = None,
  max_sources_per_run: Optional[int] = None,
  lookback_days: Optional[int] = None,
  sync_article_lists: Optional[bool] = None,
  fetch_full_content: Optional[bool] = None,
  backfill_missing_content: Optional[bool] = None,
  max_backfill_articles: Optional[int] = None,
  cache_only_backfill: Optional[bool] = None,
  retry_permanent_failures: Optional[bool] = None,
  content_fetch_retries: Optional[int] = None,
  list_fetch_attempts: Optional[int] = None,
  rate_limit_buffer_seconds: Optional[float] = None,
  request_sleep_seconds: Optional[float] = None,
  timeout_seconds: Optional[int] = None,
  rss_cache_db_path: Optional[str] = None,
) -> None:
  action = "sync marketing industry articles"
  status = "成功"
  reason = ""
  detail_lines: List[str] = []
  try:
    detail_lines = run_sync_task(
      api_base=api_base,
      page_size=page_size,
      max_pages_per_source=max_pages_per_source,
      max_sources_per_run=max_sources_per_run,
      lookback_days=lookback_days,
      sync_article_lists=sync_article_lists,
      fetch_full_content=fetch_full_content,
      backfill_missing_content=backfill_missing_content,
      max_backfill_articles=max_backfill_articles,
      cache_only_backfill=cache_only_backfill,
      retry_permanent_failures=retry_permanent_failures,
      content_fetch_retries=content_fetch_retries,
      list_fetch_attempts=list_fetch_attempts,
      rate_limit_buffer_seconds=rate_limit_buffer_seconds,
      request_sleep_seconds=request_sleep_seconds,
      timeout_seconds=timeout_seconds,
      rss_cache_db_path=rss_cache_db_path,
    )
  except Exception as error:
    status = "失败"
    reason = str(error)
    _send_failure_notification(
      title="营销行业资讯同步通知",
      table_name="ads.marketing_industry_articles",
      action=action,
      status=status,
      reason=reason,
      detail_lines=detail_lines,
      webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
    )
    raise

  _send_success_notification(
    title="营销行业资讯同步通知",
    table_name="ads.marketing_industry_articles",
    action=action,
    status=status,
    reason=reason,
    detail_lines=detail_lines,
    webhook_url=DEFAULT_FEISHU_WEBHOOK_URL,
  )


if __name__ == "__main__":
  sync_marketing_industry_articles_flow()
