use chrono::Utc;

use crate::state::AppState;

use super::super::types::{
    DataOpsNotificationTraceReasonHashRecoveryItem, DataOpsNotificationTraceSloItem,
    DataOpsNotificationTraceSloStatus,
};
use super::config::resolve_slo_config;

mod audit_event;
mod candidates;
mod cooldown;
mod status;

pub(in crate::dataops) async fn evaluate_notification_trace_slo(
    state: &AppState,
    retry_group_id: &str,
    reason_hash_recovery: &[DataOpsNotificationTraceReasonHashRecoveryItem],
    enforce_actions: bool,
) -> DataOpsNotificationTraceSloStatus {
    let config = resolve_slo_config();
    let checked_at = super::super::time::format_shanghai_datetime_from_utc(Utc::now());

    if !config.enabled {
        return status::disabled(&config, checked_at);
    }

    let candidates = candidates::select_breached(reason_hash_recovery, &config);

    if !enforce_actions {
        return status::preview(
            &config,
            checked_at,
            candidates::into_preview_items(candidates),
        );
    }

    let (items, warning) =
        apply_cooldown(state, retry_group_id, candidates.as_slice(), &config).await;
    let triggered_items = items
        .iter()
        .filter(|item| item.triggered)
        .cloned()
        .collect::<Vec<_>>();

    audit_event::append_if_triggered(state, retry_group_id, triggered_items.as_slice(), &config)
        .await;

    status::enforced(&config, checked_at, warning, items)
}

async fn apply_cooldown(
    state: &AppState,
    retry_group_id: &str,
    candidates: &[DataOpsNotificationTraceReasonHashRecoveryItem],
    config: &super::config::SloConfig,
) -> (Vec<DataOpsNotificationTraceSloItem>, Option<String>) {
    let mut warning: Option<String> = None;
    let mut items = Vec::with_capacity(candidates.len());

    for item in candidates {
        let outcome =
            cooldown::try_acquire(state, retry_group_id, item.reason_hash_key.as_str(), config)
                .await;

        if warning.is_none() {
            warning = outcome.warning.clone();
        }

        items.push(candidates::to_slo_item(
            item.clone(),
            outcome.triggered,
            !outcome.triggered,
        ));
    }

    (items, warning)
}
