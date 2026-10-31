"""Copy derived objects (DERIVED_KEY_PREFIXES) from the main bucket into TOS_DERIVED_BUCKET.

  python -m marketing_content_assets.migrate_derived_objects [--apply] [--delete-source]

Default is a dry run that lists what would move. `--apply` copies server-side (CopyObject) and
verifies size and ETag on the target; `--delete-source` additionally deletes each source object
whose verified copy exists (run it only after the API and workers read from the derived bucket).
Prints counts only, never object contents or credentials.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from dataclasses import replace
from urllib.parse import quote

from .tos_storage import DERIVED_KEY_PREFIXES, TosStorageClient, TosStorageConfig

_CONTENTS = re.compile(r"<Contents>(.*?)</Contents>", re.S)


def _tag(block, name):
  """Text of the first `<name>` element, XML entities decoded (ETags arrive as &quot;...&quot;)."""
  match = re.search(f"<{name}>(.*?)</{name}>", block, re.S)
  return html.unescape(match.group(1)) if match else ""


def list_objects(client, prefix):
  """[(key, size, etag)] under `prefix` in the client's main bucket (ListObjectsV2, paged)."""
  token, items = "", []
  while True:
    query = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
    if token:
      query["continuation-token"] = token
    url, headers = client._signed_url_and_headers("GET", "", {}, query_params=query)
    response = client.session.get(url, headers=headers, timeout=60)
    if response.status_code != 200:
      raise RuntimeError(f"list {prefix} failed HTTP {response.status_code}")
    for block in _CONTENTS.findall(response.text):
      items.append((_tag(block, "Key"), int(_tag(block, "Size") or 0), _tag(block, "ETag").strip('"')))
    token = _tag(response.text, "NextContinuationToken")
    if _tag(response.text, "IsTruncated") != "true" or not token:
      return items


def head(client, key):
  """(size, etag) of `key` in the bucket `key` routes to, or None when missing."""
  url, headers = client._signed_url_and_headers("HEAD", key, {})
  response = client.session.head(url, headers=headers, timeout=30)
  if response.status_code == 404:
    return None
  if response.status_code != 200:
    raise RuntimeError(f"HEAD failed HTTP {response.status_code}")
  return int(response.headers.get("Content-Length") or 0), (response.headers.get("ETag") or "").strip('"')


def copy(client, source_bucket, key):
  source = f"/{source_bucket}/{quote(key, safe='/~')}"
  url, headers = client._signed_url_and_headers("PUT", key, {"x-amz-copy-source": source})
  response = client.session.put(url, headers=headers, timeout=120)
  if response.status_code != 200 or "<Error>" in response.text:
    raise RuntimeError(f"copy failed HTTP {response.status_code}")


def main(argv=None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--apply", action="store_true")
  parser.add_argument("--delete-source", action="store_true")
  args = parser.parse_args(argv)
  config = TosStorageConfig.from_env()
  if not config.derived_bucket or config.derived_bucket == config.bucket:
    print("TOS_DERIVED_BUCKET is not set to a separate bucket; nothing to do", file=sys.stderr)
    return 2
  routed = TosStorageClient(config)  # derived keys resolve to the derived bucket
  source = TosStorageClient(replace(config, derived_bucket=""))  # everything resolves to the main bucket
  totals = {"listed": 0, "bytes": 0, "copied": 0, "present": 0, "deleted": 0, "failed": 0}
  for prefix in DERIVED_KEY_PREFIXES:
    for key, size, etag in list_objects(source, prefix):
      totals["listed"] += 1
      totals["bytes"] += size
      if not args.apply:
        continue
      try:
        target = head(routed, key)
        if target is None:
          copy(routed, config.bucket, key)
          target = head(routed, key)
          totals["copied"] += 1
        else:
          totals["present"] += 1
        if target is None or target[0] != size or (etag and target[1] and target[1] != etag):
          raise RuntimeError("copy does not match the source")
        if args.delete_source:
          source.delete_object(key)
          totals["deleted"] += 1
      except Exception as error:  # noqa: BLE001 - count and continue; the source stays in place
        totals["failed"] += 1
        print(f"[migrate-derived] {prefix} object failed: {type(error).__name__}", file=sys.stderr)
  print(totals, flush=True)
  return 1 if totals["failed"] else 0


if __name__ == "__main__":
  sys.exit(main())
