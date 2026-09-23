#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP_DIR="$(mktemp -d)"
UPDATE_WORKTREE="$TMP_DIR/trellis-update-worktree"
NO_TASK_CONTEXT_FILE=""

cleanup() {
  if [[ -n "$UPDATE_WORKTREE" && -e "$UPDATE_WORKTREE/.git" ]]; then
    git -C "$ROOT_DIR" worktree remove --force "$UPDATE_WORKTREE" >/dev/null 2>&1 || true
  fi
  if [[ -n "$NO_TASK_CONTEXT_FILE" ]]; then
    rm -f "$NO_TASK_CONTEXT_FILE"
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

cd "$ROOT_DIR"

log() {
  printf '[trellis-codex] %s\n' "$*"
}

ok() {
  log "OK: $*"
}

warn() {
  log "WARN: $*"
}

fail() {
  log "FAIL: $*" >&2
  exit 1
}

run_capture() {
  local label="$1"
  local output_file="$2"
  shift 2

  log "RUN: ${label}"
  if ! "$@" >"$output_file" 2>&1; then
    log "FAIL: ${label}" >&2
    tail -n 80 "$output_file" >&2 || true
    exit 1
  fi
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "required file missing: ${path}"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "required command missing: ${name}"
}

require_file ".trellis/.version"
require_file ".trellis/.template-hashes.json"
require_file ".trellis/config.yaml"
require_file ".trellis/scripts/get_context.py"
require_file ".trellis/scripts/task.py"
require_file ".codex/hooks/inject-workflow-state.py"
require_file ".codex/hooks/session-start.py"

require_command trellis
require_command python3

trellis_version="$(trellis --version | tr -d '[:space:]')"
project_version="$(tr -d '[:space:]' < .trellis/.version)"
if [[ "$trellis_version" != "$project_version" ]]; then
  fail "Trellis CLI/project version mismatch: cli=${trellis_version} project=${project_version}"
fi
ok "Trellis version aligned: ${trellis_version}"

template_hash_before="$(git hash-object .trellis/.template-hashes.json)"
template_status_before="$(git status --short -- .trellis/.template-hashes.json)"
git diff --binary HEAD -- . >"$TMP_DIR/current-worktree.patch"
run_capture "prepare isolated Trellis update worktree" "$TMP_DIR/trellis-update-worktree.txt" \
  git worktree add --detach "$UPDATE_WORKTREE" HEAD
if [[ -s "$TMP_DIR/current-worktree.patch" ]]; then
  run_capture "overlay current tracked changes" "$TMP_DIR/trellis-update-overlay.txt" \
    git -C "$UPDATE_WORKTREE" apply --whitespace=nowarn "$TMP_DIR/current-worktree.patch"
fi
run_capture "trellis update --dry-run (isolated)" "$TMP_DIR/trellis-update.txt" \
  bash -c 'cd "$1" && trellis update --dry-run' _ "$UPDATE_WORKTREE"
grep -q "Project version: ${project_version}" "$TMP_DIR/trellis-update.txt" \
  || fail "trellis update dry-run did not report project version ${project_version}"
grep -q "CLI version:     ${trellis_version}" "$TMP_DIR/trellis-update.txt" \
  || fail "trellis update dry-run did not report CLI version ${trellis_version}"
modified_count="$(grep -c '^    ? ' "$TMP_DIR/trellis-update.txt" || true)"
template_hash_after="$(git hash-object .trellis/.template-hashes.json)"
template_status_after="$(git status --short -- .trellis/.template-hashes.json)"
[[ "$template_hash_before" == "$template_hash_after" ]] \
  || fail "isolated update dry-run changed the primary .trellis/.template-hashes.json content"
[[ "$template_status_before" == "$template_status_after" ]] \
  || fail "isolated update dry-run changed the primary .trellis/.template-hashes.json status"
ok "isolated trellis update dry-run passed; local_customization_count=${modified_count}; primary template hash unchanged"
run_capture "remove isolated Trellis update worktree" "$TMP_DIR/trellis-update-cleanup.txt" \
  git worktree remove --force "$UPDATE_WORKTREE"
UPDATE_WORKTREE=""

# 运行态数据不是 Trellis 模板；显式排除，并让其余扫描错误使检查失败。
# 不用进程替换承载 find，否则 find 的退出码不会传给 set -e。
run_capture "scan Trellis sidecars" "$TMP_DIR/new-sidecars.txt" \
  find . \
    -path './node_modules' -prune -o \
    -path './.venv' -prune -o \
    -path './backend-rust/target' -prune -o \
    -path './.git' -prune -o \
    -path './.dataops/runtime-store' -prune -o \
    -name '*.new' -print

new_sidecars=()
while IFS= read -r new_sidecar; do
  new_sidecars+=("$new_sidecar")
done <"$TMP_DIR/new-sidecars.txt"
if (( ${#new_sidecars[@]} > 0 )); then
  printf '%s\n' "${new_sidecars[@]}" >&2
  fail "unexpected .new sidecar files remain"
fi
ok "no .new sidecar files"

run_capture "Trellis session context" "$TMP_DIR/context.txt" python3 ./.trellis/scripts/get_context.py
grep -q "SESSION CONTEXT" "$TMP_DIR/context.txt" || fail "get_context.py output missing SESSION CONTEXT"
ok "get_context.py session context loaded"

run_capture "Trellis packages context" "$TMP_DIR/packages.txt" python3 ./.trellis/scripts/get_context.py --mode packages
grep -Eq "Single-repo project|Packages:" "$TMP_DIR/packages.txt" || fail "packages context did not report project shape"
ok "get_context.py packages context loaded"

set +e
python3 ./.trellis/scripts/task.py current --source >"$TMP_DIR/current-task.txt" 2>&1
current_status=$?
set -e
if [[ "$current_status" != "0" && "$current_status" != "1" ]]; then
  tail -n 40 "$TMP_DIR/current-task.txt" >&2 || true
  fail "task.py current --source exited with unexpected status ${current_status}"
fi
current_task_line="$(grep '^Current task:' "$TMP_DIR/current-task.txt" | head -n 1 || true)"
ok "task.py current smoke passed; ${current_task_line:-Current task: unknown}"

run_capture "Python syntax for Trellis/Codex scripts" "$TMP_DIR/py-compile.txt" \
  python3 -m py_compile \
    .trellis/scripts/task.py \
    .trellis/scripts/add_session.py \
    .trellis/scripts/common/session_context.py \
    .trellis/scripts/common/task_context.py \
    .trellis/scripts/common/task_store.py \
    .trellis/scripts/common/workflow_phase.py \
    .codex/hooks/inject-workflow-state.py \
    .codex/hooks/session-start.py
ok "Python syntax checks passed"

run_capture "Trellis task profile behavior" "$TMP_DIR/task-profile.txt" \
  python3 -c 'from sys import path; path.insert(0, ".trellis/scripts"); from common import task_store; from common.task_store import _default_prd_content; from common.types import normalize_workflow_profile; from task import _start_context_message; assert normalize_workflow_profile(None) == "full"; assert normalize_workflow_profile("invalid") == "full"; assert normalize_workflow_profile("lite") == "lite"; assert not hasattr(task_store, "_should_seed_context_manifests"); assert "Workflow profile: `lite`" in _default_prd_content("Lite", workflow_profile="lite"); assert "no jsonl manifests" in _start_context_message("lite"); assert "manifests are lazy" in _start_context_message("full")'
run_capture "Trellis task profile CLI" "$TMP_DIR/task-create-help.txt" \
  python3 ./.trellis/scripts/task.py create --help
grep -q -- '--profile' "$TMP_DIR/task-create-help.txt" \
  || fail "task.py create help did not expose --profile"
grep -q -- '--no-start' "$TMP_DIR/task-create-help.txt" \
  || fail "task.py create help did not expose --no-start"
run_capture "Trellis strict context CLI" "$TMP_DIR/task-validate-help.txt" \
  python3 ./.trellis/scripts/task.py validate --help
grep -q -- '--require-context' "$TMP_DIR/task-validate-help.txt" \
  || fail "task.py validate help did not expose --require-context"
run_capture "Trellis task/session behavior" "$TMP_DIR/trellis-scaffold-behavior.txt" \
  python3 scripts/checks/repo/trellis-scaffold-behavior.py
ok "Trellis task profile behavior passed"

run_capture "Trellis session journal rendering" "$TMP_DIR/session-rendering.txt" \
  python3 -c 'from sys import path; path.insert(0, ".trellis/scripts"); from add_session import generate_session_content; rendered = generate_session_content(1, "Title", "abc", "Summary", "", "2026-07-12", testing="- [OK] Tests passed", commit_messages={"abc": "fix: real subject"}); forbidden = ("(Add summary)", "(Add details)", "(Add test results)", "(see git log)"); assert not any(item in rendered for item in forbidden); assert "| `abc` | fix: real subject |" in rendered; assert "- Summary" in rendered; assert "- [OK] Tests passed" in rendered; fallback = generate_session_content(2, "Title", "missing", "", "", "2026-07-12"); assert "No summary provided." in fallback; assert "Commit subject unavailable" in fallback; assert "Not recorded in this journal entry." in fallback'
run_capture "Trellis session journal CLI" "$TMP_DIR/session-help.txt" \
  python3 ./.trellis/scripts/add_session.py --help
grep -q -- '--testing' "$TMP_DIR/session-help.txt" \
  || fail "add_session.py help did not expose --testing"
workspace_status_before="$(git status --short -- .trellis/workspace)"
set +e
python3 ./.trellis/scripts/add_session.py \
  --title "Missing content smoke" \
  --content-file "$TMP_DIR/does-not-exist.md" \
  --no-commit >"$TMP_DIR/missing-content.txt" 2>&1
missing_content_status=$?
set -e
[[ "$missing_content_status" != "0" ]] || fail "missing --content-file should fail"
grep -q "Error: content file not found" "$TMP_DIR/missing-content.txt" \
  || fail "missing --content-file did not report a concrete error"
workspace_status_after="$(git status --short -- .trellis/workspace)"
[[ "$workspace_status_before" == "$workspace_status_after" ]] \
  || fail "missing --content-file changed workspace journal state"
ok "Trellis session journal rendering passed"

run_capture "Trellis finish-work scope behavior" "$TMP_DIR/trellis-finish-work-scope-behavior.txt" \
  node scripts/checks/repo/trellis-finish-work-scope.behavior.mjs
ok "Trellis finish-work scope behavior passed"

run_capture "Trellis finish-work scope guard" "$TMP_DIR/trellis-finish-work-scope.txt" \
  node scripts/checks/repo/trellis-finish-work-scope.mjs
ok "Trellis finish-work scope guard passed"

log "RUN: workflow-state hook smoke"
no_task_context_id="trellis-codex-smoke-no-task-$$"
NO_TASK_CONTEXT_FILE=".trellis/.runtime/sessions/${no_task_context_id}.json"
[[ ! -e "$NO_TASK_CONTEXT_FILE" ]] \
  || fail "workflow-state no-task fixture already exists: ${NO_TASK_CONTEXT_FILE}"
mkdir -p "$(dirname "$NO_TASK_CONTEXT_FILE")"
# An explicit empty session prevents the single-session fallback from adopting a live task.
printf '{"current_task": null}\n' >"$NO_TASK_CONTEXT_FILE"
printf '{}' | TRELLIS_CONTEXT_ID="$no_task_context_id" \
  python3 -X utf8 .codex/hooks/inject-workflow-state.py >"$TMP_DIR/workflow-state.json"
rm -f "$NO_TASK_CONTEXT_FILE"
NO_TASK_CONTEXT_FILE=""
grep -q '<codex-mode>inline:' "$TMP_DIR/workflow-state.json" \
  || fail "workflow-state hook did not report inline Codex mode"
grep -Fq '**A Codex direct inline**' "$TMP_DIR/workflow-state.json" \
  || fail "workflow-state hook did not select the Codex direct route"
grep -Fq '**B Trellis Lite / PRD-only task**' "$TMP_DIR/workflow-state.json" \
  || fail "workflow-state hook did not expose the Trellis Lite route"
grep -Fq '**C Full Trellis**' "$TMP_DIR/workflow-state.json" \
  || fail "workflow-state hook did not expose the Full Trellis route"
grep -Fq 'MUST read [Codex inline no task](#codex-inline-no-task)' "$TMP_DIR/workflow-state.json" \
  || fail "workflow-state hook lost the mandatory full-contract entrypoint"
if grep -Fq 'Routine deploy eligibility (all required)' "$TMP_DIR/workflow-state.json"; then
  fail "workflow-state hook still injects the full deployment contract every turn"
fi
if grep -Fq '**B Create a task / L1+**' "$TMP_DIR/workflow-state.json"; then
  fail "workflow-state hook fell back to the stale mandatory L1+ task route"
fi
ok "workflow-state hook reports compact inline routing with mandatory contract loading"

if command -v codex >/dev/null 2>&1; then
  run_capture "Codex config parse smoke" "$TMP_DIR/codex-debug.txt" \
    codex debug prompt-input "trellis codex smoke"
  ok "codex debug prompt-input passed"
else
  warn "codex command not found; skipped Codex config parse smoke"
fi

if [[ -x "$HOME/.codex/tools/agents_quality_verify.sh" ]]; then
  run_capture "global agents quality fast check" "$TMP_DIR/agents-quality.txt" \
    bash "$HOME/.codex/tools/agents_quality_verify.sh" --fast
  ok "global agents quality fast check passed"
else
  warn "agents_quality_verify.sh not available; skipped global agents quality fast check"
fi

python3 - <<'PY'
from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from pathlib import Path

tasks_root = Path(".trellis/tasks")
tasks = []

for task_json in sorted(tasks_root.glob("*/task.json")):
    if "archive" in task_json.parts:
        continue
    try:
        data = json.loads(task_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"[trellis-codex] FAIL: invalid task json {task_json}: {exc}") from exc
    tasks.append((task_json.parent.name, data))

by_status = Counter(str(data.get("status") or "unknown") for _, data in tasks)
by_assignee = Counter(str(data.get("assignee") or "unknown") for _, data in tasks)
in_progress = [(name, data) for name, data in tasks if str(data.get("status")) == "in_progress"]
completed = [(name, data) for name, data in tasks if str(data.get("status")) == "completed"]
archive_review_candidates = []
unfinished_active_backlog = []
context_seed_examples = []

def task_is_tracked(task_name: str) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", f".trellis/tasks/{task_name}/task.json"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0

def acceptance_counts(task_name: str) -> tuple[int, int]:
    prd_path = tasks_root / task_name / "prd.md"
    if not prd_path.exists():
        return (0, 0)
    prd_text = prd_path.read_text(encoding="utf-8")
    unchecked = len(re.findall(r"(?m)^-\s+\[\s\]\s+", prd_text))
    checked = len(re.findall(r"(?mi)^-\s+\[x\]\s+", prd_text))
    return unchecked, checked

for name, _ in in_progress:
    unchecked, checked = acceptance_counts(name)
    if unchecked > 0:
        unfinished_active_backlog.append((name, unchecked))
    elif checked > 0:
        archive_review_candidates.append(name)

for name, _ in tasks:
    for context_name in ("implement.jsonl", "check.jsonl"):
        context_path = tasks_root / name / context_name
        if not context_path.exists():
            continue
        for line_number, line in enumerate(context_path.read_text(encoding="utf-8").splitlines(), start=1):
            if '"_example"' in line:
                context_seed_examples.append((name, f"{name}/{context_name}:{line_number}"))

print(f"[trellis-codex] task_audit total_active={len(tasks)} in_progress={len(in_progress)}")
print(
    "[trellis-codex] task_audit by_status="
    + ",".join(f"{key}:{value}" for key, value in sorted(by_status.items()))
)
print(
    "[trellis-codex] task_audit by_assignee="
    + ",".join(f"{key}:{value}" for key, value in sorted(by_assignee.items()))
)
if unfinished_active_backlog:
    preview = ", ".join(f"{name}({unchecked})" for name, unchecked in unfinished_active_backlog[:8])
    suffix = "" if len(unfinished_active_backlog) <= 8 else f", ... +{len(unfinished_active_backlog) - 8} more"
    print(
        "[trellis-codex] task_audit unfinished_active_backlog="
        f"{len(unfinished_active_backlog)} preview={preview}{suffix}"
    )
if completed:
    preview = ", ".join(name for name, _ in completed[:8])
    suffix = "" if len(completed) <= 8 else f", ... +{len(completed) - 8} more"
    print(
        "[trellis-codex] task_audit completed_active_tasks="
        f"{len(completed)} preview={preview}{suffix}"
    )
    print("[trellis-codex] WARN: completed live Trellis tasks need scoped archive review.")
if archive_review_candidates:
    preview = ", ".join(archive_review_candidates[:8])
    suffix = "" if len(archive_review_candidates) <= 8 else f", ... +{len(archive_review_candidates) - 8} more"
    print(
        "[trellis-codex] task_audit archive_review_candidates="
        f"{len(archive_review_candidates)} preview={preview}{suffix}"
    )
    print("[trellis-codex] WARN: active in-progress tasks with no unchecked PRD acceptance criteria need manual status/archive review.")
if not completed and not archive_review_candidates:
    print("[trellis-codex] task_audit archive_review_candidates=0")
unfinished_names = {name for name, _ in unfinished_active_backlog}
tracked_names = {name for name, _ in tasks if task_is_tracked(name)}
pending_seed_examples = [
    example for task_name, example in context_seed_examples if task_name in unfinished_names
]
untracked_seed_examples = [
    example for task_name, example in context_seed_examples if task_name not in tracked_names
]
actionable_seed_examples = [
    example
    for task_name, example in context_seed_examples
    if task_name not in unfinished_names and task_name in tracked_names
]
if context_seed_examples:
    preview_items = [example for _, example in context_seed_examples[:8]]
    preview = ", ".join(preview_items)
    suffix = "" if len(context_seed_examples) <= 8 else f", ... +{len(context_seed_examples) - 8} more"
    print(
        "[trellis-codex] task_audit legacy_context_seed_examples="
        f"{len(context_seed_examples)} pending_unfinished={len(pending_seed_examples)} "
        f"untracked={len(untracked_seed_examples)} actionable={len(actionable_seed_examples)} "
        f"preview={preview}{suffix}"
    )
if actionable_seed_examples:
    print("[trellis-codex] WARN: remove legacy _example seed rows from active task context after curating context files.")
PY

ok "Trellis/Codex smoke completed"
