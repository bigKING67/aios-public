use std::{future::Future, time::Instant};

use tracing::info;

use super::super::{
    get_cached_value, locks::acquire_cache_fill_lock, set_cached_value, AppResult, AppState,
};
use super::{
    bucket::{take_period_items, PeriodCacheBucket},
    PeriodOption,
};

pub(super) async fn get_periods_with_cache<F, Fut>(
    state: &AppState,
    safe_limit: i64,
    bypass_cache: bool,
    bucket: PeriodCacheBucket<'_>,
    refresh_log_message: &'static str,
    fetch_periods: F,
) -> AppResult<Vec<PeriodOption>>
where
    F: Fn() -> Fut,
    Fut: Future<Output = AppResult<Vec<PeriodOption>>>,
{
    if bypass_cache {
        let periods = fetch_periods().await?;
        return Ok(take_period_items(periods.as_slice(), safe_limit));
    }

    if let Some(cached_periods) =
        get_cached_value::<Vec<PeriodOption>>(state, bucket.cache_key).await
    {
        return Ok(take_period_items(cached_periods.as_slice(), safe_limit));
    }

    let lock = acquire_cache_fill_lock(bucket.lock_map, bucket.cache_key).await;
    let _guard = lock.lock().await;

    if let Some(cached_periods) =
        get_cached_value::<Vec<PeriodOption>>(state, bucket.cache_key).await
    {
        return Ok(take_period_items(cached_periods.as_slice(), safe_limit));
    }

    let query_started = Instant::now();
    let periods = fetch_periods().await?;
    set_cached_value(state, bucket.cache_key, bucket.ttl_seconds, &periods).await;
    info!(
        cache_key = bucket.cache_key,
        count = periods.len(),
        query_ms = query_started.elapsed().as_millis(),
        message = refresh_log_message,
        "periods cache refreshed"
    );

    Ok(take_period_items(periods.as_slice(), safe_limit))
}
