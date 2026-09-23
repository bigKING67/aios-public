use axum::http::StatusCode;
use reqwest::Method;
use serde_json::json;

use crate::state::AppState;

use super::super::super::env::encode_path_segment;
use super::super::{
    cache::{get_cached_prefect_deployment, set_cached_prefect_deployment},
    config::get_prefect_api_url,
    transport::{extract_error_message, request_http_text},
    types::{PrefectDeployment, PrefectError},
};

pub(crate) async fn get_deployment_by_name(
    state: &AppState,
    flow_name: &str,
    deployment_name: &str,
) -> Result<Option<PrefectDeployment>, PrefectError> {
    let cache_key = format!("deployment:{flow_name}/{deployment_name}");
    if let Some(cached) = get_cached_prefect_deployment(cache_key.as_str()).await {
        return Ok(cached);
    }

    let path = format!(
        "{}/deployments/name/{}/{}",
        get_prefect_api_url(),
        encode_path_segment(flow_name),
        encode_path_segment(deployment_name),
    );

    let response = request_http_text(state, Method::GET, path.as_str(), None, None, None).await;

    let result = match response {
        Ok((status, _body)) if status == StatusCode::NOT_FOUND => Ok(None),
        Ok((status, body)) if !status.is_success() => Err(PrefectError {
            message: extract_error_message(status, body.as_str()),
            status: Some(status),
            is_network_error: false,
        }),
        Ok((_, body)) => serde_json::from_str::<PrefectDeployment>(body.as_str())
            .map(Some)
            .map_err(|error| PrefectError {
                message: format!("解析 Prefect deployment 响应失败：{}", error),
                status: None,
                is_network_error: false,
            }),
        Err(error) => Err(error),
    };

    if let Ok(value) = result.as_ref() {
        set_cached_prefect_deployment(cache_key.as_str(), value.clone()).await;
    }

    result
}

pub(crate) async fn patch_deployment_paused(
    state: &AppState,
    deployment_id: &str,
    paused: bool,
) -> Result<(), PrefectError> {
    let endpoint = format!("{}/deployments/{}", get_prefect_api_url(), deployment_id);
    let response = request_http_text(
        state,
        Method::PATCH,
        endpoint.as_str(),
        Some(json!({ "paused": paused })),
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

    Ok(())
}
