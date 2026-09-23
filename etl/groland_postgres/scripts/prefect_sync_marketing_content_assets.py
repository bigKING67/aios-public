from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Optional

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.models import (  # noqa: E402
  DEFAULT_SOURCE_URL,
  DEFAULT_SPREADSHEET_TOKEN,
)
from marketing_content_assets.sync import run_content_asset_sync  # noqa: E402


@task(name="sync-marketing-content-assets")
def sync_marketing_content_assets_task(
  mode: str,
  limit: int,
  sheet_ids: Optional[List[str]],
  source_url: str,
  spreadsheet_token: str,
) -> dict:
  return run_content_asset_sync(
    mode=mode,
    limit=limit,
    sheet_ids=sheet_ids,
    source_url=source_url,
    spreadsheet_token=spreadsheet_token,
  )


@flow(name="sync-marketing-content-assets")
def sync_marketing_content_assets_flow(
  mode: str = "dry-run",
  limit: int = 0,
  sheet_ids: Optional[List[str]] = None,
  source_url: str = DEFAULT_SOURCE_URL,
  spreadsheet_token: str = DEFAULT_SPREADSHEET_TOKEN,
) -> dict:
  logger = get_run_logger()
  logger.info("starting content assets sync mode=%s limit=%s sheets=%s", mode, limit, sheet_ids)
  result = sync_marketing_content_assets_task(
    mode=mode,
    limit=limit,
    sheet_ids=sheet_ids,
    source_url=source_url,
    spreadsheet_token=spreadsheet_token,
  )
  logger.info("content assets sync finished: %s", result)
  return result


if __name__ == "__main__":
  env_sheet_ids = [
    value.strip()
    for value in (os.getenv("CONTENT_ASSET_FEISHU_SHEET_IDS") or "").split(",")
    if value.strip()
  ]
  sync_marketing_content_assets_flow(
    mode=os.getenv("CONTENT_ASSET_SYNC_MODE", "dry-run"),
    limit=int(os.getenv("CONTENT_ASSET_SYNC_LIMIT", "0") or "0"),
    sheet_ids=env_sheet_ids or None,
    source_url=os.getenv("CONTENT_ASSET_FEISHU_SOURCE_URL", DEFAULT_SOURCE_URL),
    spreadsheet_token=os.getenv("CONTENT_ASSET_FEISHU_SPREADSHEET_TOKEN", DEFAULT_SPREADSHEET_TOKEN),
  )
