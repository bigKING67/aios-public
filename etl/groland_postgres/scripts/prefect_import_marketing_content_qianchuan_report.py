from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

from prefect import flow, get_run_logger, task


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.qianchuan_reports import (  # noqa: E402
  build_qianchuan_material_dwd,
  import_qianchuan_material_daily_report,
)
from marketing_content_assets.performance_rollups import (  # noqa: E402
  refresh_marketing_content_performance_rollups,
)
from marketing_content_assets.qianchuan_quality import (  # noqa: E402
  QianchuanQualityThresholds,
  check_qianchuan_material_report_quality,
)


@task(name="import-qianchuan-material-report-ods")
def import_qianchuan_material_report_ods_task(
  file_path: str,
  ingest_id: Optional[str],
  stat_date: Optional[str],
  encoding: str,
  dry_run: bool,
) -> dict:
  return import_qianchuan_material_daily_report(
    file_path,
    ingest_id=ingest_id,
    default_stat_date=stat_date,
    encoding=encoding,
    dry_run=dry_run,
  ).to_dict()


@task(name="build-qianchuan-material-report-dwd")
def build_qianchuan_material_report_dwd_task(
  ingest_id: Optional[str],
  start_date: Optional[str],
  end_date: Optional[str],
  dry_run: bool,
) -> dict:
  return build_qianchuan_material_dwd(
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
    dry_run=dry_run,
  ).to_dict()


@task(name="refresh-marketing-content-performance-rollups-after-qianchuan")
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


@task(name="check-qianchuan-material-report-quality")
def check_qianchuan_material_report_quality_task(
  ingest_id: Optional[str],
  start_date: Optional[str],
  end_date: Optional[str],
  min_ods_rows: int,
  min_dwd_rows: int,
  min_material_id_rate: float,
  warn_matched_rate: float,
  fail_matched_rate: float,
  max_unmatched_rows_warning: int,
  max_unmatched_rows_failure: int,
  max_date_span_days_warning: int,
  max_parse_null_rate_warning: float,
  fail_on_error: bool,
  fail_on_warning: bool,
) -> dict:
  result = check_qianchuan_material_report_quality(
    ingest_id=ingest_id,
    start_date=start_date,
    end_date=end_date,
    thresholds=QianchuanQualityThresholds(
      min_ods_rows=min_ods_rows,
      min_dwd_rows=min_dwd_rows,
      min_material_id_rate=min_material_id_rate,
      warn_matched_rate=warn_matched_rate,
      fail_matched_rate=fail_matched_rate,
      max_unmatched_rows_warning=max_unmatched_rows_warning,
      max_unmatched_rows_failure=max_unmatched_rows_failure,
      max_date_span_days_warning=max_date_span_days_warning,
      max_parse_null_rate_warning=max_parse_null_rate_warning,
    ),
  )
  payload = result.to_dict()
  logger = get_run_logger()
  logger.info("qianchuan report quality payload=%s", payload)
  if result.status == "failed" and fail_on_error:
    raise RuntimeError(f"qianchuan report quality failed: {payload}")
  if result.status == "warning" and fail_on_warning:
    raise RuntimeError(f"qianchuan report quality warning: {payload}")
  return payload


@flow(name="import-marketing-content-qianchuan-report")
def import_marketing_content_qianchuan_report_flow(
  file_path: str = "",
  ingest_id: Optional[str] = None,
  stat_date: Optional[str] = None,
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  encoding: str = "utf-8-sig",
  dry_run: bool = False,
  ods_only: bool = False,
  dwd_only: bool = False,
  refresh_rollups: bool = False,
  quality_check: bool = True,
  quality_fail_on_error: bool = True,
  quality_fail_on_warning: bool = False,
  quality_min_ods_rows: int = 1,
  quality_min_dwd_rows: int = 1,
  quality_min_material_id_rate: float = 0.98,
  quality_warn_matched_rate: float = 0.60,
  quality_fail_matched_rate: float = 0.0,
  quality_max_unmatched_rows_warning: int = 1000,
  quality_max_unmatched_rows_failure: int = 10000,
  quality_max_date_span_days_warning: int = 31,
  quality_max_parse_null_rate_warning: float = 0.10,
) -> dict:
  logger = get_run_logger()
  if dwd_only:
    logger.info("building qianchuan material DWD ingest_id=%s", ingest_id)
    result = {
      "dwd": build_qianchuan_material_report_dwd_task(
        ingest_id=ingest_id,
        start_date=start_date,
        end_date=end_date,
        dry_run=dry_run,
      )
    }
    if quality_check and not dry_run:
      result["quality"] = check_qianchuan_material_report_quality_task(
        ingest_id=ingest_id,
        start_date=start_date,
        end_date=end_date,
        min_ods_rows=quality_min_ods_rows,
        min_dwd_rows=quality_min_dwd_rows,
        min_material_id_rate=quality_min_material_id_rate,
        warn_matched_rate=quality_warn_matched_rate,
        fail_matched_rate=quality_fail_matched_rate,
        max_unmatched_rows_warning=quality_max_unmatched_rows_warning,
        max_unmatched_rows_failure=quality_max_unmatched_rows_failure,
        max_date_span_days_warning=quality_max_date_span_days_warning,
        max_parse_null_rate_warning=quality_max_parse_null_rate_warning,
        fail_on_error=quality_fail_on_error,
        fail_on_warning=quality_fail_on_warning,
      )
    if refresh_rollups:
      result["rollups"] = refresh_marketing_content_performance_rollups_task(
        start_date=start_date,
        end_date=end_date,
        dry_run=dry_run,
      )
    return result
  if not file_path:
    raise ValueError("file_path is required unless dwd_only=true")
  if ods_only:
    logger.info("importing qianchuan material report ODS file=%s", file_path)
    return {
      "import": import_qianchuan_material_report_ods_task(
        file_path=file_path,
        ingest_id=ingest_id,
        stat_date=stat_date,
        encoding=encoding,
        dry_run=dry_run,
      )
    }
  logger.info("running qianchuan material report pipeline file=%s", file_path)
  import_result = import_qianchuan_material_report_ods_task(
    file_path=file_path,
    ingest_id=ingest_id,
    stat_date=stat_date,
    encoding=encoding,
    dry_run=dry_run,
  )
  resolved_ingest_id = import_result.get("ingestId")
  dwd_result = build_qianchuan_material_report_dwd_task(
    ingest_id=resolved_ingest_id,
    start_date=None,
    end_date=None,
    dry_run=dry_run,
  )
  result = {
    "import": import_result,
    "dwd": dwd_result,
  }
  if quality_check and not dry_run:
    quality_result = check_qianchuan_material_report_quality_task(
      ingest_id=resolved_ingest_id,
      start_date=None,
      end_date=None,
      min_ods_rows=quality_min_ods_rows,
      min_dwd_rows=quality_min_dwd_rows,
      min_material_id_rate=quality_min_material_id_rate,
      warn_matched_rate=quality_warn_matched_rate,
      fail_matched_rate=quality_fail_matched_rate,
      max_unmatched_rows_warning=quality_max_unmatched_rows_warning,
      max_unmatched_rows_failure=quality_max_unmatched_rows_failure,
      max_date_span_days_warning=quality_max_date_span_days_warning,
      max_parse_null_rate_warning=quality_max_parse_null_rate_warning,
      fail_on_error=quality_fail_on_error,
      fail_on_warning=quality_fail_on_warning,
    )
    result["quality"] = quality_result
  if refresh_rollups:
    quality_metrics = result.get("quality", {}).get("metrics", {}) if isinstance(result.get("quality"), dict) else {}
    rollup_start_date = quality_metrics.get("firstStatDate") or stat_date
    rollup_end_date = quality_metrics.get("lastStatDate") or stat_date
    result["rollups"] = refresh_marketing_content_performance_rollups_task(
      start_date=rollup_start_date,
      end_date=rollup_end_date,
      dry_run=dry_run,
    )
  return result


if __name__ == "__main__":
  import_marketing_content_qianchuan_report_flow(
    file_path=os.getenv("CONTENT_ASSET_QIANCHUAN_REPORT_FILE", ""),
    ingest_id=os.getenv("CONTENT_ASSET_QIANCHUAN_INGEST_ID") or None,
    stat_date=os.getenv("CONTENT_ASSET_QIANCHUAN_STAT_DATE") or None,
    start_date=os.getenv("CONTENT_ASSET_QIANCHUAN_START_DATE") or None,
    end_date=os.getenv("CONTENT_ASSET_QIANCHUAN_END_DATE") or None,
    encoding=os.getenv("CONTENT_ASSET_QIANCHUAN_REPORT_ENCODING", "utf-8-sig"),
    dry_run=os.getenv("CONTENT_ASSET_QIANCHUAN_DRY_RUN", "0") == "1",
    ods_only=os.getenv("CONTENT_ASSET_QIANCHUAN_ODS_ONLY", "0") == "1",
    dwd_only=os.getenv("CONTENT_ASSET_QIANCHUAN_DWD_ONLY", "0") == "1",
    refresh_rollups=os.getenv("CONTENT_ASSET_QIANCHUAN_REFRESH_ROLLUPS", "0") == "1",
    quality_check=os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_CHECK", "1") == "1",
    quality_fail_on_error=os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_FAIL_ON_ERROR", "1") == "1",
    quality_fail_on_warning=os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_FAIL_ON_WARNING", "0") == "1",
    quality_min_ods_rows=int(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MIN_ODS_ROWS", "1")),
    quality_min_dwd_rows=int(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MIN_DWD_ROWS", "1")),
    quality_min_material_id_rate=float(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MIN_MATERIAL_ID_RATE", "0.98")),
    quality_warn_matched_rate=float(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_WARN_MATCHED_RATE", "0.60")),
    quality_fail_matched_rate=float(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_FAIL_MATCHED_RATE", "0.0")),
    quality_max_unmatched_rows_warning=int(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MAX_UNMATCHED_ROWS_WARNING", "1000")),
    quality_max_unmatched_rows_failure=int(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MAX_UNMATCHED_ROWS_FAILURE", "10000")),
    quality_max_date_span_days_warning=int(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MAX_DATE_SPAN_DAYS_WARNING", "31")),
    quality_max_parse_null_rate_warning=float(os.getenv("CONTENT_ASSET_QIANCHUAN_QUALITY_MAX_PARSE_NULL_RATE_WARNING", "0.10")),
  )
