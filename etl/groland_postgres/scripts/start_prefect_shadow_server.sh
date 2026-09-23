#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Shadow mode permits API migrations and deployment registration but prevents
# background services from generating or advancing run state.
export PREFECT_SERVER_SERVICES_SCHEDULER_ENABLED=false
export PREFECT_SERVER_SERVICES_LATE_RUNS_ENABLED=false
export PREFECT_SERVER_SERVICES_FOREMAN_ENABLED=false
export PREFECT_SERVER_SERVICES_CANCELLATION_CLEANUP_ENABLED=false
export PREFECT_SERVER_SERVICES_PAUSE_EXPIRATIONS_ENABLED=false
export PREFECT_SERVER_SERVICES_REPOSSESSOR_ENABLED=false
export PREFECT_SERVER_SERVICES_CLEANUP_RECONCILER_ENABLED=false
export PREFECT_SERVER_SERVICES_TASK_RUN_RECORDER_ENABLED=false
export PREFECT_SERVER_SERVICES_TRIGGERS_ENABLED=false

exec "$SCRIPT_DIR/start_prefect_server.sh"
