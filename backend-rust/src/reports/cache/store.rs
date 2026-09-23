use std::hash::{Hash, Hasher};

use serde::{de::DeserializeOwned, Serialize};

use crate::state::AppState;

pub(in crate::reports) async fn get_cached_value<T: DeserializeOwned>(
    state: &AppState,
    cache_key: &str,
) -> Option<T> {
    let mut connection = state.dragonfly_connection.clone();
    let payload: Option<String> = dragonfly_client::cmd("GET")
        .arg(cache_key)
        .query_async(&mut connection)
        .await
        .ok()?;

    payload.and_then(|value| serde_json::from_str::<T>(value.as_str()).ok())
}

pub(in crate::reports) async fn set_cached_value<T: Serialize>(
    state: &AppState,
    cache_key: &str,
    ttl_seconds: u64,
    value: &T,
) {
    if ttl_seconds == 0 {
        return;
    }

    let payload = match serde_json::to_string(value) {
        Ok(payload) => payload,
        Err(_) => return,
    };

    let mut connection = state.dragonfly_connection.clone();
    let effective_ttl = ttl_with_jitter(cache_key, ttl_seconds);

    let _ = dragonfly_client::cmd("SETEX")
        .arg(cache_key)
        .arg(effective_ttl)
        .arg(payload)
        .query_async::<()>(&mut connection)
        .await;
}

fn ttl_with_jitter(cache_key: &str, ttl_seconds: u64) -> u64 {
    if ttl_seconds <= 5 {
        return ttl_seconds;
    }

    let jitter_window = (ttl_seconds / 5).clamp(5, 300);
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    cache_key.hash(&mut hasher);
    let jitter = hasher.finish() % (jitter_window + 1);
    ttl_seconds + jitter
}
