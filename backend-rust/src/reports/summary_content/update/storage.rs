use sqlx::PgPool;
use tracing::error;

use crate::{
    error::{AppError, AppResult},
    reports::{
        summary_storage::{is_legacy_week_unique_violation, is_unique_violation},
        WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED,
    },
};

use super::input::ManualSummaryUpdateInput;

pub(super) async fn upsert_manual_summary_content(
    pool: &PgPool,
    input: &ManualSummaryUpdateInput,
) -> AppResult<()> {
    if input.existing_record {
        update_manual_summary_content(pool, input).await
    } else {
        insert_manual_summary_content(pool, input).await
    }
}

async fn update_manual_summary_content(
    pool: &PgPool,
    input: &ManualSummaryUpdateInput,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET
            status = 'SUCCESS',
            summary_content_status = $1,
            summary_updated_by = $2,
            summary_approved_by = NULL,
            summary_approved_at = NULL,
            summary_published_by = NULL,
            summary_published_at = NULL,
            summary_text = $3,
            generated_at = CURRENT_TIMESTAMP,
            error_msg = NULL,
            task_id = $4,
            provider = $5,
            model = $6,
            requested_by = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $8
          AND summary_scope = $9
        "#,
    )
    .bind(WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED)
    .bind(input.requested_by.as_str())
    .bind(input.summary_text.as_str())
    .bind(input.task_id.as_str())
    .bind(input.provider.as_str())
    .bind(input.model.as_str())
    .bind(input.requested_by.as_str())
    .bind(input.normalized_week_period.as_str())
    .bind(input.summary_scope.as_str())
    .execute(pool)
    .await
    .map_err(|error| {
        error!(?error, "update manual summary failed");
        AppError::Internal
    })?;

    Ok(())
}

async fn insert_manual_summary_content(
    pool: &PgPool,
    input: &ManualSummaryUpdateInput,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO ads.report_weekly_summary (
            week_period,
            summary_scope,
            summary_text,
            status,
            summary_content_status,
            summary_updated_by,
            generated_at,
            error_msg,
            task_id,
            provider,
            model,
            attempt_count,
            requested_by,
            created_at,
            updated_at
        )
        VALUES (
            $1, $2, $3, 'SUCCESS', $4, $5, CURRENT_TIMESTAMP, NULL, $6, $7, $8, 0, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        "#,
    )
    .bind(input.normalized_week_period.as_str())
    .bind(input.summary_scope.as_str())
    .bind(input.summary_text.as_str())
    .bind(WEEKLY_SUMMARY_CONTENT_STATUS_MANUAL_EDITED)
    .bind(input.requested_by.as_str())
    .bind(input.task_id.as_str())
    .bind(input.provider.as_str())
    .bind(input.model.as_str())
    .bind(input.requested_by.as_str())
    .execute(pool)
    .await
    .map_err(|error| {
        if is_legacy_week_unique_violation(&error) {
            return AppError::bad_request(
                "周报总结索引仍为旧口径（按 week_period 唯一），请完成 summary_scope 索引迁移后重试。",
            );
        }
        if is_unique_violation(&error) {
            return AppError::bad_request("总结记录已存在，请刷新后重试。");
        }
        error!(?error, "insert manual summary failed");
        AppError::Internal
    })?;

    Ok(())
}
