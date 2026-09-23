use chrono::Utc;

use crate::state::AppState;

use super::super::super::build_runtime_id;
use super::super::super::runtime_store::append_audit_event;
use super::super::super::time::format_shanghai_datetime_from_utc;
use super::super::super::types::{DataOpsAuditEvent, DataOpsNotificationTraceSloItem};
use super::super::audit::build_slo_audit_detail;
use super::super::config::SloConfig;

pub(super) async fn append_if_triggered(
    state: &AppState,
    retry_group_id: &str,
    triggered_items: &[DataOpsNotificationTraceSloItem],
    config: &SloConfig,
) {
    if triggered_items.is_empty() {
        return;
    }

    append_audit_event(
        state,
        DataOpsAuditEvent {
            id: build_runtime_id("audit_runtime"),
            action: "通知链路SLO告警".to_string(),
            operator: config.operator.clone(),
            scope: retry_group_id.to_string(),
            result: "成功".to_string(),
            event_at: format_shanghai_datetime_from_utc(Utc::now()),
            detail: build_slo_audit_detail(retry_group_id, triggered_items, config),
        },
    )
    .await;
}
