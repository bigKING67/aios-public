import inspect
import json
import unittest
from pathlib import Path

from routes import articles
from utils import rss_poller


class ProvenanceTests(unittest.TestCase):
    def test_upstream_lock_pins_reviewed_v170_source_and_image(self):
        lock = json.loads(
            Path("/opt/aios-derived/upstream.lock.json").read_text(encoding="utf-8")
        )
        self.assertEqual(lock["tag"], "v1.7.0")
        self.assertEqual(
            lock["commit"],
            "fd70a886a82a8838312e2439bb0eed1c2e1ad00b",
        )
        self.assertEqual(
            lock["image"],
            "tmwgsicp/wechat-download-api@sha256:6977f00af2334af4a8dc9ed19d0a82a5214fd4eca4d1c724f7d14b1299cc66ec",
        )
        self.assertEqual(lock["license"], "AGPL-3.0-only")
        self.assertEqual(
            lock["license_sha256"],
            "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0",
        )
        self.assertEqual(len(lock["upstream_file_sha256"]), 5)

    def test_list_consumers_do_not_contain_direct_httpx_client(self):
        route_source = inspect.getsource(articles)
        rss_source = inspect.getsource(rss_poller)
        self.assertIn("fetch_article_list_payload", route_source)
        self.assertIn("fetch_article_list_payload", rss_source)
        self.assertNotIn("httpx.AsyncClient", route_source)
        self.assertNotIn("httpx.AsyncClient", rss_source)


if __name__ == "__main__":
    unittest.main()
