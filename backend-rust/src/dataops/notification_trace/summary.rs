use std::collections::{HashMap, HashSet};

use super::super::time::to_dataops_timestamp;
use super::super::types::{DataOpsNotificationEvent, DataOpsNotificationTraceSummary};

pub(crate) fn build_notification_trace_summary(
    events: Vec<DataOpsNotificationEvent>,
    channel_name_map: HashMap<String, String>,
) -> Option<DataOpsNotificationTraceSummary> {
    if events.is_empty() {
        return None;
    }

    let sent_count = events.iter().filter(|event| event.status == "sent").count() as i64;
    let failed_count = events
        .iter()
        .filter(|event| event.status == "failed")
        .count() as i64;
    let skipped_count = events
        .iter()
        .filter(|event| event.status == "skipped")
        .count() as i64;
    let retryable_failed_count = events
        .iter()
        .filter(|event| {
            event.status == "failed" && channel_name_map.contains_key(event.channel_id.as_str())
        })
        .count() as i64;

    let mut channel_ids = events
        .iter()
        .map(|event| event.channel_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    channel_ids.sort();

    let channel_names = channel_ids
        .iter()
        .map(|channel_id| {
            channel_name_map
                .get(channel_id.as_str())
                .cloned()
                .unwrap_or_else(|| channel_id.clone())
        })
        .collect::<Vec<_>>();

    let mut sorted_by_time = events.clone();
    sorted_by_time.sort_by(|left, right| {
        (to_dataops_timestamp(left.sent_at.as_str()) - to_dataops_timestamp(right.sent_at.as_str()))
            .cmp(&0)
    });

    let earliest_at = sorted_by_time
        .first()
        .map(|event| event.sent_at.clone())
        .unwrap_or_default();
    let latest_at = sorted_by_time
        .last()
        .map(|event| event.sent_at.clone())
        .unwrap_or_default();

    Some(DataOpsNotificationTraceSummary {
        total_count: events.len() as i64,
        sent_count,
        failed_count,
        skipped_count,
        retryable_failed_count,
        earliest_at,
        latest_at,
        channel_names,
    })
}
