use std::{cmp, sync::Arc, time::Instant};

use tracing::info;

use self::{
    detail_warmup::{warmup_monthly_report_details, warmup_weekly_report_details},
    parallelism::resolve_effective_warmup_parallelism,
};
use super::{
    cache::set_cached_value,
    cache_runtime::{
        CACHE_KEY_MONTHLY_ALL_PERIODS_FULL, CACHE_KEY_MONTHLY_LATEST_PERIOD,
        CACHE_KEY_WEEKLY_ALL_PERIODS_FULL, CACHE_KEY_WEEKLY_LATEST_PERIOD, PERIODS_CACHE_MAX_ITEMS,
    },
    monthly::{get_all_month_periods, get_latest_month_period},
    weekly_query::{get_all_week_periods, get_latest_week_period},
};
use crate::{error::AppResult, state::AppState};

mod detail_warmup;
mod parallelism;
mod scheduler;

pub(super) use scheduler::spawn_report_cache_warmup;

async fn warmup_report_cache(state: Arc<AppState>) -> AppResult<()> {
    let warmup_started = Instant::now();
    let effective_warmup_parallelism = resolve_effective_warmup_parallelism(state.as_ref());

    if let Some(latest_week_period) = get_latest_week_period(&state.pool).await? {
        set_cached_value(
            state.as_ref(),
            CACHE_KEY_WEEKLY_LATEST_PERIOD,
            state.settings.weekly_period_cache_ttl_seconds,
            &latest_week_period,
        )
        .await;
    }

    if let Some(latest_month_period) = get_latest_month_period(&state.pool).await? {
        set_cached_value(
            state.as_ref(),
            CACHE_KEY_MONTHLY_LATEST_PERIOD,
            state.settings.monthly_period_cache_ttl_seconds,
            &latest_month_period,
        )
        .await;
    }

    let weekly_warmup_limit = cmp::min(
        state.settings.report_warmup_weekly_period_limit.max(1),
        PERIODS_CACHE_MAX_ITEMS,
    );
    let monthly_warmup_limit = cmp::min(
        state.settings.report_warmup_monthly_period_limit.max(1),
        PERIODS_CACHE_MAX_ITEMS,
    );

    let weekly_periods = get_all_week_periods(&state.pool, weekly_warmup_limit).await?;
    let monthly_periods = get_all_month_periods(&state.pool, monthly_warmup_limit).await?;

    set_cached_value(
        state.as_ref(),
        CACHE_KEY_WEEKLY_ALL_PERIODS_FULL,
        state.settings.weekly_period_cache_ttl_seconds,
        &weekly_periods,
    )
    .await;
    set_cached_value(
        state.as_ref(),
        CACHE_KEY_MONTHLY_ALL_PERIODS_FULL,
        state.settings.monthly_period_cache_ttl_seconds,
        &monthly_periods,
    )
    .await;

    let (weekly_success, weekly_failed) = warmup_weekly_report_details(
        Arc::clone(&state),
        weekly_periods,
        effective_warmup_parallelism,
    )
    .await;
    let (monthly_success, monthly_failed) = warmup_monthly_report_details(
        Arc::clone(&state),
        monthly_periods,
        effective_warmup_parallelism,
    )
    .await;

    info!(
        weekly_warmup_success = weekly_success,
        weekly_warmup_failed = weekly_failed,
        monthly_warmup_success = monthly_success,
        monthly_warmup_failed = monthly_failed,
        warmup_parallelism = effective_warmup_parallelism,
        warmup_parallelism_configured = state.settings.report_warmup_parallelism,
        db_max_connections = state.settings.db_max_connections,
        report_build_concurrency = state.settings.report_build_concurrency,
        warmup_ms = warmup_started.elapsed().as_millis(),
        "report cache warmup completed"
    );

    Ok(())
}
