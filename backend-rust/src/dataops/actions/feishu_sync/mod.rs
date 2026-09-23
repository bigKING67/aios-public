mod audit;
mod lock;
mod lock_conflict;
mod request;
mod service;
mod success;

use axum::{http::StatusCode, response::Response};

use crate::{auth::CurrentUser, state::AppState};

use super::super::{env::resolve_env_or, responses::action_error, types::DataOpsActionRequest};
use lock::{acquire_feishu_sync_trigger_lock, build_feishu_sync_lock_key, resolve_lock_ttl_ms};
use lock_conflict::handle_lock_conflict;
use request::trigger_feishu_sync_http;
use service::{resolve_feishu_sync_definition, resolve_requested_service_name};
use success::handle_trigger_success;

pub(crate) async fn handle_trigger_feishu_sync(
    state: &AppState,
    current_user: &CurrentUser,
    request: DataOpsActionRequest,
) -> Response {
    let service_name = resolve_requested_service_name(&request);
    let definition = match resolve_feishu_sync_definition(service_name.as_deref()) {
        Ok(value) => value,
        Err(message) => {
            return action_error(
                StatusCode::BAD_REQUEST,
                "trigger_feishu_sync",
                message.as_str(),
                None,
                None,
                None,
            );
        }
    };

    let lock_key = build_feishu_sync_lock_key(service_name.as_ref());
    let lock_ttl_ms = resolve_lock_ttl_ms();
    let lock_result = acquire_feishu_sync_trigger_lock(state, lock_key.as_str(), lock_ttl_ms).await;
    if !lock_result.acquired {
        return handle_lock_conflict(state, current_user, service_name.as_ref(), lock_result).await;
    }

    let trigger_url = resolve_env_or("DATAOPS_FEISHU_SYNC_TRIGGER_URL", "");
    if trigger_url.is_empty() {
        return action_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "trigger_feishu_sync",
            "未配置 DATAOPS_FEISHU_SYNC_TRIGGER_URL，无法触发飞书同步",
            None,
            None,
            None,
        );
    }

    let http_result =
        trigger_feishu_sync_http(state, trigger_url.as_str(), definition.as_ref()).await;

    match http_result {
        Ok(_) => {
            handle_trigger_success(
                state,
                current_user,
                service_name,
                trigger_url.as_str(),
                lock_ttl_ms,
                lock_result,
            )
            .await
        }
        Err(error) => action_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "trigger_feishu_sync",
            format!("触发飞书同步失败：{}", error.message).as_str(),
            None,
            None,
            None,
        ),
    }
}
