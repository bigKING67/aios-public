#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFLIGHT_PY="${SCRIPT_DIR}/frontend_preflight.py"

frontend_tier=""
skills=""
style_authority_path=""

usage() {
  cat <<'EOF'
Usage:
  bash ~/.codex/tools/frontend_preflight_run.sh \
    --frontend-tier <L0|L1-F|L1-V|L2> \
    --skills <comma-separated-skills> \
    [--style-authority-path <absolute-path>]

Notes:
  - --frontend-tier is required.
  - --skills defaults to empty when omitted.
  - --style-authority-path is optional.
  - Output is always normalized JSON.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-tier)
      frontend_tier="${2-}"
      shift 2
      ;;
    --skills)
      skills="${2-}"
      shift 2
      ;;
    --style-authority-path)
      style_authority_path="${2-}"
      shift 2
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

if [[ -z "${frontend_tier}" ]]; then
  echo "--frontend-tier is required." >&2
  usage >&2
  exit 2
fi

if [[ ! -f "${PREFLIGHT_PY}" ]]; then
  echo "Preflight script not found: ${PREFLIGHT_PY}" >&2
  exit 2
fi

python3 "${PREFLIGHT_PY}" \
  --frontend-tier "${frontend_tier}" \
  --skills "${skills}" \
  --style-authority-path "${style_authority_path}" \
  --output json
