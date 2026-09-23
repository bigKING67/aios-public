from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple, TypeVar


_Result = TypeVar("_Result")


class RssCacheReadError(RuntimeError):
  pass


def _signature(cache_path: Path) -> Tuple[int, int, int, int]:
  stat = cache_path.stat()
  return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def _read_snapshot(
  cache_db_path: str,
  reader: Callable[[sqlite3.Connection], _Result],
) -> _Result:
  cache_path = Path(cache_db_path).resolve()
  if not cache_path.is_file():
    raise RssCacheReadError("Wechat RSS cache database is unavailable")

  signature_before = _signature(cache_path)
  cache_uri = f"{cache_path.as_uri()}?mode=ro&immutable=1"
  try:
    cache_conn = sqlite3.connect(cache_uri, uri=True)
    try:
      cache_conn.execute("PRAGMA query_only = ON")
      result = reader(cache_conn)
    finally:
      cache_conn.close()
    if _signature(cache_path) != signature_before:
      raise sqlite3.OperationalError("RSS cache database changed while being read")
  except (OSError, sqlite3.Error) as error:
    raise RssCacheReadError(str(error)) from error
  return result


def cached_content_urls(cache_db_path: str, minimum_content_chars: int) -> set[str]:
  try:
    rows = _read_snapshot(
      cache_db_path,
      lambda cache_conn: cache_conn.execute(
        """
        SELECT link
        FROM articles
        WHERE link <> ''
          AND LENGTH(TRIM(COALESCE(plain_content, ''))) >= ?
        """,
        (minimum_content_chars,),
      ).fetchall(),
    )
  except RssCacheReadError as error:
    raise RssCacheReadError(f"Wechat RSS cache url scan failed: {error}") from error

  return {
    str(row[0] or "").strip()[:2000]
    for row in rows
    if str(row[0] or "").strip()
  }


def fetch_cached_article_content(
  cache_db_path: str,
  article_url: str,
  minimum_content_chars: int,
) -> Optional[Dict[str, object]]:
  def read_cached_article(cache_conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    cache_conn.row_factory = sqlite3.Row
    return cache_conn.execute(
      """
      SELECT
        title,
        content,
        plain_content,
        author,
        publish_time
      FROM articles
      WHERE link = ?
        AND LENGTH(TRIM(COALESCE(plain_content, ''))) >= ?
      LIMIT 1
      """,
      (article_url, minimum_content_chars),
    ).fetchone()

  try:
    row = _read_snapshot(cache_db_path, read_cached_article)
  except RssCacheReadError as error:
    raise RssCacheReadError(f"Wechat RSS cache read failed: {error}") from error
  if not row:
    return None
  return {
    "title": row["title"],
    "content": row["content"],
    "plain_content": row["plain_content"],
    "author": row["author"],
    "publish_time": row["publish_time"],
    "images": [],
  }
