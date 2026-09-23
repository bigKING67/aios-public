use serde_json::Value;

use super::super::super::{env::resolve_usize_env, types::NotificationTraceScanBody};
use super::super::{
    DEFAULT_GROUP_EVENT_LIMIT, DEFAULT_LOOKBACK_HOURS, DEFAULT_MAX_GROUPS,
    FALLBACK_SCAN_CONCURRENCY, MAX_SCAN_CONCURRENCY,
};

#[derive(Debug, Clone, Copy)]
pub(super) struct NotificationTraceScanOptions {
    pub(super) lookback_hours: i64,
    pub(super) max_groups: usize,
    pub(super) group_event_limit: usize,
    pub(super) dry_run: bool,
    pub(super) scan_concurrency: usize,
}

pub(super) fn parse_scan_options(payload: Value) -> NotificationTraceScanOptions {
    let body = serde_json::from_value::<NotificationTraceScanBody>(payload).unwrap_or(
        NotificationTraceScanBody {
            lookback_hours: None,
            max_groups: None,
            group_event_limit: None,
            dry_run: None,
            scan_concurrency: None,
        },
    );

    NotificationTraceScanOptions {
        lookback_hours: body
            .lookback_hours
            .unwrap_or(DEFAULT_LOOKBACK_HOURS)
            .clamp(1, 24 * 30),
        max_groups: body.max_groups.unwrap_or(DEFAULT_MAX_GROUPS).clamp(1, 200),
        group_event_limit: body
            .group_event_limit
            .unwrap_or(DEFAULT_GROUP_EVENT_LIMIT)
            .clamp(20, 3000),
        dry_run: body.dry_run.unwrap_or(true),
        scan_concurrency: body
            .scan_concurrency
            .unwrap_or(resolve_usize_env(
                "DATAOPS_NOTIFY_TRACE_SLO_SCAN_CONCURRENCY",
                FALLBACK_SCAN_CONCURRENCY,
                1,
                MAX_SCAN_CONCURRENCY,
            ))
            .clamp(1, MAX_SCAN_CONCURRENCY),
    }
}
