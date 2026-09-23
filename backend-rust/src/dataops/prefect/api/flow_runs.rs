use reqwest::Method;
use serde_json::{json, Value};

use crate::state::AppState;

use super::super::{
    cache::{get_cached_prefect_flow_runs, set_cached_prefect_flow_runs},
    config::get_prefect_api_url,
    transport::{extract_error_message, request_http_text},
    types::{PrefectError, PrefectFlowRun},
};

pub(crate) async fn get_recent_flow_runs_by_deployment_id(
    state: &AppState,
    deployment_id: &str,
    limit: usize,
) -> Result<Vec<PrefectFlowRun>, PrefectError> {
    let limit = limit.clamp(1, 200);
    let cache_key = format!("flow-runs:{deployment_id}:{limit}");
    if let Some(cached) = get_cached_prefect_flow_runs(cache_key.as_str()).await {
        return Ok(cached);
    }

    let body = json!({
        "sort": "START_TIME_DESC",
        "limit": limit,
        "deployments": {
            "id": {
                "any_": [deployment_id]
            }
        }
    });

    let endpoint = format!("{}/flow_runs/filter", get_prefect_api_url());
    let response = request_http_text(
        state,
        Method::POST,
        endpoint.as_str(),
        Some(body),
        None,
        None,
    )
    .await?;

    if !response.0.is_success() {
        return Err(PrefectError {
            message: extract_error_message(response.0, response.1.as_str()),
            status: Some(response.0),
            is_network_error: false,
        });
    }

    let payload =
        serde_json::from_str::<Value>(response.1.as_str()).map_err(|error| PrefectError {
            message: format!("解析 Prefect flow run 响应失败：{}", error),
            status: None,
            is_network_error: false,
        })?;

    let runs = extract_prefect_runs(&payload)?;
    set_cached_prefect_flow_runs(cache_key.as_str(), runs.clone()).await;
    Ok(runs)
}

fn extract_prefect_runs(payload: &Value) -> Result<Vec<PrefectFlowRun>, PrefectError> {
    if let Some(items) = payload.as_array() {
        return deserialize_prefect_runs(items);
    }
    for key in ["results", "items", "data"] {
        if let Some(items) = payload.get(key).and_then(|value| value.as_array()) {
            return deserialize_prefect_runs(items);
        }
    }
    Ok(Vec::new())
}

fn deserialize_prefect_runs(items: &[Value]) -> Result<Vec<PrefectFlowRun>, PrefectError> {
    let mut output = Vec::new();
    for item in items {
        match serde_json::from_value::<PrefectFlowRun>(item.clone()) {
            Ok(value) => output.push(value),
            Err(error) => {
                return Err(PrefectError {
                    message: format!("解析 Prefect flow run 失败：{}", error),
                    status: None,
                    is_network_error: false,
                })
            }
        }
    }

    Ok(output)
}
