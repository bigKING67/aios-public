from __future__ import annotations

from pathlib import Path

from .feishu_sheet import FeishuApiError, FeishuClient


class FeishuDriveClient:
  def __init__(self, client: FeishuClient):
    self.client = client

  def download_file(self, file_token: str, target_path: Path) -> Path:
    if hasattr(self.client, "download_file"):
      self.client.download_file(file_token, target_path)
      return target_path

    target_path.parent.mkdir(parents=True, exist_ok=True)
    errors = []
    for endpoint in (
      f"/drive/v1/medias/{file_token}/download",
      f"/drive/v1/files/{file_token}/download",
    ):
      url = f"{self.client.base_url}{endpoint}"
      response = self.client.session.get(
        url,
        headers=self.client._headers(),
        stream=True,
        timeout=120,
      )
      if response.status_code == 200:
        with target_path.open("wb") as output:
          for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
              output.write(chunk)
        return target_path
      errors.append(f"{endpoint}: HTTP {response.status_code} {response.text[:160]}")
    raise FeishuApiError(f"下载飞书附件失败 file_token={file_token}: {'; '.join(errors)}")
