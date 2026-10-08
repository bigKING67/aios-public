"""The container's independently installed pins must match the audited ETL lock."""
import tomllib
import unittest
from pathlib import Path


class WorkerDependencyClosureTests(unittest.TestCase):
    def test_container_pins_match_verified_lock(self):
        root = Path(__file__).resolve().parents[4]
        lock = tomllib.loads((root / "etl/groland_postgres/uv.lock").read_text())
        versions = {}
        for package in lock["package"]:
            versions.setdefault(package["name"], set()).add(package.get("version"))
        requirements = root / "docker/content-production/requirements.txt"
        for line in requirements.read_text().splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            name, version = line.split("==")
            with self.subTest(dependency=name):
                self.assertIn(version, versions.get(name, set()),
                              f"Worker dependency {line} must match the audited uv.lock")
