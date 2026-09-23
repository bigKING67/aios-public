use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::{
    summary_storage::{is_legacy_week_unique_violation, is_unique_violation},
    WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT,
};

pub(super) struct ResetWeeklySummaryTaskInput<'a> {
    pub(super) pool: &'a PgPool,
    pub(super) normalized_week_period: &'a str,
    pub(super) summary_scope: &'a str,
    pub(super) task_id: &'a str,
    pub(super) provider: &'a str,
    pub(super) model: &'a str,
    pub(super) prompt_config: &'a serde_json::Value,
    pub(super) facts_snapshot: &'a serde_json::Value,
    pub(super) requested_by: &'a str,
}

pub(super) async fn reset_existing_weekly_summary_task(
    input: ResetWeeklySummaryTaskInput<'_>,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET
            status = 'PENDING',
            summary_content_status = $1,
            summary_updated_by = NULL,
            summary_approved_by = NULL,
            summary_approved_at = NULL,
            summary_published_by = NULL,
            summary_published_at = NULL,
            summary_text = NULL,
            generated_at = NULL,
            task_id = $2,
            provider = $3,
            model = $4,
            error_msg = NULL,
            prompt_config = $5,
            facts_snapshot = $6,
            attempt_count = COALESCE(attempt_count, 0) + 1,
            requested_by = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $8
          AND summary_scope = $9
        "#,
    )
    .bind(WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT)
    .bind(input.task_id)
    .bind(input.provider)
    .bind(input.model)
    .bind(input.prompt_config)
    .bind(input.facts_snapshot)
    .bind(input.requested_by)
    .bind(input.normalized_week_period)
    .bind(input.summary_scope)
    .execute(input.pool)
    .await
    .map_err(|error| {
        if is_legacy_week_unique_violation(&error) {
            return AppError::bad_request(
                "周报总结索引仍为旧口径（按 week_period 唯一），请完成 summary_scope 索引迁移后重试。",
            );
        }
        if is_unique_violation(&error) {
            return AppError::bad_request("总结任务状态冲突，请刷新后重试。");
        }
        error!(?error, "update weekly summary task failed");
        AppError::Internal
    })?;

    Ok(())
}
