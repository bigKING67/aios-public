from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable, List

import requests

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig  # noqa: E402


DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5173",
]

DEFAULT_METHODS = ["GET", "HEAD", "PUT", "POST"]
DEFAULT_EXPOSE_HEADERS = ["ETag", "x-amz-request-id", "x-tos-request-id", "x-tos-id-2"]


def main() -> None:
  parser = argparse.ArgumentParser(description="Configure/check TOS CORS for marketing content asset browser uploads.")
  parser.add_argument("--env-file", default=".env.content-assets.local", help="本机私有 TOS env 文件。")
  parser.add_argument("--origin", action="append", default=[], help="额外允许的前端 Origin，可重复传入。")
  parser.add_argument("--apply", action="store_true", help="写入 Bucket CORS；默认只读取并打印计划。")
  parser.add_argument("--check-preflight", action="store_true", help="写入/读取后执行 OPTIONS 预检验证。")
  args = parser.parse_args()

  load_env_file(Path(args.env_file))
  origins = unique([*DEFAULT_ORIGINS, *split_env_list(os.getenv("CONTENT_ASSET_TOS_CORS_ORIGINS")), *args.origin])
  storage = TosStorageClient(TosStorageConfig.from_env())
  current_xml = storage.get_bucket_cors()
  desired_xml = build_cors_xml(origins)
  current_summary = summarize_cors(current_xml)
  desired_summary = {
    "origins": origins,
    "methods": DEFAULT_METHODS,
    "allowedHeaders": ["*"],
    "exposeHeaders": DEFAULT_EXPOSE_HEADERS,
    "maxAgeSeconds": 3600,
  }
  needs_update = not cors_contains_required(current_xml, origins, DEFAULT_METHODS)

  print("TOS bucket:", storage.config.bucket)
  print("TOS endpoint:", storage.config.endpoint)
  print("currentCors:", current_summary)
  print("desiredCors:", desired_summary)
  print("needsUpdate:", needs_update)

  if args.apply:
    if needs_update:
      storage.put_bucket_cors(desired_xml)
      print("applied: true")
    else:
      print("applied: false")
  else:
    print("applied: false")
    print("hint: add --apply to write this CORS config")

  if args.check_preflight:
    for origin in origins[:]:
      result = check_preflight(storage, origin)
      print(f"preflight[{origin}]: {result}")


def load_env_file(path: Path) -> None:
  if not path.exists():
    return
  for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if key and key not in os.environ:
      os.environ[key] = value


def split_env_list(value: str | None) -> List[str]:
  if not value:
    return []
  return [item.strip() for item in value.split(",") if item.strip()]


def unique(values: Iterable[str]) -> List[str]:
  seen = set()
  result = []
  for value in values:
    if value and value not in seen:
      seen.add(value)
      result.append(value)
  return result


def build_cors_xml(origins: List[str]) -> str:
  root = ET.Element("CORSConfiguration")
  rule = ET.SubElement(root, "CORSRule")
  for origin in origins:
    ET.SubElement(rule, "AllowedOrigin").text = origin
  for method in DEFAULT_METHODS:
    ET.SubElement(rule, "AllowedMethod").text = method
  ET.SubElement(rule, "AllowedHeader").text = "*"
  for header in DEFAULT_EXPOSE_HEADERS:
    ET.SubElement(rule, "ExposeHeader").text = header
  ET.SubElement(rule, "MaxAgeSeconds").text = "3600"
  return ET.tostring(root, encoding="unicode")


def summarize_cors(cors_xml: str) -> dict:
  if not cors_xml.strip():
    return {"configured": False}
  try:
    root = ET.fromstring(cors_xml)
  except ET.ParseError:
    return {"configured": True, "parseable": False}
  return {
    "configured": True,
    "origins": sorted(set(find_texts(root, "AllowedOrigin"))),
    "methods": sorted(set(find_texts(root, "AllowedMethod"))),
    "allowedHeaders": sorted(set(find_texts(root, "AllowedHeader"))),
    "exposeHeaders": sorted(set(find_texts(root, "ExposeHeader"))),
  }


def cors_contains_required(cors_xml: str, origins: List[str], methods: List[str]) -> bool:
  if not cors_xml.strip():
    return False
  try:
    root = ET.fromstring(cors_xml)
  except ET.ParseError:
    return False
  current_origins = set(find_texts(root, "AllowedOrigin"))
  current_methods = set(find_texts(root, "AllowedMethod"))
  current_headers = set(find_texts(root, "AllowedHeader"))
  return set(origins).issubset(current_origins) and set(methods).issubset(current_methods) and "*" in current_headers


def find_texts(root: ET.Element, name: str) -> List[str]:
  values: List[str] = []
  for item in root.iter():
    if local_name(item.tag) == name and item.text:
      values.append(item.text.strip())
  return [value for value in values if value]


def local_name(tag: str) -> str:
  return tag.rsplit("}", 1)[-1]


def check_preflight(storage: TosStorageClient, origin: str) -> dict:
  host = storage.config.endpoint.strip().replace("https://", "").replace("http://", "").strip("/")
  if not host.startswith(f"{storage.config.bucket}."):
    host = f"{storage.config.bucket}.{host}"
  url = f"https://{host}/raw/cors-preflight-smoke.txt"
  response = requests.options(
    url,
    headers={
      "Origin": origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
    timeout=20,
  )
  return {
    "status": response.status_code,
    "allowOrigin": response.headers.get("Access-Control-Allow-Origin"),
    "allowMethods": response.headers.get("Access-Control-Allow-Methods"),
    "allowHeaders": response.headers.get("Access-Control-Allow-Headers"),
  }


if __name__ == "__main__":
  main()
