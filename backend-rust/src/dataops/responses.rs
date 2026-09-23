use axum::{
    http::{header::CACHE_CONTROL, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{Map, Value};

pub(super) fn action_success(
    status: StatusCode,
    action: &str,
    message: &str,
    pipeline_id: Option<String>,
    channel_id: Option<String>,
    extra: Option<Value>,
) -> Response {
    let mut payload = Map::new();
    payload.insert("success".to_string(), Value::Bool(true));
    payload.insert("action".to_string(), Value::String(action.to_string()));
    payload.insert("message".to_string(), Value::String(message.to_string()));

    if let Some(pipeline_id) = pipeline_id {
        payload.insert("pipelineId".to_string(), Value::String(pipeline_id));
    }

    if let Some(channel_id) = channel_id {
        payload.insert("channelId".to_string(), Value::String(channel_id));
    }

    if let Some(extra) = extra {
        if let Some(map) = extra.as_object() {
            for (key, value) in map {
                if !value.is_null() {
                    payload.insert(key.clone(), value.clone());
                }
            }
        }
    }

    json_no_store(status, Value::Object(payload))
}

pub(super) fn action_error(
    status: StatusCode,
    action: &str,
    message: &str,
    pipeline_id: Option<String>,
    channel_id: Option<String>,
    lock_mode: Option<String>,
) -> Response {
    action_error_with_lock(
        status,
        action,
        message,
        pipeline_id,
        channel_id,
        lock_mode,
        None,
    )
}

pub(super) fn action_error_with_lock(
    status: StatusCode,
    action: &str,
    message: &str,
    pipeline_id: Option<String>,
    channel_id: Option<String>,
    lock_mode: Option<String>,
    lock_warning: Option<String>,
) -> Response {
    let mut payload = Map::new();
    payload.insert("success".to_string(), Value::Bool(false));
    payload.insert("action".to_string(), Value::String(action.to_string()));
    payload.insert("message".to_string(), Value::String(message.to_string()));

    if let Some(pipeline_id) = pipeline_id {
        payload.insert("pipelineId".to_string(), Value::String(pipeline_id));
    }

    if let Some(channel_id) = channel_id {
        payload.insert("channelId".to_string(), Value::String(channel_id));
    }

    if let Some(lock_mode) = lock_mode {
        payload.insert("lockMode".to_string(), Value::String(lock_mode));
    }

    if let Some(lock_warning) = lock_warning {
        payload.insert("lockWarning".to_string(), Value::String(lock_warning));
    }

    json_no_store(status, Value::Object(payload))
}

pub(super) fn json_no_store(status: StatusCode, payload: Value) -> Response {
    let mut response = (status, Json(payload)).into_response();
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
