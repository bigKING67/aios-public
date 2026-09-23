from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

from prefect import flow, get_run_logger, task


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.performance_rollups import (  # noqa: E402
  refresh_marketing_content_performance_rollups,
)


@task(name="refresh-marketing-content-performance-rollups-task")
def refresh_marketing_content_performance_rollups_task(
  start_date: Optional[str],
  end_date: Optional[str],
  dry_run: bool,
) -> dict:
  return refresh_marketing_content_performance_rollups(
    start_date=start_date,
    end_date=end_date,
    dry_run=dry_run,
  ).to_dict()


@flow(name="refresh-marketing-content-performance-rollups")
def refresh_marketing_content_performance_rollups_flow(
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  dry_run: bool = False,
) -> dict:
  logger = get_run_logger()
  logger.info(
    "refreshing marketing content performance rollups start_date=%s end_date=%s dry_run=%s",
    start_date,
    end_date,
    dry_run,
  )
  return refresh_marketing_content_performance_rollups_task(
    start_date=start_date,
    end_date=end_date,
    dry_run=dry_run,
  )


if __name__ == "__main__":
  refresh_marketing_content_performance_rollups_flow(
    start_date=os.getenv("CONTENT_ASSET_PERFORMANCE_START_DATE") or None,
    end_date=os.getenv("CONTENT_ASSET_PERFORMANCE_END_DATE") or None,
    dry_run=os.getenv("CONTENT_ASSET_PERFORMANCE_DRY_RUN", "0") == "1",
  )
