from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict, Optional

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.analysis_processor import process_content_asset_analysis_jobs  # noqa: E402


@task(name="process-marketing-content-asset-analysis-jobs")
def process_marketing_content_asset_analysis_jobs_task(limit: int, temp_dir: Optional[str]) -> Dict[str, int]:
  temp_root = Path(temp_dir).expanduser().resolve() if temp_dir else None
  return process_content_asset_analysis_jobs(limit=limit, temp_root=temp_root)


@flow(name="process-marketing-content-asset-analysis-jobs")
def process_marketing_content_asset_analysis_jobs_flow(
  limit: int = 10,
  temp_dir: Optional[str] = None,
) -> Dict[str, int]:
  logger = get_run_logger()
  logger.info("starting content asset analysis jobs limit=%s temp_dir=%s", limit, temp_dir)
  result = process_marketing_content_asset_analysis_jobs_task(limit=limit, temp_dir=temp_dir)
  logger.info("content asset analysis jobs finished: %s", result)
  return result


if __name__ == "__main__":
  process_marketing_content_asset_analysis_jobs_flow(
    limit=int(os.getenv("CONTENT_ASSET_ANALYSIS_LIMIT", "10") or "10"),
    temp_dir=os.getenv("CONTENT_ASSET_PROCESS_TEMP_DIR") or None,
  )
