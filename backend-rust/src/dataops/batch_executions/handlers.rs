use std::collections::HashMap;
use std::sync::Arc;

use axum::{extract::Query, extract::State, http::StatusCode, response::Response, Json};
use serde_json::{json, Value};

use crate::auth::CurrentUser;
use crate::state::AppState;

use super::super::access::{dataops_access_denial, resolve_operator};
use super::super::responses::json_no_store;
use super::super::runtime_store::{
    append_batch_execution_event, delete_batch_execution_event,
    list_batch_execution_events_with_store,
};
use super::super::types::BatchExecutionSaveRequest;
use super::parser::parse_batch_execution_request;

pub(in crate::dataops) async fn post_batch_executions(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Json(payload): Json<BatchExecutionSaveRequest>,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let parsed = parse_batch_execution_request(payload, resolve_operator(&current_user));
    let record = match parsed {
        Ok(item) => item,
        Err(message) => {
            return json_no_store(
                StatusCode::BAD_REQUEST,
                json!({
                    "success": false,
                    "message": message,
                }),
            )
        }
    };

    let write_result = append_batch_execution_event(state.as_ref(), record.clone()).await;
    let mut response_payload = json!({
        "success": true,
        "id": record.id,
        "message": "批量执行历史已记录",
        "storageMode": write_result.mode,
    });
    if let Some(warning) = write_result.warning {
        if let Some(payload) = response_payload.as_object_mut() {
            payload.insert("storageWarning".to_string(), Value::String(warning));
        }
    }

    json_no_store(StatusCode::OK, response_payload)
}

pub(in crate::dataops) async fn get_batch_executions(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let read_result = list_batch_execution_events_with_store(state.as_ref()).await;
    let mut response_payload = json!({
        "success": true,
        "items": read_result.items,
        "storageMode": read_result.mode,
    });
    if let Some(warning) = read_result.warning {
        if let Some(payload) = response_payload.as_object_mut() {
            payload.insert("storageWarning".to_string(), Value::String(warning));
        }
    }

    json_no_store(StatusCode::OK, response_payload)
}

pub(in crate::dataops) async fn delete_batch_executions(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    if let Some(response) = dataops_access_denial(&current_user) {
        return response;
    }

    let event_id = query
        .get("id")
        .map(|item| item.trim().to_string())
        .unwrap_or_default();

    if event_id.is_empty() {
        return json_no_store(
            StatusCode::BAD_REQUEST,
            json!({
                "success": false,
                "message": "id 不能为空",
            }),
        );
    }

    let delete_result = delete_batch_execution_event(state.as_ref(), event_id.as_str()).await;
    let mut response_payload = json!({
        "success": true,
        "id": event_id,
        "deleted": delete_result.deleted,
        "message": if delete_result.deleted { "批量执行历史已删除" } else { "未找到目标批量执行历史" },
        "storageMode": delete_result.mode,
    });
    if let Some(warning) = delete_result.warning {
        if let Some(payload) = response_payload.as_object_mut() {
            payload.insert("storageWarning".to_string(), Value::String(warning));
        }
    }

    json_no_store(StatusCode::OK, response_payload)
}
