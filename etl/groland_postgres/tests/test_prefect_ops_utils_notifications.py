from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from prefect_ops_utils import send_feishu_notification  # noqa: E402


class _Response:
  def __enter__(self):
    return self

  def __exit__(self, exc_type, exc, traceback):
    del exc_type, exc, traceback
    return False

  def read(self) -> bytes:
    return b'{"code":0}'


class PrefectOpsNotificationTest(unittest.TestCase):
  def test_stable_english_statuses_use_failure_and_recovery_card_styles(self) -> None:
    payloads: list[dict] = []

    def fake_urlopen(request, timeout):
      self.assertEqual(timeout, 10)
      payloads.append(json.loads(request.data.decode("utf-8")))
      return _Response()

    with patch.dict("os.environ", {"FEISHU_RETRY_ATTEMPTS": "1"}, clear=True):
      with patch("prefect_ops_utils.urlopen", side_effect=fake_urlopen):
        self.assertTrue(send_feishu_notification(
          title="failure",
          table_name="prefect-control-plane",
          action="watchdog",
          status="failed",
          reason="worker offline",
          webhook_url="https://fixture.invalid/webhook",
          raise_on_error=True,
        ))
        self.assertTrue(send_feishu_notification(
          title="recovery",
          table_name="prefect-control-plane",
          action="watchdog",
          status="recovered",
          detail_lines=["healthy"],
          webhook_url="https://fixture.invalid/webhook",
          raise_on_error=True,
        ))

    self.assertEqual(payloads[0]["card"]["header"]["template"], "red")
    self.assertIn("失败原因", payloads[0]["card"]["elements"][2]["text"]["content"])
    self.assertEqual(payloads[1]["card"]["header"]["template"], "green")
    self.assertIn("✅ 成功", payloads[1]["card"]["elements"][0]["text"]["content"])


if __name__ == "__main__":
  unittest.main()
