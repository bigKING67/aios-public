import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from marketing_content_assets import migrate_derived_objects as migrate  # noqa: E402


class Response:
  def __init__(self, text):
    self.status_code, self.text = 200, text


class Client:
  def __init__(self, pages):
    self.pages, self.queries = list(pages), []
    self.session = self

  def _signed_url_and_headers(self, method, key, headers, query_params=None):
    self.queries.append(dict(query_params or {}))
    return "https://media.example/", {}

  def get(self, url, headers=None, timeout=None):
    return Response(self.pages.pop(0))


class ListObjectsTests(unittest.TestCase):
  def test_listing_pages_and_decodes_escaped_etags(self):
    first = ("<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t1</NextContinuationToken>"
             "<Contents><Key>cover/a.webp</Key><Size>10</Size><ETag>&quot;abc&quot;</ETag></Contents></ListBucketResult>")
    second = ("<ListBucketResult><IsTruncated>false</IsTruncated>"
              "<Contents><Key>cover/b &amp; c.webp</Key><Size>20</Size><ETag>\"def\"</ETag></Contents></ListBucketResult>")
    client = Client([first, second])
    self.assertEqual(migrate.list_objects(client, "cover/"), [("cover/a.webp", 10, "abc"), ("cover/b & c.webp", 20, "def")])
    self.assertEqual(client.queries[1]["continuation-token"], "t1")


if __name__ == "__main__":
  unittest.main()
