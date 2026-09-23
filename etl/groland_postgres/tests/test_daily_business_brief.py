from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest
import requests


ETL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_ROOT / "scripts"))

from daily_business_brief.config import (  # noqa: E402
  BriefConfig,
  resolve_brief_config,
  resolve_target_date,
)
from daily_business_brief.delivery import FeishuWebhookSender, sanitize_error  # noqa: E402
from daily_business_brief.domain import (  # noqa: E402
  DailyBriefAggregator,
  DailyBriefComparator,
  DailyBriefRenderer,
)
from daily_business_brief.models import (  # noqa: E402
  BriefRecord,
  DeliveryMode,
  DeliveryOutcome,
  DeliveryReservation,
  DeliveryStatus,
  ReadinessIssue,
)
from daily_business_brief.repository import (  # noqa: E402
  PostgresBriefRepository,
  SOURCE_TABLES,
  normalize_overview_row,
)
from daily_business_brief.service import (  # noqa: E402
  BriefDeliveryError,
  BriefDataNotReady,
  DailyBusinessBriefService,
  stable_card_sha256,
)


TARGET_DATE = date(2026, 8, 24)


def _target_records() -> list[BriefRecord]:
  platforms = ("douyin", "taobao", "wx", "xhs", "jd")
  records = []
  for index, platform in enumerate(platforms, start=1):
    records.append(BriefRecord(
      record_date=TARGET_DATE,
      platform=platform,
      gmv=1000.0 * index,
      gsv=900.0 * index,
      refund_amount_pay_time=100.0 * index,
      order_count=10.0 * index,
    ))
    records.append(BriefRecord(
      record_date=TARGET_DATE.replace(day=23),
      platform=platform,
      gmv=500.0 * index,
      gsv=450.0 * index,
      refund_amount_pay_time=50.0 * index,
      order_count=5.0 * index,
    ))
  return records


class FakeRepository:
  def __init__(self) -> None:
    self.records = _target_records()
    self.issues = []
    self.fetch_calls = []
    self.test_attempt_count = 0
    self.production_reserve_count = 0
    self.production_reservation = DeliveryReservation(
      should_send=True,
      delivery_id=67,
      status=DeliveryStatus.SENDING,
      attempt_count=1,
    )
    self.finalized = []

  def fetch_records(self, *, start_date: date, end_date: date):
    self.fetch_calls.append((start_date, end_date))
    return self.records

  def find_readiness_issues(self, **kwargs: Any):
    return self.issues

  def create_test_attempt(self, **kwargs: Any) -> DeliveryReservation:
    self.test_attempt_count += 1
    return DeliveryReservation(
      should_send=True,
      delivery_id=100 + self.test_attempt_count,
      status=DeliveryStatus.SENDING,
      attempt_count=1,
    )

  def reserve_production(self, **kwargs: Any) -> DeliveryReservation:
    self.production_reserve_count += 1
    return self.production_reservation

  def finalize_delivery(self, *, delivery_id: int, outcome: DeliveryOutcome) -> None:
    self.finalized.append((delivery_id, outcome))


class FakeSender:
  def __init__(self, outcome: DeliveryOutcome | None = None) -> None:
    self.outcome = outcome or DeliveryOutcome(status=DeliveryStatus.SENT)
    self.calls = []

  def send(self, webhook_url: str, card: dict[str, Any]) -> DeliveryOutcome:
    self.calls.append((webhook_url, card))
    return self.outcome


def _service(
  repository: FakeRepository,
  sender: FakeSender,
  *,
  production_url: str = "https://fixture.invalid/production",
  alert_url: str = "https://fixture.invalid/test",
) -> DailyBusinessBriefService:
  return DailyBusinessBriefService(
    config=BriefConfig(
      production_webhook_url=production_url,
      alert_webhook_url=alert_url,
      dashboard_url="https://fixture.invalid/dashboard",
    ),
    repository=repository,
    sender=sender,
  )


def test_resolve_target_date_uses_shanghai_business_day() -> None:
  utc_now = datetime(2026, 8, 24, 16, 30, tzinfo=timezone.utc)

  assert resolve_target_date(None, now=utc_now) == TARGET_DATE
  assert resolve_target_date("2026-08-20", now=utc_now) == date(2026, 8, 20)


def test_resolve_target_date_rejects_implicit_naive_time_and_invalid_date() -> None:
  with pytest.raises(ValueError, match="timezone-aware"):
    resolve_target_date(None, now=datetime(2026, 8, 25, 10, 0))
  with pytest.raises(ValueError, match="YYYY-MM-DD"):
    resolve_target_date("08/24/2026")


def test_config_parses_deduplicated_required_shop_ids() -> None:
  config = resolve_brief_config({
    "DAILY_BRIEF_ADS_LOOKBACK_DAYS": "90",
    "DAILY_BRIEF_REQUIRED_SHOP_IDS_DOUYIN": " 123,456,123 ",
  })

  assert config.lookback_days == 90
  assert config.required_shop_ids_by_platform == {"douyin": ("123", "456")}


def test_config_rejects_same_test_and_production_webhook() -> None:
  config = BriefConfig(
    production_webhook_url="https://fixture.invalid/shared/",
    alert_webhook_url="https://fixture.invalid/shared",
  )

  with pytest.raises(ValueError, match="must be different"):
    config.validate_delivery(DeliveryMode.TEST)


def test_aggregator_and_comparator_preserve_daily_metric_contract() -> None:
  aggregator = DailyBriefAggregator(_target_records())
  comparison = DailyBriefComparator(aggregator).daily_change(TARGET_DATE)

  assert comparison["total"]["GMV"] == {"value": 15000.0, "change": 1.0}
  assert comparison["total"]["GSV"] == {"value": 13500.0, "change": 1.0}
  assert comparison["platforms"][0]["name"] == "jd"
  assert comparison["platforms"][0]["share"]["GMV"] == pytest.approx(1 / 3)


@pytest.mark.parametrize("report_date,previous_start,previous_end", [
  (date(2026, 9, 12), date(2026, 8, 1), date(2026, 8, 12)),
  (date(2026, 3, 31), date(2026, 2, 1), date(2026, 2, 28)),
  (date(2024, 3, 31), date(2024, 2, 1), date(2024, 2, 29)),
  (date(2026, 5, 31), date(2026, 4, 1), date(2026, 4, 30)),
  (date(2026, 8, 31), date(2026, 7, 1), date(2026, 7, 31)),
  (date(2026, 1, 12), date(2025, 12, 1), date(2025, 12, 12)),
])
def test_monthly_change_uses_previous_calendar_month(
  report_date: date, previous_start: date, previous_end: date,
) -> None:
  current_start = report_date.replace(day=1)
  records = []
  cursor = previous_start - timedelta(days=3)
  while cursor <= report_date:
    # Distinct daily values expose shifted, duplicated or truncated dates.
    value = float(cursor.toordinal())
    records.append(BriefRecord(cursor, "douyin", value, value / 2, value / 10))
    cursor += timedelta(days=1)
  comparator = DailyBriefComparator(DailyBriefAggregator(records))
  result = comparator.monthly_change(report_date)
  current = sum(r.gmv for r in records if current_start <= r.record_date <= report_date)
  previous = sum(r.gmv for r in records if previous_start <= r.record_date <= previous_end)
  assert result["total"]["GMV"] == pytest.approx({
    "value": current, "change": (current - previous) / previous,
  })
  assert result["platforms"][0]["metrics"]["GMV"] == result["total"]["GMV"]


def test_monthly_comparison_does_not_drop_prior_dates_when_current_data_is_missing() -> None:
  records = [
    BriefRecord(date(2026, 8, day), "douyin", 100, 90, 10)
    for day in (1, 2, 3)
  ] + [BriefRecord(date(2026, 9, day), "douyin", 100, 90, 10) for day in (1, 3)]
  result = DailyBriefComparator(DailyBriefAggregator(records)).monthly_change(date(2026, 9, 3))
  assert result["total"]["GMV"] == pytest.approx({"value": 200, "change": -1 / 3})


def test_renderer_is_deterministic_and_keeps_refund_direction_semantics() -> None:
  aggregator = DailyBriefAggregator(_target_records())
  comparator = DailyBriefComparator(aggregator)
  renderer = DailyBriefRenderer("https://fixture.invalid/dashboard")
  values = {
    "daily": comparator.daily_change(TARGET_DATE),
    "weekly": comparator.weekly_change(TARGET_DATE),
    "monthly": comparator.monthly_change(TARGET_DATE),
    "report_date": TARGET_DATE,
  }

  first = renderer.render(**values)
  second = renderer.render(**values)
  daily_markdown = first["card"]["elements"][1]["content"]

  assert first == second
  assert stable_card_sha256(first) == stable_card_sha256(second)
  assert "Groland线上平台生意简报" in first["card"]["header"]["title"]["content"]
  assert "退款金额（支付时间）" in daily_markdown
  assert "<font color='green'>↑100%</font>" in daily_markdown


def test_preview_has_no_webhook_or_ledger_side_effect() -> None:
  repository = FakeRepository()
  sender = FakeSender()
  result = _service(repository, sender).run(
    target_date=TARGET_DATE,
    delivery_mode=DeliveryMode.PREVIEW,
    production_confirmed=False,
  )

  assert result.status == "preview_ready"
  assert result.platform_count == 5
  assert result.delivery_id is None
  assert result.card is not None
  assert result.to_dict()["card"] == result.card
  assert repository.test_attempt_count == 0
  assert repository.finalized == []
  assert sender.calls == []


def test_test_mode_is_repeatable_and_uses_only_alert_webhook() -> None:
  repository = FakeRepository()
  sender = FakeSender()
  service = _service(repository, sender)

  first = service.run(
    target_date=TARGET_DATE,
    delivery_mode=DeliveryMode.TEST,
    production_confirmed=False,
  )
  second = service.run(
    target_date=TARGET_DATE,
    delivery_mode=DeliveryMode.TEST,
    production_confirmed=False,
  )

  assert (first.delivery_id, second.delivery_id) == (101, 102)
  assert [call[0] for call in sender.calls] == [
    "https://fixture.invalid/test",
    "https://fixture.invalid/test",
  ]
  assert [item[0] for item in repository.finalized] == [101, 102]


def test_production_requires_confirmation_before_reading_data() -> None:
  repository = FakeRepository()
  sender = FakeSender()

  with pytest.raises(ValueError, match="production_confirmed=true"):
    _service(repository, sender).run(
      target_date=TARGET_DATE,
      delivery_mode=DeliveryMode.PRODUCTION,
      production_confirmed=False,
    )

  assert repository.fetch_calls == []
  assert sender.calls == []


def test_readiness_failure_blocks_reservation_and_webhook() -> None:
  repository = FakeRepository()
  repository.issues = [ReadinessIssue(
    platform="jd",
    issue_type="ads_missing",
    message="ads.all_trade_overview platform=jd is missing",
  )]
  sender = FakeSender()

  with pytest.raises(BriefDataNotReady, match="platform=jd"):
    _service(repository, sender).run(
      target_date=TARGET_DATE,
      delivery_mode=DeliveryMode.PRODUCTION,
      production_confirmed=True,
    )

  assert repository.production_reserve_count == 0
  assert repository.finalized == []
  assert sender.calls == []


def test_existing_production_reservation_deduplicates_without_webhook() -> None:
  repository = FakeRepository()
  repository.production_reservation = DeliveryReservation(
    should_send=False,
    delivery_id=67,
    status=DeliveryStatus.UNCERTAIN,
    attempt_count=1,
    reason="production date already reserved with status=uncertain",
  )
  sender = FakeSender()

  result = _service(repository, sender).run(
    target_date=TARGET_DATE,
    delivery_mode=DeliveryMode.PRODUCTION,
    production_confirmed=True,
  )

  assert result.status == "deduplicated"
  assert result.delivery_id == 67
  assert "uncertain" in result.reason
  assert sender.calls == []
  assert repository.finalized == []


@pytest.mark.parametrize("status", [DeliveryStatus.FAILED, DeliveryStatus.UNCERTAIN])
def test_non_success_delivery_is_persisted_and_fails_the_run(status: DeliveryStatus) -> None:
  repository = FakeRepository()
  sender = FakeSender(DeliveryOutcome(
    status=status,
    error_code="fixture_error",
    error_detail="fixture detail",
  ))

  with pytest.raises(BriefDeliveryError) as captured:
    _service(repository, sender).run(
      target_date=TARGET_DATE,
      delivery_mode=DeliveryMode.PRODUCTION,
      production_confirmed=True,
    )

  assert captured.value.outcome.status is status
  assert repository.finalized == [(67, sender.outcome)]


class FakeResponse:
  def __init__(self, status_code: int, payload: Any, text: str = "") -> None:
    self.status_code = status_code
    self.payload = payload
    self.text = text

  def json(self) -> Any:
    if isinstance(self.payload, Exception):
      raise self.payload
    return self.payload


def test_webhook_sender_classifies_success_and_definite_rejection() -> None:
  success = FeishuWebhookSender(
    post=Mock(return_value=FakeResponse(200, {"code": 0})),
  ).send("https://fixture.invalid/hook", {"msg_type": "interactive"})
  rejected = FeishuWebhookSender(
    post=Mock(return_value=FakeResponse(200, {"code": 19001, "msg": "denied"})),
  ).send("https://fixture.invalid/hook", {"msg_type": "interactive"})

  assert success.status is DeliveryStatus.SENT
  assert rejected.status is DeliveryStatus.FAILED
  assert rejected.error_code == "19001"


def test_webhook_sender_treats_server_error_as_uncertain() -> None:
  outcome = FeishuWebhookSender(
    post=Mock(return_value=FakeResponse(502, {}, "upstream failed")),
  ).send("https://fixture.invalid/hook", {"msg_type": "interactive"})

  assert outcome.status is DeliveryStatus.UNCERTAIN
  assert outcome.error_code == "http_502"


@pytest.mark.parametrize(
  "post",
  [
    Mock(side_effect=requests.Timeout("timeout https://secret.invalid/hook")),
    Mock(return_value=FakeResponse(200, ValueError("not json"))),
  ],
)
def test_webhook_sender_treats_ambiguous_outcome_as_uncertain(post: Mock) -> None:
  outcome = FeishuWebhookSender(post=post).send(
    "https://fixture.invalid/hook",
    {"msg_type": "interactive"},
  )

  assert outcome.status is DeliveryStatus.UNCERTAIN
  assert "secret.invalid" not in (outcome.error_detail or "")


def test_sanitize_error_redacts_urls_and_bounds_detail() -> None:
  sanitized = sanitize_error("failed at https://secret.invalid/hook " + "x" * 700)

  assert "secret.invalid" not in sanitized
  assert "[redacted-url]" in sanitized
  assert len(sanitized) == 500


def test_normalize_overview_row_handles_decimal_and_datetime() -> None:
  row = normalize_overview_row({
    "date": datetime(2026, 8, 24, 0, 0),
    "platform": " WX ",
    "gmv": "100.25",
    "gsv": 90,
    "refund_amount_pay_time": None,
    "order_count": 2,
  })

  assert row.record_date == TARGET_DATE
  assert row.platform == "wx"
  assert row.gmv == 100.25
  assert row.refund_amount_pay_time == 0


def test_fetch_records_is_bounded_to_governed_platforms() -> None:
  cursor = Mock()
  cursor.fetchall.return_value = []
  cursor_context = Mock()
  cursor_context.__enter__ = Mock(return_value=cursor)
  cursor_context.__exit__ = Mock(return_value=False)
  connection = Mock()
  connection.cursor.return_value = cursor_context

  repository = PostgresBriefRepository(connection_factory=lambda: connection)
  repository.fetch_records(
    start_date=date(2026, 7, 1),
    end_date=TARGET_DATE,
  )

  sql, parameters = cursor.execute.call_args.args
  assert "platform = ANY(%s)" in sql
  assert parameters[2] == ["douyin", "taobao", "wx", "xhs", "jd"]
  connection.rollback.assert_called_once()
  connection.close.assert_called_once()


def test_required_shop_readiness_reports_missing_douyin_shop() -> None:
  cursor = Mock()
  cursor.fetchall.return_value = [{"shop_id": "149292200"}]
  cursor_context = Mock()
  cursor_context.__enter__ = Mock(return_value=cursor)
  cursor_context.__exit__ = Mock(return_value=False)
  connection = Mock()
  connection.cursor.return_value = cursor_context
  target_records = [
    BriefRecord(TARGET_DATE, platform, 1.0, 1.0, 0.0)
    for platform in ("douyin", "taobao", "wx", "xhs", "jd")
  ]

  issues = PostgresBriefRepository(
    connection_factory=lambda: connection,
  ).find_readiness_issues(
    target_date=TARGET_DATE,
    records=target_records,
    required_shop_ids_by_platform={
      "douyin": ("149292200", "244962248"),
    },
  )

  assert len(issues) == 1
  assert issues[0].issue_type == "source_shop_missing"
  assert issues[0].missing_shop_ids == ("244962248",)
  sql, parameters = cursor.execute.call_args.args
  assert "SELECT DISTINCT shop_id" in sql
  assert parameters == (TARGET_DATE, "全部", "不限")
  connection.rollback.assert_called_once()
  connection.close.assert_called_once()


def test_source_conditions_keep_identifiers_static_and_values_parameterized() -> None:
  conditions, values = PostgresBriefRepository._source_conditions(
    SOURCE_TABLES["douyin"],
    TARGET_DATE,
  )

  assert conditions == "stat_date = %s AND carrier_type = %s AND promotion_period = %s"
  assert values == (TARGET_DATE, "全部", "不限")
  assert SOURCE_TABLES["douyin"].gmv_column == "trade_amount"
