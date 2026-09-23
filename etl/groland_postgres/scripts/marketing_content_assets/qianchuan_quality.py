from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import psycopg2.extras

from .repository import connect_pg


@dataclass
class QianchuanQualityIssue:
  severity: str
  code: str
  message: str

  def to_dict(self) -> Dict[str, str]:
    return {
      "severity": self.severity,
      "code": self.code,
      "message": self.message,
    }


@dataclass
class QianchuanQualityResult:
  status: str
  ingest_id: Optional[str]
  start_date: Optional[str]
  end_date: Optional[str]
  metrics: Dict[str, Any]
  issues: List[QianchuanQualityIssue]

  def to_dict(self) -> Dict[str, Any]:
    return {
      "status": self.status,
      "ingestId": self.ingest_id,
      "startDate": self.start_date,
      "endDate": self.end_date,
      "metrics": self.metrics,
      "issues": [issue.to_dict() for issue in self.issues],
    }


@dataclass
class QianchuanQualityThresholds:
  min_ods_rows: int = 1
  min_dwd_rows: int = 1
  min_material_id_rate: float = 0.98
  warn_matched_rate: float = 0.60
  fail_matched_rate: float = 0.0
  max_unmatched_rows_warning: int = 1000
  max_unmatched_rows_failure: int = 10000
  max_date_span_days_warning: int = 31
  max_parse_null_rate_warning: float = 0.10


def check_qianchuan_material_report_quality(
  *,
  ingest_id: str | None = None,
  start_date: str | None = None,
  end_date: str | None = None,
  thresholds: QianchuanQualityThresholds | None = None,
) -> QianchuanQualityResult:
  normalized_ingest_id = _clean_text(ingest_id)
  normalized_start_date = _normalize_date(start_date)
  normalized_end_date = _normalize_date(end_date)
  if normalized_start_date and normalized_end_date and normalized_start_date > normalized_end_date:
    raise ValueError("--start-date cannot be later than --end-date")

  resolved_thresholds = thresholds or QianchuanQualityThresholds()
  with connect_pg() as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
      ods_summary = _query_ods_summary(
        cur,
        ingest_id=normalized_ingest_id,
        start_date=normalized_start_date,
        end_date=normalized_end_date,
      )
      dwd_summary = _query_dwd_summary(
        cur,
        ingest_id=normalized_ingest_id,
        start_date=normalized_start_date,
        end_date=normalized_end_date,
      )
      parse_summary = _query_parse_summary(
        cur,
        ingest_id=normalized_ingest_id,
        start_date=normalized_start_date,
        end_date=normalized_end_date,
      )

  metrics = _build_metrics(ods_summary, dwd_summary, parse_summary)
  issues = _evaluate_quality(metrics, resolved_thresholds)
  status = _resolve_status(issues)
  return QianchuanQualityResult(
    status=status,
    ingest_id=normalized_ingest_id,
    start_date=normalized_start_date,
    end_date=normalized_end_date,
    metrics=metrics,
    issues=issues,
  )


def _query_ods_summary(
  cur: psycopg2.extras.RealDictCursor,
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Dict[str, Any]:
  filters, params = _build_ods_filters(
    "raw",
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
  )
  cur.execute(
    f"""
    SELECT
      COUNT(*)::BIGINT AS ods_rows,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(external_material_id), '') IS NULL)::BIGINT AS material_id_missing_rows,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(account_id), '') IS NULL)::BIGINT AS account_id_missing_rows,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(raw_cost), '') IS NOT NULL)::BIGINT AS raw_cost_present_rows,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(raw_gmv), '') IS NOT NULL)::BIGINT AS raw_gmv_present_rows,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(raw_impressions), '') IS NOT NULL)::BIGINT AS raw_impressions_present_rows,
      COUNT(DISTINCT raw_payload_hash)::BIGINT AS distinct_payload_hashes,
      MIN(stat_date)::TEXT AS first_stat_date,
      MAX(stat_date)::TEXT AS last_stat_date,
      COUNT(DISTINCT stat_date)::BIGINT AS distinct_stat_dates,
      GREATEST(COALESCE(MAX(stat_date) - MIN(stat_date), 0), 0)::INTEGER AS date_span_days
    FROM ods.qianchuan_material_daily_report_raw raw
    WHERE {filters}
    """,
    params,
  )
  return dict(cur.fetchone() or {})


def _query_dwd_summary(
  cur: psycopg2.extras.RealDictCursor,
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Dict[str, Any]:
  filters, params = _build_dwd_filters(
    "dwd",
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
  )
  cur.execute(
    f"""
    SELECT
      COUNT(*)::BIGINT AS dwd_rows,
      COUNT(*) FILTER (WHERE match_status = 'matched')::BIGINT AS matched_rows,
      COUNT(*) FILTER (WHERE match_status = 'unmatched')::BIGINT AS unmatched_rows,
      COUNT(*) FILTER (WHERE match_status = 'pending_confirm')::BIGINT AS pending_confirm_rows,
      COUNT(*) FILTER (WHERE match_status = 'ambiguous')::BIGINT AS ambiguous_rows,
      COUNT(DISTINCT asset_id) FILTER (WHERE asset_id IS NOT NULL)::BIGINT AS matched_asset_count,
      COUNT(DISTINCT external_material_id)::BIGINT AS material_count,
      COALESCE(SUM(impressions), 0)::BIGINT AS impressions,
      COALESCE(SUM(clicks), 0)::BIGINT AS clicks,
      COALESCE(SUM(conversions), 0)::BIGINT AS conversions,
      COALESCE(SUM(cost), 0)::FLOAT8 AS cost,
      COALESCE(SUM(gmv), 0)::FLOAT8 AS gmv,
      CASE WHEN COALESCE(SUM(cost), 0) > 0 THEN (COALESCE(SUM(gmv), 0) / NULLIF(SUM(cost), 0))::FLOAT8 ELSE NULL::FLOAT8 END AS roi,
      MIN(stat_date)::TEXT AS first_stat_date,
      MAX(stat_date)::TEXT AS last_stat_date
    FROM dwd.marketing_content_ad_material_stats_di dwd
    WHERE {filters}
    """,
    params,
  )
  return dict(cur.fetchone() or {})


def _query_parse_summary(
  cur: psycopg2.extras.RealDictCursor,
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Dict[str, Any]:
  filters, params = _build_dwd_filters(
    "dwd",
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
  )
  cur.execute(
    f"""
    SELECT
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(raw.raw_cost), '') IS NOT NULL
          AND dwd.cost IS NULL
      )::BIGINT AS cost_parse_null_rows,
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(raw.raw_gmv), '') IS NOT NULL
          AND dwd.gmv IS NULL
      )::BIGINT AS gmv_parse_null_rows,
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(raw.raw_impressions), '') IS NOT NULL
          AND dwd.impressions IS NULL
      )::BIGINT AS impressions_parse_null_rows,
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(raw.raw_ctr), '') IS NOT NULL
          AND dwd.ctr IS NULL
      )::BIGINT AS ctr_parse_null_rows,
      COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(raw.raw_cvr), '') IS NOT NULL
          AND dwd.cvr IS NULL
      )::BIGINT AS cvr_parse_null_rows
    FROM dwd.marketing_content_ad_material_stats_di dwd
    LEFT JOIN ods.qianchuan_material_daily_report_raw raw
      ON raw.ingest_id = dwd.source_ingest_id
     AND raw.raw_payload_hash = dwd.source_row_hash
    WHERE {filters}
    """,
    params,
  )
  return dict(cur.fetchone() or {})


def _build_metrics(
  ods_summary: Dict[str, Any],
  dwd_summary: Dict[str, Any],
  parse_summary: Dict[str, Any],
) -> Dict[str, Any]:
  ods_rows = _int_metric(ods_summary, "ods_rows")
  dwd_rows = _int_metric(dwd_summary, "dwd_rows")
  matched_rows = _int_metric(dwd_summary, "matched_rows")
  material_missing_rows = _int_metric(ods_summary, "material_id_missing_rows")
  duplicate_payload_rows = max(ods_rows - _int_metric(ods_summary, "distinct_payload_hashes"), 0)
  parse_null_rows = sum(
    _int_metric(parse_summary, key)
    for key in (
      "cost_parse_null_rows",
      "gmv_parse_null_rows",
      "impressions_parse_null_rows",
      "ctr_parse_null_rows",
      "cvr_parse_null_rows",
    )
  )
  return {
    "odsRows": ods_rows,
    "dwdRows": dwd_rows,
    "matchedRows": matched_rows,
    "unmatchedRows": _int_metric(dwd_summary, "unmatched_rows"),
    "pendingConfirmRows": _int_metric(dwd_summary, "pending_confirm_rows"),
    "ambiguousRows": _int_metric(dwd_summary, "ambiguous_rows"),
    "matchedAssetCount": _int_metric(dwd_summary, "matched_asset_count"),
    "materialCount": _int_metric(dwd_summary, "material_count"),
    "materialIdMissingRows": material_missing_rows,
    "materialIdRate": _rate(ods_rows - material_missing_rows, ods_rows),
    "duplicatePayloadRows": duplicate_payload_rows,
    "duplicatePayloadRate": _rate(duplicate_payload_rows, ods_rows),
    "matchedRate": _rate(matched_rows, dwd_rows),
    "parseNullRows": parse_null_rows,
    "parseNullRate": _rate(parse_null_rows, max(dwd_rows, 1) * 5),
    "costParseNullRows": _int_metric(parse_summary, "cost_parse_null_rows"),
    "gmvParseNullRows": _int_metric(parse_summary, "gmv_parse_null_rows"),
    "impressionsParseNullRows": _int_metric(parse_summary, "impressions_parse_null_rows"),
    "ctrParseNullRows": _int_metric(parse_summary, "ctr_parse_null_rows"),
    "cvrParseNullRows": _int_metric(parse_summary, "cvr_parse_null_rows"),
    "firstStatDate": dwd_summary.get("first_stat_date") or ods_summary.get("first_stat_date"),
    "lastStatDate": dwd_summary.get("last_stat_date") or ods_summary.get("last_stat_date"),
    "distinctStatDates": _int_metric(ods_summary, "distinct_stat_dates"),
    "dateSpanDays": _int_metric(ods_summary, "date_span_days"),
    "impressions": _int_metric(dwd_summary, "impressions"),
    "clicks": _int_metric(dwd_summary, "clicks"),
    "conversions": _int_metric(dwd_summary, "conversions"),
    "cost": _float_metric(dwd_summary, "cost"),
    "gmv": _float_metric(dwd_summary, "gmv"),
    "roi": _float_metric(dwd_summary, "roi"),
  }


def _evaluate_quality(
  metrics: Dict[str, Any],
  thresholds: QianchuanQualityThresholds,
) -> List[QianchuanQualityIssue]:
  issues: List[QianchuanQualityIssue] = []
  ods_rows = int(metrics["odsRows"])
  dwd_rows = int(metrics["dwdRows"])
  unmatched_rows = int(metrics["unmatchedRows"])
  if ods_rows < thresholds.min_ods_rows:
    issues.append(QianchuanQualityIssue("failed", "ODS_EMPTY", "ODS 千川素材日报为空或未入库"))
  if dwd_rows < thresholds.min_dwd_rows:
    issues.append(QianchuanQualityIssue("failed", "DWD_EMPTY", "DWD 千川素材日报为空或未清洗"))
  if ods_rows > 0 and metrics["materialIdRate"] < thresholds.min_material_id_rate:
    issues.append(
      QianchuanQualityIssue(
        "failed",
        "MATERIAL_ID_RATE_LOW",
        f"素材 ID 非空率过低: {metrics['materialIdRate']:.2%}",
      )
    )
  if dwd_rows > 0 and metrics["matchedRate"] < thresholds.fail_matched_rate:
    issues.append(
      QianchuanQualityIssue(
        "failed",
        "MATCHED_RATE_CRITICAL",
        f"DWD 匹配率过低: {metrics['matchedRate']:.2%}",
      )
    )
  elif dwd_rows > 0 and metrics["matchedRate"] < thresholds.warn_matched_rate:
    issues.append(
      QianchuanQualityIssue(
        "warning",
        "MATCHED_RATE_LOW",
        f"DWD 匹配率偏低: {metrics['matchedRate']:.2%}",
      )
    )
  if unmatched_rows >= thresholds.max_unmatched_rows_failure:
    issues.append(
      QianchuanQualityIssue(
        "failed",
        "UNMATCHED_ROWS_CRITICAL",
        f"未匹配日报行过多: {unmatched_rows}",
      )
    )
  elif unmatched_rows >= thresholds.max_unmatched_rows_warning:
    issues.append(
      QianchuanQualityIssue(
        "warning",
        "UNMATCHED_ROWS_HIGH",
        f"未匹配日报行偏多: {unmatched_rows}",
      )
    )
  if int(metrics["dateSpanDays"]) > thresholds.max_date_span_days_warning:
    issues.append(
      QianchuanQualityIssue(
        "warning",
        "DATE_SPAN_TOO_WIDE",
        f"日报日期跨度过大: {metrics['dateSpanDays']} 天",
      )
    )
  if metrics["parseNullRate"] > thresholds.max_parse_null_rate_warning:
    issues.append(
      QianchuanQualityIssue(
        "warning",
        "PARSE_NULL_RATE_HIGH",
        f"指标解析为空比例偏高: {metrics['parseNullRate']:.2%}",
      )
    )
  return issues


def _resolve_status(issues: List[QianchuanQualityIssue]) -> str:
  if any(issue.severity == "failed" for issue in issues):
    return "failed"
  if issues:
    return "warning"
  return "ok"


def _build_ods_filters(
  alias: str,
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Tuple[str, Tuple[Any, ...]]:
  clauses = [f"{alias}.source_system = 'qianchuan'", f"{alias}.report_type = 'material_daily'"]
  params: List[Any] = []
  if ingest_id:
    clauses.append(f"{alias}.ingest_id = %s")
    params.append(ingest_id)
  if start_date:
    clauses.append(f"{alias}.stat_date >= %s")
    params.append(start_date)
  if end_date:
    clauses.append(f"{alias}.stat_date <= %s")
    params.append(end_date)
  return " AND ".join(clauses), tuple(params)


def _build_dwd_filters(
  alias: str,
  *,
  ingest_id: str | None,
  start_date: str | None,
  end_date: str | None,
) -> Tuple[str, Tuple[Any, ...]]:
  clauses = [f"{alias}.source_system = 'qianchuan'", f"{alias}.ad_platform = 'qianchuan'"]
  params: List[Any] = []
  if ingest_id:
    clauses.append(f"{alias}.source_ingest_id = %s")
    params.append(ingest_id)
  if start_date:
    clauses.append(f"{alias}.stat_date >= %s")
    params.append(start_date)
  if end_date:
    clauses.append(f"{alias}.stat_date <= %s")
    params.append(end_date)
  return " AND ".join(clauses), tuple(params)


def _normalize_date(value: str | None) -> Optional[str]:
  normalized = _clean_text(value)
  if not normalized:
    return None
  try:
    return datetime.strptime(normalized, "%Y-%m-%d").date().isoformat()
  except ValueError as error:
    raise ValueError(f"日期格式应为 YYYY-MM-DD: {value}") from error


def _clean_text(value: str | None) -> Optional[str]:
  if value is None:
    return None
  normalized = str(value).strip()
  return normalized or None


def _int_metric(row: Dict[str, Any], key: str) -> int:
  value = row.get(key)
  if value is None:
    return 0
  return int(value)


def _float_metric(row: Dict[str, Any], key: str) -> Optional[float]:
  value = row.get(key)
  if value is None:
    return None
  return float(value)


def _rate(numerator: int, denominator: int) -> float:
  if denominator <= 0:
    return 0.0
  return float(numerator) / float(denominator)


def _parse_thresholds(args: argparse.Namespace) -> QianchuanQualityThresholds:
  return QianchuanQualityThresholds(
    min_ods_rows=args.min_ods_rows,
    min_dwd_rows=args.min_dwd_rows,
    min_material_id_rate=args.min_material_id_rate,
    warn_matched_rate=args.warn_matched_rate,
    fail_matched_rate=args.fail_matched_rate,
    max_unmatched_rows_warning=args.max_unmatched_rows_warning,
    max_unmatched_rows_failure=args.max_unmatched_rows_failure,
    max_date_span_days_warning=args.max_date_span_days_warning,
    max_parse_null_rate_warning=args.max_parse_null_rate_warning,
  )


def build_arg_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(description="检查千川素材日报 ODS/DWD 数据质量")
  parser.add_argument("--ingest-id", default="", help="可选：只检查指定 ingest_id")
  parser.add_argument("--start-date", default="", help="可选：检查起始日期 YYYY-MM-DD")
  parser.add_argument("--end-date", default="", help="可选：检查结束日期 YYYY-MM-DD")
  parser.add_argument("--min-ods-rows", type=int, default=1)
  parser.add_argument("--min-dwd-rows", type=int, default=1)
  parser.add_argument("--min-material-id-rate", type=float, default=0.98)
  parser.add_argument("--warn-matched-rate", type=float, default=0.60)
  parser.add_argument("--fail-matched-rate", type=float, default=0.0)
  parser.add_argument("--max-unmatched-rows-warning", type=int, default=1000)
  parser.add_argument("--max-unmatched-rows-failure", type=int, default=10000)
  parser.add_argument("--max-date-span-days-warning", type=int, default=31)
  parser.add_argument("--max-parse-null-rate-warning", type=float, default=0.10)
  parser.add_argument("--fail-on-warning", action="store_true")
  return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = build_arg_parser()
  args = parser.parse_args(argv)
  result = check_qianchuan_material_report_quality(
    ingest_id=args.ingest_id or None,
    start_date=args.start_date or None,
    end_date=args.end_date or None,
    thresholds=_parse_thresholds(args),
  )
  print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
  if result.status == "failed":
    return 2
  if result.status == "warning" and args.fail_on_warning:
    return 3
  return 0
