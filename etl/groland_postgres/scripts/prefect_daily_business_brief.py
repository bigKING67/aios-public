from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

from prefect import flow, get_run_logger
from prefect.runtime import flow_run


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from daily_business_brief.config import (  # noqa: E402
  DeliveryMode,
  resolve_brief_config,
  resolve_target_date,
)
from daily_business_brief.delivery import FeishuWebhookSender  # noqa: E402
from daily_business_brief.repository import PostgresBriefRepository  # noqa: E402
from daily_business_brief.service import DailyBusinessBriefService  # noqa: E402


@flow(name="daily-business-brief-flow")
def daily_business_brief_flow(
  target_date: str = "",
  delivery_mode: str = "preview",
  production_confirmed: bool = False,
) -> Dict[str, Any]:
  """Build or deliver the governed daily business brief without send retries."""
  logger = get_run_logger()
  resolved_date = resolve_target_date(target_date)
  resolved_mode = DeliveryMode.parse(delivery_mode)
  config = resolve_brief_config()
  service = DailyBusinessBriefService(
    config=config,
    repository=PostgresBriefRepository(),
    sender=FeishuWebhookSender(),
  )

  run_id = str(flow_run.id or "")
  run_name = str(flow_run.name or "")
  logger.info(
    "Daily business brief started: target_date=%s mode=%s flow_run_id=%s",
    resolved_date,
    resolved_mode.value,
    run_id or "unavailable",
  )
  result = service.run(
    target_date=resolved_date,
    delivery_mode=resolved_mode,
    production_confirmed=production_confirmed,
    flow_run_id=run_id,
    flow_run_name=run_name,
  )
  logger.info(
    "Daily business brief finished: status=%s target_date=%s mode=%s "
    "platforms=%s card_sha256_prefix=%s delivery_id=%s attempt_count=%s",
    result.status,
    result.target_date,
    result.delivery_mode.value,
    result.platform_count,
    result.card_sha256[:12],
    result.delivery_id,
    result.attempt_count,
  )
  return result.to_dict()


if __name__ == "__main__":
  daily_business_brief_flow()
