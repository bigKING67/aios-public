use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::super::events::insert_event;
use super::super::guards::ensure_updated;
use super::super::write_errors::map_write_error;

const CONTENT_ASSET_AI_LONG_VIDEO_SECONDS: f64 = 30.0 * 60.0;

pub(crate) async fn retry_processing_job(
    pool: &PgPool,
    job_id: Uuid,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let row = sqlx::query(
        r#"
        SELECT
          job.asset_id,
          job.status,
          job.job_type,
          asset.duration_seconds::FLOAT8 AS duration_seconds
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.job_id = $1
          AND asset.is_deleted = FALSE
        "#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "query processing job before retry failed"))?;
    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let asset_id: Uuid = row.get("asset_id");
    let status: String = row.try_get("status").unwrap_or_default();
    let job_type: String = row.try_get("job_type").unwrap_or_default();
    if !matches!(status.as_str(), "failed" | "cancelled") {
        return Err(AppError::bad_request(
            "只有失败或已取消的处理任务可以重新排队",
        ));
    }
    let duration_seconds: Option<f64> = row.try_get("duration_seconds").ok();
    if matches!(job_type.as_str(), "analysis" | "transcript")
        && duration_seconds
            .map(|duration| duration >= CONTENT_ASSET_AI_LONG_VIDEO_SECONDS)
            .unwrap_or(false)
    {
        return Err(AppError::bad_request(
            "视频超过 30 分钟，不建议重新排队 AI 分析或脚本/SRT 任务",
        ));
    }

    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_processing_jobs
        SET
          status = 'queued',
          attempts = 0,
          error_message = NULL,
          started_at = NULL,
          finished_at = NULL,
          metadata = (
            COALESCE(metadata, '{}'::jsonb)
              - 'processing_error_category'
              - 'processing_error_label'
              - 'processing_error_helper'
          ) || jsonb_build_object(
            'manual_retry_by', $2,
            'manual_retry_at', CURRENT_TIMESTAMP,
            'processing_stage', 'queued',
            'processing_stage_label', '已重新排队',
            'processing_progress_percent', 5,
            'processing_stage_updated_at', CURRENT_TIMESTAMP::TEXT
          )
        WHERE job_id = $1
          AND status IN ('failed', 'cancelled')
        "#,
    )
    .bind(job_id)
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "retry processing job failed"))?
    .rows_affected();
    ensure_updated(rows_affected)?;

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET asset_status = CASE
          WHEN asset_status = 'failed' THEN 'pending_processing'
          ELSE asset_status
        END
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "sync asset status after processing job retry failed"))?;

    insert_event(
        pool,
        asset_id,
        "processing_job_retried",
        actor,
        Some("处理任务已重新排队"),
        json!({ "job_id": job_id, "previous_status": status }),
    )
    .await?;
    Ok(asset_id)
}

pub(crate) async fn cancel_processing_job(
    pool: &PgPool,
    job_id: Uuid,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let row = sqlx::query(
        r#"
        SELECT job.asset_id, job.status
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.job_id = $1
          AND asset.is_deleted = FALSE
        "#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "query processing job before cancel failed"))?;
    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let asset_id: Uuid = row.get("asset_id");
    let status: String = row.try_get("status").unwrap_or_default();
    if status != "queued" {
        return Err(AppError::bad_request(
            "只有排队中的处理任务可以取消；运行中的任务需要等待 worker 结束",
        ));
    }

    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_processing_jobs
        SET
          status = 'cancelled',
          error_message = NULL,
          started_at = NULL,
          finished_at = CURRENT_TIMESTAMP,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('manual_cancel_by', $2, 'manual_cancel_at', CURRENT_TIMESTAMP)
        WHERE job_id = $1
          AND status = 'queued'
        "#,
    )
    .bind(job_id)
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "cancel processing job failed"))?
    .rows_affected();
    ensure_updated(rows_affected)?;

    insert_event(
        pool,
        asset_id,
        "processing_job_cancelled",
        actor,
        Some("排队处理任务已取消"),
        json!({ "job_id": job_id }),
    )
    .await?;
    Ok(asset_id)
}

pub(crate) async fn reset_stale_processing_job(
    pool: &PgPool,
    job_id: Uuid,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    let row = sqlx::query(
        r#"
        SELECT job.asset_id, job.status
        FROM ads.marketing_content_asset_processing_jobs job
        JOIN ads.marketing_content_assets asset ON asset.asset_id = job.asset_id
        WHERE job.job_id = $1
          AND asset.is_deleted = FALSE
        "#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "query processing job before stale reset failed"))?;
    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let asset_id: Uuid = row.get("asset_id");
    let status: String = row.try_get("status").unwrap_or_default();
    if status != "running" {
        return Err(AppError::bad_request("只有运行中的处理任务可以做超时标记"));
    }

    let error_message = "运行超过 30 分钟且没有进度更新，已由人工标记为超时失败，可确认后重试";
    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_processing_jobs
        SET
          status = 'failed',
          error_message = $2,
          finished_at = CURRENT_TIMESTAMP,
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'manual_timeout_by', $3,
            'manual_timeout_at', CURRENT_TIMESTAMP,
            'processing_stage', 'failed',
            'processing_stage_label', '任务运行超时',
            'processing_error_category', 'worker_stale',
            'processing_error_label', '任务运行超时',
            'processing_error_helper', 'worker 长时间没有更新进度，已标记失败；确认没有后台进程继续处理后可以重试。'
          )
        WHERE job_id = $1
          AND status = 'running'
          AND started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
          AND updated_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'
        "#,
    )
    .bind(job_id)
    .bind(error_message)
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "reset stale processing job failed"))?
    .rows_affected();
    if rows_affected == 0 {
        return Err(AppError::bad_request(
            "该任务尚未达到 30 分钟无进度更新的超时条件",
        ));
    }

    insert_event(
        pool,
        asset_id,
        "processing_job_marked_timeout",
        actor,
        Some("运行中任务已标记为超时失败"),
        json!({ "job_id": job_id }),
    )
    .await?;
    Ok(asset_id)
}
