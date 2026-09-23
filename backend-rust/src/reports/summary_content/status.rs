use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
    state::AppState,
};

use super::super::{
    summary_generation::{normalize_weekly_summary_scope, query_weekly_summary_record},
    summary_storage::ensure_weekly_summary_storage,
    weekly_query::resolve_week_period,
    WeekPeriodSummaryScopeQuery, WeeklySummaryStatusResponse, REPORT_READ_PERMISSIONS,
    WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT,
};

pub(in crate::reports) async fn get_weekly_summary_status(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(report_id): Path<String>,
    Query(query): Query<WeekPeriodSummaryScopeQuery>,
) -> AppResult<Json<WeeklySummaryStatusResponse>> {
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
            .await?;

    let response = if let Some(record) = summary_record {
        WeeklySummaryStatusResponse {
            report_id,
            week_period,
            summary_scope: summary_scope.clone(),
            triggered: true,
            status: record.status,
            content_status: record.content_status,
            task_id: record.task_id,
            generated_at: record.generated_at.map(|value| value.to_rfc3339()),
            error_msg: record.error_msg,
            attempt_count: record.attempt_count,
            provider: record.provider,
            model: record.model,
            updated_by: record.updated_by,
            approved_by: record.approved_by,
            approved_at: record.approved_at.map(|value| value.to_rfc3339()),
            published_by: record.published_by,
            published_at: record.published_at.map(|value| value.to_rfc3339()),
        }
    } else {
        WeeklySummaryStatusResponse {
            report_id,
            week_period,
            summary_scope,
            triggered: false,
            status: "NONE".to_string(),
            content_status: WEEKLY_SUMMARY_CONTENT_STATUS_AI_DRAFT.to_string(),
            task_id: None,
            generated_at: None,
            error_msg: None,
            attempt_count: 0,
            provider: None,
            model: None,
            updated_by: None,
            approved_by: None,
            approved_at: None,
            published_by: None,
            published_at: None,
        }
    };

    Ok(Json(response))
}
