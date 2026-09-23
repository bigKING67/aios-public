use sqlx::PgPool;
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
};

use super::super::super::{
    periods::normalize_week_period_for_db,
    summary_conclusions::sanitize_summary_conclusions,
    summary_generation::{normalize_weekly_summary_scope, query_weekly_summary_record},
    Conclusions, WeeklySummaryManualUpdatePayload,
};

pub(super) struct ManualSummaryUpdateInput {
    pub(super) week_period: String,
    pub(super) normalized_week_period: String,
    pub(super) summary_scope: String,
    pub(super) conclusions: Conclusions,
    pub(super) summary_text: String,
    pub(super) provider: String,
    pub(super) model: String,
    pub(super) task_id: String,
    pub(super) requested_by: String,
    pub(super) existing_record: bool,
}

pub(super) async fn build_manual_summary_update_input(
    pool: &PgPool,
    current_user: &CurrentUser,
    week_period: &str,
    payload: WeeklySummaryManualUpdatePayload,
) -> AppResult<ManualSummaryUpdateInput> {
    let summary_scope = normalize_weekly_summary_scope(payload.summary_scope.as_deref());
    let normalized_week_period = normalize_week_period_for_db(week_period);
    let conclusions = sanitize_summary_conclusions(payload.conclusions);

    if conclusions.overall.is_empty() {
        return Err(AppError::bad_request("总体概况不能为空"));
    }

    let existing = query_weekly_summary_record(pool, week_period, summary_scope.as_str()).await?;
    let provider = payload
        .provider
        .and_then(|value| {
            let trimmed = value.trim().to_lowercase();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .or_else(|| existing.as_ref().and_then(|record| record.provider.clone()))
        .unwrap_or_else(|| "manual".to_string());
    let model = payload
        .model
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .or_else(|| existing.as_ref().and_then(|record| record.model.clone()))
        .unwrap_or_else(|| "manual-edit".to_string());
    let task_id = existing
        .as_ref()
        .and_then(|record| record.task_id.clone())
        .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
    let requested_by = current_user
        .username
        .clone()
        .unwrap_or_else(|| "manual".to_string());
    let summary_text = serde_json::to_string(&conclusions).map_err(|error| {
        error!(?error, "serialize manual summary failed");
        AppError::Internal
    })?;

    Ok(ManualSummaryUpdateInput {
        week_period: week_period.to_string(),
        normalized_week_period,
        summary_scope,
        conclusions,
        summary_text,
        provider,
        model,
        task_id,
        requested_by,
        existing_record: existing.is_some(),
    })
}
