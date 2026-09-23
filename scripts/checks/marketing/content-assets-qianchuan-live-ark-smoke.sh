#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [[ "${AIOS_QC_ALLOW_LIVE_ARK:-0}" != "1" ]]; then
  echo "Refusing to call live Ark/Doubao without AIOS_QC_ALLOW_LIVE_ARK=1." >&2
  echo "This check invokes the external video model and may consume quota." >&2
  exit 2
fi

if [[ -z "${CONTENT_ASSET_LIVE_ARK_SMOKE_VIDEO_URL:-}" ]]; then
  echo "CONTENT_ASSET_LIVE_ARK_SMOKE_VIDEO_URL is required for live video smoke." >&2
  echo "Use a short signed video URL for one explicitly selected content asset." >&2
  exit 2
fi

PYTHONPATH="${ROOT_DIR}/etl/groland_postgres/scripts" \
AIOS_REPO_ROOT="${ROOT_DIR}" \
uv run --project "${ROOT_DIR}/etl/groland_postgres" python - <<'PY'
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping

from marketing_content_assets.ark_responses import (
  ArkResponsesClient,
  ArkResponsesConfig,
)
from marketing_content_assets.worker_runtime import load_env_file


def _as_list(value: Any) -> list[Any]:
  return value if isinstance(value, list) else []


def _as_mapping(value: Any) -> Mapping[str, Any]:
  return value if isinstance(value, dict) else {}


def _has_live_boundary(analysis: Mapping[str, Any]) -> bool:
  candidates = [
    _as_mapping(analysis.get("live_acceptance_attribution")),
    _as_mapping(_as_mapping(analysis.get("fusion_diagnosis")).get("live_acceptance_attribution")),
  ]
  return any(candidate.get("level") == "account_date_environment" for candidate in candidates)


def _load_env_files() -> None:
  root = Path(os.environ["AIOS_REPO_ROOT"])
  raw_files = os.getenv(
    "CONTENT_ASSET_LIVE_ARK_ENV_FILES",
    ".env.local:.env.content-assets.local",
  )
  for raw_path in raw_files.split(":"):
    raw_path = raw_path.strip()
    if not raw_path:
      continue
    path = Path(raw_path)
    if not path.is_absolute():
      path = root / path
    load_env_file(path)


def _smoke_context() -> dict[str, Any]:
  objective = os.getenv("CONTENT_ASSET_LIVE_ARK_SMOKE_OBJECTIVE", "live_all_domain_shortvideo")
  return {
    "asset": {
      "assetId": os.getenv("CONTENT_ASSET_LIVE_ARK_SMOKE_ASSET_ID", "live-ark-smoke"),
      "title": os.getenv("CONTENT_ASSET_LIVE_ARK_SMOKE_TITLE", "千川全域视频理解 live smoke"),
      "platform": "qianchuan",
    },
    "delivery_mode": "qianchuan_all_domain",
    "objective": objective,
    "performanceSnapshot": {
      "deliveryMode": "qianchuan_all_domain",
      "materialCount": 1,
      "materials": [
        {
          "materialId": "LIVE-ARK-SMOKE",
          "objective": objective,
          "summary": {
            "totalImpressions": 20000,
            "totalClicks": 1400,
            "totalCost": 1200,
            "totalOrders": 30,
            "totalGmv": 2800,
            "ctr": 0.07,
            "cvr": 0.0214,
            "payRoi": 2.3333,
          },
          "liveAcceptance": {
            "attributionLevel": "account_date_environment",
            "douyinAccountDisplayId": "live_ark_smoke_account",
            "status": "ok",
          },
        }
      ],
    },
    "performanceDiagnosis": {
      "sample_gate": {
        "status": "ok",
        "decision": "allow_directional_verdict",
        "observed": {
          "total_impressions": 20000,
          "total_clicks": 1400,
          "total_cost": 1200,
        },
      },
      "benchmark_context": {
        "objective": objective,
        "scope": "objective_static_threshold",
        "status": "static_fallback",
        "note": "live smoke only; not production benchmark proof",
      },
      "evidence_ledger": [
        {
          "id": "metric:ctr",
          "type": "metric",
          "metric": "ctr",
          "label": "点击率",
          "value": "7.0%",
          "benchmark": ">= 1.5%",
          "judgment": "good",
          "source": "live_ark_smoke_fixture",
          "meaning": "用于验证模型会同时读取数据边界和视频内容，不代表生产表现。",
        }
      ],
      "next_actions": [
        {
          "action_type": "check_live_room_script",
          "owner": "live_room",
          "priority": "medium",
          "expected_metric_lift": "watch_to_pay_rate",
          "reason": "live smoke validates account/date acceptance boundary.",
          "evidence_refs": ["metric:ctr"],
        }
      ],
    },
    "constraints": {
      "delivery_mode": "qianchuan_all_domain",
      "boost_metrics_policy": "boost metrics are explanatory only; do not add to overall metrics",
      "live_acceptance_policy": (
        "douyin_trade_sale_live_raw is account/date live-room acceptance context, "
        "not exact material-level attribution"
      ),
    },
  }


def main() -> None:
  _load_env_files()
  video_url = os.environ["CONTENT_ASSET_LIVE_ARK_SMOKE_VIDEO_URL"].strip()
  profile = os.getenv("CONTENT_ASSET_LIVE_ARK_SMOKE_PROFILE", "preview_fast").strip() or "preview_fast"
  client = ArkResponsesClient(ArkResponsesConfig.from_env())
  result = client.analyze_video(
    video_url,
    asset_context=_smoke_context(),
    analysis_profile=profile,
  )
  analysis = result.analysis
  schema_version = str(analysis.get("analysis_schema_version") or "")
  delivery_mode = str(analysis.get("delivery_mode") or "")
  diagnosis_mode = str(analysis.get("diagnosis_mode") or "")
  objective = str(analysis.get("objective") or "")
  evidence = _as_list(analysis.get("evidence_ledger"))
  next_actions = _as_list(analysis.get("next_actions"))
  scores = _as_mapping(analysis.get("scores"))
  failures = []
  if schema_version != "2.1":
    failures.append(f"analysis_schema_version={schema_version or '<missing>'}")
  if delivery_mode != "qianchuan_all_domain":
    failures.append(f"delivery_mode={delivery_mode or '<missing>'}")
  if diagnosis_mode not in {"data_content_fusion", "data_only", "content_only", "insufficient_data"}:
    failures.append(f"diagnosis_mode={diagnosis_mode or '<missing>'}")
  if objective not in {"product_all_domain_shortvideo", "live_all_domain_shortvideo", "unknown"}:
    failures.append(f"objective={objective or '<missing>'}")
  if not evidence:
    failures.append("evidence_ledger is empty")
  if not next_actions:
    failures.append("next_actions is empty")
  if "fusion_overall_score" not in scores:
    failures.append("scores.fusion_overall_score missing")
  if not _has_live_boundary(analysis):
    failures.append("live_acceptance_attribution.account_date_environment missing")
  if failures:
    raise SystemExit("live Ark smoke failed contract checks: " + "; ".join(failures))

  print(json.dumps({
    "ok": True,
    "model": client.config.model,
    "profile": profile,
    "responseId": result.response_id,
    "usage": result.usage,
    "analysisSchemaVersion": schema_version,
    "diagnosisMode": diagnosis_mode,
    "objective": objective,
    "evidenceLedgerCount": len(evidence),
    "nextActionsCount": len(next_actions),
    "hasLiveAcceptanceBoundary": True,
  }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
PY
