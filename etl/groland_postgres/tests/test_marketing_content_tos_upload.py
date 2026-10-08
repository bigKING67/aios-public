"""TOS uploads: multipart with parallel parts, per-request retries, and a deadline."""
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import requests  # noqa: E402

from marketing_content_assets import tos_storage  # noqa: E402
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig, UploadTuning  # noqa: E402

CONFIG = TosStorageConfig("ak", "sk", "https://tos.example.com", "cn-shanghai", "bucket")


class FakeResponse:
  def __init__(self, status_code=200, text="", headers=None):
    self.status_code, self.text, self.headers = status_code, text, headers or {}


class FakeStore:
  """In-memory S3 subset shared by every session the client creates."""

  def __init__(self):
    self.lock = threading.Lock()
    self.objects, self.parts, self.calls = {}, {}, []
    self.fail_plan = {}  # (method, partNumber) -> list of exceptions/responses to emit first

  def session(self):
    store = self

    class Session:
      trust_env, verify = True, True

      def put(self, url, data=None, headers=None, timeout=None):
        return store.handle("PUT", url, data)

      def post(self, url, data=None, headers=None, timeout=None):
        return store.handle("POST", url, data)

      def delete(self, url, headers=None, timeout=None):
        return store.handle("DELETE", url, None)

    return Session()

  def handle(self, method, url, data):
    parts = urlsplit(url)
    key, query = parts.path.lstrip("/"), dict(parse_qsl(parts.query, keep_blank_values=True))
    with self.lock:
      self.calls.append((method, key, query))
      planned = self.fail_plan.get((method, query.get("partNumber")))
      if planned:
        outcome = planned.pop(0)
        if isinstance(outcome, Exception):
          raise outcome
        return outcome
    body = data.read() if hasattr(data, "read") else data
    with self.lock:
      if method == "POST" and "uploads" in query:
        return FakeResponse(text="<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>")
      if method == "PUT" and "partNumber" in query:
        self.parts[int(query["partNumber"])] = body
        return FakeResponse(headers={"ETag": f'"etag-{query["partNumber"]}"'})
      if method == "POST" and "uploadId" in query:
        numbers = [int(n) for n in tos_storage.re.findall(r"<PartNumber>(\d+)</PartNumber>", body.decode())]
        self.objects[key] = b"".join(self.parts[n] for n in numbers)
        return FakeResponse(text="<CompleteMultipartUploadResult/>")
      if method == "DELETE":
        return FakeResponse(204)
      self.objects[key] = body
      return FakeResponse(200)


class TosUploadTests(unittest.TestCase):
  def setUp(self):
    self.store = FakeStore()
    patcher = patch.object(tos_storage.requests, "Session", self.store.session)
    patcher.start()
    self.addCleanup(patcher.stop)
    sleep = patch.object(tos_storage.time, "sleep")
    sleep.start()
    self.addCleanup(sleep.stop)
    self.folder = tempfile.TemporaryDirectory()
    self.addCleanup(self.folder.cleanup)

  def file(self, payload: bytes) -> Path:
    path = Path(self.folder.name) / "video.mp4"
    path.write_bytes(payload)
    return path

  def client(self, **tuning):
    defaults = {"multipart_threshold_bytes": 10, "part_size_bytes": 4, "concurrency": 3, "attempts": 3, "deadline_seconds": 60}
    return TosStorageClient(CONFIG, UploadTuning(**{**defaults, **tuning}))

  def test_small_file_is_a_single_put(self):
    self.client().upload_file("preview/a.mp4", self.file(b"tiny"), "video/mp4")
    self.assertEqual(self.store.objects["preview/a.mp4"], b"tiny")
    self.assertEqual([c[0] for c in self.store.calls], ["PUT"])

  def test_large_file_uploads_parts_in_order_and_completes(self):
    payload = bytes(range(23))
    self.client().upload_file("preview/b.mp4", self.file(payload), "video/mp4")
    self.assertEqual(self.store.objects["preview/b.mp4"], payload)
    self.assertEqual(sorted(self.store.parts), [1, 2, 3, 4, 5, 6])
    self.assertEqual(len(self.store.parts[6]), 3)

  def test_failed_part_is_retried(self):
    self.store.fail_plan[("PUT", "2")] = [requests.ConnectionError("reset"), FakeResponse(503, "busy")]
    payload = bytes(range(12))
    self.client().upload_file("preview/c.mp4", self.file(payload), "video/mp4")
    self.assertEqual(self.store.objects["preview/c.mp4"], payload)
    self.assertEqual(sum(1 for m, _, q in self.store.calls if m == "PUT" and q.get("partNumber") == "2"), 3)

  def test_exhausted_part_aborts_the_upload(self):
    self.store.fail_plan[("PUT", "1")] = [requests.Timeout("slow")] * 3
    with self.assertRaisesRegex(RuntimeError, "part=1 Timeout"):
      self.client().upload_file("preview/d.mp4", self.file(bytes(12)), "video/mp4")
    self.assertIn(("DELETE", "preview/d.mp4", {"uploadId": "up-1"}), self.store.calls)
    self.assertNotIn("preview/d.mp4", self.store.objects)

  def test_client_errors_are_not_retried(self):
    self.store.fail_plan[("PUT", None)] = [FakeResponse(403, "denied")]
    with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
      self.client().upload_file("cover/e.webp", self.file(b"tiny"), "image/webp")
    self.assertEqual(len(self.store.calls), 1)

  def test_deadline_stops_before_sending(self):
    with self.assertRaisesRegex(RuntimeError, "超过上传时限"):
      self.client(deadline_seconds=0).upload_file("cover/f.webp", self.file(b"tiny"), "image/webp")
    self.assertEqual(self.store.calls, [])

  def test_env_tuning_is_validated(self):
    with patch.dict("os.environ", {"TOS_UPLOAD_CONCURRENCY": "6", "TOS_UPLOAD_PART_SIZE_MB": "10"}):
      tuning = UploadTuning.from_env()
    self.assertEqual((tuning.concurrency, tuning.part_size_bytes), (6, 10 * tos_storage.MB))
    with patch.dict("os.environ", {"TOS_UPLOAD_PART_SIZE_MB": "1"}):
      with self.assertRaisesRegex(RuntimeError, "TOS_UPLOAD_PART_SIZE_MB"):
        UploadTuning.from_env()


if __name__ == "__main__":
  unittest.main()
