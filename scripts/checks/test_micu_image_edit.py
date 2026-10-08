"""Offline contract tests for the bounded paid-image pilot command."""
import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "micu_edit", Path(__file__).parents[1] / "ops/micu-image-edit.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EditContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.image = self.root / "input.png"
        self.image.write_bytes(b"fixture")
        self.config = {"api_key": "test-only"}
        self.info = {"codec_name": "png", "width": 720, "height": 1280}

    def call(self):
        return module.edit(self.config, self.image, "remove caption", self.root / "attempt",
                           "gpt-image-2.5-flare", "720x1280")

    def test_actual_dimensions_and_no_duplicate_submit(self):
        response = Mock(status_code=200)
        response.json.return_value = {"data": [{"b64_json": base64.b64encode(b"png").decode()}]}
        with patch.object(module, "probe", side_effect=[self.info, dict(self.info, width=768), self.info]), \
                patch.object(module.requests, "post", return_value=response) as post:
            result = self.call()
            self.assertFalse(result["sizeMatches"])
            self.assertIsNone(result["modelMatches"])
            self.assertEqual(post.call_args.kwargs["data"]["model"], "gpt-image-2.5-flare")
            self.assertFalse(post.call_args.kwargs["allow_redirects"])
            with self.assertRaises(FileExistsError):
                self.call()
            self.assertEqual(post.call_count, 1)

    def test_timeout_is_unknown_without_retry(self):
        with patch.object(module, "probe", return_value=self.info), \
                patch.object(module.requests, "post", side_effect=module.requests.Timeout) as post:
            self.assertEqual(self.call()["status"], "unknown_requires_reconciliation")
            self.assertEqual(post.call_count, 1)

    def test_url_only_response_does_not_resubmit_or_fetch(self):
        response = Mock(status_code=200)
        response.json.return_value = {"data": [{"url": "https://invalid.example/image"}]}
        with patch.object(module, "probe", return_value=self.info), \
                patch.object(module.requests, "post", return_value=response) as post:
            self.assertEqual(self.call()["status"], "invalid_response")
            self.assertEqual(post.call_count, 1)

    def test_old_model_rejected_before_network(self):
        with patch.object(module.requests, "post") as post:
            with self.assertRaises(ValueError):
                module.edit(self.config, self.image, "edit", self.root / "attempt", "gpt-image-2", "auto")
            post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
