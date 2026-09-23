from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Any, Dict, Optional


class DeliveryMode(str, Enum):
  PREVIEW = "preview"
  TEST = "test"
  PRODUCTION = "production"

  @classmethod
  def parse(cls, value: str | DeliveryMode) -> DeliveryMode:
    if isinstance(value, cls):
      return value
    normalized = str(value or "").strip().lower()
    try:
      return cls(normalized)
    except ValueError as error:
      allowed = ", ".join(item.value for item in cls)
      raise ValueError(f"delivery_mode must be one of: {allowed}") from error


class DeliveryStatus(str, Enum):
  SENDING = "sending"
  SENT = "sent"
  FAILED = "failed"
  UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class MetricConfig:
  key: str
  name: str
  emoji: str
  positive_is_good: bool
  is_currency: bool


METRICS = (
  MetricConfig("GMV", "GMV", "💰", True, True),
  MetricConfig("GSV", "GSV（支付时间）", "📦", True, True),
  MetricConfig(
    "refund_amount_pay_time",
    "退款金额（支付时间）",
    "💸",
    False,
    True,
  ),
)
METRIC_KEYS = tuple(metric.key for metric in METRICS)
SUPPORTED_PLATFORMS = ("douyin", "taobao", "wx", "xhs", "jd")


@dataclass(frozen=True)
class BriefRecord:
  record_date: date
  platform: str
  gmv: float
  gsv: float
  refund_amount_pay_time: float
  order_count: float = 0.0

  def metric_value(self, key: str) -> float:
    values = {
      "GMV": self.gmv,
      "GSV": self.gsv,
      "refund_amount_pay_time": self.refund_amount_pay_time,
    }
    return values[key]


@dataclass(frozen=True)
class ReadinessIssue:
  platform: str
  issue_type: str
  message: str
  source_table: str = ""
  missing_shop_ids: tuple[str, ...] = ()

  def to_dict(self) -> Dict[str, Any]:
    result: Dict[str, Any] = {
      "platform": self.platform,
      "issueType": self.issue_type,
      "message": self.message,
    }
    if self.source_table:
      result["sourceTable"] = self.source_table
    if self.missing_shop_ids:
      result["missingShopIds"] = list(self.missing_shop_ids)
    return result


@dataclass(frozen=True)
class DeliveryOutcome:
  status: DeliveryStatus
  error_code: Optional[str] = None
  error_detail: Optional[str] = None

  @property
  def sent(self) -> bool:
    return self.status is DeliveryStatus.SENT


@dataclass(frozen=True)
class DeliveryReservation:
  should_send: bool
  delivery_id: Optional[int]
  status: DeliveryStatus
  attempt_count: int
  reason: str = ""
