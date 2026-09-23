use super::super::super::types::{
    DataOpsNotificationTraceSloItem, DataOpsNotificationTraceSloStatus,
};
use super::super::config::SloConfig;

pub(super) fn disabled(
    config: &SloConfig,
    checked_at: String,
) -> DataOpsNotificationTraceSloStatus {
    build_status(config, checked_at, false, false, None, Vec::new())
}

pub(super) fn preview(
    config: &SloConfig,
    checked_at: String,
    items: Vec<DataOpsNotificationTraceSloItem>,
) -> DataOpsNotificationTraceSloStatus {
    let breached = !items.is_empty();
    build_status(config, checked_at, true, breached, None, items)
}

pub(super) fn enforced(
    config: &SloConfig,
    checked_at: String,
    warning: Option<String>,
    items: Vec<DataOpsNotificationTraceSloItem>,
) -> DataOpsNotificationTraceSloStatus {
    let breached = !items.is_empty();
    build_status(config, checked_at, true, breached, warning, items)
}

fn build_status(
    config: &SloConfig,
    checked_at: String,
    enabled: bool,
    breached: bool,
    warning: Option<String>,
    items: Vec<DataOpsNotificationTraceSloItem>,
) -> DataOpsNotificationTraceSloStatus {
    DataOpsNotificationTraceSloStatus {
        enabled,
        checked_at,
        threshold_recovery_rate: config.recovery_threshold,
        min_first_failed_count: config.min_first_failed_count,
        cooldown_minutes: config.cooldown_minutes,
        breached,
        auto_notify_enabled: config.auto_notify_enabled,
        notification_triggered: false,
        notification_channel_id: Some(config.notification_channel_id.clone()),
        warning,
        items,
    }
}
