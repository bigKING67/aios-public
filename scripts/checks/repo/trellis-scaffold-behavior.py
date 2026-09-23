#!/usr/bin/env python3
"""Focused behavior checks for AIOS's upgraded Trellis scaffold contract."""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[3]
TRELLIS_SCRIPTS = REPO_ROOT / ".trellis" / "scripts"
sys.path.insert(0, str(TRELLIS_SCRIPTS))

from add_session import resolve_session_branch  # noqa: E402
from common import developer, task_context, task_store  # noqa: E402
from common.paths import get_workspace_dir, resolve_task_ref  # noqa: E402
from common.safe_commit import safe_trellis_paths_to_add  # noqa: E402


def create_args(**overrides: object) -> argparse.Namespace:
    values: dict[str, object] = {
        "title": "Behavior task",
        "profile": "full",
        "slug": "behavior-task",
        "assignee": None,
        "priority": "P2",
        "description": "  focused description  ",
        "parent": None,
        "package": None,
        "base_branch": None,
        "meta": None,
        "no_start": True,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def configure_root(root: Path, *, platform: str | None, dispatch_mode: str = "inline") -> None:
    (root / ".trellis" / "tasks").mkdir(parents=True)
    if platform:
        (root / platform).mkdir(parents=True)
    if platform == ".codex":
        (root / ".trellis" / "config.yaml").write_text(
            f"codex:\n  dispatch_mode: {dispatch_mode}\n",
            encoding="utf-8",
        )


def run_create(root: Path, args: argparse.Namespace) -> tuple[int, str, str]:
    original_root = task_store.get_repo_root
    original_prefix = task_store.generate_task_date_prefix
    original_hooks = task_store.run_task_hooks
    original_git = task_store.run_git
    task_store.get_repo_root = lambda: root
    task_store.generate_task_date_prefix = lambda: "07-13"
    task_store.run_task_hooks = lambda *_args, **_kwargs: None
    task_store.run_git = lambda *_args, **_kwargs: (0, "main\n", "")
    stdout = io.StringIO()
    stderr = io.StringIO()
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = task_store.cmd_create(args)
    finally:
        task_store.get_repo_root = original_root
        task_store.generate_task_date_prefix = original_prefix
        task_store.run_task_hooks = original_hooks
        task_store.run_git = original_git
    return status, stdout.getvalue(), stderr.getvalue()


def run_add_context(
    root: Path,
    task_name: str,
    manifest: str,
    path: str,
    reason: str = "Behavior context",
) -> tuple[int, str]:
    original_root = task_context.get_repo_root
    task_context.get_repo_root = lambda: root
    stdout = io.StringIO()
    try:
        with contextlib.redirect_stdout(stdout):
            status = task_context.cmd_add_context(
                argparse.Namespace(
                    dir=task_name,
                    file=manifest,
                    path=path,
                    reason=reason,
                )
            )
    finally:
        task_context.get_repo_root = original_root
    return status, stdout.getvalue()


def run_validate(root: Path, task_name: str, *, require_context: bool) -> tuple[int, str]:
    original_root = task_context.get_repo_root
    task_context.get_repo_root = lambda: root
    stdout = io.StringIO()
    try:
        with contextlib.redirect_stdout(stdout):
            status = task_context.cmd_validate(
                argparse.Namespace(dir=task_name, require_context=require_context)
            )
    finally:
        task_context.get_repo_root = original_root
    return status, stdout.getvalue()


def assert_manifest_behavior() -> None:
    cases = (
        (None, "inline"),
        (".codex", "inline"),
        (".codex", "auto"),
        (".codex", "sub-agent"),
        (".claude", "inline"),
        (".pi", "inline"),
        (".omp", "inline"),
        (".zcode", "inline"),
        (".grok", "inline"),
        (".kimi-code", "inline"),
    )
    for platform, dispatch_mode in cases:
        for profile in ("lite", "full"):
            with tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                configure_root(root, platform=platform, dispatch_mode=dispatch_mode)
                platform_slug = (platform or "none").removeprefix(".").replace("/", "-")
                slug = f"{platform_slug}-{dispatch_mode}-{profile}"
                status, _, stderr = run_create(
                    root,
                    create_args(profile=profile, slug=slug),
                )
                assert status == 0
                task_dir = root / ".trellis" / "tasks" / f"07-13-{slug}"
                assert (task_dir / "task.json").is_file()
                assert (task_dir / "prd.md").is_file()
                assert not (task_dir / "implement.jsonl").exists()
                assert not (task_dir / "check.jsonl").exists()
                if profile == "full":
                    assert "Context manifests are lazy" in stderr


def assert_context_lifecycle_behavior() -> None:
    legacy_seed = json.dumps({"_example": "legacy seed"})

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        configure_root(root, platform=None)
        (root / ".trellis" / "spec" / "repo").mkdir(parents=True)
        (root / ".trellis" / "spec" / "repo" / "index.md").write_text(
            "# Repo\n",
            encoding="utf-8",
        )
        (root / "docs").mkdir()
        (root / "docs" / "guide.md").write_text("# Guide\n", encoding="utf-8")
        (root / "docs" / "guide-extra.md").write_text("# Extra\n", encoding="utf-8")

        status, _, _ = run_create(root, create_args(slug="context-task"))
        assert status == 0
        task_name = "07-13-context-task"
        task_dir = root / ".trellis" / "tasks" / task_name
        implement = task_dir / "implement.jsonl"
        check = task_dir / "check.jsonl"

        implement.write_text(
            "\n".join(
                (
                    legacy_seed,
                    "not-json",
                    json.dumps({"note": "preserve me"}),
                    json.dumps(
                        {
                            "file": "docs/guide-extra.md",
                            "reason": "mentions docs/guide.md but is not that path",
                        }
                    ),
                )
            )
            + "\n",
            encoding="utf-8",
        )
        status, _ = run_add_context(root, task_name, "implement", "docs/guide.md")
        assert status == 0
        implement_lines = implement.read_text(encoding="utf-8").splitlines()
        assert legacy_seed not in implement_lines
        assert "not-json" in implement_lines
        assert json.dumps({"note": "preserve me"}) in implement_lines
        parsed_implement = []
        for line in implement_lines:
            try:
                parsed_implement.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        assert sum(
            isinstance(row, dict) and row.get("file") == "docs/guide.md"
            for row in parsed_implement
        ) == 1
        assert any(
            isinstance(row, dict) and row.get("file") == "docs/guide-extra.md"
            for row in parsed_implement
        )

        check.write_text(
            legacy_seed
            + "\n"
            + json.dumps({"file": "docs/guide.md", "reason": "existing"})
            + "\n",
            encoding="utf-8",
        )
        status, output = run_add_context(root, task_name, "check", "docs/guide.md")
        assert status == 0
        assert "Entry already exists" in output
        check_lines = check.read_text(encoding="utf-8").splitlines()
        assert legacy_seed not in check_lines
        assert len(check_lines) == 1

        status, _ = run_add_context(root, task_name, "check", "docs")
        assert status == 0
        status, output = run_add_context(root, task_name, "check", "docs/")
        assert status == 0
        assert "Entry already exists" in output
        parsed_check = [json.loads(line) for line in check.read_text(encoding="utf-8").splitlines()]
        assert sum(row.get("file") == "docs/" for row in parsed_check) == 1

        status, _ = run_add_context(root, task_name, "check", "../outside")
        assert status == 1
        status, _ = run_add_context(root, task_name, "check", str(root / "docs" / "guide.md"))
        assert status == 1
        status, _ = run_add_context(root, task_name, "../outside", "docs/guide.md")
        assert status == 1

        status, output = run_validate(root, task_name, require_context=False)
        assert status == 1
        assert "Invalid JSON" in output

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        configure_root(root, platform=None)
        (root / "docs").mkdir()
        (root / "docs" / "valid.md").write_text("# Valid\n", encoding="utf-8")

        status, _, _ = run_create(
            root,
            create_args(profile="lite", slug="lite-context"),
        )
        assert status == 0
        status, output = run_validate(root, "07-13-lite-context", require_context=True)
        assert status == 1
        assert "Full-only" in output

        status, _, _ = run_create(root, create_args(slug="strict-context"))
        assert status == 0
        task_name = "07-13-strict-context"
        task_dir = root / ".trellis" / "tasks" / task_name

        status, _ = run_validate(root, task_name, require_context=False)
        assert status == 0
        status, output = run_validate(root, task_name, require_context=True)
        assert status == 1
        assert "not found (required)" in output

        status, _ = run_add_context(root, task_name, "implement", "docs/valid.md")
        assert status == 0
        status, _ = run_validate(root, task_name, require_context=True)
        assert status == 1

        (task_dir / "check.jsonl").write_text(legacy_seed + "\n", encoding="utf-8")
        status, output = run_validate(root, task_name, require_context=True)
        assert status == 1
        assert "no real context entries" in output

        status, _ = run_add_context(root, task_name, "check", "docs/valid.md")
        assert status == 0
        status, _ = run_validate(root, task_name, require_context=True)
        assert status == 0

        (task_dir / "check.jsonl").write_text(
            '["not", "an", "object"]\n',
            encoding="utf-8",
        )
        status, output = run_validate(root, task_name, require_context=True)
        assert status == 1
        assert "Expected JSON object" in output

        (task_dir / "check.jsonl").write_text(
            json.dumps({"file": "../outside.md", "reason": "escape"}) + "\n",
            encoding="utf-8",
        )
        status, output = run_validate(root, task_name, require_context=True)
        assert status == 1
        assert "File not found" in output


def assert_slug_and_activation_behavior() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        configure_root(root, platform=None)
        status, stdout, stderr = run_create(
            root,
            create_args(slug="07-13-normalized", description="  trimmed  "),
        )
        assert status == 0
        assert stdout.strip().endswith(".trellis/tasks/07-13-normalized")
        assert "normalized to \"normalized\"" in stderr
        assert "Skipped session activation (--no-start)" in stderr
        task_json = root / ".trellis" / "tasks" / "07-13-normalized" / "task.json"
        task_data = json.loads(task_json.read_text(encoding="utf-8"))
        assert task_data["description"] == "trimmed"
        assert task_data["assignee"] == ""
        assert not (root / ".trellis" / ".runtime").exists()

    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        configure_root(root, platform=None)
        status, _, stderr = run_create(root, create_args(slug="07-12-rejected"))
        assert status == 1
        assert "always uses today's date (07-13)" in stderr
        assert not (root / ".trellis" / "tasks" / "07-13-07-12-rejected").exists()


def assert_metadata_and_containment_behavior() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        configure_root(root, platform=None)
        status, _, _ = run_create(
            root,
            create_args(
                slug="metadata-task",
                base_branch="release",
                meta=["linear=ENG-123", "epic=control-plane"],
            ),
        )
        assert status == 0
        task_json = root / ".trellis" / "tasks" / "07-13-metadata-task" / "task.json"
        task_data = json.loads(task_json.read_text(encoding="utf-8"))
        assert task_data["base_branch"] == "release"
        assert task_data["meta"] == {
            "linear": "ENG-123",
            "epic": "control-plane",
        }

        inside = resolve_task_ref("07-13-metadata-task", root)
        assert inside == task_json.parent.resolve()
        assert resolve_task_ref("../../../outside", root) is None
        assert resolve_task_ref(str(root.parent / "outside"), root) is None


def assert_branch_resolution_behavior() -> None:
    task = SimpleNamespace(raw={"branch": "stale-feature"})
    original_current = sys.modules[resolve_session_branch.__module__].get_current_git_branch
    original_exists = sys.modules[resolve_session_branch.__module__].branch_ref_exists
    module = sys.modules[resolve_session_branch.__module__]
    try:
        module.get_current_git_branch = lambda _root: "main"
        module.branch_ref_exists = lambda _root, branch: branch == "live-feature"
        assert resolve_session_branch(Path("."), "explicit", task) == "explicit"
        assert resolve_session_branch(Path("."), None, task) == "main"
        assert resolve_session_branch(
            Path("."),
            None,
            SimpleNamespace(raw={"branch": "live-feature"}),
        ) == "live-feature"
        assert resolve_session_branch(Path("."), None, SimpleNamespace(raw={})) == "main"
    finally:
        module.get_current_git_branch = original_current
        module.branch_ref_exists = original_exists


def assert_pi_context_cache_contract() -> None:
    source = (REPO_ROOT / ".pi" / "extensions" / "trellis" / "index.ts").read_text(
        encoding="utf-8"
    )
    required = (
        "const startupCtxCache = new Map<string, string>();",
        "const taskCtxSnapshot = new Map<string, string>();",
        "const lastSentTaskCtx = new Map<string, string>();",
        "const lastSentRuntimeCtx = new Map<string, string>();",
        'customType: "trellis-runtime-context"',
        "display: false",
        "Task context changed on disk.",
        "DEFAULT_CONTEXT_INJECTION_LIMITS",
        "max_total_bytes: 131072",
        "function containInRoot(",
        "function contextModelRef(",
        '"xhigh", "max"',
    )
    for marker in required:
        assert marker in source, marker
    assert 'pi.on?.("input"' not in source
    assert "function adoptKey(" not in source


def assert_host_local_workspace_contract() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        (root / ".trellis").mkdir()
        assert developer.init_developer("Fixture Developer", root)
        workspace = get_workspace_dir(root)
        assert workspace == root / ".trellis" / ".local-workspace" / "Fixture Developer"
        assert (workspace / "journal-1.md").is_file()
        assert (workspace / "index.md").is_file()
        assert not (root / ".trellis" / "workspace" / "Fixture Developer").exists()

        (root / ".trellis" / "tasks" / "fixture-task").mkdir(parents=True)
        task_json = root / ".trellis" / "tasks" / "fixture-task" / "task.json"
        task_json.write_text('{"meta": {}}\n', encoding="utf-8")
        paths = safe_trellis_paths_to_add(root, task_name="fixture-task")
        assert paths == [".trellis/tasks/fixture-task"]
        assert not any("workspace" in path for path in paths)

        module_path = TRELLIS_SCRIPTS / "hooks" / "stamp_host_role.py"
        spec = importlib.util.spec_from_file_location("stamp_host_role_fixture", module_path)
        assert spec and spec.loader
        stamp_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stamp_module)
        (root / ".trellis" / ".host-role").write_text("vps\n", encoding="utf-8")
        stamp_module.repo_root = lambda: root
        stamp_module.current_head = lambda _root: "a" * 40
        stamp_module.stamp(task_json, True)
        payload = json.loads(task_json.read_text(encoding="utf-8"))
        assert payload["meta"] == {
            "execution_host": "vps",
            "base_commit": "a" * 40,
            "hotfix": True,
        }


def assert_inline_workflow_contract() -> None:
    workflow = (REPO_ROOT / ".trellis/workflow.md").read_text(encoding="utf-8")
    states = ("no_task", "planning", "in_progress")
    titles = ("no task", "planning", "in progress")
    blocks = dict(re.findall(
        r"\[workflow-state:([\w-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
        workflow, re.S,
    ))
    fixtures = [workflow]
    for state, title in zip(states, titles):
        heading = f"### Codex inline {title}"
        fixtures.extend([
            workflow.replace(heading, heading + " missing"),
            workflow + "\n" + heading + "\nDuplicate target\n",
            workflow.replace(f"MUST read [Codex inline {title}]", f"May read [Codex inline {title}]"),
            workflow.replace(f"#codex-inline-{title.replace(' ', '-')})", "#missing-contract)"),
            workflow.replace(f"[workflow-state:{state}-inline]", f"[workflow-state:{state}-inline]\n" + "x" * 2000),
        ])
    for clause in (
        "current explicit deploy authorization", "Any false or unknown condition routes to Full",
        "Route selection never authorizes deploy", "An authorization pause does not complete that owner",
        "never suppresses dangerous-operation confirmation", "owner accepts a documented evidence boundary",
        "missing or invalid values mean `full`", "Do NOT dispatch", "--allow-lite-work",
        "jsonl curation is **skipped**", "when the task is complex",
        "reload missing context after compaction or a new session",
    ):
        fixtures.append(workflow.replace(clause, "REMOVED"))
    section = workflow[workflow.index("## Codex Inline Contracts"):]
    without_section = workflow[:workflow.index("## Codex Inline Contracts")]
    fixtures.append(without_section.replace("## Phase 1: Plan", section + "\n## Phase 1: Plan"))
    module_url = (REPO_ROOT / "scripts/checks/repo/agent-workflow.mjs").as_uri()
    program = (
        "import fs from 'node:fs';"
        f"import {{auditCodexInlineContracts}} from {json.dumps(module_url)};"
        "console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8'))"
        ".map(text => auditCodexInlineContracts(text).errors)));"
    )
    checked = subprocess.run(["node", "--input-type=module", "-e", program],
        input=json.dumps(fixtures), capture_output=True, text=True, check=True, timeout=30)
    errors = json.loads(checked.stdout)
    assert errors[0] == [], errors[0]
    for index, result in enumerate(errors[1:], 1):
        assert result, f"broken workflow fixture {index} escaped the gate"

    # Real Hook subprocesses: isolated runtime, actual repository templates/parser.
    with tempfile.TemporaryDirectory(prefix="trellis-inline-hook-") as temp_dir:
        root = Path(temp_dir)
        trellis = root / ".trellis"
        trellis.mkdir()
        (trellis / "scripts").symlink_to(TRELLIS_SCRIPTS, target_is_directory=True)
        workflow_path = trellis / "workflow.md"
        workflow_path.write_text(workflow, encoding="utf-8")
        config = trellis / "config.yaml"
        config.write_text("codex:\n  dispatch_mode: inline\n", encoding="utf-8")
        sessions = trellis / ".runtime/sessions"
        sessions.mkdir(parents=True)
        task = trellis / "tasks/fixture-task"
        task.mkdir(parents=True)
        context = sessions / "fixture-inline.json"
        env = {key: value for key, value in os.environ.items()
               if not key.endswith("_PROJECT_DIR") and not key.startswith("TRELLIS_")}
        env.update(TRELLIS_CONTEXT_ID="fixture-inline", PYTHONDONTWRITEBYTECODE="1")
        # 仓库只跟踪这一份共享 hook；通过隔离安装路径验证平台分支，
        # 不依赖被忽略的宿主 .claude/ 配置，也不跳过 Claude 行为断言。
        hook_source = REPO_ROOT / ".codex/hooks/inject-workflow-state.py"
        for platform in (".codex", ".claude"):
            hook = root / platform / "hooks/inject-workflow-state.py"
            hook.parent.mkdir(parents=True)
            shutil.copyfile(hook_source, hook)
            for state in states:
                context.write_text(json.dumps({"current_task": None if state == "no_task"
                    else ".trellis/tasks/fixture-task"}), encoding="utf-8")
                (task / "task.json").write_text(json.dumps({"id": "fixture-task", "status": state,
                    "workflow_profile": "full"}), encoding="utf-8")
                modes = ("inline", "auto") if platform == ".codex" else ("inline",)
                for mode in modes:
                    config.write_text(f"codex:\n  dispatch_mode: {mode}\n", encoding="utf-8")
                    output = subprocess.run([sys.executable, str(hook)], cwd=root, env=env,
                        input=json.dumps({"cwd": str(root), "prompt": "fixture"}),
                        capture_output=True, text=True, check=True, timeout=15)
                    payload = json.loads(output.stdout)["hookSpecificOutput"]
                    assert payload["hookEventName"] == "UserPromptSubmit"
                    content = payload["additionalContext"]
                    key = state + "-inline" if platform == ".codex" and mode == "inline" else state
                    assert blocks[key].strip() in content, (platform, state, mode)
                    header = "Status: no_task" if state == "no_task" else f"Task: fixture-task ({state})"
                    assert header in content
                    if platform == ".codex":
                        assert f"<codex-mode>{mode}:" in content
                        assert ("<trellis-bootstrap>" in content) == (state == "no_task")
                    else:
                        assert "<codex-mode>" not in content
        # The full contracts must not leak back into compact startup context.
        from common import workflow_phase
        original_path = workflow_phase._workflow_md_path
        try:
            workflow_phase._workflow_md_path = lambda: workflow_path
            phase_index = workflow_phase.get_phase_index()
            assert "## Phase Index" in phase_index
            assert "## Codex Inline Contracts" not in phase_index
            assert "current explicit deploy authorization" not in phase_index
        finally:
            workflow_phase._workflow_md_path = original_path
    print(f"[trellis-scaffold] OK: inline reminders, {len(fixtures) - 1} negative fixtures, 9 real Hook cases")


def main() -> int:
    assert_manifest_behavior()
    assert_context_lifecycle_behavior()
    assert_slug_and_activation_behavior()
    assert_metadata_and_containment_behavior()
    assert_branch_resolution_behavior()
    assert_pi_context_cache_contract()
    assert_host_local_workspace_contract()
    assert_inline_workflow_contract()
    print(
        "[trellis-scaffold] OK: task, lazy context, strict validation, workspace, host metadata, containment, branch, Pi, and inline reminder behavior passed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
