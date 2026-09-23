from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

import requests

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from configure_marketing_content_tos_cors import load_env_file  # noqa: E402
from marketing_content_assets.tos_storage import TosStorageClient, TosStorageConfig  # noqa: E402


def main() -> None:
  parser = argparse.ArgumentParser(description="Smoke test browser-style signed PUT upload to TOS.")
  parser.add_argument("--env-file", default=".env.content-assets.local", help="本机私有 TOS env 文件。")
  parser.add_argument("--origin", default="http://localhost:3000", help="模拟浏览器 Origin。")
  parser.add_argument("--keep-object", action="store_true", help="保留烟测对象，默认上传后删除。")
  args = parser.parse_args()

  load_env_file(Path(args.env_file))
  storage = TosStorageClient(TosStorageConfig.from_env())
  object_key = f"tmp/content-assets-upload-smoke/{uuid.uuid4()}.mp4"
  content_type = "video/mp4"
  payload = b"content-assets signed put smoke\n"
  url = storage.presign_put_url(object_key, content_type, ttl_seconds=600)
  response = requests.put(
    url,
    data=payload,
    headers={
      "Content-Type": content_type,
      "Origin": args.origin,
    },
    timeout=60,
  )
  upload_ok = response.status_code in (200, 201)
  exists = storage.object_exists(object_key) if upload_ok else False
  deleted = False
  delete_error = ""
  if upload_ok and not args.keep_object:
    try:
      storage.delete_object(object_key)
      deleted = True
    except Exception as error:  # noqa: BLE001 - smoke 输出需要保留失败原因
      delete_error = str(error)

  print({
    "bucket": storage.config.bucket,
    "objectKey": object_key,
    "origin": args.origin,
    "uploadStatus": response.status_code,
    "allowOrigin": response.headers.get("Access-Control-Allow-Origin"),
    "allowMethods": response.headers.get("Access-Control-Allow-Methods"),
    "uploadOk": upload_ok,
    "objectExistsAfterUpload": exists,
    "deleted": deleted,
    "deleteError": delete_error,
  })
  if not upload_ok or not exists or (not args.keep_object and not deleted):
    raise SystemExit(1)


if __name__ == "__main__":
  main()
