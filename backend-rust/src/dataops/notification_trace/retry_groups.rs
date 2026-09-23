use std::collections::HashMap;

use chrono::Utc;

use crate::state::AppState;

use super::super::runtime_store::list_notification_events_with_store;
use super::super::runtime_store_types::RuntimeStoreReadResult;
use super::super::time::to_dataops_timestamp;

#[derive(Debug, Clone)]
pub(crate) struct NotificationRetryGroup {
    pub(crate) retry_group_id: String,
    pub(crate) latest_event_at: String,
    pub(crate) event_count: i64,
}

pub(crate) async fn list_notification_retry_groups(
    state: &AppState,
    lookback_hours: i64,
    max_groups: usize,
) -> RuntimeStoreReadResult<NotificationRetryGroup> {
    let now_ts = Utc::now().timestamp_millis();
    let lookback_ms = lookback_hours * 60 * 60 * 1000;

    let events_read = list_notification_events_with_store(state).await;
    let mut group_map: HashMap<String, NotificationRetryGroup> = HashMap::new();

    for event in events_read.items {
        let retry_group_id = event
            .retry_group_id
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        if retry_group_id.is_empty() {
            continue;
        }

        let sent_at_ts = to_dataops_timestamp(event.sent_at.as_str());
        if sent_at_ts > 0 && now_ts - sent_at_ts > lookback_ms {
            continue;
        }

        let entry = group_map
            .entry(retry_group_id.clone())
            .or_insert(NotificationRetryGroup {
                retry_group_id: retry_group_id.clone(),
                latest_event_at: event.sent_at.clone(),
                event_count: 0,
            });

        entry.event_count += 1;
        if to_dataops_timestamp(event.sent_at.as_str())
            > to_dataops_timestamp(entry.latest_event_at.as_str())
        {
            entry.latest_event_at = event.sent_at.clone();
        }
    }

    let mut groups = group_map.into_values().collect::<Vec<_>>();
    groups.sort_by(|left, right| {
        (to_dataops_timestamp(right.latest_event_at.as_str())
            - to_dataops_timestamp(left.latest_event_at.as_str()))
        .cmp(&0)
    });
    groups.truncate(max_groups);

    RuntimeStoreReadResult {
        items: groups,
        mode: events_read.mode,
        warning: events_read.warning,
    }
}

pub(crate) fn format_notification_store_read_warning(label: &str, warning: &str) -> String {
    format!("DataOps {label}读取 PostgreSQL 失败，已回退内存存储：{warning}")
}
