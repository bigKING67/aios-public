#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY_SH="${SCRIPT_DIR}/frontend_worker_entry.sh"

surface="auto"
intent="auto"
scope="auto"
has_reference_image="0"
needs_generated_reference="0"
existing_project="0"
style="auto"
design_authority_mode="auto"
style_authority_path=""
output="json"

usage() {
  cat <<'EOF'
Usage:
  bash ~/.codex/tools/frontend_route_plan.sh \
    [--surface <auto|dashboard|app|admin|data-app|landing|promo|homepage|marketing|mobile|brand>] \
    [--intent <auto|functional|visual-refine|redesign|new-page|high-motion|brand|mobile-flow|reference-only>] \
    [--scope <auto|micro|component|section|page|multi-page>] \
    [--has-reference-image <0|1>] \
    [--needs-generated-reference <0|1>] \
    [--existing-project <0|1>] \
    [--style <auto|high-end|minimalist|industrial|gpt-taste|none>] \
    [--design-authority-mode <auto|enforce|evolve>] \
    [--style-authority-path <absolute-path>] \
    [--output json]

Behavior:
  - Emits a JSON route plan: frontend_tier, skills, preflight result, agent route,
    execution mode, subagent intent, and quality tradeoff.
  - Does not write logs; preflight is invoked with FRONTEND_PREFLIGHT_LOG_ENABLED=0.
  - This planner chooses a small quality-first chain; it does not maximize skill count.
  - Explicit --style-authority-path wins; otherwise FRONTEND_STYLE_AUTHORITY_PATH wins;
    otherwise DESIGN.md is discovered upward from FRONTEND_WORKSPACE_ROOT or PWD.
  - design-authority-mode=enforce means follow current DESIGN.md.
  - design-authority-mode=auto keeps the current DESIGN.md enforced. Redesign-like
    requests are marked as evolution candidates, not approved evolution.
  - design-authority-mode=evolve means intentional design-language change has been
    approved; the implementation must update DESIGN.md in the same change set.
EOF
}

normalize_bool() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "${value}" in
    1|true|yes|y) printf '1' ;;
    0|false|no|n|"") printf '0' ;;
    *)
      echo "Invalid boolean value: $1" >&2
      exit 2
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --surface)
      surface="${2-}"
      shift 2
      ;;
    --intent)
      intent="${2-}"
      shift 2
      ;;
    --scope)
      scope="${2-}"
      shift 2
      ;;
    --has-reference-image)
      has_reference_image="$(normalize_bool "${2-}")"
      shift 2
      ;;
    --needs-generated-reference)
      needs_generated_reference="$(normalize_bool "${2-}")"
      shift 2
      ;;
    --existing-project)
      existing_project="$(normalize_bool "${2-}")"
      shift 2
      ;;
    --style)
      style="${2-}"
      shift 2
      ;;
    --design-authority-mode)
      design_authority_mode="${2-}"
      shift 2
      ;;
    --style-authority-path)
      style_authority_path="${2-}"
      shift 2
      ;;
    --output)
      output="${2-}"
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

if [[ "${output}" != "json" ]]; then
  echo "--output currently supports only: json" >&2
  exit 2
fi

if [[ ! -x "${ENTRY_SH}" ]]; then
  echo "Preflight entry script not found or not executable: ${ENTRY_SH}" >&2
  exit 2
fi

python3 - \
  "${ENTRY_SH}" \
  "${surface}" \
  "${intent}" \
  "${scope}" \
  "${has_reference_image}" \
  "${needs_generated_reference}" \
  "${existing_project}" \
  "${style}" \
  "${design_authority_mode}" \
  "${style_authority_path}" <<'PY'
import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

entry_sh = sys.argv[1]
surface = sys.argv[2].strip().lower() or "auto"
intent = sys.argv[3].strip().lower() or "auto"
scope = sys.argv[4].strip().lower() or "auto"
has_reference_image = sys.argv[5].strip() == "1"
needs_generated_reference = sys.argv[6].strip() == "1"
existing_project = sys.argv[7].strip() == "1"
style = sys.argv[8].strip().lower() or "auto"
design_authority_mode = sys.argv[9].strip().lower() or "auto"
style_authority_path = sys.argv[10].strip()
style_authority_source = "explicit" if style_authority_path else "none"


def resolve_path(raw: str) -> str:
    return str(Path(raw).expanduser().resolve())


def discover_design_md() -> str:
    start_raw = os.environ.get("FRONTEND_WORKSPACE_ROOT") or os.getcwd()
    start = Path(start_raw).expanduser().resolve()
    if start.is_file():
        start = start.parent
    for directory in (start, *start.parents):
        candidate = directory / "DESIGN.md"
        if candidate.is_file():
            return str(candidate)
    return ""


if style_authority_path:
    style_authority_path = resolve_path(style_authority_path)
elif os.environ.get("FRONTEND_STYLE_AUTHORITY_PATH", "").strip():
    style_authority_path = resolve_path(os.environ["FRONTEND_STYLE_AUTHORITY_PATH"].strip())
    style_authority_source = "env"
elif os.environ.get("FRONTEND_STYLE_AUTHORITY_AUTO", "1").strip() != "0":
    discovered = discover_design_md()
    if discovered:
        style_authority_path = discovered
        style_authority_source = "auto"

surface_aliases = {
    "admin": "dashboard",
    "data-app": "dashboard",
    "data": "dashboard",
    "app": "app",
    "homepage": "landing",
    "home": "landing",
    "promo": "landing",
    "marketing": "landing",
    "website": "landing",
    "mobile-app": "mobile",
    "identity": "brand",
}
surface = surface_aliases.get(surface, surface)

valid_surfaces = {"auto", "dashboard", "app", "landing", "mobile", "brand", "component"}
valid_intents = {
    "auto",
    "functional",
    "visual-refine",
    "redesign",
    "new-page",
    "high-motion",
    "brand",
    "mobile-flow",
    "reference-only",
}
valid_scopes = {"auto", "micro", "component", "section", "page", "multi-page"}
valid_styles = {"auto", "high-end", "minimalist", "industrial", "gpt-taste", "none"}
valid_design_authority_modes = {"auto", "enforce", "evolve"}

errors: list[str] = []
if surface not in valid_surfaces:
    errors.append(f"invalid surface: {surface}")
if intent not in valid_intents:
    errors.append(f"invalid intent: {intent}")
if scope not in valid_scopes:
    errors.append(f"invalid scope: {scope}")
if style not in valid_styles:
    errors.append(f"invalid style: {style}")
if design_authority_mode not in valid_design_authority_modes:
    errors.append(f"invalid design-authority-mode: {design_authority_mode}")
if errors:
    print(json.dumps({"ok": False, "errors": errors}, ensure_ascii=False))
    raise SystemExit(2)


def read_authority_text(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return ""


def authority_digest(path: str) -> str:
    if not path:
        return ""
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except Exception:  # noqa: BLE001
        return ""


def sentence_from_bullet(line: str) -> str:
    return re.sub(r"\s+", " ", line.lstrip("-* ").strip())


def build_authority_constraints(
    *,
    authority_text: str,
    authority_path: str,
    surface_name: str,
    intent_name: str,
    frontend_tier: str,
    evolution: bool,
) -> list[str]:
    if not authority_path:
        return []
    constraints = [
        f"Read style authority before implementation: {authority_path}.",
    ]
    if evolution:
        constraints.append(
            "Use DESIGN.md as the current baseline to evolve; any intentional visual/component/token deviation must update DESIGN.md and affected token/component contracts in the same change set."
        )
    else:
        constraints.append(
            "Use DESIGN.md in enforce mode; implementation should stay inside current typography, color, spacing, component, and chart contracts unless explicitly escalated to evolve mode."
        )

    keyword_map: dict[str, set[str]] = {
        "dashboard": {"dashboard", "kpi", "chart", "table", "filter", "data-first", "marketing hero"},
        "app": {"dashboard", "app", "task flow", "information architecture", "table", "filter"},
        "landing": {"home", "marketing", "hero", "brand", "entry-point", "typography"},
        "mobile": {"mobile", "flow", "component", "typography", "color"},
        "brand": {"brand", "logo", "identity", "color", "typography"},
        "component": {"component", "css modules", "token", "typography", "color"},
        "auto": {"component", "token", "typography", "color"},
    }
    keywords = set(keyword_map.get(surface_name, set()))
    keywords.update({"design-evolution", "same change set", "tokens", "css modules"})
    if intent_name in {"redesign", "new-page", "high-motion", "brand", "mobile-flow"}:
        keywords.update({"design-evolution", "update this authority", "visual grammar", "same change set"})
    if frontend_tier == "L2":
        keywords.update({"page archetypes", "component grammar", "validation", "guard"})

    seen = set(constraints)
    for raw_line in authority_text.splitlines():
        line = raw_line.strip()
        if not line.startswith("- "):
            continue
        lowered = line.lower()
        if not any(keyword in lowered for keyword in keywords):
            continue
        item = sentence_from_bullet(line)
        if not item or item in seen:
            continue
        constraints.append(item)
        seen.add(item)
        if len(constraints) >= 12:
            break
    return constraints

skills: list[str] = ["design-taste-frontend"]
notes: list[str] = []


def add_skill(skill: str) -> None:
    if skill not in skills:
        skills.append(skill)


visual_intents = {"visual-refine", "redesign", "new-page", "high-motion", "brand", "mobile-flow", "reference-only"}
visual = intent in visual_intents or has_reference_image or needs_generated_reference
large_scope = scope in {"page", "multi-page"} or intent in {"redesign", "new-page", "brand", "mobile-flow", "high-motion"}
implementation_expected = intent != "reference-only"
design_evolution_intents = {"redesign", "new-page", "brand", "high-motion", "mobile-flow"}
style_authority_evolution_candidate = (
    design_authority_mode == "auto" and intent in design_evolution_intents and scope in {"page", "multi-page"}
)
design_evolution = design_authority_mode == "evolve"

if scope == "micro" and not visual:
    tier = "L0"
elif not visual and intent in {"auto", "functional"}:
    tier = "L1-F"
elif large_scope:
    tier = "L2"
else:
    tier = "L1-V"

if tier in {"L1-V", "L2"}:
    add_skill("frontend-skill")

if has_reference_image and implementation_expected:
    add_skill("image-to-code")
    notes.append("Reference image is present, so image-to-code is required as visual source of truth.")

if existing_project and intent in {"visual-refine", "redesign", "new-page", "auto"}:
    add_skill("redesign-existing-projects")
    notes.append("Existing project redesign/refinement detected, so audit-first redesign workflow is included.")

imagegen_skill = ""
if needs_generated_reference:
    if surface == "mobile" or intent == "mobile-flow":
        imagegen_skill = "imagegen-frontend-mobile"
    elif surface == "brand" or intent == "brand":
        imagegen_skill = "brandkit"
    else:
        imagegen_skill = "imagegen-frontend-web"
    add_skill(imagegen_skill)
    notes.append(f"Generated reference requested, so {imagegen_skill} is included as image-generation-only.")
    if implementation_expected:
        add_skill("image-to-code")
        notes.append("Generated reference will feed image-to-code before implementation.")

style_map = {
    "high-end": "high-end-visual-design",
    "minimalist": "minimalist-ui",
    "industrial": "industrial-brutalist-ui",
    "gpt-taste": "gpt-taste",
}

style_skill = ""
if style != "auto" and style != "none":
    style_skill = style_map[style]
elif tier == "L2":
    if intent == "high-motion":
        style_skill = "gpt-taste"
    elif surface in {"dashboard", "app"}:
        style_skill = "minimalist-ui"
    elif surface == "brand" or intent == "brand":
        style_skill = "high-end-visual-design"
    elif surface == "mobile" or intent == "mobile-flow":
        style_skill = "high-end-visual-design"
    else:
        style_skill = "high-end-visual-design"

if style_skill:
    add_skill(style_skill)
    if style_skill == "gpt-taste":
        notes.append("gpt-taste selected only because the request is high-motion/promotional or explicit.")
    elif style_skill == "minimalist-ui":
        notes.append("Dashboard/app L2 defaults to minimalist-ui to protect task flow and readability.")
    elif style_skill == "high-end-visual-design":
        notes.append("High-end visual direction selected for broad page/brand quality without overusing gpt-taste.")

if "stitch-design-taste" in skills and not style_authority_path:
    notes.append("stitch-design-taste requires an absolute style_authority_path.")
elif style_authority_path:
    notes.append(f"Using {style_authority_source} DESIGN.md style authority.")
if design_evolution:
    notes.append("Design authority mode is evolve: current DESIGN.md may be intentionally changed, but DESIGN.md must be updated and verified in the same change set.")
elif style_authority_evolution_candidate:
    notes.append("Design authority evolution candidate detected; staying in enforce_current_baseline until --design-authority-mode evolve or an explicit user-approved authority update is provided.")
else:
    notes.append("Design authority mode is enforce: current DESIGN.md is the project style baseline.")

# Keep the chain readable and stable: baseline -> composition -> style -> workflow -> imagegen/finalizer.
order = [
    "design-taste-frontend",
    "frontend-skill",
    "high-end-visual-design",
    "minimalist-ui",
    "industrial-brutalist-ui",
    "gpt-taste",
    "redesign-existing-projects",
    "imagegen-frontend-web",
    "imagegen-frontend-mobile",
    "brandkit",
    "image-to-code",
    "stitch-design-taste",
    "full-output-enforcement",
]
rank = {skill: idx for idx, skill in enumerate(order)}
skills = sorted(skills, key=lambda item: rank.get(item, 999))

route_defaults = {
    "L0": ("default_high", "default", "gpt-5.5", "high", "main_serial", False, "not_required"),
    "L1-F": ("default_high", "default", "gpt-5.5", "high", "spawn_default", True, "repair_then_retry"),
    "L1-V": ("default_high", "default", "gpt-5.5", "high", "spawn_default", True, "repair_then_retry"),
    "L2": ("worker_xhigh", "worker", "gpt-5.5", "xhigh", "spawn_worker", True, "repair_then_retry"),
}
route_agent, route_type, route_model, route_reasoning, route_execution, route_subagent_required, route_runtime_policy = route_defaults[tier]
authority_required = tier in {"L1-F", "L1-V", "L2"} or "stitch-design-taste" in skills or design_evolution
if authority_required and not style_authority_path:
    missing_quality = "; ".join(notes) if notes else "Missing DESIGN.md style authority."
    if missing_quality:
        missing_quality += "; "
    missing_quality += "STYLE_AUTHORITY_MISSING: L1+/stitch/evolve frontend routes require a readable DESIGN.md baseline before execution."
    print(
        json.dumps(
            {
                "ok": False,
                "frontend_tier": tier,
                "skills": skills,
                "style_authority_path": "",
                "style_authority_source": style_authority_source,
                "style_authority_mode": "evolve" if design_evolution else "enforce",
                "style_authority_digest": "",
                "style_authority_read_required": True,
                "style_authority_context_required": True,
                "style_authority_revision_policy": "none",
                "style_authority_evolution_candidate": style_authority_evolution_candidate,
                "style_authority_task_constraints": [],
                "style_authority_execution_contract": {
                    "mode": "evolve" if design_evolution else "enforce",
                    "evolution_candidate": style_authority_evolution_candidate,
                    "read_required": True,
                    "context_required": True,
                    "revision_policy": "none",
                    "enforce_rule": "Follow the current DESIGN.md contracts before generic taste-skill advice.",
                    "evolve_rule": "Approved evolve mode still requires reading the current DESIGN.md baseline first and updating DESIGN.md/tokens/component contracts in the same change set.",
                },
                "design_evolution_required": design_evolution,
                "preflight_status": "fail",
                "preflight_code": "STYLE_AUTHORITY_MISSING",
                "gate_decision": "deny",
                "agent_route": route_agent,
                "agent_type": route_type,
                "agent_model": route_model,
                "reasoning_target": route_reasoning,
                "route_reason": "tier_default",
                "execution_mode": route_execution,
                "subagent_required": route_subagent_required,
                "spawn_agent_intent": {},
                "runtime_remediation_required": False,
                "runtime_remediation_policy": route_runtime_policy,
                "progress_echo": "N/A",
                "recommended_progress_echo": "N/A",
                "quality_tradeoff": missing_quality,
                "preflight_command": "N/A",
                "inputs": {
                    "surface": surface,
                    "intent": intent,
                    "scope": scope,
                    "has_reference_image": has_reference_image,
                    "needs_generated_reference": needs_generated_reference,
                    "existing_project": existing_project,
                    "style": style,
                    "design_authority_mode": design_authority_mode,
                },
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    raise SystemExit(2)

cmd = [
    "bash",
    entry_sh,
    "--frontend-tier",
    tier,
    "--skills",
    ",".join(skills),
]
if style_authority_path:
    cmd.extend(["--style-authority-path", style_authority_path])

env = dict(os.environ)
env["FRONTEND_PREFLIGHT_LOG_ENABLED"] = "0"
env["FRONTEND_STYLE_AUTHORITY_MODE"] = "evolve" if design_evolution else "enforce"
completed = subprocess.run(cmd, env=env, text=True, capture_output=True, check=False)
raw = (completed.stdout or completed.stderr).strip()
payload: dict[str, Any]
try:
    payload = json.loads(raw.splitlines()[-1]) if raw else {}
except Exception as exc:  # noqa: BLE001
    payload = {
        "ok": False,
        "status": "fail",
        "code": "RUNTIME_ERROR",
        "message": f"Failed to parse preflight output: {exc}",
        "raw": raw,
    }

agent_route = str(payload.get("agent_route", ""))
reasoning_target = str(payload.get("reasoning_target", ""))
agent_model = str(payload.get("agent_model", ""))
execution_mode = str(payload.get("execution_mode", ""))
subagent_required = bool(payload.get("subagent_required", False))
spawn_agent_intent = payload.get("spawn_agent_intent") if isinstance(payload.get("spawn_agent_intent"), dict) else {}
runtime_remediation_policy = str(payload.get("runtime_remediation_policy", ""))
runtime_remediation_required = bool(payload.get("runtime_remediation_required", False))
if execution_mode == "spawn_worker":
    progress_echo = "要求启用 worker 前端子代理（gpt-5.5, xhigh）；成功 spawn 后才可改写为“已启用”。"
elif execution_mode == "spawn_default":
    progress_echo = "要求启用 frontend default 子代理（gpt-5.5, high）；成功 spawn 后才可改写为“已启用”。"
elif execution_mode == "main_serial":
    progress_echo = "路由允许主代理串行执行（通常仅限 L0）。"
elif agent_route == "worker_xhigh":
    progress_echo = "要求启用 worker 前端子代理（gpt-5.5, xhigh）；成功 spawn 后才可改写为“已启用”。"
elif agent_route == "default_high":
    progress_echo = "要求启用 frontend default 子代理（gpt-5.5, high）；成功 spawn 后才可改写为“已启用”。"
else:
    progress_echo = "N/A"

avoid: list[str] = []
if surface in {"dashboard", "app"} and "gpt-taste" not in skills:
    avoid.append("avoided gpt-taste for dashboard/app to protect information architecture and task flow")
if not has_reference_image and "image-to-code" not in skills:
    avoid.append("did not include image-to-code because no visual source of truth was provided or generated")
if not needs_generated_reference and imagegen_skill == "":
    avoid.append("did not include imagegen skills because no generated reference was requested")

quality_tradeoff = "; ".join(notes + avoid)
if not quality_tradeoff:
    quality_tradeoff = "Minimal quality-first route selected without extra skills."

authority_text = read_authority_text(style_authority_path)
style_authority_digest = payload.get("style_authority_digest") or authority_digest(style_authority_path)
style_authority_read_required = bool(payload.get("style_authority_read_required", bool(style_authority_path)))
style_authority_context_required = bool(payload.get("style_authority_context_required", bool(style_authority_path)))
style_authority_revision_policy = str(
    payload.get("style_authority_revision_policy")
    or ("evolve_current_baseline" if design_evolution and style_authority_path else "enforce_current_baseline" if style_authority_path else "none")
)
style_authority_task_constraints = build_authority_constraints(
    authority_text=authority_text,
    authority_path=style_authority_path,
    surface_name=surface,
    intent_name=intent,
    frontend_tier=tier,
    evolution=design_evolution,
)
style_authority_execution_contract = {
    "mode": "evolve" if design_evolution else "enforce",
    "evolution_candidate": style_authority_evolution_candidate,
    "read_required": style_authority_read_required,
    "context_required": style_authority_context_required,
    "revision_policy": style_authority_revision_policy,
    "enforce_rule": "Follow the current DESIGN.md contracts before generic taste-skill advice.",
    "evolve_rule": "If the current DESIGN.md is not good enough for the agreed direction, update DESIGN.md/tokens/component contracts in the same change set before treating the deviation as valid.",
}
if spawn_agent_intent and style_authority_path:
    spawn_agent_intent = dict(spawn_agent_intent)
    spawn_agent_intent.update(
        {
            "style_authority_path": style_authority_path,
            "style_authority_mode": "evolve" if design_evolution else "enforce",
            "style_authority_digest": style_authority_digest,
            "style_authority_read_required": style_authority_read_required,
            "style_authority_context_required": style_authority_context_required,
            "style_authority_revision_policy": style_authority_revision_policy,
            "style_authority_evolution_candidate": style_authority_evolution_candidate,
            "style_authority_task_constraints": style_authority_task_constraints,
        }
    )

result = {
    "ok": completed.returncode == 0 and bool(payload.get("ok", False)),
    "frontend_tier": tier,
    "skills": skills,
    "style_authority_path": style_authority_path or "",
    "style_authority_source": style_authority_source,
    "style_authority_mode": payload.get("style_authority_mode") or ("evolve" if design_evolution else "enforce"),
    "style_authority_digest": style_authority_digest,
    "style_authority_read_required": style_authority_read_required,
    "style_authority_context_required": style_authority_context_required,
    "style_authority_revision_policy": style_authority_revision_policy,
    "style_authority_evolution_candidate": style_authority_evolution_candidate,
    "style_authority_task_constraints": style_authority_task_constraints,
    "style_authority_execution_contract": style_authority_execution_contract,
    "design_evolution_required": design_evolution,
    "preflight_status": payload.get("preflight_status") or payload.get("status"),
    "preflight_code": payload.get("preflight_code") or payload.get("code"),
    "gate_decision": payload.get("gate_decision"),
    "agent_route": agent_route,
    "agent_type": payload.get("agent_type"),
    "agent_model": agent_model,
    "reasoning_target": reasoning_target,
    "route_reason": payload.get("route_reason"),
    "execution_mode": execution_mode,
    "subagent_required": subagent_required,
    "spawn_agent_intent": spawn_agent_intent,
    "runtime_remediation_required": runtime_remediation_required,
    "runtime_remediation_policy": runtime_remediation_policy,
    "progress_echo": progress_echo,
    "recommended_progress_echo": progress_echo,
    "quality_tradeoff": quality_tradeoff,
    "preflight_command": "FRONTEND_PREFLIGHT_LOG_ENABLED=0 " + " ".join(cmd),
    "inputs": {
        "surface": surface,
        "intent": intent,
        "scope": scope,
        "has_reference_image": has_reference_image,
        "needs_generated_reference": needs_generated_reference,
        "existing_project": existing_project,
        "style": style,
        "design_authority_mode": design_authority_mode,
    },
}

print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
raise SystemExit(0 if completed.returncode == 0 else 2)
PY
