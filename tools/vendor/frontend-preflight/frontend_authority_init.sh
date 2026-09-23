#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_PATH="${SCRIPT_DIR}/templates/DESIGN.authority.template.md"

target_path=""
force="0"

usage() {
  cat <<'EOF'
Usage:
  bash ~/.codex/tools/frontend_authority_init.sh \
    --target <absolute-path-to-DESIGN.md> \
    [--force]

Behavior:
  - Initializes a DESIGN authority file from the standard template.
  - Refuses to overwrite an existing file unless --force is provided.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target_path="${2-}"
      shift 2
      ;;
    --force)
      force="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${target_path}" ]]; then
  echo "--target is required." >&2
  usage >&2
  exit 2
fi

if [[ "${target_path}" != /* ]]; then
  echo "--target must be an absolute path." >&2
  exit 2
fi

if [[ ! -f "${TEMPLATE_PATH}" ]]; then
  echo "Template not found: ${TEMPLATE_PATH}" >&2
  exit 2
fi

mkdir -p "$(dirname "${target_path}")"

if [[ -f "${target_path}" && "${force}" != "1" ]]; then
  echo "Target already exists: ${target_path}" >&2
  echo "Use --force to overwrite." >&2
  exit 2
fi

cp "${TEMPLATE_PATH}" "${target_path}"
echo "Initialized authority template: ${target_path}"
