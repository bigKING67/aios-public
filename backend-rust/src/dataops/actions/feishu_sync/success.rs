use axum::{http::StatusCode, response::Response};
use chrono::Utc;
use serde_json::json;

use crate::{auth::CurrentUser, state::AppState};

use super::{
    super::super::{
        access::resolve_operator, build_runtime_id, responses::action_success,
        runtime_store::append_audit_event, runtime_store_types::RuntimeLockResult,
        time::format_shanghai_datetime_from_utc, types::DataOpsAuditEvent,
    },
    super::lock_warning_value,
    audit::build_success_detail,
};

pub(super) async fn handle_trigger_success(
    state: &AppState,
    current_user: &CurrentUser,
    service_name: Option<String>,
    trigger_url: &str,
    lock_ttl_ms: i64,
    lock_result: RuntimeLockResult,
) -> Response {
    let message = if let Some(service_name) = service_name {
        format!("已触发飞书同步：{}", service_name)
    } else {
        "已触发飞书同步：全部服务".to_string()
    };

    append_audit_event(
        state,
        DataOpsAuditEvent {
            id: build_runtime_id("audit_runtime"),
            action: "手动触发飞书同步".to_string(),
            operator: resolve_operator(current_user),
            scope: message.clone(),
            result: "成功".to_string(),
            event_at: format_shanghai_datetime_from_utc(Utc::now()),
            detail: build_success_detail(
                trigger_url,
                lock_result.mode.as_str(),
                lock_ttl_ms,
                lock_result.warning.as_ref(),
            ),
        },
    )
    .await;

    action_success(
        StatusCode::ACCEPTED,
        "trigger_feishu_sync",
        message.as_str(),
        None,
        None,
        Some(json!({
            "lockMode": lock_result.mode,
            "lockWarning": lock_warning_value(lock_result.warning.as_ref()),
        })),
    )
}
