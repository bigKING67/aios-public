mod aggregate;
mod group;

use super::super::types::{
    DataOpsNotificationEvent, DataOpsNotificationTraceReasonHashRecoveryItem,
};

pub(crate) fn build_notification_trace_reason_hash_recovery(
    events: &[DataOpsNotificationEvent],
) -> Vec<DataOpsNotificationTraceReasonHashRecoveryItem> {
    if events.is_empty() {
        return Vec::new();
    }

    aggregate::aggregate_recovery_items(group::group_events_by_trace_key(events))
}
