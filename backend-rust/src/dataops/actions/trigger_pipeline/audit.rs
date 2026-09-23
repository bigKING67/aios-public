use chrono::Utc;

use crate::{auth::CurrentUser, state::AppState};

use super::super::super::{
    access::resolve_operator, build_runtime_id, runtime_store::append_audit_event,
    time::format_shanghai_datetime_from_utc, types::DataOpsAuditEvent,
};

pub(super) async fn append_trigger_pipeline_audit(
    state: &AppState,
    current_user: &CurrentUser,
    pipeline_name: &str,
    result: &str,
    detail: String,
) {
    append_audit_event(
        state,
        DataOpsAuditEvent {
            id: build_runtime_id("audit_runtime"),
            action: "手动触发任务".to_string(),
            operator: resolve_operator(current_user),
            scope: pipeline_name.to_string(),
            result: result.to_string(),
            event_at: format_shanghai_datetime_from_utc(Utc::now()),
            detail,
        },
    )
    .await;
}
