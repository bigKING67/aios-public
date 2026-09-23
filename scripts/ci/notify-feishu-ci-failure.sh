#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${FEISHU_WEBHOOK_URL:-}" ]]; then
  echo "FEISHU_WEBHOOK_URL is empty, skip notification."
  exit 0
fi

run_url="https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
msg_text="DataOps API quick regression failed
repo: ${GITHUB_REPOSITORY}
workflow: ${GITHUB_WORKFLOW}
event: ${GITHUB_EVENT_NAME}
ref: ${GITHUB_REF_NAME}
run: ${run_url}"

payload="$(jq -nc --arg text "$msg_text" '{msg_type:"text",content:{text:$text}}')"

curl -sS -X POST "${FEISHU_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  --data "${payload}"
