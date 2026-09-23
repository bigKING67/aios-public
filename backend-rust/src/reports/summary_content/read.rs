use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use tracing::warn;

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::{
    summary_conclusions::parse_summary_conclusions,
    summary_generation::{normalize_weekly_summary_scope, query_weekly_summary_record},
    summary_storage::ensure_weekly_summary_storage,
    weekly_query::resolve_week_period,
    WeekPeriodSummaryScopeQuery, WeeklySummaryContentResponse, REPORT_READ_PERMISSIONS,
};

pub(in crate::reports) async fn get_weekly_summary_content(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(report_id): Path<String>,
    Query(query): Query<WeekPeriodSummaryScopeQuery>,
) -> AppResult<Json<WeeklySummaryContentResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    ensure_weekly_summary_storage(&state.pool).await?;

    let week_period = resolve_week_period(
        &state.pool,
        report_id.as_str(),
        query.week_period.as_deref(),
    )
    .await?;
    let summary_scope = normalize_weekly_summary_scope(query.summary_scope.as_deref());

    let summary_record =
        query_weekly_summary_record(&state.pool, week_period.as_str(), summary_scope.as_str())
            .await?
            .ok_or(AppError::NotFound)?;

    if summary_record.status != "SUCCESS" {
        return Err(AppError::NotFound);
    }

    let summary_text = summary_record
        .summary_text
        .unwrap_or_else(|| "{}".to_string());
    let conclusions = parse_summary_conclusions(summary_text.as_str()).map_err(|error| {
        warn!(
            ?error,
            "summary text parse failed, fallback to default structure"
        );
        AppError::Internal
    })?;

    Ok(Json(WeeklySummaryContentResponse {
        week_period,
        summary_scope,
        status: "SUCCESS".to_string(),
        content_status: summary_record.content_status,
        task_id: summary_record.task_id,
        provider: summary_record.provider,
        model: summary_record.model,
        generated_at: summary_record.generated_at.map(|value| value.to_rfc3339()),
        updated_by: summary_record.updated_by,
        approved_by: summary_record.approved_by,
        approved_at: summary_record.approved_at.map(|value| value.to_rfc3339()),
        published_by: summary_record.published_by,
        published_at: summary_record.published_at.map(|value| value.to_rfc3339()),
        message: None,
        conclusions,
    }))
}
