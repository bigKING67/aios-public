from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, Protocol, Sequence

from .config import BriefConfig
from .delivery import sanitize_error
from .domain import DailyBriefAggregator, DailyBriefComparator, DailyBriefRenderer
from .models import (
  BriefRecord,
  DeliveryMode,
  DeliveryOutcome,
  DeliveryReservation,
  DeliveryStatus,
  ReadinessIssue,
)


class BriefRepository(Protocol):
  def fetch_records(
    self,
    *,
    start_date: date,
    end_date: date,
  ) -> list[BriefRecord]: ...

  def find_readiness_issues(
    self,
    *,
    target_date: date,
    records: Sequence[BriefRecord],
    required_shop_ids_by_platform: Any,
  ) -> list[ReadinessIssue]: ...

  def create_test_attempt(self, **kwargs: Any) -> DeliveryReservation: ...

  def reserve_production(self, **kwargs: Any) -> DeliveryReservation: ...

  def finalize_delivery(
    self,
    *,
    delivery_id: int,
    outcome: DeliveryOutcome,
  ) -> None: ...


class WebhookSender(Protocol):
  def send(self, webhook_url: str, card: Dict[str, Any]) -> DeliveryOutcome: ...


@dataclass(frozen=True)
class PreparedBrief:
  card: Dict[str, Any]
  card_sha256: str
  record_count: int
  platform_count: int


@dataclass(frozen=True)
class BriefRunResult:
  status: str
  target_date: date
  delivery_mode: DeliveryMode
  card_sha256: str
  record_count: int
  platform_count: int
  delivery_id: int | None = None
  attempt_count: int = 0
  reason: str = ""
  card: Dict[str, Any] | None = None

  def to_dict(self) -> Dict[str, Any]:
    result: Dict[str, Any] = {
      "status": self.status,
      "targetDate": self.target_date.isoformat(),
      "deliveryMode": self.delivery_mode.value,
      "cardSha256": self.card_sha256,
      "recordCount": self.record_count,
      "platformCount": self.platform_count,
      "deliveryId": self.delivery_id,
      "attemptCount": self.attempt_count,
      "reason": self.reason,
    }
    if self.card is not None:
      result["card"] = self.card
    return result


class BriefDataNotReady(RuntimeError):
  def __init__(self, target_date: date, issues: Sequence[ReadinessIssue]):
    self.target_date = target_date
    self.issues = tuple(issues)
    summary = "; ".join(issue.message for issue in self.issues[:10])
    super().__init__(f"daily brief data is not ready for {target_date}: {summary}")


class BriefDeliveryError(RuntimeError):
  def __init__(self, result: BriefRunResult, outcome: DeliveryOutcome):
    self.result = result
    self.outcome = outcome
    detail = outcome.error_detail or outcome.error_code or "unknown delivery error"
    super().__init__(
      f"daily brief delivery ended with {outcome.status.value}: {detail}"
    )


def stable_card_sha256(card: Dict[str, Any]) -> str:
  payload = json.dumps(
    card,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
  ).encode("utf-8")
  return hashlib.sha256(payload).hexdigest()


class DailyBusinessBriefService:
  def __init__(
    self,
    *,
    config: BriefConfig,
    repository: BriefRepository,
    sender: WebhookSender,
  ):
    self.config = config
    self.repository = repository
    self.sender = sender

  def prepare(self, target_date: date) -> PreparedBrief:
    start_date = target_date - timedelta(days=self.config.lookback_days)
    records = self.repository.fetch_records(
      start_date=start_date,
      end_date=target_date,
    )
    issues = self.repository.find_readiness_issues(
      target_date=target_date,
      records=records,
      required_shop_ids_by_platform=self.config.required_shop_ids_by_platform,
    )
    if issues:
      raise BriefDataNotReady(target_date, issues)

    aggregator = DailyBriefAggregator(records)
    comparator = DailyBriefComparator(aggregator)
    renderer = DailyBriefRenderer(self.config.dashboard_url)
    card = renderer.render(
      daily=comparator.daily_change(target_date),
      weekly=comparator.weekly_change(target_date),
      monthly=comparator.monthly_change(target_date),
      report_date=target_date,
    )
    platform_count = len({
      record.platform for record in records if record.record_date == target_date
    })
    return PreparedBrief(
      card=card,
      card_sha256=stable_card_sha256(card),
      record_count=len(records),
      platform_count=platform_count,
    )

  def run(
    self,
    *,
    target_date: date,
    delivery_mode: DeliveryMode,
    production_confirmed: bool,
    flow_run_id: str = "",
    flow_run_name: str = "",
  ) -> BriefRunResult:
    mode = DeliveryMode.parse(delivery_mode)
    if mode is DeliveryMode.PRODUCTION and production_confirmed is not True:
      raise ValueError("production delivery requires production_confirmed=true")
    self.config.validate_delivery(mode)

    prepared = self.prepare(target_date)
    if mode is DeliveryMode.PREVIEW:
      return self._result(
        prepared=prepared,
        target_date=target_date,
        mode=mode,
        status="preview_ready",
        include_card=True,
      )

    reservation = self._reserve(
      prepared=prepared,
      target_date=target_date,
      mode=mode,
      flow_run_id=flow_run_id,
      flow_run_name=flow_run_name,
    )
    if not reservation.should_send:
      return self._result(
        prepared=prepared,
        target_date=target_date,
        mode=mode,
        status="deduplicated",
        reservation=reservation,
        reason=reservation.reason,
      )
    if reservation.delivery_id is None:
      raise RuntimeError("send reservation is missing delivery_id")

    try:
      outcome = self.sender.send(self.config.webhook_for(mode), prepared.card)
    except Exception as error:
      outcome = DeliveryOutcome(
        status=DeliveryStatus.UNCERTAIN,
        error_code="unexpected_sender_error",
        error_detail=sanitize_error(error),
      )
    self.repository.finalize_delivery(
      delivery_id=reservation.delivery_id,
      outcome=outcome,
    )

    status = "sent" if outcome.sent else outcome.status.value
    result = self._result(
      prepared=prepared,
      target_date=target_date,
      mode=mode,
      status=status,
      reservation=reservation,
      reason=outcome.error_detail or outcome.error_code or "",
    )
    if not outcome.sent:
      raise BriefDeliveryError(result, outcome)
    return result

  def _reserve(
    self,
    *,
    prepared: PreparedBrief,
    target_date: date,
    mode: DeliveryMode,
    flow_run_id: str,
    flow_run_name: str,
  ) -> DeliveryReservation:
    values = {
      "target_date": target_date,
      "card_sha256": prepared.card_sha256,
      "flow_run_id": flow_run_id,
      "flow_run_name": flow_run_name,
    }
    if mode is DeliveryMode.TEST:
      return self.repository.create_test_attempt(**values)
    return self.repository.reserve_production(**values)

  @staticmethod
  def _result(
    *,
    prepared: PreparedBrief,
    target_date: date,
    mode: DeliveryMode,
    status: str,
    reservation: DeliveryReservation | None = None,
    reason: str = "",
    include_card: bool = False,
  ) -> BriefRunResult:
    return BriefRunResult(
      status=status,
      target_date=target_date,
      delivery_mode=mode,
      card_sha256=prepared.card_sha256,
      record_count=prepared.record_count,
      platform_count=prepared.platform_count,
      delivery_id=reservation.delivery_id if reservation else None,
      attempt_count=reservation.attempt_count if reservation else 0,
      reason=reason,
      card=prepared.card if include_card else None,
    )
