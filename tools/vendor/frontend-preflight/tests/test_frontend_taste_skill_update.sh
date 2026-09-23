#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PY_SCRIPT="${TOOLS_DIR}/frontend_taste_skill_update.py"

bash -n "${TOOLS_DIR}/frontend_taste_skill_update.sh"
bash -n "${TOOLS_DIR}/frontend_taste_skill_auto_update.sh"
python3 -m py_compile "${PY_SCRIPT}"
python3 -m json.tool "${TOOLS_DIR}/frontend_taste_skill_policy.json" >/dev/null

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

repo_dir="${tmp_dir}/repo"
mkdir -p "${repo_dir}/skills/taste-skill"
printf '%s\n' 'upstream skill body' >"${repo_dir}/skills/taste-skill/SKILL.md"
git -C "${repo_dir}" init -q
git -C "${repo_dir}" add skills/taste-skill/SKILL.md
git -C "${repo_dir}" -c user.name='Codex Test' -c user.email='codex-test@example.invalid' commit -q -m 'initial skill'
git -C "${repo_dir}" branch -M main
tree_hash="$(git -C "${repo_dir}" rev-parse HEAD:skills/taste-skill)"

skill_root="${tmp_dir}/skills"
mkdir -p "${skill_root}/design-taste-frontend"
printf '%s\n' 'old local skill body' >"${skill_root}/design-taste-frontend/SKILL.md"

lockfile="${tmp_dir}/skill-lock.json"
cat >"${lockfile}" <<JSON
{
  "version": 3,
  "skills": {
    "design-taste-frontend": {
      "source": "Leonxlnx/taste-skill",
      "sourceType": "github",
      "sourceUrl": "${repo_dir}",
      "skillPath": "old/path/SKILL.md",
      "skillFolderHash": "oldhash",
      "installedAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
JSON

policy="${tmp_dir}/policy.json"
cat >"${policy}" <<JSON
{
  "version": 1,
  "source": "Leonxlnx/taste-skill",
  "sourceType": "github",
  "sourceUrl": "${repo_dir}",
  "branch": "main",
  "skillRoot": "${skill_root}",
  "lockfile": "${lockfile}",
  "backupDir": "${tmp_dir}/backups",
  "claudeBridgeDir": "${tmp_dir}/claude-skills",
  "forbiddenSources": ["pbakaus/impeccable"],
  "verifyCommands": [],
  "skills": [
    {
      "name": "design-taste-frontend",
      "skillPath": "skills/taste-skill/SKILL.md"
    }
  ]
}
JSON

audit_json="$(bash "${TOOLS_DIR}/frontend_taste_skill_update.sh" --policy "${policy}" --mode audit --output json)"
python3 - "${audit_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
audit = payload["audit"]
skill = audit["skills"][0]
assert audit["updateCount"] == 1
assert skill["contentStatus"] == "diff"
assert skill["lockStatus"] == "drift"
PY

bash "${TOOLS_DIR}/frontend_taste_skill_update.sh" --policy "${policy}" --mode apply --output json >/dev/null
cmp -s "${repo_dir}/skills/taste-skill/SKILL.md" "${skill_root}/design-taste-frontend/SKILL.md"

python3 - "${lockfile}" "${tree_hash}" <<'PY'
import json
import sys

payload = json.loads(open(sys.argv[1], encoding="utf-8").read())
entry = payload["skills"]["design-taste-frontend"]
assert entry["skillPath"] == "skills/taste-skill/SKILL.md"
assert entry["skillFolderHash"] == sys.argv[2]
assert entry["installedAt"] == "2026-01-01T00:00:00.000Z"
assert entry["updatedAt"] != "2026-01-01T00:00:00.000Z"
PY

echo "taste_skill_update_passed=1"
