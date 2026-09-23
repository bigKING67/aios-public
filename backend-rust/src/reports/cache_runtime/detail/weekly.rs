use std::{sync::Arc, time::Instant};

use tracing::{error, info};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

use super::super::super::{
    build_weekly_report,
    cache::{
        resolve_weekly_report_data_version, should_trigger_detail_cache_refresh,
        weekly_report_cache_key,
    },
    WeeklyReportResponse,
};
use super::super::{
    locks::acquire_cache_fill_lock,
    payload::{get_cached_weekly_report_payload, set_cached_weekly_report},
};
use super::background::schedule_weekly_report_background_refresh;
use super::state::WEEKLY_REPORT_CACHE_FILL_LOCKS;

pub(in crate::reports) async fn get_or_build_weekly_report(
    state: &Arc<AppState>,
    week_period: &str,
    bypass_cache: bool,
) -> AppResult<WeeklyReportResponse> {
    if bypass_cache {
        let build_started = Instant::now();
        let permit_wait_started = Instant::now();
        let _permit = state
            .report_build_semaphore
            .acquire()
            .await
            .map_err(|error| {
                error!(
                    ?error,
                    week_period = %week_period,
                    "weekly report rebuild aborted because build semaphore is closed"
                );
                AppError::Internal
            })?;
        let permit_wait_ms = permit_wait_started.elapsed().as_millis();
        let build_query_started = Instant::now();
        let report = build_weekly_report(&state.pool, week_period).await?;
        info!(
            week_period = %week_period,
            permit_wait_ms,
            build_query_ms = build_query_started.elapsed().as_millis(),
            build_ms = build_started.elapsed().as_millis(),
            "weekly report bypassed cache and rebuilt"
        );
        return Ok(report);
    }

    let data_version = resolve_weekly_report_data_version(&state.pool).await;
    let cache_key = weekly_report_cache_key(week_period, data_version.as_str());
    if let Some(cached) = get_cached_weekly_report_payload(state.as_ref(), cache_key.as_str()).await
    {
        if should_trigger_detail_cache_refresh(
            cached.cached_at_epoch_seconds,
            state.settings.weekly_report_cache_ttl_seconds,
        ) {
            schedule_weekly_report_background_refresh(
                Arc::clone(state),
                week_period.to_string(),
                cache_key.clone(),
            )
            .await;
        }
        return Ok(cached.payload);
    }

    let lock = acquire_cache_fill_lock(&WEEKLY_REPORT_CACHE_FILL_LOCKS, cache_key.as_str()).await;
    let _guard = lock.lock().await;

    if let Some(cached) = get_cached_weekly_report_payload(state.as_ref(), cache_key.as_str()).await
    {
        return Ok(cached.payload);
    }

    let build_started = Instant::now();
    let permit_wait_started = Instant::now();
    let _permit = state
        .report_build_semaphore
        .acquire()
        .await
        .map_err(|error| {
            error!(
                ?error,
                week_period = %week_period,
                "weekly report cache miss rebuild aborted because build semaphore is closed"
            );
            AppError::Internal
        })?;
    let permit_wait_ms = permit_wait_started.elapsed().as_millis();
    let build_query_started = Instant::now();
    let report = build_weekly_report(&state.pool, week_period).await?;
    set_cached_weekly_report(state.as_ref(), cache_key.as_str(), &report).await;
    info!(
        week_period = %week_period,
        data_version = %data_version,
        permit_wait_ms,
        build_query_ms = build_query_started.elapsed().as_millis(),
        build_ms = build_started.elapsed().as_millis(),
        "weekly report cache miss rebuilt"
    );
    Ok(report)
}
