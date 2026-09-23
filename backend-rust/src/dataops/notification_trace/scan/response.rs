use chrono::{DateTime, Utc};

use crate::dataops::{
    time::{format_shanghai_datetime_from_utc, to_dataops_timestamp},
    types::{DataOpsNotificationTraceSloScanItem, DataOpsNotificationTraceSloScanResponse},
};

use super::options::NotificationTraceScanOptions;

pub(super) fn sort_scan_items(items: &mut [DataOpsNotificationTraceSloScanItem]) {
    items.sort_by(|left, right| {
        if right.risk_score != left.risk_score {
            return right.risk_score.cmp(&left.risk_score);
        }

        let time_diff = to_dataops_timestamp(right.latest_event_at.as_str())
            - to_dataops_timestamp(left.latest_event_at.as_str());
        if time_diff != 0 {
            return time_diff.cmp(&0);
        }

        left.retry_group_id.cmp(&right.retry_group_id)
    });
}

pub(super) fn build_scan_response(
    started_at: DateTime<Utc>,
    options: NotificationTraceScanOptions,
    group_source: String,
    items: Vec<DataOpsNotificationTraceSloScanItem>,
    warnings: Vec<String>,
) -> DataOpsNotificationTraceSloScanResponse {
    let breached_groups = items.iter().filter(|item| item.breached).count() as i64;
    let triggered_groups = items.iter().filter(|item| item.triggered_count > 0).count() as i64;
    let duration_ms = (Utc::now() - started_at).num_milliseconds().max(0);

    DataOpsNotificationTraceSloScanResponse {
        executed_at: format_shanghai_datetime_from_utc(Utc::now()),
        dry_run: options.dry_run,
        lookback_hours: options.lookback_hours,
        max_groups: options.max_groups,
        scan_concurrency: options.scan_concurrency,
        duration_ms,
        processed_groups: items.len() as i64,
        breached_groups,
        triggered_groups,
        group_source,
        items,
        warnings,
    }
}
