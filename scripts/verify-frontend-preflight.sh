#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VENDOR_DIR="${REPO_ROOT}/tools/vendor/frontend-preflight"
VERIFY_SH="${VENDOR_DIR}/frontend_preflight_verify.sh"
MANIFEST_FILE="${VENDOR_DIR}/MANIFEST.sha256"
CACHE_HELPER="${REPO_ROOT}/scripts/lib/frontend/frontend-preflight-cache.mjs"
PYTHON_SHIM_DIR=""
PREFLIGHT_PYTHON_ID=""
PREFLIGHT_PYTHON_VERSION_ID=""

cleanup_python_shim() {
  if [[ -n "${PYTHON_SHIM_DIR}" && -d "${PYTHON_SHIM_DIR}" ]]; then
    rm -rf "${PYTHON_SHIM_DIR}"
  fi
}

python_supports_preflight() {
  local python_bin="$1"
  local version_id
  if ! version_id="$("${python_bin}" - <<'PY' 2>/dev/null
import platform
import sys

if sys.version_info < (3, 10):
    raise SystemExit(1)
print(platform.python_implementation(), sys.version)
PY
)"; then
    return 1
  fi
  PREFLIGHT_PYTHON_VERSION_ID="status=0;${version_id}"
  return 0
}

resolve_python_candidate() {
  local candidate="$1"
  if [[ -z "${candidate}" ]]; then
    return 1
  fi
  if ! command -v "${candidate}" >/dev/null 2>&1; then
    return 1
  fi
  local candidate_path
  candidate_path="$(command -v "${candidate}")"
  if python_supports_preflight "${candidate_path}"; then
    printf '%s\n' "${candidate_path}"
    return 0
  fi
  return 1
}

ensure_frontend_preflight_python() {
  if command -v python3 >/dev/null 2>&1 && python_supports_preflight "$(command -v python3)"; then
    PREFLIGHT_PYTHON_ID="$(command -v python3)"
    return 0
  fi

  local resolved_python=""
  local candidate
  for candidate in "${FRONTEND_PREFLIGHT_PYTHON:-}" python3.12 python3.11 python3.10; do
    if resolved_python="$(resolve_python_candidate "${candidate}")"; then
      break
    fi
  done

  if [[ -n "${resolved_python}" ]]; then
    PYTHON_SHIM_DIR="$(mktemp -d)"
    trap cleanup_python_shim EXIT
    cat >"${PYTHON_SHIM_DIR}/python3" <<EOF
#!/usr/bin/env bash
exec "${resolved_python}" "\$@"
EOF
    chmod +x "${PYTHON_SHIM_DIR}/python3"
    export PATH="${PYTHON_SHIM_DIR}:${PATH}"
    PREFLIGHT_PYTHON_ID="${resolved_python}"
    echo "[verify:frontend:preflight] using ${resolved_python} as python3 for vendor preflight"
    return 0
  fi

  if command -v uv >/dev/null 2>&1; then
    PYTHON_SHIM_DIR="$(mktemp -d)"
    trap cleanup_python_shim EXIT
    cat >"${PYTHON_SHIM_DIR}/python3" <<'EOF'
#!/usr/bin/env bash
exec uv run --python 3.12 python3 "$@"
EOF
    chmod +x "${PYTHON_SHIM_DIR}/python3"
    export PATH="${PYTHON_SHIM_DIR}:${PATH}"
    PREFLIGHT_PYTHON_ID="uv:$(command -v uv):python3.12"
    echo "[verify:frontend:preflight] system python3 is < 3.10; using uv-managed Python 3.12 for vendor preflight"
    return 0
  fi

  echo "[verify:frontend:preflight] python3 >= 3.10 is required for vendor preflight." >&2
  echo "[verify:frontend:preflight] install python3.12/python3.11, set FRONTEND_PREFLIGHT_PYTHON, or install uv." >&2
  return 2
}

frontend_preflight_cache_disabled_reason() {
  if [[ "${AIOS_FRONTEND_PREFLIGHT_CACHE:-1}" == "0" ]]; then
    echo "AIOS_FRONTEND_PREFLIGHT_CACHE=0"
    return 0
  fi
  return 1
}

read_frontend_preflight_cache_probe() {
  local skip_prompts="$1"
  local disabled_reason=""
  local cache_args=()
  if disabled_reason="$(frontend_preflight_cache_disabled_reason)"; then
    cache_args=(
      "probe"
      "--repo-root" "${REPO_ROOT}"
      "--vendor-dir" "${VENDOR_DIR}"
      "--manifest-file" "${MANIFEST_FILE}"
      "--disabled-reason" "${disabled_reason}"
    )
  else
    git_version_id="status=0;$(git --version)"
    cache_args=(
      "probe"
      "--repo-root" "${REPO_ROOT}"
      "--vendor-dir" "${VENDOR_DIR}"
      "--manifest-file" "${MANIFEST_FILE}"
      "--helper-path" "${CACHE_HELPER}"
      "--wrapper" "${REPO_ROOT}/scripts/verify-frontend-preflight.sh"
      "--python-bin" "$(command -v python3)"
      "--python-id" "${PREFLIGHT_PYTHON_ID:-$(command -v python3)}"
      "--python-version-id" "${PREFLIGHT_PYTHON_VERSION_ID}"
      "--git-version-id" "${git_version_id}"
      "--bash-version-id" "status=0;bash:${BASH_VERSION:-unknown}"
      "--system-id" "status=0;bash:${OSTYPE:-unknown}:${MACHTYPE:-unknown}"
      "--skip-prompts" "${skip_prompts}"
    )
  fi

  node "${CACHE_HELPER}" "${cache_args[@]}"
}

if [[ ! -d "${VENDOR_DIR}" ]]; then
  echo "[verify:frontend:preflight] vendor tools dir missing: ${VENDOR_DIR}" >&2
  echo "[verify:frontend:preflight] run: npm run sync:frontend:preflight-tools" >&2
  exit 2
fi

if [[ ! -r "${MANIFEST_FILE}" ]]; then
  echo "[verify:frontend:preflight] manifest missing: ${MANIFEST_FILE}" >&2
  echo "[verify:frontend:preflight] run: npm run sync:frontend:preflight-tools" >&2
  exit 2
fi

if [[ ! -x "${VERIFY_SH}" ]]; then
  echo "[verify:frontend:preflight] verify script not executable: ${VERIFY_SH}" >&2
  exit 2
fi

ensure_frontend_preflight_python
skip_prompts="${FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS:-1}"

echo "[verify:frontend:preflight] verify vendor manifest and snapshot key"
cache_probe="$(read_frontend_preflight_cache_probe "${skip_prompts}")"
cacheable="0"
cache_hit="0"
cache_schema=""
cache_key=""
cache_file=""
cache_reason=""
while IFS= read -r line; do
  key="${line%%=*}"
  value="${line#*=}"
  case "${key}" in
    cacheable) cacheable="${value}" ;;
    cache_schema) cache_schema="${value}" ;;
    cache_hit) cache_hit="${value}" ;;
    cache_key) cache_key="${value}" ;;
    cache_file) cache_file="${value}" ;;
    cache_reason) cache_reason="${value}" ;;
  esac
done <<< "${cache_probe}"

if [[ "${cache_hit}" == "1" ]]; then
  echo "[verify:frontend:preflight] cache hit ${cache_key:0:12}; ${cache_reason}"
  exit 0
fi

if [[ "${cacheable}" == "1" ]]; then
  echo "[verify:frontend:preflight] cache miss ${cache_key:0:12}; run vendor verify"
else
  echo "[verify:frontend:preflight] cache disabled; ${cache_reason}"
  echo "[verify:frontend:preflight] run vendor verify"
fi

set +e
(
  unset GIT_ALTERNATE_OBJECT_DIRECTORIES
  unset GIT_COMMON_DIR
  unset GIT_DIR
  unset GIT_INDEX_FILE
  unset GIT_NAMESPACE
  unset GIT_OBJECT_DIRECTORY
  unset GIT_PREFIX
  unset GIT_WORK_TREE
  FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS="${skip_prompts}" bash "${VERIFY_SH}"
)
verify_rc=$?
set -e
if [[ "${verify_rc}" -ne 0 ]]; then
  exit "${verify_rc}"
fi

if [[ "${cacheable}" == "1" ]]; then
  if [[ -z "${cache_file}" || ! "${cache_key}" =~ ^[a-f0-9]{64}$ || ! "${cache_schema}" =~ ^[0-9]+$ ]]; then
    echo "[verify:frontend:preflight] invalid cache probe output; cannot write pass stamp" >&2
    exit 2
  fi
  mkdir -p "$(dirname "${cache_file}")"
  tmp_cache_file="${cache_file}.$$.$RANDOM.tmp"
  cat >"${tmp_cache_file}" <<EOF
{
  "cacheKey": "${cache_key}",
  "schema": ${cache_schema},
  "status": "pass",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  mv "${tmp_cache_file}" "${cache_file}"
  echo "[verify:frontend:preflight] cached ${cache_key:0:12}"
fi
