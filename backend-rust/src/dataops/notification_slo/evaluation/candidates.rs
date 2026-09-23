use super::super::super::types::{
    DataOpsNotificationTraceReasonHashRecoveryItem, DataOpsNotificationTraceSloItem,
};
use super::super::config::SloConfig;

pub(super) fn select_breached(
    reason_hash_recovery: &[DataOpsNotificationTraceReasonHashRecoveryItem],
    config: &SloConfig,
) -> Vec<DataOpsNotificationTraceReasonHashRecoveryItem> {
    reason_hash_recovery
        .iter()
        .filter(|item| {
            item.first_failed_count >= config.min_first_failed_count
                && item.recovery_rate < config.recovery_threshold
        })
        .take(config.max_reason_items)
        .cloned()
        .collect::<Vec<_>>()
}

pub(super) fn into_preview_items(
    candidates: Vec<DataOpsNotificationTraceReasonHashRecoveryItem>,
) -> Vec<DataOpsNotificationTraceSloItem> {
    candidates
        .into_iter()
        .map(|item| to_slo_item(item, false, false))
        .collect::<Vec<_>>()
}

pub(super) fn to_slo_item(
    item: DataOpsNotificationTraceReasonHashRecoveryItem,
    triggered: bool,
    cooldown_active: bool,
) -> DataOpsNotificationTraceSloItem {
    DataOpsNotificationTraceSloItem {
        reason_hash_key: item.reason_hash_key,
        reason_hash_label: item.reason_hash_label,
        first_failed_count: item.first_failed_count,
        recovered_count: item.recovered_count,
        unresolved_count: item.unresolved_count,
        recovery_rate: item.recovery_rate,
        sample_reason: item.sample_reason,
        triggered,
        cooldown_active,
    }
}
