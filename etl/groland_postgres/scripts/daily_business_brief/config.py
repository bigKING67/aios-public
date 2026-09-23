from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Mapping
from zoneinfo import ZoneInfo

from .models import DeliveryMode, SUPPORTED_PLATFORMS


SHANGHAI_TIMEZONE = ZoneInfo("Asia/Shanghai")
DEFAULT_DASHBOARD_URL = "http://127.0.0.1:5173/dashboard"


@dataclass(frozen=True)
class BriefConfig:
  production_webhook_url: str = ""
  alert_webhook_url: str = ""
  dashboard_url: str = DEFAULT_DASHBOARD_URL
  lookback_days: int = 120
  required_shop_ids_by_platform: Mapping[str, tuple[str, ...]] = field(
    default_factory=dict
  )

  def webhook_for(self, mode: DeliveryMode) -> str:
    if mode is DeliveryMode.TEST:
      return self.alert_webhook_url.strip()
    if mode is DeliveryMode.PRODUCTION:
      return self.production_webhook_url.strip()
    return ""

  def validate_delivery(self, mode: DeliveryMode) -> None:
    if mode is DeliveryMode.PREVIEW:
      return

    webhook_url = self.webhook_for(mode)
    if not webhook_url:
      env_name = (
        "DAILY_BRIEF_ALERT_WEBHOOK_URL"
        if mode is DeliveryMode.TEST
        else "DAILY_BRIEF_WEBHOOK_URL"
      )
      raise ValueError(f"missing required environment variable {env_name}")

    production_url = _normalize_webhook(self.production_webhook_url)
    alert_url = _normalize_webhook(self.alert_webhook_url)
    if production_url and alert_url and production_url == alert_url:
      raise ValueError("production and alert webhook URLs must be different")


def _normalize_webhook(value: str) -> str:
  return str(value or "").strip().rstrip("/")


def _read_positive_int(env: Mapping[str, str], name: str, default: int) -> int:
  raw_value = str(env.get(name, "") or "").strip()
  if not raw_value:
    return default
  try:
    value = int(raw_value)
  except ValueError as error:
    raise ValueError(f"{name} must be an integer") from error
  if value <= 0:
    raise ValueError(f"{name} must be greater than zero")
  return value


def _read_csv(env: Mapping[str, str], name: str) -> tuple[str, ...]:
  values = (item.strip() for item in str(env.get(name, "") or "").split(","))
  return tuple(dict.fromkeys(item for item in values if item))


def resolve_brief_config(env: Mapping[str, str] | None = None) -> BriefConfig:
  source = os.environ if env is None else env
  required_shop_ids = {
    platform: shop_ids
    for platform in SUPPORTED_PLATFORMS
    if (
      shop_ids := _read_csv(
        source,
        f"DAILY_BRIEF_REQUIRED_SHOP_IDS_{platform.upper()}",
      )
    )
  }
  return BriefConfig(
    production_webhook_url=str(source.get("DAILY_BRIEF_WEBHOOK_URL", "") or "").strip(),
    alert_webhook_url=str(
      source.get("DAILY_BRIEF_ALERT_WEBHOOK_URL", "") or ""
    ).strip(),
    dashboard_url=str(
      source.get("DAILY_BRIEF_DASHBOARD_URL", DEFAULT_DASHBOARD_URL)
      or DEFAULT_DASHBOARD_URL
    ).strip(),
    lookback_days=_read_positive_int(
      source,
      "DAILY_BRIEF_ADS_LOOKBACK_DAYS",
      120,
    ),
    required_shop_ids_by_platform=required_shop_ids,
  )


def resolve_target_date(
  target_date: str | date | None,
  *,
  now: datetime | None = None,
) -> date:
  if isinstance(target_date, datetime):
    raise ValueError("target_date must be a date or YYYY-MM-DD string")
  if isinstance(target_date, date):
    return target_date
  if target_date is not None and str(target_date).strip():
    try:
      return date.fromisoformat(str(target_date).strip())
    except ValueError as error:
      raise ValueError("target_date must use YYYY-MM-DD format") from error

  current = now or datetime.now(SHANGHAI_TIMEZONE)
  if current.tzinfo is None:
    raise ValueError("now must be timezone-aware")
  shanghai_now = current.astimezone(SHANGHAI_TIMEZONE)
  return shanghai_now.date() - timedelta(days=1)


__all__ = [
  "BriefConfig",
  "DeliveryMode",
  "SHANGHAI_TIMEZONE",
  "resolve_brief_config",
  "resolve_target_date",
]
