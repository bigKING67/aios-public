from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict

from prefect import flow, get_run_logger, task

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from live_center_analysis.processor import process_douyin_live_center_analysis_jobs  # noqa: E402


@task(name="process-douyin-live-center-analysis-jobs")
def process_douyin_live_center_analysis_jobs_task(limit: int) -> Dict[str, int]:
  return process_douyin_live_center_analysis_jobs(limit=limit)


@flow(name="process-douyin-live-center-analysis-jobs")
def process_douyin_live_center_analysis_jobs_flow(limit: int = 10) -> Dict[str, int]:
  logger = get_run_logger()
  logger.info("starting douyin live-center analysis jobs limit=%s", limit)
  result = process_douyin_live_center_analysis_jobs_task(limit=limit)
  logger.info("douyin live-center analysis jobs finished: %s", result)
  return result


if __name__ == "__main__":
  process_douyin_live_center_analysis_jobs_flow(
    limit=int(os.getenv("DOUYIN_LIVE_ANALYSIS_LIMIT", "10") or "10"),
  )
