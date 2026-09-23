#!/usr/bin/env python3
"""Apply the reviewed Prefect SQLite deployment-readiness transaction fix."""

from __future__ import annotations

import ast
import importlib.metadata
import os
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from prefect_postgres_connection import ConnectionUrlError, parse_connection_url


SUPPORTED_PREFECT_VERSIONS = {"3.7.8"}
DEFAULT_PREFECT_DATABASE_URL = "sqlite+aiosqlite:///prefect.db"
SUPPORTED_DATABASE_BACKENDS = {"sqlite", "postgresql"}
TARGET_FUNCTIONS = (
  "mark_deployments_ready",
  "mark_deployments_not_ready",
)
DEFERRED_CONTEXT_PATTERN = re.compile(
  r"^(?P<indent> +)async with db\.session_context\(\n"
  r"(?P=indent)    begin_transaction=True,\n"
  r"(?P=indent)\) as session:",
  re.MULTILINE,
)
IMMEDIATE_CONTEXT_PATTERN = re.compile(
  r"^(?P<indent> +)async with db\.session_context\(\n"
  r"(?P=indent)    begin_transaction=True,\n"
  r"(?P=indent)    with_for_update=True,\n"
  r"(?P=indent)\) as session:",
  re.MULTILINE,
)


class PrefectPatchError(RuntimeError):
  """Raised when the installed Prefect source is not the reviewed contract."""


def configured_database_backend(connection_url: str | None = None) -> str:
  """Resolve the configured Prefect backend without importing Prefect source."""
  raw_url = connection_url
  if raw_url is None:
    raw_url = os.getenv("PREFECT_API_DATABASE_CONNECTION_URL")
  raw_url = (raw_url or DEFAULT_PREFECT_DATABASE_URL).strip()
  scheme = urlparse(raw_url).scheme.lower()
  backend = scheme.split("+", 1)[0]
  if backend not in SUPPORTED_DATABASE_BACKENDS:
    rendered = scheme or "missing"
    raise PrefectPatchError(
      f"unsupported Prefect database backend scheme {rendered}; expected sqlite or postgresql"
    )
  if backend == "postgresql":
    try:
      parse_connection_url(raw_url)
    except ConnectionUrlError as error:
      raise PrefectPatchError(f"invalid Prefect PostgreSQL connection URL: {error}") from error
  return backend


def patch_source(source: str) -> tuple[str, tuple[str, ...]]:
  """Patch only the two reviewed deployment readiness functions."""
  changed: list[str] = []
  current = source
  for target in TARGET_FUNCTIONS:
    tree = ast.parse(current)
    node = next(
      (
        candidate
        for candidate in ast.walk(tree)
        if isinstance(candidate, (ast.FunctionDef, ast.AsyncFunctionDef))
        and candidate.name == target
      ),
      None,
    )
    if node is None or node.end_lineno is None:
      raise PrefectPatchError(f"missing reviewed Prefect function: {target}")

    lines = current.splitlines(keepends=True)
    start = node.lineno - 1
    end = node.end_lineno
    function_source = "".join(lines[start:end])
    deferred_count = len(DEFERRED_CONTEXT_PATTERN.findall(function_source))
    immediate_count = len(IMMEDIATE_CONTEXT_PATTERN.findall(function_source))
    if immediate_count == 1 and deferred_count == 0:
      continue
    if deferred_count != 1 or immediate_count != 0:
      raise PrefectPatchError(
        f"unexpected transaction context in {target}: "
        f"deferred={deferred_count}, immediate={immediate_count}"
      )
    function_source, replacement_count = DEFERRED_CONTEXT_PATTERN.subn(
      lambda match: (
        f"{match.group('indent')}async with db.session_context(\n"
        f"{match.group('indent')}    begin_transaction=True,\n"
        f"{match.group('indent')}    with_for_update=True,\n"
        f"{match.group('indent')}) as session:"
      ),
      function_source,
      count=1,
    )
    if replacement_count != 1:
      raise PrefectPatchError(f"failed to patch transaction context in {target}")
    lines[start:end] = function_source.splitlines(keepends=True)
    current = "".join(lines)
    changed.append(target)

  return current, tuple(changed)


def installed_target() -> Path:
  import prefect

  return Path(prefect.__file__).resolve().parent / "server" / "models" / "deployments.py"


def apply_installed_patch() -> tuple[Path, tuple[str, ...]]:
  version = importlib.metadata.version("prefect")
  if version not in SUPPORTED_PREFECT_VERSIONS:
    raise PrefectPatchError(
      f"unsupported Prefect version {version}; expected "
      + ", ".join(sorted(SUPPORTED_PREFECT_VERSIONS))
    )

  target = installed_target()
  source = target.read_text(encoding="utf-8")
  patched, changed = patch_source(source)
  if not changed:
    return target, changed

  fd, temporary_name = tempfile.mkstemp(
    prefix=f".{target.name}.",
    suffix=".tmp",
    dir=target.parent,
  )
  temporary = Path(temporary_name)
  try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
      handle.write(patched)
      handle.flush()
      os.fsync(handle.fileno())
    shutil.copymode(target, temporary)
    os.replace(temporary, target)
  finally:
    if temporary.exists():
      temporary.unlink()

  return target, changed


def apply_configured_patch(
  connection_url: str | None = None,
) -> tuple[Path | None, tuple[str, ...], str]:
  """Apply the tactical patch only when the configured backend is SQLite."""
  backend = configured_database_backend(connection_url)
  if backend == "postgresql":
    return None, (), backend
  target, changed = apply_installed_patch()
  return target, changed, backend


def main() -> None:
  target, changed, backend = apply_configured_patch()
  if backend == "postgresql":
    print("Prefect SQLite deployment transaction patch skipped: backend=postgresql")
    return
  state = "patched" if changed else "already-patched"
  functions = ",".join(changed or TARGET_FUNCTIONS)
  print(
    "Prefect SQLite deployment transaction patch "
    f"{state}: version={importlib.metadata.version('prefect')} "
    f"backend={backend} functions={functions} target={target}"
  )


if __name__ == "__main__":
  main()
