import logging
import os
import unittest
from unittest.mock import Mock, patch

import requests
from content_production import daily_remix_scheduler as scheduler


class DailyRemixSchedulerTests(unittest.TestCase):
    def test_disabled_never_connects(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(requests, "Session") as session:
            self.assertEqual(scheduler.execute(logging.getLogger(__name__)), {"status": "disabled"})
            session.assert_not_called()

    def test_service_configuration_rejects_credential_urls_and_external_http(self):
        values = {"CONTENT_AI_STUDIO_DAILY_REMIX_ENABLED": "true", "CONTENT_AI_STUDIO_DAILY_REMIX_TOKEN": "x" * 32}
        with patch.dict(os.environ, values, clear=True):
            self.assertEqual(scheduler.configuration()[0], "http://127.0.0.1:8000")
            for url in ["http://external.test", "https://u:p@example.test", "https://example.test/?token=x"]:
                with patch.dict(os.environ, {"CONTENT_AI_STUDIO_DAILY_REMIX_API_URL": url}):
                    with self.assertRaises(ValueError):
                        scheduler.configuration()

    def test_dispatch_uses_day_identity_and_never_redirects_or_logs_response_body(self):
        session = Mock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {"date": "2026-10-30", "status": "running"}
        scheduler.dispatch_once(session, "https://api.test", "fixture", "2026-10-30")
        self.assertFalse(session.post.call_args.kwargs["allow_redirects"])
        self.assertEqual(session.post.call_args.kwargs["json"], {"date": "2026-10-30"})
        session.post.return_value.status_code = 302
        with self.assertRaisesRegex(RuntimeError, "HTTP 302"):
            scheduler.dispatch_once(session, "https://api.test", "fixture", "2026-10-30")

    def test_ambiguous_timeout_resumes_same_date_and_pause_is_resumable(self):
        call = Mock(side_effect=[requests.Timeout(), {"status": "paused"}, {"status": "running"}, {"status": "done"}])
        result = scheduler.run_day(call, date="2026-10-30", logger=Mock(), sleep=Mock(), current_date=lambda: "2026-10-30")
        self.assertEqual(result["status"], "done")
        self.assertEqual([args.args for args in call.call_args_list], [("2026-10-30",)] * 4)

    def test_day_change_and_repeated_transport_failures_are_bounded(self):
        call = Mock()
        result = scheduler.run_day(call, date="2026-10-30", logger=Mock(), sleep=Mock(), current_date=lambda: "2026-10-31")
        self.assertEqual(result["schedulerStop"], "day_changed")
        call.assert_not_called()
        call.side_effect = requests.ConnectionError()
        with self.assertRaisesRegex(RuntimeError, "three polls"):
            scheduler.run_day(call, date="2026-10-30", logger=Mock(), sleep=Mock(), current_date=lambda: "2026-10-30")
        self.assertEqual(call.call_count, 3)
