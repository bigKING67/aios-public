use std::collections::HashSet;

use crate::state::AppState;

use super::super::{
    append_unique_warning, build_notification_trace_reason_hash_recovery,
    format_notification_store_read_warning,
};
use crate::dataops::{
    notification_slo::{
        evaluate_notification_trace_slo, get_dataops_notification_trace_slo_risk_score,
        resolve_dataops_notification_trace_slo_risk_level,
    },
    runtime_store::list_notification_events_by_retry_group_with_store,
    types::DataOpsNotificationTraceSloScanItem,
};

use super::options::NotificationTraceScanOptions;
use crate::dataops::notification_trace::retry_groups::NotificationRetryGroup;

pub(super) async fn build_scan_item(
    state: &AppState,
    group: &NotificationRetryGroup,
    options: NotificationTraceScanOptions,
    warnings: &mut Vec<String>,
    warning_set: &mut HashSet<String>,
) -> DataOpsNotificationTraceSloScanItem {
    let events_read = list_notification_events_by_retry_group_with_store(
        state,
        group.retry_group_id.as_str(),
        options.group_event_limit,
    )
    .await;

    if let Some(warning) = events_read.warning.as_ref() {
        append_unique_warning(
            warnings,
            warning_set,
            format!(
                "{}: {}",
                group.retry_group_id,
                format_notification_store_read_warning("通知追踪事件", warning)
            )
            .as_str(),
        );
    }

    let event_source = events_read.mode;
    let reason_hash_recovery =
        build_notification_trace_reason_hash_recovery(events_read.items.as_slice());
    let slo_status = evaluate_notification_trace_slo(
        state,
        group.retry_group_id.as_str(),
        reason_hash_recovery.as_slice(),
        !options.dry_run,
    )
    .await;

    if let Some(warning) = slo_status.warning.clone() {
        append_unique_warning(
            warnings,
            warning_set,
            format!("{}: {}", group.retry_group_id, warning).as_str(),
        );
    }

    let mut item = DataOpsNotificationTraceSloScanItem {
        retry_group_id: group.retry_group_id.clone(),
        latest_event_at: group.latest_event_at.clone(),
        event_count: group.event_count,
        event_source,
        breached: slo_status.breached,
        triggered_count: slo_status
            .items
            .iter()
            .filter(|entry| entry.triggered)
            .count() as i64,
        cooldown_count: slo_status
            .items
            .iter()
            .filter(|entry| entry.cooldown_active)
            .count() as i64,
        risk_score: 0,
        risk_level: "normal".to_string(),
        warning: slo_status.warning,
    };
    item.risk_score = get_dataops_notification_trace_slo_risk_score(&item);
    item.risk_level = resolve_dataops_notification_trace_slo_risk_level(&item, item.risk_score);
    item
}
