#!/usr/bin/env bash

set -euo pipefail

changed_files_env="${FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES:-}"
checked_count=0
scanned_all=0

normalize_changed_file() {
  local entry="$1"
  if [[ "$entry" == *:* ]]; then
    entry="${entry#*:}"
  fi
  printf '%s\n' "$entry"
}

is_shell_file() {
  local file="$1"
  [[ "$file" == *.sh || "$file" == ".githooks/"* ]]
}

check_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  if [[ "$file" == *.sh ]]; then
    bash -n "$file"
    checked_count=$((checked_count + 1))
    return 0
  fi

  if [[ "$file" == ".githooks/"* ]]; then
    bash -n "$file"
    checked_count=$((checked_count + 1))
  fi
}

check_dir() {
  local dir="$1"
  if [ -d "$dir" ]; then
    while IFS= read -r -d '' file; do
      check_file "$file"
    done < <(find "$dir" -type f -name '*.sh' -print0)
  fi
}

if [[ -n "$changed_files_env" ]]; then
  while IFS= read -r entry; do
    file="$(normalize_changed_file "$entry")"
    if is_shell_file "$file"; then
      check_file "$file"
    fi
  done < <(printf '%s\n' "$changed_files_env" | awk 'NF && !seen[$0]++')
else
  scanned_all=1
  check_dir scripts
  check_dir etl/groland_postgres/scripts

  while IFS= read -r -d '' file; do
    check_file "$file"
  done < <(find . -maxdepth 1 -type f -name '*.sh' -print0)
fi

if [[ "$scanned_all" == "1" ]]; then
  echo "[shell-syntax] OK checked=${checked_count} mode=full"
else
  echo "[shell-syntax] OK checked=${checked_count} mode=changed"
fi
