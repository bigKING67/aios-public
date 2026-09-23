use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

use crate::{auth::CurrentUser, state::AppState};

use super::{
    access::dataops_access_denial,
    actions::{
        handle_pause_or_resume, handle_trigger_feishu_sync, handle_trigger_pipeline,
        parse_action_request,
    },
    batch_executions::{delete_batch_executions, get_batch_executions, post_batch_executions},
    notification_trace::{get_notification_trace, post_notification_trace_scan},
    responses::{action_error, json_no_store},
    runtime::build_runtime_response,
    webhook::handle_test_channel_webhook,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/runtime", get(get_runtime))
        .route(
            "/actions",
            post(post_actions).get(method_not_allowed_actions),
        )
        .route(
            "/batch-executions",
            post(post_batch_executions)
                .get(get_batch_executions)
                .delete(delete_batch_executions),
        )
        .route("/runtime/notification-trace", get(get_notification_trace))
        .route(
            "/runtime/notification-trace/scan",
            post(post_notification_trace_scan),
        )
}

async fn get_runtime(State(state): State<Arc<AppState>>, current_user: CurrentUser) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    match build_runtime_response(state.as_ref()).await {
        Ok(payload) => json_no_store(StatusCode::OK, json!(payload)),
        Err(message) => json_no_store(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({
                "message": message,
            }),
        ),
    }
}

async fn post_actions(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<Value>,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let Some(request) = parse_action_request(payload) else {
        return action_error(
            StatusCode::BAD_REQUEST,
            "trigger_pipeline",
            "请求体非法，或 action 不在允许范围内",
            None,
            None,
            None,
        );
    };

    match request.action.as_str() {
        "trigger_pipeline" => handle_trigger_pipeline(state.as_ref(), &current_user, request).await,
        "pause_deployment" | "resume_deployment" => {
            handle_pause_or_resume(state.as_ref(), &current_user, request).await
        }
        "test_channel_webhook" => {
            handle_test_channel_webhook(state.as_ref(), &current_user, request).await
        }
        "trigger_feishu_sync" => {
            handle_trigger_feishu_sync(state.as_ref(), &current_user, request).await
        }
        _ => action_error(
            StatusCode::BAD_REQUEST,
            &request.action,
            "未支持的 action",
            None,
            None,
            None,
        ),
    }
}

async fn method_not_allowed_actions(current_user: CurrentUser) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    action_error(
        StatusCode::METHOD_NOT_ALLOWED,
        "trigger_pipeline",
        "Method not allowed. Use POST.",
        None,
        None,
        None,
    )
}
