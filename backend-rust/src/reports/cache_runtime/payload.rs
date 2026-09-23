use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

use super::super::{
    cache::{get_cached_value, set_cached_value},
    MonthlyReportResponse, WeeklyReportResponse,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct CachedPayload<T> {
    pub(super) payload: T,
    pub(super) cached_at_epoch_seconds: i64,
}

pub(super) async fn get_cached_weekly_report_payload(
    state: &AppState,
    cache_key: &str,
) -> Option<CachedPayload<WeeklyReportResponse>> {
    if let Some(cached) =
        get_cached_value::<CachedPayload<WeeklyReportResponse>>(state, cache_key).await
    {
        return Some(cached);
    }

    let legacy = get_cached_value::<WeeklyReportResponse>(state, cache_key).await?;
    Some(CachedPayload {
        payload: legacy,
        cached_at_epoch_seconds: Utc::now().timestamp(),
    })
}

pub(super) async fn get_cached_monthly_report_payload(
    state: &AppState,
    cache_key: &str,
) -> Option<CachedPayload<MonthlyReportResponse>> {
    if let Some(cached) =
        get_cached_value::<CachedPayload<MonthlyReportResponse>>(state, cache_key).await
    {
        return Some(cached);
    }

    let legacy = get_cached_value::<MonthlyReportResponse>(state, cache_key).await?;
    Some(CachedPayload {
        payload: legacy,
        cached_at_epoch_seconds: Utc::now().timestamp(),
    })
}

pub(super) async fn set_cached_weekly_report(
    state: &AppState,
    cache_key: &str,
    report: &WeeklyReportResponse,
) {
    let wrapped = CachedPayload {
        payload: report.clone(),
        cached_at_epoch_seconds: Utc::now().timestamp(),
    };
    set_cached_value(
        state,
        cache_key,
        state.settings.weekly_report_cache_ttl_seconds,
        &wrapped,
    )
    .await;
}

pub(super) async fn set_cached_monthly_report(
    state: &AppState,
    cache_key: &str,
    report: &MonthlyReportResponse,
) {
    let wrapped = CachedPayload {
        payload: report.clone(),
        cached_at_epoch_seconds: Utc::now().timestamp(),
    };
    set_cached_value(
        state,
        cache_key,
        state.settings.monthly_report_cache_ttl_seconds,
        &wrapped,
    )
    .await;
}
