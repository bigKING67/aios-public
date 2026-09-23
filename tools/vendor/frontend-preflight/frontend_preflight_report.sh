#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMMARY_SH="${SCRIPT_DIR}/frontend_preflight_log_summary.sh"

log_path="${HOME}/.codex/logs/frontend_preflight_events.jsonl"
days="14"
top="3"
period="day"
json_mode="0"
output_path=""
contexts_serialized=""

usage() {
  cat <<'USAGE'
Usage:
  bash ~/.codex/tools/frontend_preflight_report.sh \
    [--log-path <absolute-path>] \
    [--days <n>] \
    [--top <n>] \
    [--period <day|week|both>] \
    [--context <name>[,<name>...]]... \
    [--json] \
    [--output <absolute-path>]

Behavior:
  - Calls frontend_preflight_log_summary.sh --json as the only data source.
  - Exports daily/weekly aggregated rows with deny-rate and top codes.
  - --context keeps only matching event contexts (for example: prod,ci,test).
  - If --output is provided, writes the rendered result to that path.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log-path)
      log_path="${2-}"
      shift 2
      ;;
    --days)
      days="${2-}"
      shift 2
      ;;
    --top)
      top="${2-}"
      shift 2
      ;;
    --period)
      period="${2-}"
      shift 2
      ;;
    --context)
      if [[ -n "${contexts_serialized}" ]]; then
        contexts_serialized+=$'\x1f'
      fi
      contexts_serialized+="${2-}"
      shift 2
      ;;
    --json)
      json_mode="1"
      shift
      ;;
    --output)
      output_path="${2-}"
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

if [[ "${log_path}" != /* ]]; then
  echo "--log-path must be absolute: ${log_path}" >&2
  exit 2
fi

if ! [[ "${days}" =~ ^[0-9]+$ ]] || [[ "${days}" -lt 1 ]]; then
  echo "--days must be an integer >= 1: ${days}" >&2
  exit 2
fi

if ! [[ "${top}" =~ ^[0-9]+$ ]] || [[ "${top}" -lt 1 ]]; then
  echo "--top must be an integer >= 1: ${top}" >&2
  exit 2
fi

if [[ "${period}" != "day" && "${period}" != "week" && "${period}" != "both" ]]; then
  echo "--period must be one of: day|week|both" >&2
  exit 2
fi

if [[ -n "${output_path}" && "${output_path}" != /* ]]; then
  echo "--output must be absolute: ${output_path}" >&2
  exit 2
fi

if [[ ! -x "${SUMMARY_SH}" ]]; then
  echo "Summary script not executable: ${SUMMARY_SH}" >&2
  exit 2
fi

tmp_json="$(mktemp)"
trap 'rm -f "${tmp_json}"' EXIT

summary_cmd=(
  bash "${SUMMARY_SH}"
  --log-path "${log_path}"
  --days "${days}"
  --top "${top}"
  --json
)

if [[ -n "${contexts_serialized}" ]]; then
  IFS=$'\x1f' read -r -a context_items <<< "${contexts_serialized}"
  for ctx in "${context_items[@]}"; do
    [[ -z "${ctx}" ]] && continue
    summary_cmd+=(--context "${ctx}")
  done
fi

"${summary_cmd[@]}" > "${tmp_json}"

python3 - "${tmp_json}" "${period}" "${top}" "${json_mode}" "${output_path}" "${contexts_serialized}" <<'PY'
from __future__ import annotations

import json
from collections import Counter
from datetime import date
from pathlib import Path
import sys
from typing import Any, Dict, List

summary_json_path = Path(sys.argv[1])
period = sys.argv[2]
top_n = int(sys.argv[3])
json_mode = sys.argv[4] == "1"
output_path_raw = sys.argv[5].strip()
contexts_raw = [item.strip() for item in sys.argv[6].split("\x1f") if item.strip()]
contexts: list[str] = []
for raw in contexts_raw:
    for part in raw.split(","):
        value = part.strip()
        if value and value not in contexts:
            contexts.append(value)

payload = json.loads(summary_json_path.read_text(encoding="utf-8"))
summary = payload.get("summary", {})
daily_rows = list(summary.get("daily_breakdown", []))
window = summary.get("window", {})


def fmt_top(codes: List[Dict[str, Any]]) -> str:
    if not codes:
        return "-"
    parts = [f"{item['code']}({item['count']})" for item in codes]
    return ", ".join(parts)


def fmt_top_routes(routes: List[Dict[str, Any]]) -> str:
    if not routes:
        return "-"
    parts = [f"{item['route']}({item['count']})" for item in routes]
    return ", ".join(parts)


def build_day_rows(rows: List[Dict[str, Any]], top_n: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in rows:
        route_counter = Counter(row.get("route_counts", {}))
        top_routes = [
            {
                "route": route,
                "count": count,
                "rate_pct": round((count / int(row.get("events", 0)) * 100), 4)
                if int(row.get("events", 0))
                else 0.0,
            }
            for route, count in route_counter.most_common(top_n)
        ]
        out.append(
            {
                "bucket": row["date_utc"],
                "events": int(row.get("events", 0)),
                "allow": int(row.get("allow", 0)),
                "deny": int(row.get("deny", 0)),
                "deny_rate_pct": float(row.get("deny_rate_pct", 0.0)),
                "top_codes": list(row.get("top_codes", []))[:top_n],
                "code_counts": dict(row.get("code_counts", {})),
                "route_counts": dict(row.get("route_counts", {})),
                "top_routes": top_routes,
            }
        )
    return out


def build_week_rows(rows: List[Dict[str, Any]], top_n: int) -> List[Dict[str, Any]]:
    buckets: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        day = date.fromisoformat(str(row["date_utc"]))
        iso_year, iso_week, _ = day.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        monday = day.fromisocalendar(iso_year, iso_week, 1)
        sunday = day.fromisocalendar(iso_year, iso_week, 7)

        item = buckets.setdefault(
            week_key,
            {
                "bucket": week_key,
                "start_date_utc": monday.isoformat(),
                "end_date_utc": sunday.isoformat(),
                "events": 0,
                "allow": 0,
                "deny": 0,
                "code_counter": Counter(),
                "route_counter": Counter(),
            },
        )

        item["events"] += int(row.get("events", 0))
        item["allow"] += int(row.get("allow", 0))
        item["deny"] += int(row.get("deny", 0))
        item["code_counter"].update(row.get("code_counts", {}))
        item["route_counter"].update(row.get("route_counts", {}))

    out: List[Dict[str, Any]] = []
    for week_key in sorted(buckets):
        item = buckets[week_key]
        events = int(item["events"])
        deny = int(item["deny"])
        deny_rate = (deny / events * 100) if events else 0.0
        top_codes = [
            {
                "code": code,
                "count": count,
                "rate_pct": round((count / events * 100), 4) if events else 0.0,
            }
            for code, count in item["code_counter"].most_common(top_n)
        ]
        top_routes = [
            {
                "route": route,
                "count": count,
                "rate_pct": round((count / events * 100), 4) if events else 0.0,
            }
            for route, count in item["route_counter"].most_common(top_n)
        ]
        out.append(
            {
                "bucket": week_key,
                "start_date_utc": item["start_date_utc"],
                "end_date_utc": item["end_date_utc"],
                "events": events,
                "allow": int(item["allow"]),
                "deny": deny,
                "deny_rate_pct": round(deny_rate, 4),
                "top_codes": top_codes,
                "route_counts": dict(item["route_counter"]),
                "top_routes": top_routes,
            }
        )

    return out


day_rows = build_day_rows(daily_rows, top_n)
week_rows = build_week_rows(daily_rows, top_n)

if period == "day":
    result: Dict[str, Any] = {
        "ok": bool(payload.get("ok", True)),
        "period": "day",
        "window": window,
        "contexts": contexts,
        "rows": day_rows,
    }
elif period == "week":
    result = {
        "ok": bool(payload.get("ok", True)),
        "period": "week",
        "window": window,
        "contexts": contexts,
        "rows": week_rows,
    }
else:
    result = {
        "ok": bool(payload.get("ok", True)),
        "period": "both",
        "window": window,
        "contexts": contexts,
        "day_rows": day_rows,
        "week_rows": week_rows,
    }

if json_mode:
    rendered = json.dumps(result, ensure_ascii=False)
else:
    lines: List[str] = []
    lines.append(
        "Frontend preflight aggregate report "
        f"(UTC, {window.get('from_utc', '-') } -> {window.get('to_utc', '-')})"
    )
    if contexts:
        lines.append(f"Context filter: {','.join(contexts)}")

    if period in {"day", "both"}:
        lines.append("")
        lines.append("Daily:")
        if not day_rows:
            lines.append("- (no events)")
        for row in day_rows:
            lines.append(
                f"- {row['bucket']}: events={row['events']}, "
                f"deny_rate={row['deny_rate_pct']:.1f}%, top={fmt_top(row['top_codes'])}, "
                f"routes={fmt_top_routes(row.get('top_routes', []))}"
            )

    if period in {"week", "both"}:
        lines.append("")
        lines.append("Weekly:")
        if not week_rows:
            lines.append("- (no events)")
        for row in week_rows:
            lines.append(
                f"- {row['bucket']} ({row['start_date_utc']}..{row['end_date_utc']}): "
                f"events={row['events']}, deny_rate={row['deny_rate_pct']:.1f}%, "
                f"top={fmt_top(row['top_codes'])}, routes={fmt_top_routes(row.get('top_routes', []))}"
            )

    rendered = "\n".join(lines)

if output_path_raw:
    output_path = Path(output_path_raw)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered + ("\n" if not json_mode else ""), encoding="utf-8")

print(rendered)
PY
