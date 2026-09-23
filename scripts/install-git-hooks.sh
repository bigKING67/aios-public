#!/usr/bin/env bash

set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

git config core.hooksPath .githooks
echo "Configured local git hooks path: .githooks"
echo "pre-push hook will run verify:prepush before pushing to origin/main."
