use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use axum::body::Bytes;
use once_cell::sync::Lazy;
use serde_json::Value;
use tokio::sync::Mutex;
use tracing::warn;

const MAX_CACHE_ENTRIES: usize = 256;

struct CachedDashboardPayload {
    expires_at: Instant,
    payload: Bytes,
}

type DashboardResponseCache = Mutex<HashMap<String, CachedDashboardPayload>>;

static DASHBOARD_RESPONSE_CACHE: Lazy<DashboardResponseCache> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub(super) async fn get_cached_dashboard_payload(cache_key: &str, ttl_ms: u64) -> Option<Bytes> {
    if ttl_ms == 0 {
        return None;
    }

    let now = Instant::now();
    let mut guard = DASHBOARD_RESPONSE_CACHE.lock().await;
    match guard.get(cache_key) {
        Some(item) if item.expires_at > now => Some(item.payload.clone()),
        Some(_) => {
            guard.remove(cache_key);
            None
        }
        None => None,
    }
}

pub(super) async fn set_cached_dashboard_payload(cache_key: &str, payload: &Value, ttl_ms: u64) {
    if ttl_ms == 0 {
        return;
    }

    let expires_at = Instant::now() + Duration::from_millis(ttl_ms);
    let payload = match serde_json::to_vec(payload) {
        Ok(payload) => Bytes::from(payload),
        Err(error) => {
            warn!(?error, "serialize dashboard response cache payload failed");
            return;
        }
    };
    let mut guard = DASHBOARD_RESPONSE_CACHE.lock().await;
    prune_cache(&mut guard);
    guard.insert(
        cache_key.to_string(),
        CachedDashboardPayload {
            expires_at,
            payload,
        },
    );
}

fn prune_cache(cache: &mut HashMap<String, CachedDashboardPayload>) {
    let now = Instant::now();
    cache.retain(|_, item| item.expires_at > now);
    while cache.len() >= MAX_CACHE_ENTRIES {
        let Some(key) = cache.keys().next().cloned() else {
            break;
        };
        cache.remove(key.as_str());
    }
}

pub(super) fn dashboard_cache_key(endpoint: &str, parts: &[(&str, &str)]) -> String {
    let mut key = String::from(endpoint);
    for (name, value) in parts {
        key.push('|');
        key.push_str(name);
        key.push('=');
        key.push_str(value);
    }
    key
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{dashboard_cache_key, get_cached_dashboard_payload, set_cached_dashboard_payload};

    #[tokio::test]
    async fn cache_round_trips_payload_when_ttl_enabled() {
        let key = "test:cache_round_trips_payload_when_ttl_enabled";
        let payload = json!({ "ok": true });

        set_cached_dashboard_payload(key, &payload, 1000).await;

        let cached = get_cached_dashboard_payload(key, 1000)
            .await
            .expect("cache hit");

        assert_eq!(serde_json::from_slice::<Value>(&cached).unwrap(), payload);
    }

    #[tokio::test]
    async fn cache_is_disabled_when_ttl_is_zero() {
        let key = "test:cache_is_disabled_when_ttl_is_zero";
        set_cached_dashboard_payload(key, &json!({ "ok": true }), 0).await;

        assert_eq!(get_cached_dashboard_payload(key, 0).await, None);
    }

    #[test]
    fn cache_key_preserves_parameter_names() {
        assert_eq!(
            dashboard_cache_key(
                "traffic",
                &[("start", "2026-05-13"), ("platform", "taobao")]
            ),
            "traffic|start=2026-05-13|platform=taobao"
        );
    }
}
