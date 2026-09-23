use std::{cmp, sync::Arc};

use crate::{
    auth::{ensure_any_permission, CurrentUser},
    error::AppResult,
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    Json,
};

use super::{
    cache_runtime::{
        get_latest_week_period_with_cache, get_or_build_weekly_report,
        get_weekly_periods_with_cache,
    },
    handler_cache::should_bypass_backend_report_cache,
    periods::normalize_week_period_for_api,
    types::{
        WeekPeriodOptionalQuery, WeekPeriodQuery, WeeklyLatestPeriodResponse, WeeklyMetadata,
        WeeklyPeriodsQuery, WeeklyPeriodsResponse, WeeklyReportResponse,
    },
    weekly_query::resolve_week_period,
    REPORT_READ_PERMISSIONS,
};

pub(super) async fn get_weekly_by_period(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<WeekPeriodQuery>,
) -> AppResult<Json<WeeklyReportResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let normalized_week_period = normalize_week_period_for_api(query.week_period.as_str());
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let report =
        get_or_build_weekly_report(&state, normalized_week_period.as_str(), bypass_cache).await?;
    Ok(Json(report))
}

pub(super) async fn get_latest_week_period_handler(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
) -> AppResult<Json<WeeklyLatestPeriodResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let week_period = get_latest_week_period_with_cache(state.as_ref(), bypass_cache).await?;

    Ok(Json(WeeklyLatestPeriodResponse { week_period }))
}

pub(super) async fn get_all_week_periods_handler(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<WeeklyPeriodsQuery>,
) -> AppResult<Json<WeeklyPeriodsResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let limit = cmp::min(query.limit.unwrap_or(50).max(1), 200);
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let periods = get_weekly_periods_with_cache(&state, limit, bypass_cache).await?;

    Ok(Json(WeeklyPeriodsResponse { periods }))
}

pub(super) async fn get_weekly_report(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Path(report_id): Path<String>,
    Query(query): Query<WeekPeriodOptionalQuery>,
) -> AppResult<Json<WeeklyReportResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let query_period = resolve_week_period(
        &state.pool,
        report_id.as_str(),
        query.week_period.as_deref(),
    )
    .await?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let mut report =
        get_or_build_weekly_report(&state, query_period.as_str(), bypass_cache).await?;

    report.metadata.report_id = report_id;
    Ok(Json(report))
}

pub(super) async fn get_weekly_metadata(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Path(report_id): Path<String>,
    Query(query): Query<WeekPeriodOptionalQuery>,
) -> AppResult<Json<WeeklyMetadata>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let query_period = resolve_week_period(
        &state.pool,
        report_id.as_str(),
        query.week_period.as_deref(),
    )
    .await?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let report = get_or_build_weekly_report(&state, query_period.as_str(), bypass_cache).await?;

    Ok(Json(report.metadata))
}
