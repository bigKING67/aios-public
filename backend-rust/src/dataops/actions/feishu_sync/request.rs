use axum::http::{HeaderMap, HeaderValue};
use reqwest::Method;
use serde_json::{Map, Value};

use crate::state::AppState;

use super::super::super::{
    env::{resolve_i64_env, resolve_optional_env},
    prefect::{request_http_json, PrefectError},
    types::DataOpsFeishuSyncServiceDefinition,
};

pub(super) async fn trigger_feishu_sync_http(
    state: &AppState,
    trigger_url: &str,
    definition: Option<&DataOpsFeishuSyncServiceDefinition>,
) -> Result<Value, PrefectError> {
    let mut request_body = Map::new();
    if let Some(item) = definition.and_then(|entry| entry.cli_flag.clone()) {
        request_body.insert("service_flag".to_string(), Value::String(item));
    }

    let timeout_ms = resolve_i64_env(
        "DATAOPS_FEISHU_SYNC_TRIGGER_TIMEOUT_MS",
        10_000,
        1_000,
        60_000,
    ) as u64;

    let mut headers = HeaderMap::new();
    if let Some(token) = resolve_optional_env("DATAOPS_FEISHU_SYNC_TRIGGER_TOKEN") {
        if let Ok(header) = HeaderValue::from_str(format!("Bearer {}", token).as_str()) {
            headers.insert("Authorization", header);
        }
    }

    request_http_json::<Value>(
        state,
        Method::POST,
        trigger_url,
        Some(Value::Object(request_body)),
        Some(timeout_ms),
        Some(headers),
    )
    .await
}
