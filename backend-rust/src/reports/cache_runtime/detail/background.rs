use std::{sync::Arc, time::Instant};

use tracing::{info, warn};

use crate::state::AppState;

use super::super::super::{build_weekly_report, monthly_report::build_monthly_report};
use super::super::{
    locks::{
        acquire_cache_fill_lock, mark_background_refresh_done, try_mark_background_refreshing,
    },
    payload::{set_cached_monthly_report, set_cached_weekly_report},
};
use super::state::{
    MONTHLY_REPORT_BACKGROUND_REFRESHING, MONTHLY_REPORT_CACHE_FILL_LOCKS,
    WEEKLY_REPORT_BACKGROUND_REFRESHING, WEEKLY_REPORT_CACHE_FILL_LOCKS,
};

pub(super) async fn schedule_weekly_report_background_refresh(
    state: Arc<AppState>,
    week_period: String,
    cache_key: String,
) {
    if !try_mark_background_refreshing(&WEEKLY_REPORT_BACKGROUND_REFRESHING, cache_key.as_str())
        .await
    {
        return;
    }

    tokio::spawn(async move {
        let refresh_started = Instant::now();
        let lock =
            acquire_cache_fill_lock(&WEEKLY_REPORT_CACHE_FILL_LOCKS, cache_key.as_str()).await;
        let _guard = lock.lock().await;

        let permit_wait_started = Instant::now();
        let permit = state.report_build_semaphore.acquire().await;
        let _permit = match permit {
            Ok(permit) => permit,
            Err(error) => {
                warn!(
                    ?error,
                    week_period = %week_period,
                    "weekly report background refresh skipped because build semaphore is closed"
                );
                mark_background_refresh_done(
                    &WEEKLY_REPORT_BACKGROUND_REFRESHING,
                    cache_key.as_str(),
                )
                .await;
                return;
            }
        };
        let permit_wait_ms = permit_wait_started.elapsed().as_millis();

        let build_started = Instant::now();
        match build_weekly_report(&state.pool, week_period.as_str()).await {
            Ok(report) => {
                set_cached_weekly_report(state.as_ref(), cache_key.as_str(), &report).await;
                info!(
                    week_period = %week_period,
                    permit_wait_ms,
                    build_query_ms = build_started.elapsed().as_millis(),
                    refresh_ms = refresh_started.elapsed().as_millis(),
                    "weekly report background refresh completed"
                );
            }
            Err(error) => warn!(
                ?error,
                week_period = %week_period,
                refresh_ms = refresh_started.elapsed().as_millis(),
                "weekly report background refresh failed"
            ),
        }

        mark_background_refresh_done(&WEEKLY_REPORT_BACKGROUND_REFRESHING, cache_key.as_str())
            .await;
    });
}

pub(super) async fn schedule_monthly_report_background_refresh(
    state: Arc<AppState>,
    month_period: String,
    cache_key: String,
) {
    if !try_mark_background_refreshing(&MONTHLY_REPORT_BACKGROUND_REFRESHING, cache_key.as_str())
        .await
    {
        return;
    }

    tokio::spawn(async move {
        let refresh_started = Instant::now();
        let lock =
            acquire_cache_fill_lock(&MONTHLY_REPORT_CACHE_FILL_LOCKS, cache_key.as_str()).await;
        let _guard = lock.lock().await;

        let permit_wait_started = Instant::now();
        let permit = state.report_build_semaphore.acquire().await;
        let _permit = match permit {
            Ok(permit) => permit,
            Err(error) => {
                warn!(
                    ?error,
                    month_period = %month_period,
                    "monthly report background refresh skipped because build semaphore is closed"
                );
                mark_background_refresh_done(
                    &MONTHLY_REPORT_BACKGROUND_REFRESHING,
                    cache_key.as_str(),
                )
                .await;
                return;
            }
        };
        let permit_wait_ms = permit_wait_started.elapsed().as_millis();

        let build_started = Instant::now();
        match build_monthly_report(&state.pool, month_period.as_str()).await {
            Ok(report) => {
                set_cached_monthly_report(state.as_ref(), cache_key.as_str(), &report).await;
                info!(
                    month_period = %month_period,
                    permit_wait_ms,
                    build_query_ms = build_started.elapsed().as_millis(),
                    refresh_ms = refresh_started.elapsed().as_millis(),
                    "monthly report background refresh completed"
                );
            }
            Err(error) => warn!(
                ?error,
                month_period = %month_period,
                refresh_ms = refresh_started.elapsed().as_millis(),
                "monthly report background refresh failed"
            ),
        }

        mark_background_refresh_done(&MONTHLY_REPORT_BACKGROUND_REFRESHING, cache_key.as_str())
            .await;
    });
}
