#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/checks/backend-rust/run-dashboard-api-latency-observation.sh

Runs a dashboard API latency observation:
  1. Executes the live latency smoke.
  2. Writes a timestamped full JSON report and updates latest.json.
  3. Appends a compact JSONL history record to history.jsonl.
  4. Runs the history analyzer against recent records.
  5. Writes a timestamped markdown trend report and updates latest.md.
  6. Refreshes daily.md and weekly.md rollups for long-term trend review.

Environment overrides:
  DASHBOARD_API_BASE_URL                         Default: http://127.0.0.1:8000
  DASHBOARD_API_LATENCY_ARTIFACT_DIR            Default: .artifacts/dashboard-api-latency
  DASHBOARD_API_LATENCY_THRESHOLD_MS            Default: 500
  DASHBOARD_API_LATENCY_TIMEOUT_MS              Default: 5000
  DASHBOARD_API_LATENCY_WARMUPS                 Default: 1
  DASHBOARD_API_LATENCY_CONCURRENCY             Default: 3
  DASHBOARD_API_LATENCY_REQUIRE_CACHE_HIT       Default: 1
  DASHBOARD_API_LATENCY_CACHE_HIT_MAX_MS        Default: 50
  DASHBOARD_API_LATENCY_PAYLOAD_MAX_KB          Default: 5000
  DASHBOARD_API_LATENCY_HISTORY_LAST            Default: 20
  DASHBOARD_API_LATENCY_ROLLUP_DAYS             Default: 7
  DASHBOARD_API_LATENCY_ROLLUP_WEEKS            Default: 8
  DASHBOARD_API_LATENCY_REPORT_KEEP             Default: 336; 0 disables pruning
  DASHBOARD_API_LATENCY_ENDPOINTS               Default: traffic traffic_goods goods
  DASHBOARD_API_BEARER_TOKEN                    Optional bearer token used by the smoke script
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
cd "${repo_root}"

base_url="${DASHBOARD_API_BASE_URL:-http://127.0.0.1:8000}"
artifact_dir="${DASHBOARD_API_LATENCY_ARTIFACT_DIR:-.artifacts/dashboard-api-latency}"
threshold_ms="${DASHBOARD_API_LATENCY_THRESHOLD_MS:-500}"
timeout_ms="${DASHBOARD_API_LATENCY_TIMEOUT_MS:-5000}"
warmups="${DASHBOARD_API_LATENCY_WARMUPS:-1}"
concurrency="${DASHBOARD_API_LATENCY_CONCURRENCY:-3}"
require_cache_hit="${DASHBOARD_API_LATENCY_REQUIRE_CACHE_HIT:-1}"
cache_hit_max_ms="${DASHBOARD_API_LATENCY_CACHE_HIT_MAX_MS:-50}"
payload_max_kb="${DASHBOARD_API_LATENCY_PAYLOAD_MAX_KB:-5000}"
history_last="${DASHBOARD_API_LATENCY_HISTORY_LAST:-20}"
rollup_days="${DASHBOARD_API_LATENCY_ROLLUP_DAYS:-7}"
rollup_weeks="${DASHBOARD_API_LATENCY_ROLLUP_WEEKS:-8}"
report_keep="${DASHBOARD_API_LATENCY_REPORT_KEEP:-336}"
endpoints="${DASHBOARD_API_LATENCY_ENDPOINTS:-traffic traffic_goods goods}"

if ! [[ "${report_keep}" =~ ^[0-9]+$ ]]; then
  echo "DASHBOARD_API_LATENCY_REPORT_KEEP must be a non-negative integer" >&2
  exit 2
fi

prune_timestamped_reports() {
  local keep="$1"
  if [[ "${keep}" -eq 0 ]]; then
    return 0
  fi

  local ext reports delete_count index pruned=0
  for ext in json md; do
    reports=("${artifact_dir}"/report-*.${ext})
    if [[ ! -e "${reports[0]}" ]]; then
      continue
    fi
    IFS=$'\n' reports=($(printf '%s\n' "${reports[@]}" | sort))
    unset IFS
    delete_count=$((${#reports[@]} - keep))
    if [[ "${delete_count}" -le 0 ]]; then
      continue
    fi
    for ((index = 0; index < delete_count; index += 1)); do
      rm -f -- "${reports[index]}"
      pruned=$((pruned + 1))
    done
  done

  if [[ "${pruned}" -gt 0 ]]; then
    echo "[dashboard-api-latency-observation] prunedReports=${pruned} keep=${keep}"
  fi
}

run_id="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${artifact_dir}"

report_json="${artifact_dir}/report-${run_id}.json"
report_md="${artifact_dir}/report-${run_id}.md"
latest_json="${artifact_dir}/latest.json"
latest_md="${artifact_dir}/latest.md"
daily_md="${artifact_dir}/daily.md"
weekly_md="${artifact_dir}/weekly.md"
history_jsonl="${artifact_dir}/history.jsonl"

smoke_args=(
  --base-url "${base_url}"
  --threshold-ms "${threshold_ms}"
  --timeout-ms "${timeout_ms}"
  --warmups "${warmups}"
  --concurrency "${concurrency}"
  --output-json "${report_json}"
  --history-jsonl "${history_jsonl}"
)

if [[ "${require_cache_hit}" != "0" ]]; then
  smoke_args+=(--require-server-timing-phase cache_hit)
  smoke_args+=(--max-server-timing-phase "cache_hit:${cache_hit_max_ms}")
fi

history_args=(
  --history-jsonl "${history_jsonl}"
  --last "${history_last}"
)

report_args=(
  --history-jsonl "${history_jsonl}"
  --last "${history_last}"
  --output-md "${report_md}"
)

rollup_daily_args=(
  --history-jsonl "${history_jsonl}"
  --period day
  --last-periods "${rollup_days}"
  --output-md "${daily_md}"
  --title "Dashboard API Latency Daily Rollup"
)

rollup_weekly_args=(
  --history-jsonl "${history_jsonl}"
  --period week
  --last-periods "${rollup_weeks}"
  --output-md "${weekly_md}"
  --title "Dashboard API Latency Weekly Rollup"
)

for endpoint in ${endpoints}; do
  history_args+=(--fail-on-p95 "${endpoint}:${threshold_ms}")
  report_args+=(--fail-on-p95 "${endpoint}:${threshold_ms}")
  report_args+=(--fail-on-payload-kb "${endpoint}:${payload_max_kb}")
  smoke_args+=(--max-payload-kb "${endpoint}:${payload_max_kb}")
  history_args+=(--fail-on-payload-kb "${endpoint}:${payload_max_kb}")
  rollup_daily_args+=(--fail-on-p95 "${endpoint}:${threshold_ms}")
  rollup_daily_args+=(--fail-on-payload-kb "${endpoint}:${payload_max_kb}")
  rollup_weekly_args+=(--fail-on-p95 "${endpoint}:${threshold_ms}")
  rollup_weekly_args+=(--fail-on-payload-kb "${endpoint}:${payload_max_kb}")

  if [[ "${require_cache_hit}" != "0" ]]; then
    history_args+=(--fail-on-cache-hit-p95 "${endpoint}:${cache_hit_max_ms}")
    report_args+=(--fail-on-cache-hit-p95 "${endpoint}:${cache_hit_max_ms}")
    rollup_daily_args+=(--fail-on-cache-hit-p95 "${endpoint}:${cache_hit_max_ms}")
    rollup_weekly_args+=(--fail-on-cache-hit-p95 "${endpoint}:${cache_hit_max_ms}")
  fi
done

echo "[dashboard-api-latency-observation] baseUrl=${base_url}"
echo "[dashboard-api-latency-observation] requireCacheHit=${require_cache_hit}"
echo "[dashboard-api-latency-observation] reportKeep=${report_keep}"
echo "[dashboard-api-latency-observation] report=${report_json}"
echo "[dashboard-api-latency-observation] markdown=${report_md}"
echo "[dashboard-api-latency-observation] daily=${daily_md}"
echo "[dashboard-api-latency-observation] weekly=${weekly_md}"
echo "[dashboard-api-latency-observation] history=${history_jsonl}"

smoke_status=0
node scripts/checks/backend-rust/dashboard-api-latency-smoke.mjs "${smoke_args[@]}" || smoke_status=$?

if [[ -f "${report_json}" ]]; then
  cp "${report_json}" "${latest_json}"
fi

history_status=0
node scripts/checks/backend-rust/dashboard-api-latency-history.mjs "${history_args[@]}" || history_status=$?

report_status=0
node scripts/checks/backend-rust/dashboard-api-latency-history-report.mjs "${report_args[@]}" || report_status=$?

if [[ -f "${report_md}" ]]; then
  cp "${report_md}" "${latest_md}"
fi

rollup_daily_status=0
node scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs "${rollup_daily_args[@]}" || rollup_daily_status=$?

rollup_weekly_status=0
node scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs "${rollup_weekly_args[@]}" || rollup_weekly_status=$?

prune_timestamped_reports "${report_keep}"

if [[ "${smoke_status}" -ne 0 || "${history_status}" -ne 0 || "${report_status}" -ne 0 || "${rollup_daily_status}" -ne 0 || "${rollup_weekly_status}" -ne 0 ]]; then
  echo "[dashboard-api-latency-observation] fail smoke_status=${smoke_status} history_status=${history_status} report_status=${report_status} rollup_daily_status=${rollup_daily_status} rollup_weekly_status=${rollup_weekly_status}" >&2
  exit 1
fi

echo "[dashboard-api-latency-observation] pass"
