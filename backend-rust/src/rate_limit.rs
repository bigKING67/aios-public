//! Fixed-window request counters in Dragonfly. Callers own the key layout
//! and decide whether an unavailable limiter fails open or closed.
use dragonfly_client::RedisError;
use tracing::warn;

use crate::state::AppState;

/// Increments `key` and sets its TTL on the first hit of the window.
pub(crate) async fn increment_window(
    state: &AppState,
    key: &str,
    ttl_seconds: i64,
) -> Result<i64, RedisError> {
    let mut connection = state.dragonfly_connection.clone();
    let count: i64 = dragonfly_client::cmd("INCR")
        .arg(key)
        .query_async(&mut connection)
        .await?;
    if count == 1 {
        if let Err(error) = dragonfly_client::cmd("EXPIRE")
            .arg(key)
            .arg(ttl_seconds)
            .query_async::<()>(&mut connection)
            .await
        {
            warn!(?error, key, "rate limit window expiry failed");
        }
    }
    Ok(count)
}
