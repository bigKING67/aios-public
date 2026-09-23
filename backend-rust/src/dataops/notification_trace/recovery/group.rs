use std::collections::HashMap;

use super::super::super::{
    time::{normalize_token, to_dataops_timestamp},
    types::DataOpsNotificationEvent,
};

pub(super) fn group_events_by_trace_key(
    events: &[DataOpsNotificationEvent],
) -> HashMap<String, Vec<DataOpsNotificationEvent>> {
    let mut ordered = events.to_vec();
    ordered.sort_by(|left, right| {
        let diff = to_dataops_timestamp(left.sent_at.as_str())
            - to_dataops_timestamp(right.sent_at.as_str());
        if diff != 0 {
            return diff.cmp(&0);
        }
        left.id.cmp(&right.id)
    });

    let mut trace_group_map: HashMap<String, Vec<DataOpsNotificationEvent>> = HashMap::new();
    for event in ordered {
        trace_group_map
            .entry(build_notification_trace_group_key(&event))
            .or_default()
            .push(event);
    }

    trace_group_map
}

fn build_notification_trace_group_key(event: &DataOpsNotificationEvent) -> String {
    [
        normalize_token(event.channel_id.as_str()),
        normalize_token(event.event_type.as_str()),
        normalize_token(event.target_table.as_str()),
        normalize_token(event.flow_name.as_str()),
        normalize_token(event.title.as_str()),
    ]
    .join("|")
}
