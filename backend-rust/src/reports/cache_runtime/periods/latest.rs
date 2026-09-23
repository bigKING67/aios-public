use std::future::Future;

use super::super::{
    get_cached_value, locks::acquire_cache_fill_lock, set_cached_value, AppError, AppResult,
    AppState,
};
use super::bucket::PeriodCacheBucket;

pub(super) async fn get_latest_period_with_cache<F, Fut>(
    state: &AppState,
    bypass_cache: bool,
    bucket: PeriodCacheBucket<'_>,
    fetch_latest_period: F,
) -> AppResult<String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = AppResult<Option<String>>>,
{
    if bypass_cache {
        return fetch_latest_period().await?.ok_or(AppError::NotFound);
    }

    if let Some(cached_period) = get_cached_value::<String>(state, bucket.cache_key).await {
        return Ok(cached_period);
    }

    let lock = acquire_cache_fill_lock(bucket.lock_map, bucket.cache_key).await;
    let _guard = lock.lock().await;

    if let Some(cached_period) = get_cached_value::<String>(state, bucket.cache_key).await {
        return Ok(cached_period);
    }

    let period = fetch_latest_period().await?.ok_or(AppError::NotFound)?;
    set_cached_value(state, bucket.cache_key, bucket.ttl_seconds, &period).await;

    Ok(period)
}
