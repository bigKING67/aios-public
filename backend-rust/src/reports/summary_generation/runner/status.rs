use tracing::error;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::super::{
    summary_storage::is_undefined_table, WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT,
};
use super::super::cache::cache_summary_status;
use super::types::GeneratedSummary;

pub(super) async fn mark_weekly_summary_generating(
    state: &AppState,
    normalized_week_period: &str,
    summary_scope: &str,
    task_id: &str,
) -> AppResult<bool> {
    let moved = sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET status = 'GENERATING', updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $1 AND summary_scope = $2 AND task_id = $3 AND status = 'PENDING'
        "#,
    )
    .bind(normalized_week_period)
    .bind(summary_scope)
    .bind(task_id)
    .execute(&state.pool)
    .await;

    match moved {
        Ok(result) => Ok(result.rows_affected() > 0),
        Err(error) if is_undefined_table(&error) => Ok(false),
        Err(error) => {
            error!(?error, "mark summary generating failed");
            Err(AppError::Internal)
        }
    }
}

pub(super) async fn persist_weekly_summary_facts(
    state: &AppState,
    normalized_week_period: &str,
    summary_scope: &str,
    task_id: &str,
    facts: serde_json::Value,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET facts_snapshot = $1, updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $2 AND summary_scope = $3 AND task_id = $4
        "#,
    )
    .bind(facts)
    .bind(normalized_week_period)
    .bind(summary_scope)
    .bind(task_id)
    .execute(&state.pool)
    .await
    .map_err(|error| {
        error!(?error, "persist merged summary facts failed");
        AppError::Internal
    })?;

    Ok(())
}

pub(super) async fn mark_weekly_summary_success(
    state: &AppState,
    normalized_week_period: &str,
    summary_scope: &str,
    task_id: &str,
    generated: GeneratedSummary,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET
            status = 'SUCCESS',
            summary_content_status = $1,
            summary_updated_by = NULL,
            summary_approved_by = NULL,
            summary_approved_at = NULL,
            summary_published_by = NULL,
            summary_published_at = NULL,
            summary_text = $2,
            provider = $3,
            model = $4,
            generated_at = CURRENT_TIMESTAMP,
            error_msg = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $5 AND summary_scope = $6 AND task_id = $7
        "#,
    )
    .bind(WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT)
    .bind(generated.summary_text)
    .bind(generated.provider)
    .bind(generated.model)
    .bind(normalized_week_period)
    .bind(summary_scope)
    .bind(task_id)
    .execute(&state.pool)
    .await
    .map_err(|error| {
        error!(?error, "mark summary success failed");
        AppError::Internal
    })?;

    Ok(())
}

pub(super) async fn mark_weekly_summary_failed(
    state: &AppState,
    normalized_week_period: &str,
    summary_scope: &str,
    week_period_for_cache: &str,
    task_id: &str,
    error_message: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.report_weekly_summary
        SET
            status = 'FAILED',
            error_msg = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE week_period = $2 AND summary_scope = $3 AND task_id = $4
        "#,
    )
    .bind(error_message)
    .bind(normalized_week_period)
    .bind(summary_scope)
    .bind(task_id)
    .execute(&state.pool)
    .await
    .map_err(|error| {
        error!(?error, "mark summary failed failed");
        AppError::Internal
    })?;

    cache_summary_status(state, week_period_for_cache, summary_scope, "FAILED").await;
    Ok(())
}
