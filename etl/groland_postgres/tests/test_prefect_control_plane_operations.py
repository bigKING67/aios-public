from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


ETL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ETL_ROOT.parents[1]
SCRIPTS = ETL_ROOT / "scripts"


def _write_executable(path: Path, source: str) -> None:
  path.write_text(source, encoding="utf-8")
  path.chmod(0o755)


class PrefectControlPlaneOperationsTest(unittest.TestCase):
  def test_control_plane_state_paths_reject_shared_system_roots(self) -> None:
    for path in ("/", "/opt", "/var", "/var/lib", "/var/lib/aios-prefect", "/tmp"):
      completed = subprocess.run(
        [
          sys.executable,
          str(SCRIPTS / "prefect_filesystem_safety.py"),
          "--path",
          path,
          "--label",
          "PREFECT_BACKUP_ROOT",
        ],
        check=False,
        text=True,
        capture_output=True,
      )
      self.assertNotEqual(completed.returncode, 0, path)
      self.assertIn("shared system root", completed.stderr)

    with tempfile.TemporaryDirectory() as temporary:
      dedicated = Path(temporary) / "backups"
      completed = subprocess.run(
        [
          sys.executable,
          str(SCRIPTS / "prefect_filesystem_safety.py"),
          "--path",
          str(dedicated),
          "--label",
          "PREFECT_BACKUP_ROOT",
        ],
        check=True,
        text=True,
        capture_output=True,
      )
      self.assertEqual(Path(completed.stdout.strip()), dedicated.resolve())

  def test_postgres_url_parser_keeps_credentials_out_of_arguments(self) -> None:
    environment = os.environ.copy()
    environment["PREFECT_TEST_URL"] = (
      "postgresql+asyncpg://fixture%2Buser:p%40ss@127.0.0.1:5544/prefect?ssl=disable"
    )
    completed = subprocess.run(
      [
        sys.executable,
        str(SCRIPTS / "prefect_postgres_connection.py"),
        "--env-key",
        "PREFECT_TEST_URL",
      ],
      env=environment,
      check=True,
      capture_output=True,
    )
    self.assertEqual(
      tuple(part.decode() for part in completed.stdout.rstrip(b"\0").split(b"\0")),
      ("127.0.0.1", "5544", "fixture+user", "p@ss", "prefect", "disable"),
    )
    self.assertNotIn(environment["PREFECT_TEST_URL"], " ".join(completed.args))

    environment["PREFECT_TEST_URL"] = (
      "postgresql+asyncpg://fixture:fixture@127.0.0.1/prefect?sslmode=disable"
    )
    rejected = subprocess.run(
      [
        sys.executable,
        str(SCRIPTS / "prefect_postgres_connection.py"),
        "--env-key",
        "PREFECT_TEST_URL",
      ],
      env=environment,
      check=False,
      text=True,
      capture_output=True,
    )
    self.assertNotEqual(rejected.returncode, 0)
    self.assertIn("asyncpg connection URLs must use ssl=", rejected.stderr)
    self.assertNotIn(environment["PREFECT_TEST_URL"], rejected.stderr)

    environment["PREFECT_TEST_URL"] = "sqlite+aiosqlite:///prefect.db"
    rejected = subprocess.run(
      [
        sys.executable,
        str(SCRIPTS / "prefect_postgres_connection.py"),
        "--env-key",
        "PREFECT_TEST_URL",
      ],
      env=environment,
      check=False,
      text=True,
      capture_output=True,
    )
    self.assertNotEqual(rejected.returncode, 0)
    self.assertNotIn(environment["PREFECT_TEST_URL"], rejected.stderr)

  def test_prefect_shell_entrypoints_avoid_bash4_only_case_conversion(self) -> None:
    for path in sorted(SCRIPTS.glob("*.sh")):
      source = path.read_text(encoding="utf-8")
      self.assertNotRegex(source, r"\$\{[^}]*,,\}", path.name)

  def test_systemd_installer_generates_managed_journald_units_and_timers(self) -> None:
    with tempfile.TemporaryDirectory() as temporary:
      root = Path(temporary)
      bin_dir = root / "bin"
      units = root / "units"
      state = root / "state"
      runtime = root / "runtime"
      bin_dir.mkdir()
      runtime.mkdir()
      systemctl_log = root / "systemctl.log"
      chown_log = root / "chown.log"
      env_file = root / "env.vps"
      env_file.write_text(
        "DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api\n"
        "PREFECT_API_DATABASE_CONNECTION_URL="
        "postgresql+asyncpg://fixture:fixture@127.0.0.1/aios_prefect\n",
        encoding="utf-8",
      )
      operations_env_file = root / "prefect-operations.env"
      operations_env_file.write_text(
        "PREFECT_DB_PASSWORD=fixture-role-password\n"
        "PREFECT_BACKUP_RESTORE_ADMIN_URL=postgresql://fixture:fixture@127.0.0.1/postgres\n",
        encoding="utf-8",
      )

      _write_executable(
        bin_dir / "id",
        "#!/usr/bin/env bash\nif [[ \"${1:-}\" == \"-u\" ]]; then echo 0; fi\nexit 0\n",
      )
      _write_executable(
        bin_dir / "systemctl",
        """#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
if [[ "${1:-}" == "show" ]]; then
  unit_path="$SYSTEMD_DIR/${2:-}"
  user="$(sed -n 's/^User=//p' "$unit_path" | head -1)"
  group="$(sed -n 's/^Group=//p' "$unit_path" | head -1)"
  supplementary_groups="$(sed -n 's/^SupplementaryGroups=//p' "$unit_path" | head -1)"
  printf 'LoadState=loaded\nUser=%s\nGroup=%s\nSupplementaryGroups=%s\n' \
    "$user" "$group" "$supplementary_groups"
fi
""",
      )
      _write_executable(
        bin_dir / "getent",
        "#!/usr/bin/env bash\n[[ \"${1:-}\" == \"group\" && \"${2:-}\" == \"fixture-runtime-env\" ]]\n",
      )
      _write_executable(
        bin_dir / "install",
        """#!/usr/bin/env bash
set -euo pipefail
paths=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d) shift ;;
    -o|-g|-m) shift 2 ;;
    *) paths+=("$1"); shift ;;
  esac
done
mkdir -p "${paths[@]}"
""",
      )
      _write_executable(
        bin_dir / "chown",
        "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"$CHOWN_LOG\"\n",
      )
      _write_executable(
        runtime / "python",
        f'#!/usr/bin/env bash\nexec "{sys.executable}" "$@"\n',
      )
      _write_executable(runtime / "prefect", "#!/usr/bin/env bash\nexit 0\n")

      environment = os.environ.copy()
      environment.update({
        "PATH": f"{bin_dir}:{environment['PATH']}",
        "SYSTEMCTL_LOG": str(systemctl_log),
        "CHOWN_LOG": str(chown_log),
        "PROJECT_ROOT": str(ETL_ROOT),
        "REPO_ROOT": str(REPO_ROOT),
        "ENV_FILE": str(env_file),
        "PREFECT_OPERATIONS_ENV_FILE": str(operations_env_file),
        "SYSTEMD_DIR": str(units),
        "SYSTEMD_USER": "fixture-prefect",
        "SYSTEMD_GROUP": "fixture-prefect",
        "AIOS_RUNTIME_ENV_GROUP": "fixture-runtime-env",
        "PREFECT_STATE_DIR": str(state),
        "PYTHON_BIN": str(runtime / "python"),
        "PREFECT_BIN": str(runtime / "prefect"),
        "ENABLE_ON_BOOT": "1",
        "START_NOW": "0",
      })
      subprocess.run(
        ["bash", str(SCRIPTS / "install_prefect_systemd.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=True,
        text=True,
        capture_output=True,
      )

      rendered = "\n".join(path.read_text(encoding="utf-8") for path in sorted(units.iterdir()))
      self.assertIn("User=fixture-prefect", rendered)
      self.assertEqual(rendered.count("SupplementaryGroups=fixture-runtime-env"), 3)
      self.assertIn(f"Environment=PYTHON_BIN={runtime / 'python'}", rendered)
      self.assertIn("StandardOutput=journal", rendered)
      self.assertIn("SyslogIdentifier=aios-prefect-watchdog", rendered)
      self.assertIn("OnUnitActiveSec=5min", rendered)
      self.assertIn("OnCalendar=*-*-* 02:15:00", rendered)
      self.assertIn("OnCalendar=Sun *-*-* 04:10:00", rendered)
      self.assertIn("SyslogIdentifier=aios-prefect-backup", rendered)
      self.assertIn("SyslogIdentifier=aios-prefect-restore-verify", rendered)
      self.assertIn(f'source "{operations_env_file}"', rendered)
      self.assertNotIn("fixture-role-password", rendered)
      self.assertNotIn("postgresql://fixture:fixture@", rendered)
      self.assertIn("PREFECT_SERVER_SERVICES_DB_VACUUM_ENABLED=events,flow_runs", rendered)
      self.assertIn("PREFECT_SERVER_SERVICES_DB_VACUUM_RETENTION_PERIOD=P90D", rendered)
      self.assertIn("PREFECT_SERVER_EVENTS_RETENTION_PERIOD=P7D", rendered)
      self.assertIn('exec "' + str(runtime / "python") + '"', rendered)
      self.assertIn('"$PREFECT_API_URL"', rendered)
      self.assertNotIn("StandardOutput=append:", rendered)
      self.assertNotIn("uv run", rendered)
      self.assertNotIn("|| true", rendered)
      systemctl_calls = systemctl_log.read_text(encoding="utf-8")
      self.assertIn("daemon-reload", systemctl_calls)
      self.assertIn("aios-prefect-watchdog.timer", systemctl_calls)
      self.assertIn("aios-prefect-backup.timer", systemctl_calls)
      self.assertIn("aios-prefect-restore-verify.timer", systemctl_calls)
      self.assertIn(f"root:fixture-runtime-env {env_file}", chown_log.read_text(encoding="utf-8"))

      unsafe_consumer = units / "unsafe-env-consumer.service"
      unsafe_consumer.write_text(
        "[Service]\n"
        "User=fixture-user\n"
        f"EnvironmentFile={env_file}\n",
        encoding="utf-8",
      )
      chown_before_rejection = chown_log.read_text(encoding="utf-8")
      rejected = subprocess.run(
        ["bash", str(SCRIPTS / "install_prefect_systemd.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=False,
        text=True,
        capture_output=True,
      )
      self.assertNotEqual(rejected.returncode, 0)
      self.assertIn("non-root systemd consumers lack fixture-runtime-env", rejected.stderr)
      self.assertIn("unsafe-env-consumer.service", rejected.stderr)
      self.assertEqual(chown_log.read_text(encoding="utf-8"), chown_before_rejection)

      unsafe_consumer.write_text(
        "[Service]\n"
        "User=fixture-user\n"
        "SupplementaryGroups=fixture-runtime-env\n"
        f"EnvironmentFile={env_file}\n",
        encoding="utf-8",
      )
      subprocess.run(
        ["bash", str(SCRIPTS / "install_prefect_systemd.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=True,
        text=True,
        capture_output=True,
      )

      env_file.write_text(
        "DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api\n"
        "PREFECT_API_DATABASE_CONNECTION_URL="
        "postgresql+asyncpg://fixture:fixture@127.0.0.1/aios_prefect\n"
        "PREFECT_BACKUP_RESTORE_ADMIN_URL=postgresql://should-not-be-shared\n",
        encoding="utf-8",
      )
      chown_before_rejection = chown_log.read_text(encoding="utf-8")
      rejected = subprocess.run(
        ["bash", str(SCRIPTS / "install_prefect_systemd.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=False,
        text=True,
        capture_output=True,
      )
      self.assertNotEqual(rejected.returncode, 0)
      self.assertIn("must not contain bootstrap or restore-admin credentials", rejected.stderr)
      self.assertEqual(chown_log.read_text(encoding="utf-8"), chown_before_rejection)

      env_file.write_text(
        "DATAOPS_PREFECT_API_URL=http://127.0.0.1:4200/api\n"
        "PREFECT_API_DATABASE_CONNECTION_URL=sqlite+aiosqlite:///prefect.db\n",
        encoding="utf-8",
      )
      rejected = subprocess.run(
        ["bash", str(SCRIPTS / "install_prefect_systemd.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=False,
        text=True,
        capture_output=True,
      )
      self.assertNotEqual(rejected.returncode, 0)
      self.assertIn("valid PostgreSQL PREFECT_API_DATABASE_CONNECTION_URL", rejected.stderr)
      self.assertEqual(chown_log.read_text(encoding="utf-8"), chown_before_rejection)

  def test_prefect_retention_and_shadow_settings_are_real_378_settings(self) -> None:
    environment = os.environ.copy()
    environment.update({
      "PREFECT_SERVER_SERVICES_DB_VACUUM_ENABLED": "events,flow_runs",
      "PREFECT_SERVER_SERVICES_DB_VACUUM_RETENTION_PERIOD": "P90D",
      "PREFECT_SERVER_EVENTS_RETENTION_PERIOD": "P7D",
      "PREFECT_SERVER_SERVICES_SCHEDULER_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_LATE_RUNS_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_FOREMAN_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_CANCELLATION_CLEANUP_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_PAUSE_EXPIRATIONS_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_REPOSSESSOR_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_CLEANUP_RECONCILER_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_TASK_RUN_RECORDER_ENABLED": "false",
      "PREFECT_SERVER_SERVICES_TRIGGERS_ENABLED": "false",
    })
    completed = subprocess.run(
      [
        sys.executable,
        "-c",
        """
import json
from prefect.settings import Settings

settings = Settings()
services = settings.server.services
print(json.dumps({
  "vacuum_types": sorted(services.db_vacuum.enabled_vacuum_types),
  "vacuum_days": services.db_vacuum.retention_period.days,
  "event_days": settings.server.events.retention_period.days,
  "disabled": {
    name: not getattr(services, name).enabled
    for name in (
      "scheduler",
      "late_runs",
      "foreman",
      "cancellation_cleanup",
      "pause_expirations",
      "repossessor",
      "cleanup_reconciler",
      "task_run_recorder",
      "triggers",
    )
  },
}))
""",
      ],
      env=environment,
      check=True,
      text=True,
      capture_output=True,
    )
    observed = json.loads(completed.stdout)
    self.assertEqual(observed["vacuum_types"], ["events", "flow_runs"])
    self.assertEqual(observed["vacuum_days"], 90)
    self.assertEqual(observed["event_days"], 7)
    self.assertTrue(all(observed["disabled"].values()), observed["disabled"])

  def test_bootstrap_keeps_password_out_of_psql_arguments_and_sql(self) -> None:
    with tempfile.TemporaryDirectory() as temporary:
      root = Path(temporary)
      capture = root / "psql.log"
      fake_psql = root / "psql"
      _write_executable(
        fake_psql,
        """#!/usr/bin/env bash
printf 'ARGS:%s\n' "$*" >> "$PSQL_CAPTURE"
cat >> "$PSQL_CAPTURE"
""",
      )
      environment = os.environ.copy()
      environment.update({
        "ALLOW_NON_ROOT_PREFECT_DB_BOOTSTRAP": "1",
        "PSQL_BIN": str(fake_psql),
        "PSQL_CAPTURE": str(capture),
        "PREFECT_DB_NAME": "fixture_prefect",
        "PREFECT_DB_ROLE": "fixture_prefect",
        "PREFECT_DB_PASSWORD": "fixture-secret-must-not-appear",
      })
      subprocess.run(
        ["bash", str(SCRIPTS / "bootstrap_prefect_postgres.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=True,
        text=True,
        capture_output=True,
      )

      captured = capture.read_text(encoding="utf-8")
      self.assertIn("current_setting('aios.prefect_db_password_b64')", captured)
      self.assertIn("AS prefect_db_password \\gset", captured)
      self.assertIn("NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS", captured)
      self.assertIn("must not inherit membership in another role", captured)
      self.assertIn("REVOKE ALL ON DATABASE", captured)
      self.assertNotIn("fixture-secret-must-not-appear", captured)

  def test_sqlite_backup_is_consistent_hashed_and_retention_is_scoped(self) -> None:
    with tempfile.TemporaryDirectory() as temporary:
      root = Path(temporary)
      source = root / "prefect.db"
      backup_root = root / "backups"
      old_backup = backup_root / "20200101T000000Z"
      old_backup.mkdir(parents=True)
      (old_backup / "keep-scope-proof").write_text("old", encoding="utf-8")
      old_time = time.time() - (3 * 24 * 60 * 60)
      os.utime(old_backup, (old_time, old_time))
      unrelated = backup_root / "manual-do-not-delete"
      unrelated.mkdir()
      os.utime(unrelated, (old_time, old_time))
      with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("INSERT INTO fixture (value) VALUES ('preserved')")

      environment = os.environ.copy()
      environment.pop("PREFECT_API_DATABASE_CONNECTION_URL", None)
      environment.update({
        "ALLOW_NON_ROOT_PREFECT_BACKUP": "1",
        "PREFECT_SQLITE_PATH": str(source),
        "PREFECT_BACKUP_ROOT": str(backup_root),
        "PREFECT_BACKUP_RETENTION_DAYS": "1",
        "PYTHON_BIN": sys.executable,
        "PROJECT_ROOT": str(ETL_ROOT),
        "REPO_ROOT": str(REPO_ROOT),
      })
      subprocess.run(
        ["bash", str(SCRIPTS / "backup_prefect_control_plane.sh")],
        cwd=REPO_ROOT,
        env=environment,
        check=True,
        text=True,
        capture_output=True,
      )

      created = [path for path in backup_root.iterdir() if path.name not in {unrelated.name}]
      self.assertEqual(len(created), 1)
      backup_dir = created[0]
      backup = backup_dir / "prefect-metadata.sqlite3"
      with sqlite3.connect(f"file:{backup}?mode=ro", uri=True) as connection:
        self.assertEqual(connection.execute("SELECT value FROM fixture").fetchone(), ("preserved",))
      digest = hashlib.sha256(backup.read_bytes()).hexdigest()
      self.assertIn(f"{digest}  prefect-metadata.sqlite3", (backup_dir / "SHA256SUMS").read_text())
      manifest = (backup_dir / "MANIFEST").read_text(encoding="utf-8")
      self.assertIn("artifact_count=1", manifest)
      self.assertNotIn(str(source), manifest)
      self.assertFalse(old_backup.exists())
      self.assertTrue(unrelated.exists())

  def test_runtime_installer_contract_is_versioned_clean_and_root_owned(self) -> None:
    source = (SCRIPTS / "install_prefect_runtime.sh").read_text(encoding="utf-8")
    for contract in (
      'branch --show-current)" != "main"',
      "status --porcelain --untracked-files=all",
      'RELEASE_DIR="$RUNTIME_ROOT/releases/$GIT_SHA"',
      "sync --project \"$ETL_ROOT\" --frozen --no-dev",
      'if [[ "$installed_version" != "3.7.8" ]]',
      "AIOS_RUNTIME_ENV_GROUP",
      "AIOS_RUNTIME_ENV_OPERATOR_USER",
      "PREFECT_RUNTIME_PYTHON",
      "PREFECT_RUNTIME_PYTHON_VERSION",
      "PREFECT_RUNTIME_PYTHON_DIR",
      'runtime_python_source="runtime-managed"',
      'python install "$RUNTIME_PYTHON_VERSION" --no-bin',
      'python find "$RUNTIME_PYTHON_VERSION"',
      "UV_PYTHON_INSTALL_DIR",
      "UV_NO_MANAGED_PYTHON=1",
      "UV_PYTHON_DOWNLOADS=never",
      'runtime_python_target="$(readlink -f "$RELEASE_DIR/venv/bin/python")"',
      'runtime_python_full_version="$($RUNTIME_PYTHON -c',
      '"$runtime_python_full_version" != "$RUNTIME_PYTHON_VERSION"',
      'case "$runtime_python_target" in',
      '"$RUNUSER_BIN" --user "$SERVICE_USER"',
      'groupadd --system "$RUNTIME_ENV_GROUP"',
      'usermod --append --groups "$RUNTIME_ENV_GROUP" "$SERVICE_USER"',
      'usermod --append --groups "$RUNTIME_ENV_GROUP" "$RUNTIME_ENV_OPERATOR_USER"',
      'chown -R root:root "$RELEASE_DIR"',
      'chmod -R go-w "$RELEASE_DIR"',
      'mv -Tf "$TEMP_LINK" "$RUNTIME_ROOT/current"',
    ):
      self.assertIn(contract, source)

  def test_restore_verifier_is_hash_pinned_ephemeral_and_records_proof(self) -> None:
    source = (SCRIPTS / "verify_prefect_control_plane_restore.sh").read_text(encoding="utf-8")
    for contract in (
      'expected_sha256="$(awk',
      'actual_sha256="$(sha256sum "$dump_path"',
      '"$CREATEDB_BIN" "$restore_database"',
      '"$PG_RESTORE_BIN"',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      "to_regclass('public.flow_run') IS NOT NULL",
      '"$DROPDB_BIN" --if-exists "$restore_database"',
      'mv "$temporary_state" "$state_path"',
    ):
      self.assertIn(contract, source)
    self.assertNotIn('echo "$PREFECT_BACKUP_RESTORE_ADMIN_URL"', source)
    self.assertNotIn('- "$PREFECT_BACKUP_RESTORE_ADMIN_URL"', source)

    backup_source = (SCRIPTS / "backup_prefect_control_plane.sh").read_text(encoding="utf-8")
    self.assertNotIn('- "$PREFECT_API_DATABASE_CONNECTION_URL"', backup_source)


if __name__ == "__main__":
  unittest.main()
