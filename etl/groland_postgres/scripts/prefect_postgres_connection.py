#!/usr/bin/env python3
"""Read a PostgreSQL URL from the environment and emit NUL-delimited fields."""

from __future__ import annotations

import argparse
import os
import sys
from urllib.parse import parse_qs, unquote, urlparse


class ConnectionUrlError(RuntimeError):
  """Raised when a control-plane PostgreSQL URL is incomplete or unsupported."""


def parse_connection_url(raw_url: str, *, default_database: str = "") -> tuple[str, ...]:
  try:
    parsed = urlparse(raw_url)
    port = parsed.port or 5432
  except ValueError as error:
    raise ConnectionUrlError("PostgreSQL URL has an invalid host or port") from error
  scheme = parsed.scheme.lower()
  if scheme.split("+", 1)[0] != "postgresql":
    raise ConnectionUrlError("control-plane database URL is not PostgreSQL")
  query = parse_qs(parsed.query)
  if scheme == "postgresql+asyncpg" and "sslmode" in query:
    raise ConnectionUrlError(
      "asyncpg connection URLs must use ssl= instead of the libpq-only sslmode="
    )
  values = (
    parsed.hostname or "",
    str(port),
    unquote(parsed.username or ""),
    unquote(parsed.password or ""),
    parsed.path.lstrip("/") or default_database,
    query.get("sslmode", query.get("ssl", [""]))[0],
  )
  if not values[0] or not values[2] or not values[4]:
    raise ConnectionUrlError("PostgreSQL connection fields are incomplete")
  return values


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--env-key", required=True)
  parser.add_argument("--default-database", default="")
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  try:
    raw_url = os.environ.get(args.env_key, "")
    if not raw_url:
      raise ConnectionUrlError(f"missing required environment variable: {args.env_key}")
    for value in parse_connection_url(raw_url, default_database=args.default_database):
      sys.stdout.buffer.write(value.encode("utf-8") + b"\0")
  except ConnectionUrlError as error:
    print(f"Prefect PostgreSQL connection error: {error}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
