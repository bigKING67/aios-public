#!/usr/bin/env python3
"""Audit and update the local frontend taste-skill family from upstream."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_POLICY = SCRIPT_DIR / "frontend_taste_skill_policy.json"


class UpdateError(Exception):
    pass


def expand_path(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run(args: list[str], cwd: Path | None = None, shell: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args if not shell else " ".join(args),
        cwd=str(cwd) if cwd else None,
        shell=shell,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        command = result.args if isinstance(result.args, str) else " ".join(result.args)
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise UpdateError(f"{command}: {detail}")
    return result


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path: Path, payload: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def clone_source(policy: dict, workdir: Path) -> Path:
    repo_dir = workdir / "taste-skill"
    source_url = policy["sourceUrl"]
    branch = policy.get("branch") or "main"
    try:
        run(["git", "clone", "--depth", "1", "--single-branch", "--branch", branch, source_url, str(repo_dir)])
    except UpdateError:
        if repo_dir.exists():
            shutil.rmtree(repo_dir)
        run(["git", "clone", "--depth", "1", source_url, str(repo_dir)])
        run(["git", "checkout", branch], cwd=repo_dir)
    return repo_dir


def git_output(repo_dir: Path, *args: str) -> str:
    return run(["git", "-C", str(repo_dir), *args]).stdout.strip()


def git_tree_hash(repo_dir: Path, skill_path: str) -> str:
    skill_dir = str(Path(skill_path).parent)
    return git_output(repo_dir, "rev-parse", f"HEAD:{skill_dir}")


def source_meta(repo_dir: Path) -> dict:
    return {
        "commit": git_output(repo_dir, "rev-parse", "HEAD"),
        "commitDate": git_output(repo_dir, "log", "-1", "--format=%cI"),
        "commitSubject": git_output(repo_dir, "log", "-1", "--format=%s"),
    }


def read_lock(lockfile: Path) -> dict:
    if lockfile.exists():
        return load_json(lockfile)
    return {"version": 3, "skills": {}, "dismissed": {}, "lastSelectedAgents": []}


def forbidden_hits(lock: dict, forbidden_sources: list[str]) -> list[dict]:
    hits = []
    skills = lock.get("skills") or {}
    for name, entry in skills.items():
        haystack = " ".join(str(entry.get(key, "")) for key in ("source", "sourceUrl"))
        for forbidden in forbidden_sources:
            if forbidden and forbidden in haystack:
                hits.append({"name": name, "source": entry.get("source"), "sourceUrl": entry.get("sourceUrl")})
                break
    return hits


def build_audit(policy: dict, repo_dir: Path, lock: dict) -> dict:
    skill_root = expand_path(policy["skillRoot"])
    skills = []
    for item in policy.get("skills", []):
        name = item["name"]
        upstream_skill_path = item["skillPath"]
        upstream_file = repo_dir / upstream_skill_path
        local_file = skill_root / name / "SKILL.md"
        upstream_tree_hash = git_tree_hash(repo_dir, upstream_skill_path)
        upstream_sha1 = sha1_file(upstream_file)
        local_sha1 = sha1_file(local_file) if local_file.exists() else ""

        lock_entry = (lock.get("skills") or {}).get(name) or {}
        content_status = "ok" if local_sha1 == upstream_sha1 else "diff"
        if not local_file.exists():
            content_status = "missing"

        expected_source_url = policy["sourceUrl"]
        lock_status = "ok"
        lock_reasons = []
        if not lock_entry:
            lock_status = "missing"
            lock_reasons.append("entry_missing")
        else:
            if lock_entry.get("source") != policy["source"]:
                lock_status = "drift"
                lock_reasons.append("source")
            if lock_entry.get("sourceUrl") != expected_source_url:
                lock_status = "drift"
                lock_reasons.append("sourceUrl")
            if lock_entry.get("skillPath") != upstream_skill_path:
                lock_status = "drift"
                lock_reasons.append("skillPath")
            if lock_entry.get("skillFolderHash") != upstream_tree_hash:
                lock_status = "drift"
                lock_reasons.append("skillFolderHash")

        skills.append(
            {
                "name": name,
                "skillPath": upstream_skill_path,
                "localPath": str(local_file),
                "contentStatus": content_status,
                "lockStatus": lock_status,
                "lockReasons": lock_reasons,
                "localSha1": local_sha1,
                "upstreamSha1": upstream_sha1,
                "upstreamTreeHash": upstream_tree_hash,
                "needsUpdate": content_status != "ok" or lock_status != "ok",
            }
        )

    hits = forbidden_hits(lock, policy.get("forbiddenSources", []))
    update_count = sum(1 for skill in skills if skill["needsUpdate"])
    return {
        "ok": update_count == 0 and not hits,
        "source": policy["source"],
        "sourceUrl": policy["sourceUrl"],
        "branch": policy.get("branch") or "main",
        "sourceMeta": source_meta(repo_dir),
        "skillRoot": str(skill_root),
        "lockfile": str(expand_path(policy["lockfile"])),
        "skills": skills,
        "updateCount": update_count,
        "forbiddenSourceHits": hits,
    }


def backup_state(policy: dict, audit: dict, lockfile: Path, changed_skills: list[dict]) -> Path:
    backup_root = expand_path(policy["backupDir"]) / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (backup_root / "skills").mkdir(parents=True, exist_ok=True)
    if lockfile.exists():
        shutil.copy2(lockfile, backup_root / "skill-lock.json")
    skill_root = expand_path(policy["skillRoot"])
    for skill in changed_skills:
        source_dir = skill_root / skill["name"]
        if source_dir.exists():
            shutil.copytree(source_dir, backup_root / "skills" / skill["name"], symlinks=True)
    (backup_root / "audit-before.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return backup_root


def restore_backup(policy: dict, lockfile: Path, backup_root: Path, changed_skills: list[dict]) -> None:
    skill_root = expand_path(policy["skillRoot"])
    lock_backup = backup_root / "skill-lock.json"
    if lock_backup.exists():
        shutil.copy2(lock_backup, lockfile)
    for skill in changed_skills:
        target_dir = skill_root / skill["name"]
        backup_dir = backup_root / "skills" / skill["name"]
        if target_dir.exists():
            shutil.rmtree(target_dir)
        if backup_dir.exists():
            shutil.copytree(backup_dir, target_dir, symlinks=True)


def sync_claude_bridge(policy: dict, skill_name: str) -> None:
    bridge_raw = policy.get("claudeBridgeDir")
    if not bridge_raw:
        return
    bridge_dir = expand_path(bridge_raw)
    if not bridge_dir.exists():
        return
    skill_dir = expand_path(policy["skillRoot"]) / skill_name
    link_path = bridge_dir / skill_name
    rel_target = os.path.relpath(skill_dir, bridge_dir)
    if link_path.is_symlink():
        if os.path.realpath(link_path) != str(skill_dir):
            link_path.unlink()
            link_path.symlink_to(rel_target)
    elif not link_path.exists():
        link_path.symlink_to(rel_target)


def apply_updates(policy: dict, repo_dir: Path, audit: dict, verify: bool) -> dict:
    if audit["forbiddenSourceHits"]:
        raise UpdateError("Forbidden skill source found in lockfile; aborting update.")

    changed_skills = [skill for skill in audit["skills"] if skill["needsUpdate"]]
    if not changed_skills:
        return {"applied": False, "updatedSkills": [], "backupPath": "", "verified": False}

    skill_root = expand_path(policy["skillRoot"])
    lockfile = expand_path(policy["lockfile"])
    lock = read_lock(lockfile)
    lock.setdefault("skills", {})
    backup_root = backup_state(policy, audit, lockfile, changed_skills)
    updated_names = []
    now = utc_now()

    try:
        for skill in changed_skills:
            name = skill["name"]
            upstream_dir = repo_dir / str(Path(skill["skillPath"]).parent)
            target_dir = skill_root / name
            tmp_target = target_dir.with_name(f".{name}.tmp-update")
            if tmp_target.exists():
                shutil.rmtree(tmp_target)
            shutil.copytree(upstream_dir, tmp_target)
            if target_dir.exists():
                shutil.rmtree(target_dir)
            tmp_target.replace(target_dir)
            sync_claude_bridge(policy, name)

            old_entry = lock["skills"].get(name) or {}
            lock["skills"][name] = {
                "source": policy["source"],
                "sourceType": policy.get("sourceType", "github"),
                "sourceUrl": policy["sourceUrl"],
                "skillPath": skill["skillPath"],
                "skillFolderHash": skill["upstreamTreeHash"],
                "installedAt": old_entry.get("installedAt") or now,
                "updatedAt": now,
            }
            updated_names.append(name)

        write_json_atomic(lockfile, lock)

        verified = False
        if verify:
            for command in policy.get("verifyCommands", []):
                run([command], shell=True)
            verified = True
        return {
            "applied": True,
            "updatedSkills": updated_names,
            "backupPath": str(backup_root),
            "verified": verified,
        }
    except Exception:
        restore_backup(policy, lockfile, backup_root, changed_skills)
        raise


def print_text_report(payload: dict) -> None:
    audit = payload["audit"]
    print(f"source={audit['source']} branch={audit['branch']}")
    meta = audit["sourceMeta"]
    print(f"commit={meta['commit']} date={meta['commitDate']}")
    print(f"subject={meta['commitSubject']}")
    print(f"update_count={audit['updateCount']}")
    if audit["forbiddenSourceHits"]:
        print("forbidden_source_hits=" + ",".join(hit["name"] for hit in audit["forbiddenSourceHits"]))
    for skill in audit["skills"]:
        mark = "UPDATE" if skill["needsUpdate"] else "OK"
        print(
            f"{mark}\t{skill['name']}\tcontent={skill['contentStatus']}\t"
            f"lock={skill['lockStatus']}\tpath={skill['skillPath']}"
        )
    result = payload.get("applyResult")
    if result:
        print(f"applied={str(result['applied']).lower()}")
        if result["updatedSkills"]:
            print("updated_skills=" + ",".join(result["updatedSkills"]))
        if result["backupPath"]:
            print("backup=" + result["backupPath"])
        print(f"verified={str(result['verified']).lower()}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit or update local frontend taste skills.")
    parser.add_argument("--policy", default=str(DEFAULT_POLICY), help="Path to frontend_taste_skill_policy.json")
    parser.add_argument("--mode", choices=["audit", "apply"], default="audit")
    parser.add_argument("--output", choices=["text", "json"], default="text")
    parser.add_argument("--verify", action="store_true", help="Run policy verifyCommands after apply")
    parser.add_argument("--fail-on-drift", action="store_true", help="Exit 1 when audit finds drift or forbidden sources")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    policy = load_json(expand_path(args.policy))
    workdir = Path(tempfile.mkdtemp(prefix="frontend-taste-skill-"))
    try:
        repo_dir = clone_source(policy, workdir)
        lock = read_lock(expand_path(policy["lockfile"]))
        audit = build_audit(policy, repo_dir, lock)
        payload = {"audit": audit}
        if args.mode == "apply":
            payload["applyResult"] = apply_updates(policy, repo_dir, audit, args.verify)
            lock = read_lock(expand_path(policy["lockfile"]))
            payload["auditAfter"] = build_audit(policy, repo_dir, lock)
        if args.output == "json":
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print_text_report(payload)
        if args.fail_on_drift and (not audit["ok"]):
            return 1
        return 0
    except UpdateError as exc:
        print(f"frontend_taste_skill_update: {exc}", file=sys.stderr)
        return 2
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
