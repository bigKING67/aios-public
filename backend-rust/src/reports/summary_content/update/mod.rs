mod input;
mod response;
mod storage;

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
    state::AppState,
};

use super::super::{
    summary_storage::ensure_weekly_summary_storage, weekly_query::resolve_week_period,
    WeeklySummaryContentResponse, WeeklySummaryManualUpdatePayload, REPORT_READ_PERMISSIONS,
    REPORT_SUMMARY_EDIT_PERMISSIONS,
};
use input::build_manual_summary_update_input;
use response::build_manual_summary_response;
use storage::upsert_manual_summary_content;

pub(in crate::reports) async fn update_weekly_summary_content(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(report_id): Path<String>,
    Json(payload): Json<WeeklySummaryManualUpdatePayload>,
) -> AppResult<Json<WeeklySummaryContentResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    ensure_any_permission(&current_user, &REPORT_SUMMARY_EDIT_PERMISSIONS)?;
    ensure_weekly_summary_storage(&state.pool).await?;

    let week_period = resolve_week_period(
        &state.pool,
        report_id.as_str(),
        payload.week_period.as_deref(),
    )
    .await?;
    let input = build_manual_summary_update_input(
        &state.pool,
        &current_user,
        week_period.as_str(),
        payload,
    )
    .await?;

    upsert_manual_summary_content(&state.pool, &input).await?;
    super::super::summary_generation::cache_summary_status(
        &state,
        input.week_period.as_str(),
        input.summary_scope.as_str(),
        "SUCCESS",
    )
    .await;

    Ok(Json(build_manual_summary_response(input)))
}
