use std::collections::{HashMap, HashSet};

use super::super::super::{
    notification_reason::normalize_notification_failure_reason,
    time::normalize_token,
    types::{DataOpsNotificationEvent, DataOpsNotificationTraceReasonHashRecoveryItem},
};
use super::super::constants::DATAOPS_MISSING_REASON_HASH_KEY;

#[derive(Default)]
struct RecoveryAggregator {
    reason_hash_key: String,
    reason_hash_label: String,
    first_failed_count: i64,
    recovered_count: i64,
    unresolved_count: i64,
    sample_reasons: HashSet<String>,
    trace_group_keys: HashSet<String>,
}

pub(super) fn aggregate_recovery_items(
    trace_group_map: HashMap<String, Vec<DataOpsNotificationEvent>>,
) -> Vec<DataOpsNotificationTraceReasonHashRecoveryItem> {
    let mut aggregator_map: HashMap<String, RecoveryAggregator> = HashMap::new();

    for (trace_group_key, trace_events) in trace_group_map.into_iter() {
        let first_failed_index = trace_events
            .iter()
            .position(|event| event.status == "failed");

        let Some(first_failed_index) = first_failed_index else {
            continue;
        };

        aggregate_trace_group(
            &mut aggregator_map,
            trace_group_key,
            &trace_events,
            first_failed_index,
        );
    }

    sort_recovery_items(recovery_items_from_aggregators(aggregator_map))
}

fn aggregate_trace_group(
    aggregator_map: &mut HashMap<String, RecoveryAggregator>,
    trace_group_key: String,
    trace_events: &[DataOpsNotificationEvent],
    first_failed_index: usize,
) {
    let first_failed_event = &trace_events[first_failed_index];
    let normalized_reason_hash =
        normalize_token(first_failed_event.reason_hash.as_deref().unwrap_or(""));
    let reason_hash_key = if normalized_reason_hash.is_empty() {
        DATAOPS_MISSING_REASON_HASH_KEY.to_string()
    } else {
        normalized_reason_hash.clone()
    };
    let reason_hash_label = if normalized_reason_hash.is_empty() {
        "缺失".to_string()
    } else {
        first_failed_event
            .reason_hash
            .as_ref()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or(normalized_reason_hash)
    };

    let has_success_after_first_failure = trace_events
        .iter()
        .skip(first_failed_index + 1)
        .any(|event| event.status == "sent");

    let normalized_reason =
        normalize_notification_failure_reason(first_failed_event.detail.as_str());

    let entry = aggregator_map
        .entry(reason_hash_key.clone())
        .or_insert_with(|| RecoveryAggregator {
            reason_hash_key,
            reason_hash_label,
            ..RecoveryAggregator::default()
        });

    entry.first_failed_count += 1;
    if has_success_after_first_failure {
        entry.recovered_count += 1;
    } else {
        entry.unresolved_count += 1;
    }
    entry.sample_reasons.insert(normalized_reason);
    entry.trace_group_keys.insert(trace_group_key);
}

fn recovery_items_from_aggregators(
    aggregator_map: HashMap<String, RecoveryAggregator>,
) -> Vec<DataOpsNotificationTraceReasonHashRecoveryItem> {
    aggregator_map
        .into_values()
        .map(|entry| {
            let sample_reason = entry
                .sample_reasons
                .into_iter()
                .filter(|item| !item.is_empty())
                .take(2)
                .collect::<Vec<_>>()
                .join(" / ");

            let recovery_rate = if entry.first_failed_count > 0 {
                ((entry.recovered_count as f64 / entry.first_failed_count as f64) * 100.0).round()
                    as i64
            } else {
                0
            };

            DataOpsNotificationTraceReasonHashRecoveryItem {
                reason_hash_key: entry.reason_hash_key,
                reason_hash_label: entry.reason_hash_label,
                first_failed_count: entry.first_failed_count,
                recovered_count: entry.recovered_count,
                unresolved_count: entry.unresolved_count,
                recovery_rate,
                sample_reason,
                trace_group_keys: entry.trace_group_keys.into_iter().collect(),
            }
        })
        .collect::<Vec<_>>()
}

fn sort_recovery_items(
    mut items: Vec<DataOpsNotificationTraceReasonHashRecoveryItem>,
) -> Vec<DataOpsNotificationTraceReasonHashRecoveryItem> {
    items.sort_by(|left, right| {
        if right.first_failed_count != left.first_failed_count {
            return right.first_failed_count.cmp(&left.first_failed_count);
        }
        if right.recovery_rate != left.recovery_rate {
            return right.recovery_rate.cmp(&left.recovery_rate);
        }
        left.reason_hash_label.cmp(&right.reason_hash_label)
    });

    items
}
