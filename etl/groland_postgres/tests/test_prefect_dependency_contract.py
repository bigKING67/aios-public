from __future__ import annotations

import re
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ETL_ROOT = Path(__file__).resolve().parents[1]


class PrefectDependencyContractTest(unittest.TestCase):
  def test_server_places_ui_cache_in_writable_state_and_preserves_override(self) -> None:
    with tempfile.TemporaryDirectory() as temporary:
      root = Path(temporary)
      probe = root / "prefect-probe"
      probe.write_text('#!/bin/bash\nset -eu\nprintf "%s" "$PREFECT_UI_STATIC_DIRECTORY"\ntest -w "$PREFECT_UI_STATIC_DIRECTORY"\n')
      probe.chmod(0o755)
      for override in (None, str(root / "custom-ui")):
        with self.subTest(override=override):
          env = {**os.environ, "PROJECT_ROOT": str(root), "PREFECT_HOME": str(root / "state"),
                 "PYTHON_BIN": "/usr/bin/true", "PREFECT_BIN": str(probe)}
          env.pop("PREFECT_UI_STATIC_DIRECTORY", None)
          if override is not None:
            env["PREFECT_UI_STATIC_DIRECTORY"] = override
          result = subprocess.run(["bash", str(ETL_ROOT / "scripts/start_prefect_server.sh")],
                                  env=env, text=True, capture_output=True, check=True)
          self.assertEqual(result.stdout, override or str(root / "state/ui-static"))

  def test_pyproject_lock_and_patch_support_the_same_exact_version(self) -> None:
    pyproject = (ETL_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    lock = (ETL_ROOT / "uv.lock").read_text(encoding="utf-8")
    patch_source = (
      ETL_ROOT / "scripts" / "patch_prefect_sqlite_deployment_transactions.py"
    ).read_text(encoding="utf-8")

    self.assertIn('"prefect==3.8.8"', pyproject)
    self.assertRegex(
      lock,
      re.compile(r'name = "prefect"\nversion = "3\.8\.8"', re.MULTILINE),
    )
    self.assertIn('SUPPORTED_PREFECT_VERSIONS = {"3.8.8"}', patch_source)

  def test_upstream_readiness_transactions_need_no_local_patch(self) -> None:
    import prefect
    import sys
    sys.path.insert(0, str(ETL_ROOT / "scripts"))
    from patch_prefect_sqlite_deployment_transactions import patch_source

    source = (Path(prefect.__file__).parent / "server/models/deployments.py").read_text()
    patched, changed = patch_source(source)
    self.assertEqual(changed, ())
    self.assertEqual(patched, source)


if __name__ == "__main__":
  unittest.main()
