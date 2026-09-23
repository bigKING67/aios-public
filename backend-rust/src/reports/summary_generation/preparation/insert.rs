use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::{
    summary_storage::{is_legacy_week_unique_violation, is_unique_violation},
    WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT,
};
use super::super::{records::query_weekly_summary_record, types::PreparedSummaryTask};

pub(super) struct InsertWeeklySummaryTaskInput<'a> {
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

pub(super) async fn insert_weekly_summary_task(
    input: InsertWeeklySummaryTaskInput<'_>,
) -> AppResult<Option<PreparedSummaryTask>> {
    let insert_result = sqlx::query(
        r#"
        INSERT INTO ads.report_weekly_summary (
            week_period,
            summary_scope,
            status,
            summary_content_status,
            task_id,
            provider,
            model,
            prompt_config,
            facts_snapshot,
            attempt_count,
            requested_by,
            created_at,
            updated_at
        )
        VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, 1, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        "#,
    )
    .bind(input.normalized_week_period)
    .bind(input.summary_scope)
    .bind(WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT)
    .bind(input.task_id)
    .bind(input.provider)
    .bind(input.model)
    .bind(input.prompt_config)
    .bind(input.facts_snapshot)
    .bind(input.requested_by)
    .execute(input.pool)
    .await;

    match insert_result {
        Ok(_) => Ok(None),
        Err(error) if is_legacy_week_unique_violation(&error) => Err(AppError::bad_request(
            "周报总结索引仍为旧口径（按 week_period 唯一），请完成 summary_scope 索引迁移后重试。",
        )),
        Err(error) if is_unique_violation(&error) => {
            // 并发点击“生成总结”时，另一条请求可能已经插入同 scope 任务。
            if let Some(latest_record) = query_weekly_summary_record(
                input.pool,
                input.normalized_week_period,
                input.summary_scope,
            )
            .await?
            {
                return Ok(Some(PreparedSummaryTask {
                    should_enqueue: false,
                    status: latest_record.status.to_uppercase(),
                    task_id: latest_record
                        .task_id
                        .unwrap_or_else(|| input.task_id.to_string()),
                }));
            }

            error!(
                ?error,
                "insert weekly summary task conflicted but no record found"
            );
            Err(AppError::bad_request("总结任务正在处理中，请刷新后重试。"))
        }
        Err(error) => {
            error!(?error, "insert weekly summary task failed");
            Err(AppError::Internal)
        }
    }
}
