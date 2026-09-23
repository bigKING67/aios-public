use crate::state::AppState;

use super::super::super::{
    env::resolve_i64_env, runtime_store::try_acquire_trigger_lock,
    runtime_store_types::RuntimeLockResult,
};
use super::super::DATAOPS_TRIGGER_LOCK_NAMESPACE;

const DEFAULT_FEISHU_TRIGGER_LOCK_TTL_MS: i64 = 2 * 60 * 1000;
const MIN_FEISHU_TRIGGER_LOCK_TTL_MS: i64 = 10 * 1000;
const MAX_FEISHU_TRIGGER_LOCK_TTL_MS: i64 = 15 * 60 * 1000;

pub(super) fn build_feishu_sync_lock_key(service_name: Option<&String>) -> String {
    if let Some(service_name) = service_name {
        format!("feishu_sync:{}", service_name)
    } else {
        "feishu_sync:all".to_string()
    }
}

pub(super) fn resolve_lock_ttl_ms() -> i64 {
    resolve_i64_env(
        "DATAOPS_FEISHU_SYNC_TRIGGER_LOCK_TTL_MS",
        DEFAULT_FEISHU_TRIGGER_LOCK_TTL_MS,
        MIN_FEISHU_TRIGGER_LOCK_TTL_MS,
        MAX_FEISHU_TRIGGER_LOCK_TTL_MS,
    )
}

pub(super) async fn acquire_feishu_sync_trigger_lock(
    state: &AppState,
    lock_key: &str,
    lock_ttl_ms: i64,
) -> RuntimeLockResult {
    try_acquire_trigger_lock(
        state,
        format!("{}:{}", DATAOPS_TRIGGER_LOCK_NAMESPACE, lock_key).as_str(),
        lock_ttl_ms,
    )
    .await
}
