import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from content_production.benchmark import benchmark, load_cases, run_case, tree_rss_bytes


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source.mp4"
        self.source.write_bytes(b"unit-test-source")
        self.case = {"name": "first", "media": {"asset": str(self.source)}, "snapshot": {
            "title": "unit test", "aspect": "portrait", "assets": [
                {"assetId": "asset", "sha256": hashlib.sha256(self.source.read_bytes()).hexdigest()}],
            "clips": [{"assetId": "asset", "startMs": 0, "endMs": 1000, "caption": "", "volume": 1}]}}
        self.manifest = self.root / "manifest.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, cases):
        self.manifest.write_text(json.dumps({"schema": "aios.local-render-benchmark.v1", "cases": cases}))

    def test_freezes_input_digest_and_rejects_tampering_or_unsafe_names(self):
        self.write_manifest([self.case])
        cases, digest = load_cases(self.manifest)
        self.assertEqual(digest, hashlib.sha256(self.manifest.read_bytes()).hexdigest())
        self.assertEqual(cases[0]["name"], "first")
        self.source.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            load_cases(self.manifest)
        self.case["name"] = "../escape"
        self.write_manifest([self.case])
        with self.assertRaisesRegex(ValueError, "safe identifiers"):
            load_cases(self.manifest)

    def test_rejects_duplicate_cases_and_unbounded_duration(self):
        self.write_manifest([self.case, self.case])
        with self.assertRaisesRegex(ValueError, "unique"):
            load_cases(self.manifest)
        self.case["snapshot"]["clips"][0]["endMs"] = 121000
        self.write_manifest([self.case])
        with self.assertRaisesRegex(ValueError, "120 seconds"):
            load_cases(self.manifest)

    def test_resource_sampler_only_counts_owned_process_tree(self):
        self.assertEqual(tree_rss_bytes(10, "10 1 5\n11 10 7\n12 11 3\n20 1 999\n"), 15 * 1024)

    def test_source_change_while_queued_and_cancellation_never_render(self):
        self.write_manifest([self.case])
        cases, _ = load_cases(self.manifest)
        self.source.write_bytes(b"changed after admission")
        with patch("content_production.benchmark.render_local") as render:
            row = run_case(cases[0], self.root, self.root, time.monotonic(), threading.Event(), 10)
            self.assertEqual(row["status"], "failed")
            self.assertEqual(row["errorType"], "ValueError")
            cancelled = threading.Event()
            cancelled.set()
            self.case["name"] = "cancelled"
            row = run_case(self.case, self.root, self.root, time.monotonic(), cancelled, 10)
            self.assertEqual(row["status"], "cancelled")
            render.assert_not_called()

    def test_bounded_parallelism_keeps_failures_in_report_and_refuses_overwrite(self):
        self.write_manifest([{**self.case, "name": name} for name in ("first", "second", "failed")])
        active = maximum = 0
        lock = threading.Lock()
        def render(_module, _snapshot, _media, _project, work, _preview, tick):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
            try:
                time.sleep(0.03)
                tick()
                if work.name == "failed":
                    raise RuntimeError("sensitive-example-must-not-leak")
                video = work / "video.mp4"
                video.write_bytes(b"unit-test-output")
                return video, {}
            finally:
                with lock:
                    active -= 1
        with patch("content_production.benchmark.verify_module"), patch("content_production.benchmark.version", return_value="fixture"), \
                patch("content_production.benchmark.sample_resources"), \
                patch("content_production.benchmark.render_local", side_effect=render), \
                patch("content_production.benchmark.inspect_output", return_value={"status": "passed"}):
            output = self.root / "output"
            report = benchmark(self.manifest, self.root, output, 2, 10)
            self.assertEqual(maximum, 2)
            self.assertEqual(report["planned"], 3)
            self.assertEqual(report["counts"], {"passed": 2, "failed": 1, "cancelled": 0})
            self.assertEqual([r["name"] for r in report["cases"]], ["first", "second", "failed"])
            self.assertNotIn("sensitive-example", json.dumps(report))
            self.assertIn("50 qualified videos/day", report["unverified"])
            original = (output / "report.json").read_bytes()
            with self.assertRaises(FileExistsError):
                benchmark(self.manifest, self.root, output, 1, 10)
            self.assertEqual((output / "report.json").read_bytes(), original)
        with self.assertRaises(ValueError):
            benchmark(self.manifest, self.root, self.root / "invalid", 3, 10)

    def test_active_cancellation_and_timeout_keep_case_receipts(self):
        for outcome in ("cancelled", "timeout"):
            with self.subTest(outcome=outcome):
                case = {**self.case, "name": outcome}
                cancelled = threading.Event()
                with patch("content_production.benchmark.time.monotonic", return_value=100) as clock, \
                        patch("content_production.benchmark.inspect_output") as inspect:
                    def render(_module, _snapshot, _media, _project, _work, _preview, tick):
                        if outcome == "cancelled":
                            cancelled.set()
                        else:
                            clock.return_value = 111
                        tick()
                        self.fail("a cancelled or timed out render must stop")
                    with patch("content_production.benchmark.render_local", side_effect=render):
                        row = run_case(case, self.root, self.root, 100, cancelled, 10)
                    self.assertEqual(row["status"], "cancelled" if outcome == "cancelled" else "failed")
                    if outcome == "timeout":
                        self.assertEqual(row["errorType"], "TimeoutError")
                    self.assertEqual(json.loads((self.root / outcome / "measurement.json").read_text()), row)
                    inspect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
