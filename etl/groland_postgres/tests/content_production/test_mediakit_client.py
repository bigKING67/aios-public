"""Shared MediaKit client: task normalization, tool-name guard and rejection codes."""
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from content_production.mediakit_client import MediaKitClient, MediaKitError  # noqa: E402


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = MediaKitClient("fixture-key")
        self.requests = []

    def queue(self, *bodies):
        responses = [io.BytesIO(json.dumps(body).encode()) for body in bodies]

        def open_request(request, timeout):
            self.requests.append(request)
            response = responses.pop(0)
            response.__enter__ = lambda *_: response
            response.__exit__ = lambda *_: False
            return response
        self.client._opener = Mock(open=open_request)

    def test_submit_and_task_states(self):
        self.queue({"success": True, "task_id": "amk-tool-multi-track-edit-1"},
                   {"task_id": "amk-tool-multi-track-edit-1", "status": "completed", "result": {"duration": 2}},
                   {"success": False, "status": "failed", "error": {"code": "InputInvalid", "message": "private"}})
        self.assertEqual(self.client.submit_tool("multi-track-edit", {"client_token": "t"}), "amk-tool-multi-track-edit-1")
        self.assertTrue(self.requests[0].full_url.endswith("/api/v1/tools/multi-track-edit"))
        self.assertEqual(self.requests[0].get_header("Authorization"), "Bearer fixture-key")
        self.assertEqual(self.client.task("amk-tool-multi-track-edit-1"), {"status": "completed", "result": {"duration": 2}})
        self.assertEqual(self.client.task("amk-tool-multi-track-edit-1"), {"status": "failed", "errorCode": "InputInvalid"})

    def test_rejection_keeps_only_the_error_code_and_tool_names_are_guarded(self):
        self.queue({"success": False, "error": {"code": "InvalidParameter", "message": "secret detail"}})
        with self.assertRaises(MediaKitError) as caught:
            self.client.submit_tool("multi-track-edit", {})
        self.assertIn("InvalidParameter", str(caught.exception))
        self.assertNotIn("secret", str(caught.exception))
        for tool in ("../tasks", "multi_track", ""):
            with self.assertRaises(ValueError):
                self.client.submit_tool(tool, {})


if __name__ == "__main__":
    unittest.main()
