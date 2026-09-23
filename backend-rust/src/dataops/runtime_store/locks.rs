use tracing::warn;

use super::super::{
    runtime_store_pg::try_acquire_postgres_lock,
    runtime_store_types::{RuntimeLockResult, STORE_MODE_MEMORY, STORE_MODE_POSTGRES},
};
use super::memory;
use crate::state::AppState;

const RUNTIME_TRIGGER_LOCK_NAMESPACE_FALLBACK: &str = "dataops-runtime";
const RUNTIME_SLO_LOCK_NAMESPACE: &str = "dataops-slo-cooldown";

pub(super) async fn try_acquire_trigger_lock(
    state: &AppState,
    lock_key: &str,
    ttl_ms: i64,
    postgres_requested: bool,
) -> RuntimeLockResult {
    let (lock_namespace, lock_key) = split_lock_key(lock_key);
    try_acquire_runtime_lock(
        state,
        lock_namespace.as_str(),
        lock_key.as_str(),
        ttl_ms,
        false,
        postgres_requested,
    )
    .await
}

pub(super) async fn try_acquire_slo_cooldown(
    state: &AppState,
    lock_key: &str,
    ttl_ms: i64,
    postgres_requested: bool,
) -> RuntimeLockResult {
    try_acquire_runtime_lock(
        state,
        RUNTIME_SLO_LOCK_NAMESPACE,
        lock_key,
        ttl_ms,
        true,
        postgres_requested,
    )
    .await
}

async fn try_acquire_runtime_lock(
    state: &AppState,
    lock_namespace: &str,
    lock_key: &str,
    ttl_ms: i64,
    slo: bool,
    postgres_requested: bool,
) -> RuntimeLockResult {
    if postgres_requested {
        match try_acquire_postgres_lock(state, lock_namespace, lock_key, ttl_ms).await {
            Ok(acquired) => {
                return RuntimeLockResult {
                    acquired,
                    mode: STORE_MODE_POSTGRES.to_string(),
                    warning: None,
                }
            }
            Err(message) => {
                warn!(
                    error = %message,
                    lock_namespace,
                    lock_key,
                    "dataops postgres runtime lock failed"
                );
                let acquired = memory::try_acquire_lock(
                    format!("{}:{}", lock_namespace, lock_key).as_str(),
                    ttl_ms,
                    slo,
                )
                .await;
                return RuntimeLockResult {
                    acquired,
                    mode: STORE_MODE_MEMORY.to_string(),
                    warning: Some(message),
                };
            }
        }
    }

    RuntimeLockResult {
        acquired: memory::try_acquire_lock(
            format!("{}:{}", lock_namespace, lock_key).as_str(),
            ttl_ms,
            slo,
        )
        .await,
        mode: STORE_MODE_MEMORY.to_string(),
        warning: None,
    }
}

fn split_lock_key(combined: &str) -> (String, String) {
    let normalized = combined.trim();
    if let Some((namespace, key)) = normalized.split_once(':') {
        let namespace = namespace.trim();
        let key = key.trim();
        if !namespace.is_empty() && !key.is_empty() {
            return (namespace.to_string(), key.to_string());
        }
    }

    (
        RUNTIME_TRIGGER_LOCK_NAMESPACE_FALLBACK.to_string(),
        normalized.to_string(),
    )
}
