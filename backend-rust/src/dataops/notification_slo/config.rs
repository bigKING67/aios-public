use super::super::env::{resolve_bool_env, resolve_env_or, resolve_i64_env, resolve_usize_env};
use super::constants::{
    DEFAULT_SLO_AUTO_NOTIFY_ENABLED, DEFAULT_SLO_COOLDOWN_MINUTES, DEFAULT_SLO_ENABLED,
    DEFAULT_SLO_MAX_REASON_ITEMS, DEFAULT_SLO_MIN_FIRST_FAILED_COUNT,
    DEFAULT_SLO_NOTIFICATION_CHANNEL_ID, DEFAULT_SLO_OPERATOR, DEFAULT_SLO_RECOVERY_THRESHOLD,
};

#[derive(Debug, Clone)]
pub(super) struct SloConfig {
    pub(super) enabled: bool,
    pub(super) auto_notify_enabled: bool,
    pub(super) recovery_threshold: i64,
    pub(super) min_first_failed_count: i64,
    pub(super) cooldown_minutes: i64,
    pub(super) max_reason_items: usize,
    pub(super) notification_channel_id: String,
    pub(super) operator: String,
}

pub(super) fn resolve_slo_config() -> SloConfig {
    SloConfig {
        enabled: resolve_bool_env("DATAOPS_NOTIFY_TRACE_SLO_ENABLED", DEFAULT_SLO_ENABLED),
        auto_notify_enabled: resolve_bool_env(
            "DATAOPS_NOTIFY_TRACE_SLO_AUTO_NOTIFY",
            DEFAULT_SLO_AUTO_NOTIFY_ENABLED,
        ),
        recovery_threshold: resolve_i64_env(
            "DATAOPS_NOTIFY_TRACE_SLO_RECOVERY_THRESHOLD",
            DEFAULT_SLO_RECOVERY_THRESHOLD,
            0,
            100,
        ),
        min_first_failed_count: resolve_i64_env(
            "DATAOPS_NOTIFY_TRACE_SLO_MIN_FIRST_FAILED_COUNT",
            DEFAULT_SLO_MIN_FIRST_FAILED_COUNT,
            1,
            9999,
        ),
        cooldown_minutes: resolve_i64_env(
            "DATAOPS_NOTIFY_TRACE_SLO_COOLDOWN_MINUTES",
            DEFAULT_SLO_COOLDOWN_MINUTES,
            1,
            24 * 60,
        ),
        max_reason_items: resolve_usize_env(
            "DATAOPS_NOTIFY_TRACE_SLO_MAX_REASON_ITEMS",
            DEFAULT_SLO_MAX_REASON_ITEMS,
            1,
            20,
        ),
        notification_channel_id: resolve_env_or(
            "DATAOPS_NOTIFY_TRACE_SLO_CHANNEL_ID",
            DEFAULT_SLO_NOTIFICATION_CHANNEL_ID,
        ),
        operator: resolve_env_or("DATAOPS_NOTIFY_TRACE_SLO_OPERATOR", DEFAULT_SLO_OPERATOR),
    }
}
