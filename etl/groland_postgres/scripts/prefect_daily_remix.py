"""Default-off daily AI Studio dispatch, scheduled for 10:00 Asia/Shanghai."""
import sys
from pathlib import Path

from prefect import flow, get_run_logger

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from content_production.daily_remix_scheduler import execute  # noqa: E402


@flow(name="daily-remix-flow", retries=0)
def daily_remix_flow():
    return execute(get_run_logger())
