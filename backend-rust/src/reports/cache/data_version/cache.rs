pub(super) type DataVersionCache = tokio::sync::Mutex<Option<(String, i64)>>;

const DATA_VERSION_CACHE_TTL_SECONDS: i64 = 15;

pub(super) async fn get_cached_data_version(
    cache: &DataVersionCache,
    now_epoch_seconds: i64,
) -> Option<String> {
    let guard = cache.lock().await;
    guard.as_ref().and_then(|(cached_version, expires_at)| {
        if *expires_at > now_epoch_seconds {
            Some(cached_version.clone())
        } else {
            None
        }
    })
}

pub(super) async fn set_cached_data_version(
    cache: &DataVersionCache,
    now_epoch_seconds: i64,
    resolved_version: &str,
) {
    let mut guard = cache.lock().await;
    *guard = Some((
        resolved_version.to_string(),
        now_epoch_seconds + DATA_VERSION_CACHE_TTL_SECONDS,
    ));
}
