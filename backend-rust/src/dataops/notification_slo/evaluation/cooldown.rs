use crate::state::AppState;

use super::super::super::runtime_store::try_acquire_slo_cooldown;
use super::super::super::time::normalize_token;
use super::super::config::SloConfig;
use super::super::constants::SLO_LOCK_MEMORY_FALLBACK_WARNING;

pub(super) struct CooldownOutcome {
    pub(super) triggered: bool,
    pub(super) warning: Option<String>,
}

pub(super) async fn try_acquire(
    state: &AppState,
    retry_group_id: &str,
    reason_hash_key: &str,
    config: &SloConfig,
) -> CooldownOutcome {
    let lock_key = build_lock_key(retry_group_id, reason_hash_key, config);
    let ttl_ms = config.cooldown_minutes * 60 * 1000;
    let lock_result = try_acquire_slo_cooldown(state, lock_key.as_str(), ttl_ms).await;

    CooldownOutcome {
        triggered: lock_result.acquired,
        warning: lock_result.warning.as_ref().map(|message| {
            format!(
                "{}；lockMode={}；postgresError={}",
                SLO_LOCK_MEMORY_FALLBACK_WARNING, lock_result.mode, message
            )
        }),
    }
}

fn build_lock_key(retry_group_id: &str, reason_hash_key: &str, config: &SloConfig) -> String {
    format!(
        "{}:{}:{}:{}",
        normalize_token(retry_group_id),
        normalize_token(reason_hash_key),
        config.recovery_threshold,
        config.min_first_failed_count,
    )
}
