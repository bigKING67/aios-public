#!/usr/bin/env python3
"""Reject control-plane state paths that resolve to shared system roots."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


UNSAFE_SHARED_ROOTS = frozenset({
  Path(path).resolve(strict=False)
  for path in (
    "/",
    "/Applications",
    "/Library",
    "/System",
    "/Users",
    "/Volumes",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/home",
    "/lib",
    "/lib64",
    "/media",
    "/mnt",
    "/opt",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/srv",
    "/sys",
    "/tmp",
    "/usr",
    "/var",
    "/var/lib",
    "/var/lib/aios-prefect",
    "/var/log",
  )
})


class FilesystemSafetyError(RuntimeError):
  """Raised when an operational path is not a dedicated directory."""


def validate_dedicated_directory(raw_path: str, *, label: str) -> Path:
  path = Path(raw_path).expanduser()
  if not path.is_absolute():
    raise FilesystemSafetyError(f"{label} must be an absolute path")
  resolved = path.resolve(strict=False)
  if resolved in UNSAFE_SHARED_ROOTS:
    raise FilesystemSafetyError(
      f"{label} resolves to shared system root {resolved}; use a dedicated child directory"
    )
  return resolved


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--path", required=True)
  parser.add_argument("--label", required=True)
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  try:
    resolved = validate_dedicated_directory(args.path, label=args.label)
  except FilesystemSafetyError as error:
    print(f"Prefect filesystem safety error: {error}", file=sys.stderr)
    return 1
  print(resolved)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
