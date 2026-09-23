use axum::{http::StatusCode, response::Response};
use chrono::Utc;

use crate::{auth::CurrentUser, state::AppState};

use super::{
    super::super::{
        access::resolve_operator, build_runtime_id, responses::action_error_with_lock,
        runtime_store::append_audit_event, runtime_store_types::RuntimeLockResult,
        time::format_shanghai_datetime_from_utc, types::DataOpsAuditEvent,
    },
    super::lock_fallback_warning_text,
    audit::build_failed_lock_detail,
};

pub(super) async fn handle_lock_conflict(
    state: &AppState,
    current_user: &CurrentUser,
    service_name: Option<&String>,
    lock_result: RuntimeLockResult,
) -> Response {
    let message = if let Some(service_name) = service_name {
        format!("飞书同步「{}」正在运行中，请勿重复提交", service_name)
    } else {
        "飞书同步全量任务正在运行中，请勿重复提交".to_string()
    };

    append_audit_event(
        state,
        DataOpsAuditEvent {
            id: build_runtime_id("audit_runtime"),
            action: "手动触发飞书同步".to_string(),
            operator: resolve_operator(current_user),
            scope: service_name
                .map(|item| format!("飞书同步/{}", item))
                .unwrap_or_else(|| "飞书同步/全部服务".to_string()),
            result: "失败".to_string(),
            event_at: format_shanghai_datetime_from_utc(Utc::now()),
            detail: build_failed_lock_detail(
                message.as_str(),
                lock_result.mode.as_str(),
                lock_result.warning.as_ref(),
            ),
        },
    )
    .await;

    action_error_with_lock(
        StatusCode::CONFLICT,
        "trigger_feishu_sync",
        message.as_str(),
        None,
        None,
        Some(lock_result.mode),
        lock_fallback_warning_text(lock_result.warning.as_ref()),
    )
}
