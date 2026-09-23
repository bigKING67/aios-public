#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_npm_script() {
  npm --prefix "$PROJECT_ROOT" run "$1"
}

echo "[verify:backend] scripts/verify-backend.sh is deprecated; delegating to quality-runner."
run_npm_script verify:backend
