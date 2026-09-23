#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ETL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ETL_ROOT/../.." && pwd)"
CONTAINER_NAME="aios-prefect-control-plane-test-$$"
POSTGRES_IMAGE="${PREFECT_CONTROL_PLANE_TEST_POSTGRES_IMAGE:-postgres:14-alpine}"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/aios-prefect-control-plane.XXXXXX")"
FIXTURE_FLOW="$ETL_ROOT/.prefect_control_plane_smoke_$$.py"
SERVER_LOG="$FIXTURE_ROOT/prefect-server.log"
WORKER_LOG="$FIXTURE_ROOT/prefect-worker.log"
server_pid=""
worker_pid=""

stop_process() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  fi
  wait "$pid" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  stop_process "$worker_pid"
  stop_process "$server_pid"
  docker rm -fv "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f -- "$FIXTURE_FLOW"
  if [[ "$exit_code" -ne 0 ]]; then
    if [[ -s "$SERVER_LOG" ]]; then
      echo "--- disposable Prefect Server log (last 80 lines) ---" >&2
      tail -n 80 "$SERVER_LOG" >&2
    fi
    if [[ -s "$WORKER_LOG" ]]; then
      echo "--- disposable Prefect Worker log (last 80 lines) ---" >&2
      tail -n 80 "$WORKER_LOG" >&2
    fi
  fi
  rm -rf -- "$FIXTURE_ROOT"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the disposable Prefect PostgreSQL fixture." >&2
  exit 1
fi
if [[ ! -x "$ETL_ROOT/.venv/bin/python" || ! -x "$ETL_ROOT/.venv/bin/prefect" ]]; then
  echo "Run 'uv sync --project etl/groland_postgres --frozen' before this fixture." >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- etl/groland_postgres/prefect.yaml)" ]]; then
  echo "The disposable fixture requires an unchanged etl/groland_postgres/prefect.yaml." >&2
  exit 1
fi

prefect_yaml_sha="$(shasum -a 256 "$ETL_ROOT/prefect.yaml" | awk '{print $1}')"

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=fixture \
  --env POSTGRES_DB=aios_prefect \
  --publish 127.0.0.1::5432 \
  "$POSTGRES_IMAGE" >/dev/null

database_ready() {
  docker exec "$CONTAINER_NAME" \
    psql -Atq -U postgres -d aios_prefect -c 'SELECT 1;' 2>/dev/null \
    | grep -qx '1'
}

ready=0
for _ in $(seq 1 60); do
  if database_ready; then
    sleep 1
    if database_ready; then
      ready=1
      break
    fi
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi

published_address="$(docker port "$CONTAINER_NAME" 5432/tcp | tail -n 1)"
published_port="${published_address##*:}"
control_plane_port="$("$ETL_ROOT/.venv/bin/python" - <<'PY'
import socket

with socket.socket() as listener:
  listener.bind(("127.0.0.1", 0))
  print(listener.getsockname()[1])
PY
)"

export PREFECT_HOME="$FIXTURE_ROOT/prefect-home"
export PREFECT_API_URL="http://127.0.0.1:${control_plane_port}/api"
export DATAOPS_PREFECT_API_URL="$PREFECT_API_URL"
export DATAOPS_PREFECT_AUTH_MODE=none
export PREFECT_API_DATABASE_CONNECTION_URL="postgresql+asyncpg://postgres:fixture@127.0.0.1:${published_port}/aios_prefect"
export PREFECT_SERVER_ANALYTICS_ENABLED=false
export PREFECT_UI_ENABLED=false
export HOST_ADDRESS=127.0.0.1
export PORT="$control_plane_port"
export WORK_POOL_NAME=default-agent-pool
export POOL_NAME="$WORK_POOL_NAME"
export POOL_TYPE=process
export RUN_OVERVIEW_SCHEMA_PRECHECK=0
export CONTENT_ASSET_FEISHU_SPREADSHEET_TOKEN=
export CONTENT_ASSET_FEISHU_SOURCE_URL=https://fixture.invalid/content-assets
export PGHOST=127.0.0.1
export PGPORT="$published_port"
export PGUSER=postgres
export PGPASSWORD=fixture
export PGDATABASE=aios_prefect
export SERVER_WAIT_TIMEOUT_SECONDS=180
export SERVER_WAIT_POLL_SECONDS=1
export PREFECT_FIXTURE_SCRIPT_DIR="$SCRIPT_DIR"

run_fixture_action() {
  local action="$1"
  local timeout_seconds="${2:-180}"
  "$ETL_ROOT/.venv/bin/python" - "$action" "$timeout_seconds" <<'PY'
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.environ["PREFECT_FIXTURE_SCRIPT_DIR"])

from manage_prefect_deployments import (  # noqa: E402
  PrefectApiClient,
  active_entries,
  fetch_live_deployments,
  load_manifest,
)


def active_live(client, manifest):
  live = {
    (item["flow_name"], item["name"]): item
    for item in fetch_live_deployments(client)
  }
  expected = active_entries(manifest)
  missing = [
    f"{entry['flow_name']}/{entry['deployment_name']}"
    for entry in expected
    if (entry["flow_name"], entry["deployment_name"]) not in live
  ]
  if missing:
    raise RuntimeError("active deployments missing: " + ", ".join(missing))
  return {
    str(live[(entry["flow_name"], entry["deployment_name"])]["id"]): entry
    for entry in expected
  }


def flow_runs(client, *, deployment_ids, state_filter=None, limit=200):
  contract = {"deployment_id": {"any_": list(deployment_ids)}}
  if state_filter is not None:
    contract["state"] = {"type": state_filter}
  return client.request("POST", "/flow_runs/filter", {
    "flow_runs": contract,
    "sort": "EXPECTED_START_TIME_ASC",
    "limit": limit,
    "offset": 0,
  })


action = sys.argv[1]
timeout_seconds = float(sys.argv[2])
client = PrefectApiClient(os.environ["PREFECT_API_URL"], timeout_seconds=10)
manifest = load_manifest()

if action == "shadow-empty":
  runs = client.request("POST", "/flow_runs/filter", {"limit": 1, "offset": 0})
  if runs:
    raise RuntimeError("shadow control plane generated a flow run")
  print("Prefect shadow run-production check: PASS flow_runs=0")
elif action == "wait-future":
  active = active_live(client, manifest)
  missing = {
    deployment_id: entry
    for deployment_id, entry in active.items()
    if entry["schedule"]["active"]
  }
  deadline = time.monotonic() + timeout_seconds
  while missing and time.monotonic() < deadline:
    now = datetime.now(timezone.utc).isoformat()
    for deployment_id in list(missing):
      runs = client.request("POST", "/flow_runs/filter", {
        "flow_runs": {
          "deployment_id": {"any_": [deployment_id]},
          "state": {"type": {"any_": ["SCHEDULED"]}},
          "expected_start_time": {"after_": now},
        },
        "sort": "EXPECTED_START_TIME_ASC",
        "limit": 1,
        "offset": 0,
      })
      if runs:
        del missing[deployment_id]
    if missing:
      time.sleep(2)
  if missing:
    names = sorted(
      f"{entry['flow_name']}/{entry['deployment_name']}"
      for entry in missing.values()
    )
    raise RuntimeError("scheduler did not create future runs for: " + ", ".join(names))
  print("Prefect scheduler future-run check: PASS scheduled_deployments=28")
elif action == "pause-delete":
  active = active_live(client, manifest)
  deployment_ids = list(active)
  for deployment_id in deployment_ids:
    client.request("POST", f"/deployments/{deployment_id}/pause_deployment")
  unsafe = flow_runs(
    client,
    deployment_ids=deployment_ids,
    state_filter={"not_any_": ["SCHEDULED"]},
    limit=1,
  )
  if unsafe:
    raise RuntimeError("business deployment produced a non-SCHEDULED run before Worker startup")
  deleted = 0
  while True:
    result = client.request("POST", "/flow_runs/bulk_delete", {
      "flow_runs": {"deployment_id": {"any_": deployment_ids}},
      "limit": 50,
    })
    batch = result.get("deleted") if isinstance(result, dict) else None
    if not batch:
      break
    deleted += len(batch)
  remaining = flow_runs(client, deployment_ids=deployment_ids, limit=1)
  if remaining:
    raise RuntimeError("business flow runs remain after disposable cleanup")
  print(f"Prefect business isolation check: PASS paused=30 deleted_runs={deleted}")
elif action == "wait-worker":
  deadline = time.monotonic() + timeout_seconds
  while time.monotonic() < deadline:
    workers = client.request(
      "POST",
      f"/work_pools/{os.environ['WORK_POOL_NAME']}/workers/filter",
      {"limit": 100, "offset": 0},
    )
    if any(worker.get("status") == "ONLINE" for worker in workers):
      print("Prefect Worker heartbeat check: PASS online=1")
      break
    time.sleep(1)
  else:
    raise RuntimeError("Worker did not become ONLINE before the fixture deadline")
elif action == "smoke-completed":
  live = {
    (item["flow_name"], item["name"]): item
    for item in fetch_live_deployments(client)
  }
  smoke = live.get(("aios-control-plane-smoke", "control-plane-smoke"))
  if smoke is None:
    raise RuntimeError("smoke deployment is missing")
  completed = flow_runs(
    client,
    deployment_ids=[str(smoke["id"])],
    state_filter={"any_": ["COMPLETED"]},
    limit=10,
  )
  if len(completed) != 1:
    raise RuntimeError(f"expected one completed smoke run, found {len(completed)}")
  business = flow_runs(client, deployment_ids=active_live(client, manifest), limit=1)
  if business:
    raise RuntimeError("a business deployment run appeared during the Worker smoke")
  print("Prefect Worker execution check: PASS completed_smoke_runs=1 business_runs=0")
else:
  raise RuntimeError(f"unsupported fixture action: {action}")
PY
}

start_server() {
  local mode="$1"
  if [[ "$mode" == "shadow" ]]; then
    bash "$SCRIPT_DIR/start_prefect_shadow_server.sh" >"$SERVER_LOG" 2>&1 &
  else
    bash "$SCRIPT_DIR/start_prefect_server.sh" >"$SERVER_LOG" 2>&1 &
  fi
  server_pid=$!
  "$ETL_ROOT/.venv/bin/python" "$SCRIPT_DIR/ensure_prefect_worker_ready.py" \
    --api-url "$PREFECT_API_URL" \
    --pool "$WORK_POOL_NAME" \
    --pool-type process \
    --prefect-bin "$ETL_ROOT/.venv/bin/prefect" \
    --timeout-seconds 180 \
    --poll-interval-seconds 1
}

cd "$ETL_ROOT"
start_server shadow

"$ETL_ROOT/.venv/bin/python" "$SCRIPT_DIR/manage_prefect_deployments.py" deploy active
"$ETL_ROOT/.venv/bin/python" "$SCRIPT_DIR/manage_prefect_deployments.py" \
  verify-live --mode clean --api-url "$PREFECT_API_URL"
run_fixture_action shadow-empty

stop_process "$server_pid"
server_pid=""
: >"$SERVER_LOG"
start_server normal
run_fixture_action wait-future 180
run_fixture_action pause-delete

printf '%s\n' \
  'from prefect import flow' \
  '' \
  '@flow(name="aios-control-plane-smoke")' \
  'def control_plane_smoke():' \
  '  return {"status": "ok"}' \
  >"$FIXTURE_FLOW"

uv run --project "$ETL_ROOT" --frozen prefect deploy \
  "$FIXTURE_FLOW:control_plane_smoke" \
  --name control-plane-smoke \
  --pool "$WORK_POOL_NAME"

bash "$SCRIPT_DIR/start_prefect_worker.sh" >"$WORKER_LOG" 2>&1 &
worker_pid=$!
run_fixture_action wait-worker 120

uv run --project "$ETL_ROOT" --frozen prefect deployment run \
  --name aios-control-plane-smoke/control-plane-smoke \
  --watch \
  --watch-interval 1 \
  --watch-timeout 180
run_fixture_action smoke-completed

current_prefect_yaml_sha="$(shasum -a 256 "$ETL_ROOT/prefect.yaml" | awk '{print $1}')"
if [[ "$current_prefect_yaml_sha" != "$prefect_yaml_sha" ]]; then
  echo "Disposable fixture modified etl/groland_postgres/prefect.yaml." >&2
  exit 1
fi

echo "Prefect PostgreSQL control-plane fixture: PASS active=30 retired=0 future_schedules=28 worker_smoke=COMPLETED"
