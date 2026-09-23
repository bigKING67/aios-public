import os
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import unittest
from unittest.mock import patch

from content_production.execution import build_spec, renderer_env, verify_module


class ExecutionTests(unittest.TestCase):
    def test_vendored_renderer_preserves_locked_source_bytes(self):
        repo = Path(__file__).resolve().parents[4]
        lock = json.loads((repo / "etl/groland_postgres/scripts/content_production/creative-craft.lock.json").read_text())
        for name, expected in lock["files"].items():
            with self.subTest(file=name):
                vendor = repo / "docker/content-production/renderer" / name
                self.assertFalse(vendor.is_symlink())
                self.assertEqual(hashlib.sha256(vendor.read_bytes()).hexdigest(), expected)

    def test_precise_cut_and_source_timed_caption(self):
        snapshot = {"aspect": "portrait", "title": "剪辑", "assets": [{"assetId": "abc"}],
                    "clips": [{"assetId": "abc", "startMs": 1200, "endMs": 2345, "volume": 0, "caption": "台词"}]}
        spec = build_spec(snapshot, {"abc": Path("/fixture.mp4")}, "demo")
        self.assertEqual(spec["clips"][0]["frames"], 34)
        self.assertEqual(spec["clips"][0]["in_seconds"], 1.2)
        self.assertEqual(spec["clips"][0]["captions"][0]["from"], 1.2)
        self.assertEqual(spec["clips"][0]["volume"], 0)
        self.assertEqual(spec["canvas"]["width"], 720)

    def test_renderer_does_not_receive_service_credentials(self):
        with patch.dict(os.environ, {"DATABASE_URL": "secret", "TOS_SECRET_ACCESS_KEY": "secret", "NODE_OPTIONS": "--inspect", "HOME": "/private"}):
            env = renderer_env(Path("/isolated"))
        self.assertNotIn("DATABASE_URL", env)
        self.assertNotIn("TOS_SECRET_ACCESS_KEY", env)
        self.assertNotIn("NODE_OPTIONS", env)
        self.assertEqual(env["HOME"], "/isolated")

    def test_missing_module_fails_closed(self):
        with self.assertRaises(RuntimeError):
            verify_module(Path("/missing-creative-craft-fixture"))
