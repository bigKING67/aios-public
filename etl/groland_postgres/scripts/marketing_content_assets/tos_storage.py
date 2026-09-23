from __future__ import annotations

import hashlib
import hmac
import mimetypes
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Mapping, Tuple

import requests


@dataclass(frozen=True)
class TosStorageConfig:
  access_key_id: str
  secret_access_key: str
  endpoint: str
  region: str
  bucket: str

  @classmethod
  def from_env(cls) -> "TosStorageConfig":
    access_key_id = (os.getenv("TOS_ACCESS_KEY_ID") or "").strip()
    secret_access_key = (os.getenv("TOS_SECRET_ACCESS_KEY") or "").strip()
    if not access_key_id or not secret_access_key:
      raise RuntimeError("缺少 TOS_ACCESS_KEY_ID/TOS_SECRET_ACCESS_KEY，无法上传对象存储")
    return cls(
      access_key_id=access_key_id,
      secret_access_key=secret_access_key,
      endpoint=(os.getenv("TOS_ENDPOINT") or "https://tos-s3-cn-shanghai.volces.com").strip(),
      region=(os.getenv("TOS_REGION") or "cn-shanghai").strip(),
      bucket=(os.getenv("TOS_BUCKET") or "aios-content-assets").strip(),
    )


class TosStorageClient:
  def __init__(self, config: TosStorageConfig):
    self.config = config
    self.session = requests.Session()

  def upload_file(self, object_key: str, path: Path, content_type: str = "") -> None:
    content_type = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    url, headers = self._signed_url_and_headers("PUT", object_key, {"content-type": content_type})
    with path.open("rb") as file_obj:
      response = self.session.put(url, data=file_obj, headers=headers, timeout=300)
    if response.status_code not in (200, 201):
      raise RuntimeError(f"TOS 上传失败 key={object_key} HTTP {response.status_code}: {response.text[:240]}")

  def get_bucket_cors(self) -> str:
    url, headers = self._signed_url_and_headers("GET", "", {}, query_params={"cors": ""})
    response = self.session.get(url, headers=headers, timeout=30)
    if response.status_code == 404:
      return ""
    if response.status_code != 200:
      raise RuntimeError(f"TOS 读取 Bucket CORS 失败 HTTP {response.status_code}: {response.text[:240]}")
    return response.text

  def put_bucket_cors(self, cors_xml: str) -> None:
    url, headers = self._signed_url_and_headers(
      "PUT",
      "",
      {"content-type": "application/xml"},
      query_params={"cors": ""},
    )
    response = self.session.put(url, data=cors_xml.encode("utf-8"), headers=headers, timeout=30)
    if response.status_code not in (200, 204):
      raise RuntimeError(f"TOS 写入 Bucket CORS 失败 HTTP {response.status_code}: {response.text[:240]}")

  def presign_put_url(self, object_key: str, content_type: str, ttl_seconds: int = 600) -> str:
    host = _virtual_host(self.config.endpoint, self.config.bucket)
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    credential_scope = f"{date_stamp}/{self.config.region}/s3/aws4_request"
    credential = f"{self.config.access_key_id}/{credential_scope}"
    signed_headers = "content-type;host"
    canonical_uri = f"/{_quote_path(object_key)}"
    canonical_query = _canonical_query({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amz_date,
      "X-Amz-Expires": str(ttl_seconds),
      "X-Amz-SignedHeaders": signed_headers,
    })
    canonical_headers = f"content-type:{content_type.strip()}\nhost:{host}\n"
    canonical_request = "\n".join([
      "PUT",
      canonical_uri,
      canonical_query,
      canonical_headers,
      signed_headers,
      "UNSIGNED-PAYLOAD",
    ])
    string_to_sign = "\n".join([
      "AWS4-HMAC-SHA256",
      amz_date,
      credential_scope,
      hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = hmac.new(
      _signing_key(self.config.secret_access_key, date_stamp, self.config.region),
      string_to_sign.encode("utf-8"),
      hashlib.sha256,
    ).hexdigest()
    return f"https://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"

  def presign_get_url(self, object_key: str, ttl_seconds: int = 600, response_content_type: str = "") -> str:
    host = _virtual_host(self.config.endpoint, self.config.bucket)
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    credential_scope = f"{date_stamp}/{self.config.region}/s3/aws4_request"
    credential = f"{self.config.access_key_id}/{credential_scope}"
    signed_headers = "host"
    canonical_uri = f"/{_quote_path(object_key)}"
    query_params = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amz_date,
      "X-Amz-Expires": str(ttl_seconds),
      "X-Amz-SignedHeaders": signed_headers,
    }
    if response_content_type.strip():
      query_params["response-content-type"] = response_content_type.strip()
    canonical_query = _canonical_query(query_params)
    canonical_headers = f"host:{host}\n"
    canonical_request = "\n".join([
      "GET",
      canonical_uri,
      canonical_query,
      canonical_headers,
      signed_headers,
      "UNSIGNED-PAYLOAD",
    ])
    string_to_sign = "\n".join([
      "AWS4-HMAC-SHA256",
      amz_date,
      credential_scope,
      hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = hmac.new(
      _signing_key(self.config.secret_access_key, date_stamp, self.config.region),
      string_to_sign.encode("utf-8"),
      hashlib.sha256,
    ).hexdigest()
    return f"https://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"

  def download_file(self, object_key: str, target_path: Path) -> None:
    url, headers = self._signed_url_and_headers("GET", object_key, {})
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with self.session.get(url, headers=headers, stream=True, timeout=300) as response:
      if response.status_code != 200:
        raise RuntimeError(f"TOS 下载失败 key={object_key} HTTP {response.status_code}: {response.text[:240]}")
      with target_path.open("wb") as file_obj:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
          if chunk:
            file_obj.write(chunk)

  def object_exists(self, object_key: str) -> bool:
    url, headers = self._signed_url_and_headers("HEAD", object_key, {})
    response = self.session.head(url, headers=headers, timeout=30)
    if response.status_code == 200:
      return True
    if response.status_code == 404:
      return False
    raise RuntimeError(f"TOS HEAD 失败 key={object_key} HTTP {response.status_code}: {response.text[:240]}")

  def delete_object(self, object_key: str) -> None:
    url, headers = self._signed_url_and_headers("DELETE", object_key, {})
    response = self.session.delete(url, headers=headers, timeout=30)
    if response.status_code not in (200, 204):
      raise RuntimeError(f"TOS 删除失败 key={object_key} HTTP {response.status_code}: {response.text[:240]}")

  def _signed_url_and_headers(
    self,
    method: str,
    object_key: str,
    signed_headers: Dict[str, str],
    query_params: Mapping[str, str] | None = None,
  ) -> Tuple[str, Dict[str, str]]:
    host = _virtual_host(self.config.endpoint, self.config.bucket)
    canonical_uri = f"/{_quote_path(object_key)}"
    canonical_query = _canonical_query(query_params or {})
    url = f"https://{host}{canonical_uri}"
    if canonical_query:
      url = f"{url}?{canonical_query}"
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    headers = {
      "host": host,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-date": amz_date,
      **signed_headers,
    }
    canonical_headers = "".join(f"{key}:{headers[key]}\n" for key in sorted(headers))
    signed_header_names = ";".join(sorted(headers))
    canonical_request = "\n".join([
      method,
      canonical_uri,
      canonical_query,
      canonical_headers,
      signed_header_names,
      "UNSIGNED-PAYLOAD",
    ])
    credential_scope = f"{date_stamp}/{self.config.region}/s3/aws4_request"
    string_to_sign = "\n".join([
      "AWS4-HMAC-SHA256",
      amz_date,
      credential_scope,
      hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = hmac.new(
      _signing_key(self.config.secret_access_key, date_stamp, self.config.region),
      string_to_sign.encode("utf-8"),
      hashlib.sha256,
    ).hexdigest()
    auth_header = (
      "AWS4-HMAC-SHA256 "
      f"Credential={self.config.access_key_id}/{credential_scope}, "
      f"SignedHeaders={signed_header_names}, "
      f"Signature={signature}"
    )
    final_headers = {key: value for key, value in headers.items() if key != "host"}
    final_headers["Authorization"] = auth_header
    return url, final_headers


def sha256_file(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as file_obj:
    for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
      digest.update(chunk)
  return digest.hexdigest()


def build_object_key(kind: str, asset_id: str, sha256: str, ext: str, now: datetime | None = None) -> str:
  now = now or datetime.now(timezone.utc)
  ext = ext if ext.startswith(".") else f".{ext}"
  normalized_ext = ext.lower()
  if kind == "preview":
    normalized_ext = ".mp4"
  if kind == "cover":
    normalized_ext = ".webp"
  return f"{kind}/{now:%Y}/{now:%m}/{asset_id}/{sha256}{normalized_ext}"


def guess_video_mime(path: Path) -> str:
  return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def _virtual_host(endpoint: str, bucket: str) -> str:
  host = endpoint.strip().replace("https://", "").replace("http://", "").strip("/")
  if host.startswith(f"{bucket}."):
    return host
  return f"{bucket}.{host}"


def _quote_path(value: str) -> str:
  return "/".join(_quote(segment) for segment in value.split("/"))


def _canonical_query(values: Mapping[str, str]) -> str:
  if not values:
    return ""
  return "&".join(f"{_quote(str(key))}={_quote(str(value))}" for key, value in sorted(values.items()))


def _quote(value: str) -> str:
  safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~"
  return "".join(char if char in safe else f"%{byte:02X}" for char in value for byte in char.encode("utf-8"))


def _signing_key(secret_key: str, date_stamp: str, region: str) -> bytes:
  key = f"AWS4{secret_key}".encode("utf-8")
  for value in (date_stamp, region, "s3", "aws4_request"):
    key = hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()
  return key
