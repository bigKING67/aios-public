from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, Iterable, Sequence

from .models import BriefRecord, METRIC_KEYS, METRICS


class DailyBriefAggregator:
  def __init__(self, records: Sequence[BriefRecord]):
    self.records = tuple(records)

  @staticmethod
  def week_range(reference_date: date) -> tuple[date, date]:
    days_since_saturday = (reference_date.weekday() - 5) % 7
    week_start = reference_date - timedelta(days=days_since_saturday)
    return week_start, week_start + timedelta(days=6)

  def aggregate_daily(self, target_date: date) -> Dict[str, Any]:
    return self._aggregate(
      record for record in self.records if record.record_date == target_date
    )

  def aggregate_weekly(self, reference_date: date) -> Dict[str, Any]:
    week_start, week_end = self.week_range(reference_date)
    actual_end = min(week_end, reference_date)
    return self._aggregate(
      record
      for record in self.records
      if week_start <= record.record_date <= actual_end
    )

  def aggregate_monthly(self, reference_date: date) -> Dict[str, Any]:
    month_start = reference_date.replace(day=1)
    return self._aggregate(
      record
      for record in self.records
      if month_start <= record.record_date <= reference_date
    )

  def weekly_dates(self, reference_date: date) -> list[date]:
    week_start, week_end = self.week_range(reference_date)
    actual_end = min(week_end, reference_date)
    return sorted({
      record.record_date
      for record in self.records
      if week_start <= record.record_date <= actual_end
    })

  def monthly_dates(self, reference_date: date) -> list[date]:
    month_start = reference_date.replace(day=1)
    return sorted({
      record.record_date
      for record in self.records
      if month_start <= record.record_date <= reference_date
    })

  def aggregate_by_dates(self, dates: Iterable[date]) -> Dict[str, Any]:
    date_set = set(dates)
    return self._aggregate(
      record for record in self.records if record.record_date in date_set
    )

  @staticmethod
  def _aggregate(records: Iterable[BriefRecord]) -> Dict[str, Any]:
    total = {key: 0.0 for key in METRIC_KEYS}
    by_platform: Dict[str, Dict[str, float]] = defaultdict(
      lambda: {key: 0.0 for key in METRIC_KEYS}
    )
    has_records = False
    for record in records:
      has_records = True
      for key in METRIC_KEYS:
        value = record.metric_value(key)
        total[key] += value
        by_platform[record.platform][key] += value

    if not has_records:
      return {"total": total, "platforms": []}

    platforms = []
    sorted_platforms = sorted(
      by_platform.items(),
      key=lambda item: (-item[1].get("GMV", 0.0), item[0]),
    )
    for name, metrics in sorted_platforms:
      share = {
        key: metrics[key] / total[key] if total[key] > 0 else 0.0
        for key in METRIC_KEYS
      }
      platforms.append({"name": name, "metrics": metrics, "share": share})
    return {"total": total, "platforms": platforms}


class DailyBriefComparator:
  def __init__(self, aggregator: DailyBriefAggregator):
    self.aggregator = aggregator

  def daily_change(self, report_date: date) -> Dict[str, Any]:
    return self._calculate(
      self.aggregator.aggregate_daily(report_date),
      self.aggregator.aggregate_daily(report_date - timedelta(days=1)),
    )

  def weekly_change(self, report_date: date) -> Dict[str, Any]:
    current_dates = self.aggregator.weekly_dates(report_date)
    previous_dates = [value - timedelta(days=7) for value in current_dates]
    return self._calculate(
      self.aggregator.aggregate_weekly(report_date),
      self.aggregator.aggregate_by_dates(previous_dates),
    )

  def monthly_change(self, report_date: date) -> Dict[str, Any]:
    previous_month_end = report_date.replace(day=1) - timedelta(days=1)
    previous_month_start = previous_month_end.replace(day=1)
    comparable_days = min(report_date.day, previous_month_end.day)
    previous_dates = [
      previous_month_start + timedelta(days=offset)
      for offset in range(comparable_days)
    ]
    return self._calculate(
      self.aggregator.aggregate_monthly(report_date),
      self.aggregator.aggregate_by_dates(previous_dates),
    )

  @staticmethod
  def _rate(current: float, previous: float) -> float:
    if previous == 0:
      return 0.0 if current == 0 else 1.0
    return (current - previous) / previous

  def _calculate(self, current: Dict[str, Any], previous: Dict[str, Any]) -> Dict[str, Any]:
    result: Dict[str, Any] = {"total": {}, "platforms": []}
    for key in METRIC_KEYS:
      current_value = float(current["total"].get(key, 0) or 0)
      previous_value = float(previous["total"].get(key, 0) or 0)
      result["total"][key] = {
        "value": current_value,
        "change": self._rate(current_value, previous_value),
      }

    previous_by_platform = {
      item["name"]: item for item in previous.get("platforms", [])
    }
    for platform in current.get("platforms", []):
      previous_platform = previous_by_platform.get(platform["name"], {})
      previous_metrics = previous_platform.get("metrics", {})
      metrics: Dict[str, Any] = {}
      for key in METRIC_KEYS:
        current_value = float(platform["metrics"].get(key, 0) or 0)
        previous_value = float(previous_metrics.get(key, 0) or 0)
        metrics[key] = {
          "value": current_value,
          "change": self._rate(current_value, previous_value),
        }
      result["platforms"].append({
        "name": platform["name"],
        "metrics": metrics,
        "share": platform.get("share", {}),
      })
    return result


class DailyBriefRenderer:
  PLATFORM_NAMES = {
    "taobao": "天猫",
    "wx": "微信",
    "jd": "京东",
    "douyin": "抖音",
    "xhs": "小红书",
  }

  def __init__(self, dashboard_url: str):
    self.dashboard_url = dashboard_url

  def render(
    self,
    *,
    daily: Dict[str, Any],
    weekly: Dict[str, Any],
    monthly: Dict[str, Any],
    report_date: date,
  ) -> Dict[str, Any]:
    week_start, week_end = DailyBriefAggregator.week_range(report_date)
    week_end = min(week_end, report_date)
    month_start = report_date.replace(day=1)
    dashboard_link = f"[{self.dashboard_url}]({self.dashboard_url})"
    return {
      "msg_type": "interactive",
      "card": {
        "header": {
          "title": {
            "tag": "plain_text",
            "content": "📊 Groland线上平台生意简报",
          },
          "template": "blue",
        },
        "elements": [
          {
            "tag": "markdown",
            "content": f"**📅 昨日数据** {report_date:%m/%d}",
          },
          {"tag": "markdown", "content": self._render_section(daily)},
          {"tag": "hr"},
          {
            "tag": "markdown",
            "content": f"**📆 本周累计**（{week_start:%m/%d}~{week_end:%m/%d}）",
          },
          {"tag": "markdown", "content": self._render_section(weekly)},
          {"tag": "hr"},
          {
            "tag": "markdown",
            "content": f"**📅 本月累计**（{month_start:%m/%d}~{report_date:%m/%d}）",
          },
          {"tag": "markdown", "content": self._render_section(monthly)},
          {"tag": "hr"},
          {"tag": "markdown", "content": f"更多数据请见👉 {dashboard_link}"},
          {
            "tag": "note",
            "elements": [{
              "tag": "plain_text",
              "content": (
                "备注：非自然周，周六至周五为一周；周环比为上周同期；"
                "月环比为上月1日至同日累计，上月无对应日时截止上月月末"
              ),
            }],
          },
        ],
      },
    }

  def _render_section(self, data: Dict[str, Any]) -> str:
    total = data.get("total", {})
    platforms = data.get("platforms", [])[:5]
    blocks = []
    for metric in METRICS:
      metric_data = total.get(metric.key, {})
      value = float(metric_data.get("value", 0) or 0)
      change = float(metric_data.get("change", 0) or 0)
      lines = [
        f"{metric.emoji} **{metric.name}**: "
        f"{self._format_value(value, metric.is_currency)} "
        f"{self._format_change(change, metric.positive_is_good)}"
      ]
      for platform in platforms:
        platform_metric = platform.get("metrics", {}).get(metric.key, {})
        platform_value = float(platform_metric.get("value", 0) or 0)
        platform_change = float(platform_metric.get("change", 0) or 0)
        platform_share = float(platform.get("share", {}).get(metric.key, 0) or 0)
        platform_name = self.PLATFORM_NAMES.get(
          str(platform.get("name") or "").strip().lower(),
          str(platform.get("name") or "未知"),
        )
        lines.append(
          f"  {platform_name} "
          f"({self._format_value(platform_value, metric.is_currency)}) "
          f"{self._bar(platform_share)} {platform_share:.0%} "
          f"{self._format_change(platform_change, metric.positive_is_good)}"
        )
      blocks.append("\n".join(lines))
    return "\n\n".join(blocks)

  @staticmethod
  def _bar(ratio: float, width: int = 8) -> str:
    bounded_ratio = min(max(ratio, 0.0), 1.0)
    filled = int(bounded_ratio * width)
    return "▓" * filled + "░" * (width - filled)

  @staticmethod
  def _format_value(value: float, is_currency: bool) -> str:
    if is_currency:
      if value >= 10000:
        return f"¥{value / 10000:.1f}万"
      return f"¥{value:,.0f}"
    return f"{value:,.0f}"

  @staticmethod
  def _format_change(change: float, positive_is_good: bool) -> str:
    if change == 0:
      return "→"
    is_good = (change > 0) == positive_is_good
    color = "red" if is_good else "green"
    arrow = "↑" if change > 0 else "↓"
    return f"<font color='{color}'>{arrow}{abs(change * 100):.0f}%</font>"
