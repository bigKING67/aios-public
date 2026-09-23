use chrono::Utc;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use tokio::sync::Mutex;
use tracing::warn;

use super::config::get_prefect_cache_ttl_ms;
use super::types::{PrefectDeployment, PrefectFlowRun};

#[derive(Debug, Clone)]
struct TimedCacheValue<T> {
    value: T,
    expires_at_ms: i64,
}

type DeploymentCache = Mutex<HashMap<String, TimedCacheValue<Option<PrefectDeployment>>>>;
type FlowRunsCache = Mutex<HashMap<String, TimedCacheValue<Vec<PrefectFlowRun>>>>;

static PREFECT_DEPLOYMENT_CACHE: Lazy<DeploymentCache> = Lazy::new(|| Mutex::new(HashMap::new()));
static PREFECT_FLOW_RUNS_CACHE: Lazy<FlowRunsCache> = Lazy::new(|| Mutex::new(HashMap::new()));

pub(crate) async fn get_cached_prefect_deployment(
    cache_key: &str,
) -> Option<Option<PrefectDeployment>> {
    let ttl_ms = get_prefect_cache_ttl_ms();
    if ttl_ms <= 0 {
        return None;
    }

    let now = Utc::now().timestamp_millis();
    let guard = PREFECT_DEPLOYMENT_CACHE.lock().await;
    guard.get(cache_key).and_then(|item| {
        if item.expires_at_ms > now {
            Some(item.value.clone())
        } else {
            None
        }
    })
}

pub(crate) async fn set_cached_prefect_deployment(
    cache_key: &str,
    value: Option<PrefectDeployment>,
) {
    let ttl_ms = get_prefect_cache_ttl_ms();
    if ttl_ms <= 0 {
        return;
    }

    let mut guard = PREFECT_DEPLOYMENT_CACHE.lock().await;
    prune_prefect_cache(&mut guard);
    guard.insert(
        cache_key.to_string(),
        TimedCacheValue {
            value,
            expires_at_ms: Utc::now().timestamp_millis() + ttl_ms,
        },
    );
}

pub(crate) async fn get_cached_prefect_flow_runs(cache_key: &str) -> Option<Vec<PrefectFlowRun>> {
    let ttl_ms = get_prefect_cache_ttl_ms();
    if ttl_ms <= 0 {
        return None;
    }

    let now = Utc::now().timestamp_millis();
    let guard = PREFECT_FLOW_RUNS_CACHE.lock().await;
    guard.get(cache_key).and_then(|item| {
        if item.expires_at_ms > now {
            Some(item.value.clone())
        } else {
            None
        }
    })
}

pub(crate) async fn set_cached_prefect_flow_runs(cache_key: &str, value: Vec<PrefectFlowRun>) {
    let ttl_ms = get_prefect_cache_ttl_ms();
    if ttl_ms <= 0 {
        return;
    }

    let mut guard = PREFECT_FLOW_RUNS_CACHE.lock().await;
    prune_prefect_cache(&mut guard);
    guard.insert(
        cache_key.to_string(),
        TimedCacheValue {
            value,
            expires_at_ms: Utc::now().timestamp_millis() + ttl_ms,
        },
    );
}

fn prune_prefect_cache<T>(cache: &mut HashMap<String, TimedCacheValue<T>>) {
    if cache.len() < 512 {
        return;
    }

    let now = Utc::now().timestamp_millis();
    let before = cache.len();
    cache.retain(|_, item| item.expires_at_ms > now);
    if before != cache.len() {
        warn!(
            before,
            after = cache.len(),
            "dataops prefect runtime cache pruned expired entries"
        );
    }
}
