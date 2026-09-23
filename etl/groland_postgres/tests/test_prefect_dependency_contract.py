from __future__ import annotations

import re
import unittest
from pathlib import Path


ETL_ROOT = Path(__file__).resolve().parents[1]


class PrefectDependencyContractTest(unittest.TestCase):
  def test_pyproject_lock_and_patch_support_the_same_exact_version(self) -> None:
    pyproject = (ETL_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    lock = (ETL_ROOT / "uv.lock").read_text(encoding="utf-8")
    patch_source = (
      ETL_ROOT / "scripts" / "patch_prefect_sqlite_deployment_transactions.py"
    ).read_text(encoding="utf-8")

    self.assertIn('"prefect==3.7.8"', pyproject)
    self.assertRegex(
      lock,
      re.compile(r'name = "prefect"\nversion = "3\.7\.8"', re.MULTILINE),
    )
    self.assertIn('SUPPORTED_PREFECT_VERSIONS = {"3.7.8"}', patch_source)


if __name__ == "__main__":
  unittest.main()
