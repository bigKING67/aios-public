#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SPEC_JSON="${TOOLS_DIR}/frontend_preflight_spec.json"
AGENTS_MD="${HOME}/.codex/AGENTS.md"
WORKER_TOML="${HOME}/.codex/agents/worker.toml"
SKIP_PROMPT_SYNC="${FRONTEND_PREFLIGHT_SPEC_SYNC_SKIP_PROMPTS:-0}"
PREFLIGHT_PY="${TOOLS_DIR}/frontend_preflight.py"
ENTRY_SH="${TOOLS_DIR}/frontend_worker_entry.sh"
SUMMARY_SH="${TOOLS_DIR}/frontend_preflight_log_summary.sh"
REPORT_SH="${TOOLS_DIR}/frontend_preflight_report.sh"
VERIFY_SH="${TOOLS_DIR}/frontend_preflight_verify.sh"
ROUTE_PLAN_SH="${TOOLS_DIR}/frontend_route_plan.sh"
POLICY_RUN_SH="${TOOLS_DIR}/frontend_preflight_policy_run.sh"
POLICY_JSON="${TOOLS_DIR}/frontend_preflight_policy.json"
ROUTING_JSON="${TOOLS_DIR}/frontend_agent_routing.json"
CI_TEMPLATE="${TOOLS_DIR}/templates/frontend-preflight-ci.yml"

python3 - "${SPEC_JSON}" "${AGENTS_MD}" "${WORKER_TOML}" "${PREFLIGHT_PY}" "${ENTRY_SH}" "${SUMMARY_SH}" "${REPORT_SH}" "${VERIFY_SH}" "${ROUTE_PLAN_SH}" "${POLICY_RUN_SH}" "${POLICY_JSON}" "${ROUTING_JSON}" "${CI_TEMPLATE}" "${SKIP_PROMPT_SYNC}" <<'PY'
import json
import os
import re
import sys
from pathlib import Path

spec_path = Path(sys.argv[1])
agents_path = Path(sys.argv[2])
worker_path = Path(sys.argv[3])
preflight_path = Path(sys.argv[4])
entry_path = Path(sys.argv[5])
summary_path = Path(sys.argv[6])
report_path = Path(sys.argv[7])
verify_path = Path(sys.argv[8])
route_plan_path = Path(sys.argv[9])
policy_run_path = Path(sys.argv[10])
policy_json_path = Path(sys.argv[11])
routing_json_path = Path(sys.argv[12])
ci_template_path = Path(sys.argv[13])
skip_prompt_sync = str(sys.argv[14]).strip() == "1"

spec = json.loads(spec_path.read_text(encoding="utf-8"))
agents_text = ""
worker_text = ""
if not skip_prompt_sync:
    agents_text = agents_path.read_text(encoding="utf-8")
    worker_text = worker_path.read_text(encoding="utf-8")
preflight_text = preflight_path.read_text(encoding="utf-8")
entry_text = entry_path.read_text(encoding="utf-8")
summary_text = summary_path.read_text(encoding="utf-8")
report_text = report_path.read_text(encoding="utf-8")
verify_text = verify_path.read_text(encoding="utf-8")
route_plan_text = route_plan_path.read_text(encoding="utf-8")
policy_run_text = policy_run_path.read_text(encoding="utf-8")
ci_template_text = ci_template_path.read_text(encoding="utf-8")


def merge_dict(base, override):
    out = dict(base)
    for key, value in override.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = merge_dict(out[key], value)
        else:
            out[key] = value
    return out


def resolve_profile(name, profiles, trail=None):
    trail = [] if trail is None else trail
    if name in trail:
        raise SystemExit(f"frontend_preflight_policy.json profile extends cycle: {' -> '.join(trail + [name])}")
    raw = profiles.get(name)
    if not isinstance(raw, dict):
        raise SystemExit(f"frontend_preflight_policy.json profile must be object: {name}")
    parent = raw.get("extends")
    parent_name = str(parent).strip() if parent is not None else ""
    if parent_name:
        if parent_name not in profiles:
            raise SystemExit(
                f"frontend_preflight_policy.json profile extends unknown parent: {name} -> {parent_name}"
            )
        base = resolve_profile(parent_name, profiles, trail + [name])
        local = {k: v for k, v in raw.items() if k != "extends"}
        return merge_dict(base, local)
    return dict(raw)


normalized_codes = spec.get("normalized_error_codes", [])
preflight_emitted_codes = spec.get("preflight_emitted_codes", [])
legacy_forbidden_codes = spec.get("legacy_forbidden_codes", [])
authority_required_sections = spec.get("authority_required_sections", {})
l1f_visual_warning_skills = spec.get("l1f_visual_warning_skills", [])
core_baseline_skills = spec.get("core_baseline_skills", [])
composition_skills = spec.get("composition_skills", [])
mutex_style_skills = spec.get("mutex_style_skills", [])
workflow_modifier_skills = spec.get("workflow_modifier_skills", [])
finalizer_skills = spec.get("finalizer_skills", [])
imagegen_only_skills = spec.get("imagegen_only_skills", [])

if not normalized_codes or not preflight_emitted_codes:
    raise SystemExit("spec missing normalized_error_codes or preflight_emitted_codes")

if spec.get("execution_modes") != ["main_serial", "spawn_default", "spawn_worker"]:
    raise SystemExit("frontend_preflight_spec.json execution_modes must describe the execution contract")

if spec.get("runtime_remediation_policies") != ["not_required", "repair_then_retry"]:
    raise SystemExit("frontend_preflight_spec.json runtime_remediation_policies must describe repair policy")

if spec.get("style_authority_revision_policies") != ["none", "enforce_current_baseline", "evolve_current_baseline"]:
    raise SystemExit("frontend_preflight_spec.json style_authority_revision_policies must describe DESIGN.md policy")

if len(normalized_codes) != len(set(normalized_codes)):
    raise SystemExit("normalized_error_codes contains duplicates")

if not set(preflight_emitted_codes).issubset(set(normalized_codes)):
    raise SystemExit("preflight_emitted_codes must be subset of normalized_error_codes")

if not isinstance(authority_required_sections, dict) or not authority_required_sections:
    raise SystemExit("spec missing authority_required_sections")
for section, words in authority_required_sections.items():
    if not isinstance(words, list) or not words:
        raise SystemExit(f"authority_required_sections.{section} must be non-empty list")

if not isinstance(l1f_visual_warning_skills, list) or not l1f_visual_warning_skills:
    raise SystemExit("spec missing l1f_visual_warning_skills")
for skill in [
    "frontend-skill",
    "gpt-taste",
    "image-to-code",
    "redesign-existing-projects",
    "imagegen-frontend-web",
    "imagegen-frontend-mobile",
    "brandkit",
]:
    if skill not in l1f_visual_warning_skills:
        raise SystemExit(f"l1f_visual_warning_skills missing skill: {skill}")
if "gpt-taste" not in mutex_style_skills:
    raise SystemExit("mutex_style_skills must include gpt-taste")
if "image-to-code" in mutex_style_skills:
    raise SystemExit("image-to-code must not be a mutually exclusive style skill")
for skill in ["imagegen-frontend-web", "imagegen-frontend-mobile", "brandkit"]:
    if skill not in imagegen_only_skills:
        raise SystemExit(f"imagegen_only_skills missing skill: {skill}")
    if skill in mutex_style_skills:
        raise SystemExit(f"{skill} must not be a mutually exclusive style skill")
for skill in ["image-to-code", "redesign-existing-projects", "stitch-design-taste"]:
    if skill not in workflow_modifier_skills:
        raise SystemExit(f"workflow_modifier_skills missing skill: {skill}")
for skill in ["design-taste-frontend"]:
    if skill not in core_baseline_skills:
        raise SystemExit(f"core_baseline_skills missing skill: {skill}")
for skill in ["frontend-skill"]:
    if skill not in composition_skills:
        raise SystemExit(f"composition_skills missing skill: {skill}")
if "full-output-enforcement" not in finalizer_skills:
    raise SystemExit("finalizer_skills missing full-output-enforcement")
if "full-output-enforcement" in l1f_visual_warning_skills:
    raise SystemExit("full-output-enforcement must not trigger L1-F visual warning")

if "frontend_preflight_spec.json" not in preflight_text:
    raise SystemExit("frontend_preflight.py must reference frontend_preflight_spec.json")

if "TIER_CHOICES =" in preflight_text:
    raise SystemExit("frontend_preflight.py should not hardcode TIER_CHOICES")

if "MUTEX_STYLE_SKILLS =" in preflight_text:
    raise SystemExit("frontend_preflight.py should not hardcode MUTEX_STYLE_SKILLS")

if "STYLE_SECTION_HEADING_PATTERNS =" in preflight_text:
    raise SystemExit("frontend_preflight.py should not hardcode STYLE_SECTION_HEADING_PATTERNS")

if "FRONTEND_PREFLIGHT_SPEC_PATH" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh must support FRONTEND_PREFLIGHT_SPEC_PATH")

if "FRONTEND_PREFLIGHT_LOG_CONTEXT" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh missing FRONTEND_PREFLIGHT_LOG_CONTEXT support")

for required in [
    "FRONTEND_STYLE_AUTHORITY_PATH",
    "FRONTEND_STYLE_AUTHORITY_AUTO",
    "FRONTEND_STYLE_AUTHORITY_REQUIRED",
    "FRONTEND_STYLE_AUTHORITY_REQUIRED_TIERS",
    "FRONTEND_STYLE_AUTHORITY_MODE",
]:
    if required not in entry_text + preflight_text + route_plan_text:
        raise SystemExit(f"frontend style authority routing missing env support: {required}")

if "candidate = directory / \"DESIGN.md\"" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh must auto-discover ancestor DESIGN.md")

if "candidate = directory / \"DESIGN.md\"" not in route_plan_text:
    raise SystemExit("frontend_route_plan.sh must auto-discover ancestor DESIGN.md")

if "style_authority_source" not in entry_text or "style_authority_source" not in route_plan_text:
    raise SystemExit("frontend route outputs must expose style_authority_source")

if "style_authority_mode" not in entry_text or "style_authority_mode" not in route_plan_text:
    raise SystemExit("frontend route outputs must expose style_authority_mode")

if "design_evolution_required" not in route_plan_text:
    raise SystemExit("frontend_route_plan.sh must expose design_evolution_required")

if "FRONTEND_AGENT_ROUTING_PATH" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh missing FRONTEND_AGENT_ROUTING_PATH support")

if "--reasoning-override" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh missing --reasoning-override support")

if "agent_type" not in entry_text:
    raise SystemExit("frontend_worker_entry.sh missing agent_type route payload support")

if "--fail-on-tier-deny-rate" not in summary_text:
    raise SystemExit("frontend_preflight_log_summary.sh missing tier deny-rate threshold flag")

if "--fail-on-deny-trend" not in summary_text or "--fail-on-tier-deny-trend" not in summary_text:
    raise SystemExit("frontend_preflight_log_summary.sh missing trend flags")

if "--context" not in summary_text:
    raise SystemExit("frontend_preflight_log_summary.sh missing context filter flag")

for required_flag in [
    "--include-rotated",
    "--include-gzip-rotated",
    "--max-rotated-files",
    "--require-min-events",
    "--no-data-action",
    "--state-path",
    "--incremental",
    "--max-parse-error-rate-pct",
    "--parse-error-action",
    "--state-max-events",
]:
    if required_flag not in summary_text:
        raise SystemExit(f"frontend_preflight_log_summary.sh missing flag: {required_flag}")

if "for raw_line in fp" not in summary_text:
    raise SystemExit("frontend_preflight_log_summary.sh must keep streaming line-by-line read")

if "read_text(encoding=\"utf-8\").splitlines()" in summary_text:
    raise SystemExit("frontend_preflight_log_summary.sh should not load whole log with read_text().splitlines()")

if "frontend_preflight_log_summary.sh --json" not in report_text:
    raise SystemExit("frontend_preflight_report.sh must consume summary --json output")

if "--context" not in report_text:
    raise SystemExit("frontend_preflight_report.sh missing context passthrough")

if not verify_path.exists():
    raise SystemExit("frontend_preflight_verify.sh not found")

if not os.access(verify_path, os.X_OK):
    raise SystemExit("frontend_preflight_verify.sh must be executable")

if not policy_run_path.exists():
    raise SystemExit("frontend_preflight_policy_run.sh not found")

if not os.access(policy_run_path, os.X_OK):
    raise SystemExit("frontend_preflight_policy_run.sh must be executable")

if not policy_json_path.exists():
    raise SystemExit("frontend_preflight_policy.json not found")

if not routing_json_path.exists():
    raise SystemExit("frontend_agent_routing.json not found")

routing_payload = json.loads(routing_json_path.read_text(encoding="utf-8"))
if str(routing_payload.get("version")) != "1":
    raise SystemExit("frontend_agent_routing.json version must be 1")

tier_defaults = routing_payload.get("tier_defaults")
if not isinstance(tier_defaults, dict):
    raise SystemExit("frontend_agent_routing.json tier_defaults must be object")
for tier in ["L0", "L1-F", "L1-V", "L2"]:
    item = tier_defaults.get(tier)
    if not isinstance(item, dict):
        raise SystemExit(f"frontend_agent_routing.json missing tier default: {tier}")
    route = str(item.get("agent_route", ""))
    agent_type = str(item.get("agent_type", ""))
    model = str(item.get("agent_model", ""))
    reasoning = str(item.get("reasoning_target", ""))
    reason = str(item.get("route_reason", ""))
    execution_mode = str(item.get("execution_mode", ""))
    subagent_required = item.get("subagent_required")
    runtime_policy = str(item.get("runtime_remediation_policy", ""))
    if route not in {"default_high", "worker_xhigh"}:
        raise SystemExit(f"frontend_agent_routing.json invalid agent_route for {tier}: {route}")
    if agent_type not in {"default", "worker"}:
        raise SystemExit(f"frontend_agent_routing.json invalid agent_type for {tier}: {agent_type}")
    if route == "default_high" and agent_type != "default":
        raise SystemExit(f"frontend_agent_routing.json default_high must use agent_type=default for {tier}: {agent_type}")
    if route == "worker_xhigh" and agent_type != "worker":
        raise SystemExit(f"frontend_agent_routing.json worker_xhigh must use agent_type=worker for {tier}: {agent_type}")
    if route == "default_high" and model != "gpt-5.5":
        raise SystemExit(f"frontend_agent_routing.json default_high must use gpt-5.5 for {tier}: {model}")
    if route == "worker_xhigh" and model != "gpt-5.5":
        raise SystemExit(f"frontend_agent_routing.json worker_xhigh must use gpt-5.5 for {tier}: {model}")
    if reasoning not in {"high", "xhigh"}:
        raise SystemExit(f"frontend_agent_routing.json invalid reasoning_target for {tier}: {reasoning}")
    if reason != "tier_default":
        raise SystemExit(f"frontend_agent_routing.json route_reason for {tier} must be tier_default")
    expected_execution = {
        "L0": "main_serial",
        "L1-F": "spawn_default",
        "L1-V": "spawn_default",
        "L2": "spawn_worker",
    }[tier]
    if execution_mode != expected_execution:
        raise SystemExit(f"frontend_agent_routing.json execution_mode for {tier} must be {expected_execution}: {execution_mode}")
    expected_required = tier != "L0"
    if subagent_required is not expected_required:
        raise SystemExit(f"frontend_agent_routing.json subagent_required for {tier} must be {expected_required}")
    expected_policy = "repair_then_retry" if expected_required else "not_required"
    if runtime_policy != expected_policy:
        raise SystemExit(f"frontend_agent_routing.json runtime_remediation_policy for {tier} must be {expected_policy}: {runtime_policy}")

if tier_defaults["L2"].get("reasoning_target") != "xhigh":
    raise SystemExit("frontend_agent_routing.json L2 reasoning_target must be xhigh")
for tier in ["L0", "L1-F", "L1-V"]:
    if tier_defaults[tier].get("reasoning_target") != "high":
        raise SystemExit(f"frontend_agent_routing.json {tier} reasoning_target must be high")

overrides = routing_payload.get("overrides")
if not isinstance(overrides, dict):
    raise SystemExit("frontend_agent_routing.json overrides must be object")
for key in ["explicit_high", "explicit_xhigh"]:
    item = overrides.get(key)
    if not isinstance(item, dict):
        raise SystemExit(f"frontend_agent_routing.json missing override: {key}")
    if str(item.get("route_reason", "")) != "explicit_override":
        raise SystemExit(f"frontend_agent_routing.json override route_reason must be explicit_override: {key}")
    agent_type = str(item.get("agent_type", ""))
    if key == "explicit_high" and agent_type != "default":
        raise SystemExit("frontend_agent_routing.json explicit_high agent_type must be default")
    if key == "explicit_xhigh" and agent_type != "worker":
        raise SystemExit("frontend_agent_routing.json explicit_xhigh agent_type must be worker")
    model = str(item.get("agent_model", ""))
    if key == "explicit_high" and model != "gpt-5.5":
        raise SystemExit("frontend_agent_routing.json explicit_high agent_model must be gpt-5.5")
    if key == "explicit_xhigh" and model != "gpt-5.5":
        raise SystemExit("frontend_agent_routing.json explicit_xhigh agent_model must be gpt-5.5")
    expected_execution = "spawn_default" if key == "explicit_high" else "spawn_worker"
    if str(item.get("execution_mode", "")) != expected_execution:
        raise SystemExit(f"frontend_agent_routing.json {key} execution_mode must be {expected_execution}")
    if item.get("subagent_required") is not True:
        raise SystemExit(f"frontend_agent_routing.json {key} subagent_required must be true")
    if str(item.get("runtime_remediation_policy", "")) != "repair_then_retry":
        raise SystemExit(f"frontend_agent_routing.json {key} runtime_remediation_policy must be repair_then_retry")

if str(overrides["explicit_high"].get("reasoning_target", "")) != "high":
    raise SystemExit("frontend_agent_routing.json explicit_high reasoning_target must be high")
if str(overrides["explicit_xhigh"].get("reasoning_target", "")) != "xhigh":
    raise SystemExit("frontend_agent_routing.json explicit_xhigh reasoning_target must be xhigh")

policy_payload = json.loads(policy_json_path.read_text(encoding="utf-8"))
if str(policy_payload.get("version")) != "1":
    raise SystemExit("frontend_preflight_policy.json version must be 1")
if "profiles" in policy_payload:
    profiles = policy_payload.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise SystemExit("frontend_preflight_policy.json profiles must be non-empty object")
    if not isinstance(policy_payload.get("default_profile"), str) or not policy_payload.get("default_profile"):
        raise SystemExit("frontend_preflight_policy.json missing default_profile")
    for required_profile in ["prod", "ci", "test"]:
        if required_profile not in profiles:
            raise SystemExit(f"frontend_preflight_policy.json missing profile: {required_profile}")
    prod_profile = resolve_profile("prod", profiles)
    if not isinstance(prod_profile.get("window"), dict):
        raise SystemExit("frontend_preflight_policy.json prod profile missing window object")
    if not isinstance(prod_profile.get("sources"), dict):
        raise SystemExit("frontend_preflight_policy.json prod profile missing sources object")
    if not isinstance(prod_profile.get("checks"), dict):
        raise SystemExit("frontend_preflight_policy.json prod profile missing checks object")
    thresholds = prod_profile.get("thresholds")
    if not isinstance(thresholds, dict):
        raise SystemExit("frontend_preflight_policy.json prod profile missing thresholds object")
    for required_key in [
        "deny_rate_pct",
        "tier_deny_rate_pct",
        "deny_trend_days",
        "tier_deny_trend_days",
    ]:
        if required_key not in thresholds:
            raise SystemExit(f"frontend_preflight_policy.json prod thresholds missing key: {required_key}")
    for required_key in ["include_rotated", "include_gzip_rotated", "max_rotated_files"]:
        if required_key not in prod_profile["sources"]:
            raise SystemExit(f"frontend_preflight_policy.json prod sources missing key: {required_key}")
    for required_key in ["min_events", "no_data_action", "parse_error_action"]:
        if required_key not in prod_profile["checks"]:
            raise SystemExit(f"frontend_preflight_policy.json prod checks missing key: {required_key}")
else:
    if not isinstance(policy_payload.get("window"), dict):
        raise SystemExit("frontend_preflight_policy.json missing window object")
    if not isinstance(policy_payload.get("sources"), dict):
        raise SystemExit("frontend_preflight_policy.json missing sources object")
    if not isinstance(policy_payload.get("checks"), dict):
        raise SystemExit("frontend_preflight_policy.json missing checks object")
    thresholds = policy_payload.get("thresholds")
    if not isinstance(thresholds, dict):
        raise SystemExit("frontend_preflight_policy.json missing thresholds object")
    for required_key in [
        "deny_rate_pct",
        "tier_deny_rate_pct",
        "deny_trend_days",
        "tier_deny_trend_days",
    ]:
        if required_key not in thresholds:
            raise SystemExit(f"frontend_preflight_policy.json thresholds missing key: {required_key}")
    for required_key in ["include_rotated", "include_gzip_rotated", "max_rotated_files"]:
        if required_key not in policy_payload["sources"]:
            raise SystemExit(f"frontend_preflight_policy.json sources missing key: {required_key}")
    for required_key in ["min_events", "no_data_action", "parse_error_action"]:
        if required_key not in policy_payload["checks"]:
            raise SystemExit(f"frontend_preflight_policy.json checks missing key: {required_key}")

if "frontend_preflight_policy.json" not in policy_run_text:
    raise SystemExit("frontend_preflight_policy_run.sh must default to frontend_preflight_policy.json")

if "frontend_preflight_log_summary.sh" not in policy_run_text:
    raise SystemExit("frontend_preflight_policy_run.sh must execute frontend_preflight_log_summary.sh")

if "--profile" not in policy_run_text:
    raise SystemExit("frontend_preflight_policy_run.sh missing --profile support")

for required_flag in [
    "--fail-on-tier-deny-rate",
    "--fail-on-deny-trend",
    "--include-rotated",
    "--include-gzip-rotated",
    "--max-rotated-files",
    "--require-min-events",
    "--no-data-action",
    "--max-parse-error-rate-pct",
    "--parse-error-action",
]:
    if required_flag not in policy_run_text:
        raise SystemExit(f"frontend_preflight_policy_run.sh missing mapping flag: {required_flag}")

if "unknown policy keys" not in policy_run_text:
    raise SystemExit("frontend_preflight_policy_run.sh missing strict unknown-key validation")

if "--fail-on-tier-deny-rate" not in policy_run_text or "--fail-on-deny-trend" not in policy_run_text:
    raise SystemExit("frontend_preflight_policy_run.sh missing threshold mapping flags")

if "frontend_preflight_policy_run.sh" not in verify_text or "frontend_preflight_policy.json" not in verify_text:
    raise SystemExit("frontend_preflight_verify.sh must run policy runner with policy json")

if "frontend_preflight_policy_run.sh" not in ci_template_text or "frontend_preflight_policy.json" not in ci_template_text:
    raise SystemExit("frontend-preflight-ci.yml must call policy runner with policy file")

if "frontend_route_plan.sh" not in verify_text:
    raise SystemExit("frontend_preflight_verify.sh must run route planner tests")

if "frontend_worker_entry.sh" not in route_plan_text:
    raise SystemExit("frontend_route_plan.sh must call frontend_worker_entry.sh")

for required_skill in ["image-to-code", "imagegen-frontend-web", "imagegen-frontend-mobile", "brandkit", "gpt-taste"]:
    if required_skill not in route_plan_text:
        raise SystemExit(f"frontend_route_plan.sh missing routing skill: {required_skill}")

for required_field in [
    "quality_tradeoff",
    "frontend_tier",
    "agent_route",
    "progress_echo",
    "execution_mode",
    "subagent_required",
    "spawn_agent_intent",
    "runtime_remediation_policy",
    "style_authority_digest",
    "style_authority_read_required",
    "style_authority_context_required",
    "style_authority_revision_policy",
    "style_authority_evolution_candidate",
    "style_authority_task_constraints",
    "style_authority_execution_contract",
]:
    if required_field not in route_plan_text:
        raise SystemExit(f"frontend_route_plan.sh missing output field: {required_field}")
if "本次已启用 frontend default 子代理" in route_plan_text or "本次已启用 worker 前端子代理" in route_plan_text:
    raise SystemExit("frontend_route_plan.sh must not claim subagents were already enabled")
for required_field in [
    "style_authority_digest",
    "style_authority_read_required",
    "style_authority_context_required",
    "style_authority_revision_policy",
]:
    if required_field not in entry_text:
        raise SystemExit(f"frontend_worker_entry.sh missing authority execution field: {required_field}")

if "context\": \"prod\"" not in verify_text:
    raise SystemExit("frontend_preflight_verify.sh must generate prod fixture before policy run")

if "context\": \"prod\"" not in ci_template_text:
    raise SystemExit("frontend-preflight-ci.yml must generate prod fixture before policy run")

# Ensure AGENTS and worker prompt both mention all normalized codes.
if not skip_prompt_sync:
    if "frontend_agent_routing.json" not in agents_text:
        raise SystemExit("AGENTS must reference frontend_agent_routing.json as routing source")
    if "default_high" not in agents_text or "worker_xhigh" not in agents_text:
        raise SystemExit("AGENTS must describe default_high/worker_xhigh routing")
    if "agent_type" not in agents_text:
        raise SystemExit("AGENTS must describe route agent_type mapping")
    if "gpt-5.5, high" not in agents_text or "gpt-5.5, xhigh" not in agents_text:
        raise SystemExit("AGENTS must include both route progress echo templates")
    if "repair_then_retry" not in agents_text or "不得降级为主代理串行完整交付" not in agents_text:
        raise SystemExit("AGENTS must describe subagent runtime remediation instead of serial downgrade")
    if "evolve_current_baseline" not in agents_text or "style_authority_task_constraints" not in agents_text:
        raise SystemExit("AGENTS must describe DESIGN.md authority execution/evolution contract")
    if "frontend_route_plan.sh" not in agents_text or "完整前端任务主入口" not in agents_text:
        raise SystemExit("AGENTS must describe frontend_route_plan.sh as the L1+ task entry")
    if "style_authority_evolution_candidate" not in agents_text:
        raise SystemExit("AGENTS must describe DESIGN.md evolution candidate semantics")
    for required_worker_text in [
        "style_authority_revision_policy",
        "enforce_current_baseline",
        "evolve_current_baseline",
        "style_authority_task_constraints",
        "style_authority_evolution_candidate",
    ]:
        if required_worker_text not in worker_text:
            raise SystemExit(f"worker.toml missing authority contract text: {required_worker_text}")

    for skill in ["gpt-taste", "image-to-code", "imagegen-frontend-web", "imagegen-frontend-mobile", "brandkit"]:
        if skill not in agents_text:
            raise SystemExit(f"AGENTS missing taste skill route: {skill}")
        if skill not in worker_text:
            raise SystemExit(f"worker.toml missing taste skill guardrail: {skill}")

    for code in normalized_codes:
        if code not in agents_text:
            raise SystemExit(f"AGENTS missing code: {code}")
        if code not in worker_text:
            raise SystemExit(f"worker.toml missing code: {code}")

    if "L2" not in worker_text or "xhigh" not in worker_text:
        raise SystemExit("worker.toml must keep L2/xhigh positioning")

# Extract emitted code literals from frontend_preflight.py.
found_preflight_codes = set(re.findall(r'code=\"([A-Z0-9_]+)\"', preflight_text))
if found_preflight_codes != set(preflight_emitted_codes):
    raise SystemExit(
        "frontend_preflight.py emitted codes mismatch spec. "
        f"found={sorted(found_preflight_codes)} expected={sorted(preflight_emitted_codes)}"
    )

# Ensure forbidden legacy codes are not emitted by runtime scripts.
for legacy in legacy_forbidden_codes:
    if legacy in preflight_text:
        raise SystemExit(f"legacy code still present in frontend_preflight.py: {legacy}")
    if legacy in entry_text:
        raise SystemExit(f"legacy code still present in frontend_worker_entry.sh: {legacy}")

print("spec_sync=ok")
print("normalized_codes_count=", len(normalized_codes))
print("preflight_emitted_codes_count=", len(preflight_emitted_codes))
PY
