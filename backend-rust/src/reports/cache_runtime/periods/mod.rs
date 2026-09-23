use std::cmp;

use super::super::{
    monthly::{get_all_month_periods, get_latest_month_period},
    types::PeriodOption,
    weekly_query::{get_all_week_periods, get_latest_week_period},
};
use super::{
    AppResult, AppState, CACHE_KEY_MONTHLY_ALL_PERIODS_FULL, CACHE_KEY_MONTHLY_LATEST_PERIOD,
    CACHE_KEY_WEEKLY_ALL_PERIODS_FULL, CACHE_KEY_WEEKLY_LATEST_PERIOD,
    MONTHLY_PERIODS_CACHE_FILL_LOCKS, PERIODS_CACHE_MAX_ITEMS, WEEKLY_PERIODS_CACHE_FILL_LOCKS,
};

mod bucket;
mod latest;
mod lists;

use bucket::PeriodCacheBucket;
use latest::get_latest_period_with_cache;
use lists::get_periods_with_cache;

pub(crate) async fn get_latest_week_period_with_cache(
    state: &AppState,
    bypass_cache: bool,
) -> AppResult<String> {
    get_latest_period_with_cache(
        state,
        bypass_cache,
        PeriodCacheBucket {
            cache_key: CACHE_KEY_WEEKLY_LATEST_PERIOD,
            lock_map: &WEEKLY_PERIODS_CACHE_FILL_LOCKS,
            ttl_seconds: state.settings.weekly_period_cache_ttl_seconds,
        },
        || async { get_latest_week_period(&state.pool).await },
    )
    .await
}

pub(crate) async fn get_latest_month_period_with_cache(
    state: &AppState,
    bypass_cache: bool,
) -> AppResult<String> {
    get_latest_period_with_cache(
        state,
        bypass_cache,
        PeriodCacheBucket {
            cache_key: CACHE_KEY_MONTHLY_LATEST_PERIOD,
            lock_map: &MONTHLY_PERIODS_CACHE_FILL_LOCKS,
            ttl_seconds: state.settings.monthly_period_cache_ttl_seconds,
        },
        || async { get_latest_month_period(&state.pool).await },
    )
    .await
}

pub(crate) async fn get_weekly_periods_with_cache(
    state: &AppState,
    limit: i64,
    bypass_cache: bool,
) -> AppResult<Vec<PeriodOption>> {
    let safe_limit = cmp::min(limit.max(1), PERIODS_CACHE_MAX_ITEMS);

    get_periods_with_cache(
        state,
        safe_limit,
        bypass_cache,
        PeriodCacheBucket {
            cache_key: CACHE_KEY_WEEKLY_ALL_PERIODS_FULL,
            lock_map: &WEEKLY_PERIODS_CACHE_FILL_LOCKS,
            ttl_seconds: state.settings.weekly_period_cache_ttl_seconds,
        },
        "weekly periods cache refreshed",
        || async { get_all_week_periods(&state.pool, PERIODS_CACHE_MAX_ITEMS).await },
    )
    .await
}

pub(crate) async fn get_monthly_periods_with_cache(
    state: &AppState,
    limit: i64,
    bypass_cache: bool,
) -> AppResult<Vec<PeriodOption>> {
    let safe_limit = cmp::min(limit.max(1), PERIODS_CACHE_MAX_ITEMS);

    get_periods_with_cache(
        state,
        safe_limit,
        bypass_cache,
        PeriodCacheBucket {
            cache_key: CACHE_KEY_MONTHLY_ALL_PERIODS_FULL,
            lock_map: &MONTHLY_PERIODS_CACHE_FILL_LOCKS,
            ttl_seconds: state.settings.monthly_period_cache_ttl_seconds,
        },
        "monthly periods cache refreshed",
        || async { get_all_month_periods(&state.pool, PERIODS_CACHE_MAX_ITEMS).await },
    )
    .await
}
