use serde::{Deserialize, Serialize};

use super::DataOpsNotificationEvent;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotificationTraceQuery {
    pub(crate) retry_group_id: Option<String>,
    pub(crate) limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotificationTraceScanBody {
    #[serde(default)]
    pub(crate) lookback_hours: Option<i64>,
    #[serde(default)]
    pub(crate) max_groups: Option<usize>,
    #[serde(default)]
    pub(crate) group_event_limit: Option<usize>,
    #[serde(default)]
    pub(crate) dry_run: Option<bool>,
    #[serde(default)]
    pub(crate) scan_concurrency: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceSummary {
    pub(crate) total_count: i64,
    pub(crate) sent_count: i64,
    pub(crate) failed_count: i64,
    pub(crate) skipped_count: i64,
    pub(crate) retryable_failed_count: i64,
    pub(crate) earliest_at: String,
    pub(crate) latest_at: String,
    pub(crate) channel_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceReasonHashRecoveryItem {
    pub(crate) reason_hash_key: String,
    pub(crate) reason_hash_label: String,
    pub(crate) first_failed_count: i64,
    pub(crate) recovered_count: i64,
    pub(crate) unresolved_count: i64,
    pub(crate) recovery_rate: i64,
    pub(crate) sample_reason: String,
    pub(crate) trace_group_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceSloItem {
    pub(crate) reason_hash_key: String,
    pub(crate) reason_hash_label: String,
    pub(crate) first_failed_count: i64,
    pub(crate) recovered_count: i64,
    pub(crate) unresolved_count: i64,
    pub(crate) recovery_rate: i64,
    pub(crate) sample_reason: String,
    pub(crate) triggered: bool,
    pub(crate) cooldown_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceSloStatus {
    pub(crate) enabled: bool,
    pub(crate) checked_at: String,
    pub(crate) threshold_recovery_rate: i64,
    pub(crate) min_first_failed_count: i64,
    pub(crate) cooldown_minutes: i64,
    pub(crate) breached: bool,
    pub(crate) auto_notify_enabled: bool,
    pub(crate) notification_triggered: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) notification_channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) warning: Option<String>,
    pub(crate) items: Vec<DataOpsNotificationTraceSloItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceResponse {
    pub(crate) snapshot_at: String,
    pub(crate) retry_group_id: String,
    pub(crate) events: Vec<DataOpsNotificationEvent>,
    pub(crate) summary: Option<DataOpsNotificationTraceSummary>,
    pub(crate) reason_hash_recovery: Vec<DataOpsNotificationTraceReasonHashRecoveryItem>,
    pub(crate) slo: DataOpsNotificationTraceSloStatus,
    pub(crate) source: String,
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceSloScanItem {
    pub(crate) retry_group_id: String,
    pub(crate) latest_event_at: String,
    pub(crate) event_count: i64,
    pub(crate) event_source: String,
    pub(crate) breached: bool,
    pub(crate) triggered_count: i64,
    pub(crate) cooldown_count: i64,
    pub(crate) risk_score: i64,
    pub(crate) risk_level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataOpsNotificationTraceSloScanResponse {
    pub(crate) executed_at: String,
    pub(crate) dry_run: bool,
    pub(crate) lookback_hours: i64,
    pub(crate) max_groups: usize,
    pub(crate) scan_concurrency: usize,
    pub(crate) duration_ms: i64,
    pub(crate) processed_groups: i64,
    pub(crate) breached_groups: i64,
    pub(crate) triggered_groups: i64,
    pub(crate) group_source: String,
    pub(crate) items: Vec<DataOpsNotificationTraceSloScanItem>,
    pub(crate) warnings: Vec<String>,
}
