from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from patch_prefect_sqlite_deployment_transactions import (  # noqa: E402
  PrefectPatchError,
  TARGET_FUNCTIONS,
  apply_configured_patch,
  configured_database_backend,
  patch_source,
)


def _fixture_source() -> str:
  return '''\
async def mark_deployments_ready():
    async with db.session_context(
        begin_transaction=True,
    ) as session:
        return None


async def unrelated():
    async with db.session_context(
        begin_transaction=True,
    ) as session:
        return session


async def mark_deployments_not_ready():
    try:
        async with db.session_context(
            begin_transaction=True,
        ) as session:
            return None
    except Exception:
        return None
'''


class PrefectSqliteDeploymentTransactionPatchTest(unittest.TestCase):
  def test_patches_only_reviewed_readiness_functions(self) -> None:
    source = _fixture_source()

    patched, changed = patch_source(source)

    self.assertEqual(changed, TARGET_FUNCTIONS)
    self.assertEqual(patched.count("with_for_update=True"), 2)
    self.assertIn(
      "async def unrelated():\n"
      "    async with db.session_context(\n"
      "        begin_transaction=True,\n"
      "    ) as session:",
      patched,
    )

  def test_is_idempotent(self) -> None:
    source, first_changed = patch_source(_fixture_source())
    self.assertEqual(first_changed, TARGET_FUNCTIONS)

    patched, changed = patch_source(source)

    self.assertEqual(patched, source)
    self.assertEqual(changed, ())

  def test_rejects_missing_or_drifted_function(self) -> None:
    source = "async def mark_deployments_ready():\n    return None\n"

    with self.assertRaises(PrefectPatchError):
      patch_source(source)

  def test_backend_contract_skips_postgresql_without_importing_prefect(self) -> None:
    with patch(
      "patch_prefect_sqlite_deployment_transactions.apply_installed_patch"
    ) as apply_patch:
      target, changed, backend = apply_configured_patch(
        "postgresql+asyncpg://prefect@db/aios_prefect?ssl=disable"
      )

    self.assertIsNone(target)
    self.assertEqual(changed, ())
    self.assertEqual(backend, "postgresql")
    apply_patch.assert_not_called()

  def test_backend_contract_rejects_libpq_sslmode_for_asyncpg(self) -> None:
    with self.assertRaisesRegex(PrefectPatchError, "must use ssl="):
      configured_database_backend(
        "postgresql+asyncpg://prefect@db/aios_prefect?sslmode=disable"
      )

  def test_backend_contract_defaults_to_sqlite_and_rejects_unknown_scheme(self) -> None:
    with patch.dict("os.environ", {}, clear=True):
      self.assertEqual(configured_database_backend(), "sqlite")
    self.assertEqual(configured_database_backend("sqlite+aiosqlite:///prefect.db"), "sqlite")
    with self.assertRaisesRegex(PrefectPatchError, "unsupported Prefect database backend"):
      configured_database_backend("mysql+asyncmy://prefect@db/prefect")


if __name__ == "__main__":
  unittest.main()
