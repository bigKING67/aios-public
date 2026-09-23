use reqwest::Method;
use serde_json::{json, Map, Value};

use crate::state::AppState;

use super::super::{
    config::get_prefect_api_url,
    transport::{extract_error_message, request_http_text},
    types::{PrefectError, PrefectRunCreateResult},
};

pub(crate) async fn create_flow_run_by_deployment_id(
    state: &AppState,
    deployment_id: &str,
    name: &str,
    parameters: Map<String, Value>,
) -> Result<PrefectRunCreateResult, PrefectError> {
    let endpoint = format!(
        "{}/deployments/{}/create_flow_run",
        get_prefect_api_url(),
        deployment_id
    );
    let response = request_http_text(
        state,
        Method::POST,
        endpoint.as_str(),
        Some(json!({
            "name": name,
            "parameters": Value::Object(parameters),
        })),
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

    let payload = serde_json::from_str::<Value>(response.1.as_str()).unwrap_or_else(|_| json!({}));
    Ok(PrefectRunCreateResult {
        id: payload
            .get("id")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
        name: payload
            .get("name")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string()),
    })
}
