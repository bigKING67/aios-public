from __future__ import annotations

import hashlib
import hmac
import mimetypes
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Mapping, Tuple

import requests

MB = 1024 * 1024
# Cross-border VPS -> TOS uploads run on a lossy ~200ms link where a single TCP
# stream crawls (observed ~17 KB/s); large files go multipart with parallel parts,
# every request is retried, and the whole upload has a deadline so a job fails
# visibly instead of hanging.
REQUEST_TIMEOUT = (10, 120)


@dataclass(frozen=True)
class UploadTuning:
  multipart_threshold_bytes: int = 16 * MB
  part_size_bytes: int = 8 * MB
  concurrency: int = 4
  attempts: int = 3
  deadline_seconds: float = 1800.0

  @classmethod
  def from_env(cls) -> "UploadTuning":
    return cls(
      multipart_threshold_bytes=_env_number("TOS_UPLOAD_MULTIPART_THRESHOLD_MB", 16, 5, 1024) * MB,
      part_size_bytes=_env_number("TOS_UPLOAD_PART_SIZE_MB", 8, 5, 512) * MB,
      concurrency=_env_number("TOS_UPLOAD_CONCURRENCY", 4, 1, 16),
      attempts=_env_number("TOS_UPLOAD_ATTEMPTS", 3, 1, 10),
      deadline_seconds=float(_env_number("TOS_UPLOAD_DEADLINE_SECONDS", 1800, 60, 86400)),
    )


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
  def __init__(self, config: TosStorageConfig, tuning: UploadTuning | None = None):
    self.config = config
    self.tuning = tuning or UploadTuning.from_env()
    self.session = requests.Session()
    self._part_sessions = threading.local()

  def upload_file(self, object_key: str, path: Path, content_type: str = "") -> None:
    content_type = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    deadline = time.monotonic() + self.tuning.deadline_seconds
    size = path.stat().st_size
    if size >= self.tuning.multipart_threshold_bytes:
      self._upload_multipart(object_key, path, size, content_type, deadline)
      return

    def put() -> requests.Response:
      url, headers = self._signed_url_and_headers("PUT", object_key, {"content-type": content_type})
      with path.open("rb") as file_obj:
        return self.session.put(url, data=file_obj, headers=headers, timeout=REQUEST_TIMEOUT)

    self._with_retries(put, (200, 201), f"TOS 上传失败 key={object_key}", deadline)

  def _upload_multipart(self, object_key: str, path: Path, size: int, content_type: str, deadline: float) -> None:
    def initiate() -> requests.Response:
      url, headers = self._signed_url_and_headers(
        "POST", object_key, {"content-type": content_type}, query_params={"uploads": ""})
      return self.session.post(url, headers=headers, timeout=REQUEST_TIMEOUT)

    response = self._with_retries(initiate, (200,), f"TOS 分片上传初始化失败 key={object_key}", deadline)
    upload_id = _xml_text(response.text, "UploadId")
    if not upload_id:
      raise RuntimeError(f"TOS 分片上传初始化失败 key={object_key}: 响应缺少 UploadId")
    part_size = self.tuning.part_size_bytes
    ranges = [(number, offset, min(part_size, size - offset))
              for number, offset in enumerate(range(0, size, part_size), start=1)]
    try:
      with ThreadPoolExecutor(max_workers=min(self.tuning.concurrency, len(ranges))) as pool:
        etags = list(pool.map(
          lambda part: self._upload_part(object_key, upload_id, path, *part, deadline=deadline), ranges))
      body = "<CompleteMultipartUpload>" + "".join(
        f"<Part><PartNumber>{number}</PartNumber><ETag>{etag}</ETag></Part>"
        for (number, _, _), etag in zip(ranges, etags)) + "</CompleteMultipartUpload>"

      def complete() -> requests.Response:
        url, headers = self._signed_url_and_headers(
          "POST", object_key, {"content-type": "application/xml"}, query_params={"uploadId": upload_id})
        return self.session.post(url, data=body.encode("utf-8"), headers=headers, timeout=REQUEST_TIMEOUT)

      response = self._with_retries(complete, (200,), f"TOS 分片上传合并失败 key={object_key}", deadline)
      if "<Error>" in response.text:
        raise RuntimeError(f"TOS 分片上传合并失败 key={object_key}: {response.text[:240]}")
    except BaseException:
      self._abort_multipart(object_key, upload_id)
      raise

  def _upload_part(self, object_key: str, upload_id: str, path: Path, number: int, offset: int,
                   length: int, deadline: float) -> str:
    session = getattr(self._part_sessions, "session", None)
    if session is None:
      session = self._part_sessions.session = self._new_part_session()

    def put() -> requests.Response:
      with path.open("rb") as file_obj:
        file_obj.seek(offset)
        data = file_obj.read(length)
      url, headers = self._signed_url_and_headers(
        "PUT", object_key, {}, query_params={"partNumber": str(number), "uploadId": upload_id})
      return session.put(url, data=data, headers=headers, timeout=REQUEST_TIMEOUT)

    response = self._with_retries(put, (200,), f"TOS 分片上传失败 key={object_key} part={number}", deadline)
    etag = response.headers.get("ETag", "")
    if not etag:
      raise RuntimeError(f"TOS 分片上传失败 key={object_key} part={number}: 响应缺少 ETag")
    return etag

  def _new_part_session(self) -> requests.Session:
    session = requests.Session()
    session.trust_env = self.session.trust_env
    session.verify = self.session.verify
    return session

  def _abort_multipart(self, object_key: str, upload_id: str) -> None:
    try:
      url, headers = self._signed_url_and_headers("DELETE", object_key, {}, query_params={"uploadId": upload_id})
      self.session.delete(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException:
      pass  # Best effort: a leftover upload only keeps invisible, billable parts.

  def _with_retries(self, send, ok_statuses: Tuple[int, ...], message: str, deadline: float) -> requests.Response:
    last_error = ""
    for attempt in range(1, self.tuning.attempts + 1):
      if time.monotonic() >= deadline:
        raise RuntimeError(f"{message}: 超过上传时限 {self.tuning.deadline_seconds:.0f}s（{last_error or '未开始'}）")
      try:
        response = send()
      except requests.RequestException as error:
        last_error = f"{type(error).__name__}: {str(error)[:160]}"
      else:
        if response.status_code in ok_statuses:
          return response
        last_error = f"HTTP {response.status_code}: {response.text[:240]}"
        if response.status_code < 500 and response.status_code not in (408, 429):
          break
      if attempt < self.tuning.attempts:
        time.sleep(min(2 ** attempt, 10))
    raise RuntimeError(f"{message} {last_error}")

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


def _xml_text(document: str, tag: str) -> str:
  match = re.search(rf"<{tag}>([^<]*)</{tag}>", document)
  return match.group(1).strip() if match else ""


def _env_number(name: str, default: int, minimum: int, maximum: int) -> int:
  raw = (os.getenv(name) or "").strip()
  if not raw:
    return default
  try:
    value = int(raw)
  except ValueError as error:
    raise RuntimeError(f"{name} 必须是整数，当前为 {raw!r}") from error
  if not minimum <= value <= maximum:
    raise RuntimeError(f"{name} 必须在 {minimum}–{maximum} 之间，当前为 {value}")
  return value
