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
        get_latest_month_period_with_cache, get_monthly_periods_with_cache,
        get_or_build_monthly_report,
    },
    handler_cache::should_bypass_backend_report_cache,
    periods::normalize_month_period_for_api,
    types::{
        MonthlyLatestPeriodResponse, MonthlyMetadata, MonthlyPeriodQuery, MonthlyPeriodsQuery,
        MonthlyPeriodsResponse, MonthlyReportResponse,
    },
    REPORT_READ_PERMISSIONS,
};

pub(super) async fn get_monthly_by_period(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<MonthlyPeriodQuery>,
) -> AppResult<Json<MonthlyReportResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let normalized_month_period = normalize_month_period_for_api(query.month_period.as_str())?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let report =
        get_or_build_monthly_report(&state, normalized_month_period.as_str(), bypass_cache).await?;
    Ok(Json(report))
}

pub(super) async fn get_monthly_report(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Path(month_period): Path<String>,
) -> AppResult<Json<MonthlyReportResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let normalized_month_period = normalize_month_period_for_api(month_period.as_str())?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let report =
        get_or_build_monthly_report(&state, normalized_month_period.as_str(), bypass_cache).await?;
    Ok(Json(report))
}

pub(super) async fn get_monthly_metadata(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Path(month_period): Path<String>,
) -> AppResult<Json<MonthlyMetadata>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let normalized_month_period = normalize_month_period_for_api(month_period.as_str())?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let report =
        get_or_build_monthly_report(&state, normalized_month_period.as_str(), bypass_cache).await?;

    Ok(Json(report.metadata))
}

pub(super) async fn get_latest_month_period_handler(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
) -> AppResult<Json<MonthlyLatestPeriodResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let month_period = get_latest_month_period_with_cache(state.as_ref(), bypass_cache).await?;

    Ok(Json(MonthlyLatestPeriodResponse { month_period }))
}

pub(super) async fn get_all_month_periods_handler(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    headers: HeaderMap,
    Query(query): Query<MonthlyPeriodsQuery>,
) -> AppResult<Json<MonthlyPeriodsResponse>> {
    ensure_any_permission(&current_user, &REPORT_READ_PERMISSIONS)?;

    let limit = cmp::min(query.limit.unwrap_or(50).max(1), 200);
    let bypass_cache = should_bypass_backend_report_cache(&headers);
    let periods = get_monthly_periods_with_cache(&state, limit, bypass_cache).await?;

    Ok(Json(MonthlyPeriodsResponse { periods }))
}
