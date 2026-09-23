#!/usr/bin/env python3
"""Wait for Prefect deterministically and validate the configured process pool."""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class ReadinessError(RuntimeError):
  """Raised when Prefect cannot satisfy the Worker startup contract."""


class ApiNotFound(ReadinessError):
  """Raised only when the requested Prefect object does not exist."""


class PrefectHttpClient:
  def __init__(self, api_url: str, *, request_timeout_seconds: float = 5.0):
    self.api_url = api_url.rstrip("/")
    self.request_timeout_seconds = request_timeout_seconds
    self.headers = {"Accept": "application/json", "Content-Type": "application/json"}
    auth_mode = os.getenv("DATAOPS_PREFECT_AUTH_MODE", "").strip().lower()
    if not auth_mode:
      auth_mode = "bearer" if os.getenv("DATAOPS_PREFECT_API_KEY") else "none"
    if auth_mode == "bearer":
      token = os.getenv("DATAOPS_PREFECT_API_KEY", "")
      if not token:
        raise ReadinessError("bearer Prefect auth requires DATAOPS_PREFECT_API_KEY")
      self.headers["Authorization"] = f"Bearer {token}"
    elif auth_mode == "basic":
      username = os.getenv("DATAOPS_PREFECT_BASIC_AUTH_USERNAME", "")
      password = os.getenv("DATAOPS_PREFECT_BASIC_AUTH_PASSWORD", "")
      if not username or not password:
        raise ReadinessError("basic Prefect auth requires username and password")
      encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
      self.headers["Authorization"] = f"Basic {encoded}"
    elif auth_mode != "none":
      raise ReadinessError(f"unsupported Prefect auth mode: {auth_mode}")

  def request(self, method: str, path: str) -> Any:
    request = Request(
      f"{self.api_url}/{path.lstrip('/')}",
      headers=self.headers,
      method=method,
    )
    try:
      with urlopen(request, timeout=self.request_timeout_seconds) as response:
        payload = response.read()
    except HTTPError as error:
      if error.code == 404:
        raise ApiNotFound(path) from error
      raise ReadinessError(f"Prefect API returned HTTP {error.code} for {path}") from error
    except (URLError, TimeoutError) as error:
      raise ReadinessError(f"Prefect API request failed for {path}: {error}") from error
    if not payload:
      return None
    try:
      return json.loads(payload)
    except json.JSONDecodeError as error:
      raise ReadinessError(f"Prefect API returned invalid JSON for {path}") from error


def wait_for_api(
  client: PrefectHttpClient,
  *,
  timeout_seconds: float,
  poll_interval_seconds: float,
  monotonic: Callable[[], float] = time.monotonic,
  sleep: Callable[[float], None] = time.sleep,
) -> None:
  if timeout_seconds <= 0 or poll_interval_seconds <= 0:
    raise ReadinessError("readiness timeout and poll interval must be positive")
  deadline = monotonic() + timeout_seconds
  last_error = "health endpoint did not return true"
  while True:
    try:
      if client.request("GET", "/health") is True:
        return
      last_error = "health endpoint did not return true"
    except ReadinessError as error:
      last_error = str(error)
    now = monotonic()
    if now >= deadline:
      raise ReadinessError(
        f"Prefect API did not become ready within {timeout_seconds:g}s: {last_error}"
      )
    sleep(min(poll_interval_seconds, max(0.0, deadline - now)))


def ensure_work_pool(
  client: PrefectHttpClient,
  *,
  pool_name: str,
  expected_type: str,
  create_pool: Callable[[], None],
) -> str:
  path = f"/work_pools/{quote(pool_name, safe='')}"
  try:
    pool = client.request("GET", path)
  except ApiNotFound:
    create_pool()
    try:
      pool = client.request("GET", path)
    except ApiNotFound as error:
      raise ReadinessError(f"work pool {pool_name!r} is still missing after creation") from error

  if not isinstance(pool, dict):
    raise ReadinessError(f"work pool {pool_name!r} returned an invalid response")
  pool_type = str(pool.get("type") or "")
  if pool_type != expected_type:
    raise ReadinessError(
      f"work pool {pool_name!r} type mismatch: expected {expected_type!r}, found {pool_type!r}"
    )
  if pool.get("is_paused") is True:
    raise ReadinessError(f"work pool {pool_name!r} is paused")
  return "existing"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--api-url", required=True)
  parser.add_argument("--pool", required=True)
  parser.add_argument("--pool-type", default="process")
  parser.add_argument("--prefect-bin", required=True)
  parser.add_argument("--timeout-seconds", type=float, default=120.0)
  parser.add_argument("--poll-interval-seconds", type=float, default=2.0)
  parser.add_argument("--request-timeout-seconds", type=float, default=5.0)
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  try:
    client = PrefectHttpClient(
      args.api_url,
      request_timeout_seconds=args.request_timeout_seconds,
    )
    wait_for_api(
      client,
      timeout_seconds=args.timeout_seconds,
      poll_interval_seconds=args.poll_interval_seconds,
    )

    def create_pool() -> None:
      completed = subprocess.run(
        [args.prefect_bin, "work-pool", "create", args.pool, "--type", args.pool_type],
        text=True,
        capture_output=True,
        check=False,
      )
      if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown error").strip()
        raise ReadinessError(f"failed to create work pool {args.pool!r}: {detail}")

    ensure_work_pool(
      client,
      pool_name=args.pool,
      expected_type=args.pool_type,
      create_pool=create_pool,
    )
    print(f"Prefect Worker readiness: PASS pool={args.pool} type={args.pool_type}")
  except ReadinessError as error:
    print(f"Prefect Worker readiness: FAIL {error}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
