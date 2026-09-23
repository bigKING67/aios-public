#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v cargo >/dev/null 2>&1 && [ -f "${HOME}/.cargo/env" ]; then
  # shellcheck source=/dev/null
  . "${HOME}/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[backend-rust-cargo] cargo not found. Install Rust with rustup before running backend checks." >&2
  exit 127
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${repo_root}/.cache/cargo-target/backend-rust}"

cd "${repo_root}/backend-rust"
exec python3 "${repo_root}/scripts/backend-rust/cache-maintenance.py" run "$@"
