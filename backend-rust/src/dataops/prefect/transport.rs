use axum::http::{HeaderMap, StatusCode};
use reqwest::Method;
use serde::Deserialize;
use serde_json::Value;

use crate::state::AppState;

use super::super::env::resolve_optional_env;
use super::config::DEFAULT_PREFECT_TIMEOUT_MS;
use super::types::PrefectError;

#[derive(Debug, PartialEq, Eq)]
enum PrefectAuth {
    None,
    Bearer(String),
    Basic { username: String, password: String },
}

pub(crate) async fn request_http_text(
    state: &AppState,
    method: Method,
    url: &str,
    body: Option<Value>,
    timeout_ms: Option<u64>,
    headers: Option<HeaderMap>,
) -> Result<(StatusCode, String), PrefectError> {
    let timeout_ms = timeout_ms.unwrap_or(DEFAULT_PREFECT_TIMEOUT_MS);

    let mut request_builder = state
        .http_client
        .request(method, url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .timeout(std::time::Duration::from_millis(timeout_ms));

    let auth_mode = resolve_optional_env("DATAOPS_PREFECT_AUTH_MODE");
    let api_key = resolve_optional_env("DATAOPS_PREFECT_API_KEY");
    let basic_username = resolve_optional_env("DATAOPS_PREFECT_BASIC_AUTH_USERNAME");
    let basic_password = resolve_optional_env("DATAOPS_PREFECT_BASIC_AUTH_PASSWORD");
    match resolve_prefect_auth(
        auth_mode.as_deref(),
        api_key.as_deref(),
        basic_username.as_deref(),
        basic_password.as_deref(),
    )? {
        PrefectAuth::None => {}
        PrefectAuth::Bearer(token) => {
            request_builder = request_builder.bearer_auth(token);
        }
        PrefectAuth::Basic { username, password } => {
            request_builder = request_builder.basic_auth(username, Some(password));
        }
    }

    if let Some(headers) = headers {
        for (key, value) in headers.iter() {
            request_builder = request_builder.header(key, value);
        }
    }

    if let Some(body) = body {
        request_builder = request_builder.json(&body);
    }

    let response = request_builder.send().await.map_err(|error| PrefectError {
        message: if error.is_timeout() {
            format!("请求超时（>{}ms）", timeout_ms)
        } else {
            format!("网络请求失败：{}", error)
        },
        status: None,
        is_network_error: true,
    })?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    Ok((status, body))
}

fn resolve_prefect_auth(
    mode: Option<&str>,
    api_key: Option<&str>,
    basic_username: Option<&str>,
    basic_password: Option<&str>,
) -> Result<PrefectAuth, PrefectError> {
    let normalized_mode = mode.map(str::trim).filter(|value| !value.is_empty());
    let normalized_api_key = api_key.map(str::trim).filter(|value| !value.is_empty());
    let normalized_username = basic_username
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let normalized_password = basic_password.filter(|value| !value.is_empty());

    match normalized_mode {
        None if normalized_api_key.is_some() => Ok(PrefectAuth::Bearer(
            normalized_api_key.unwrap_or_default().to_string(),
        )),
        None | Some("none") => Ok(PrefectAuth::None),
        Some("bearer") => normalized_api_key
            .map(|token| PrefectAuth::Bearer(token.to_string()))
            .ok_or_else(|| {
                prefect_auth_config_error(
                    "DATAOPS_PREFECT_AUTH_MODE=bearer 需要 DATAOPS_PREFECT_API_KEY",
                )
            }),
        Some("basic") => match (normalized_username, normalized_password) {
            (Some(username), Some(password)) => Ok(PrefectAuth::Basic {
                username: username.to_string(),
                password: password.to_string(),
            }),
            _ => Err(prefect_auth_config_error(
                "DATAOPS_PREFECT_AUTH_MODE=basic 需要 DATAOPS_PREFECT_BASIC_AUTH_USERNAME 和 DATAOPS_PREFECT_BASIC_AUTH_PASSWORD",
            )),
        },
        Some(other) => Err(prefect_auth_config_error(
            format!(
                "DATAOPS_PREFECT_AUTH_MODE 不支持 {other}，仅支持 none / bearer / basic"
            )
            .as_str(),
        )),
    }
}

fn prefect_auth_config_error(message: &str) -> PrefectError {
    PrefectError {
        message: message.to_string(),
        status: None,
        is_network_error: false,
    }
}

pub(crate) async fn request_http_json<T: for<'de> Deserialize<'de>>(
    state: &AppState,
    method: Method,
    url: &str,
    body: Option<Value>,
    timeout_ms: Option<u64>,
    headers: Option<HeaderMap>,
) -> Result<T, PrefectError> {
    let response = request_http_text(state, method, url, body, timeout_ms, headers).await?;
    if !response.0.is_success() {
        return Err(PrefectError {
            message: extract_error_message(response.0, response.1.as_str()),
            status: Some(response.0),
            is_network_error: false,
        });
    }

    serde_json::from_str::<T>(response.1.as_str()).map_err(|error| PrefectError {
        message: format!("解析响应失败：{}", error),
        status: Some(response.0),
        is_network_error: false,
    })
}

pub(crate) fn extract_error_message(status: StatusCode, body: &str) -> String {
    let normalized = body.trim();
    if normalized.is_empty() {
        return format!("Prefect 请求失败 ({})", status.as_u16());
    }

    if let Ok(value) = serde_json::from_str::<Value>(normalized) {
        if let Some(detail) = value.get("detail").and_then(|item| item.as_str()) {
            return detail.to_string();
        }
        if let Some(message) = value.get("message").and_then(|item| item.as_str()) {
            return message.to_string();
        }
    }

    truncate_text(normalized, 200)
}

fn truncate_text(value: &str, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value.to_string();
    }

    let prefix = value
        .chars()
        .take(max_len.saturating_sub(1))
        .collect::<String>();
    format!("{}…", prefix)
}

#[cfg(test)]
mod tests {
    use super::{resolve_prefect_auth, PrefectAuth};

    #[test]
    fn auth_defaults_to_none_without_credentials() {
        assert_eq!(
            resolve_prefect_auth(None, None, None, None).expect("resolve auth"),
            PrefectAuth::None
        );
    }

    #[test]
    fn auth_preserves_legacy_api_key_as_bearer() {
        assert_eq!(
            resolve_prefect_auth(None, Some("legacy-token"), None, None).expect("resolve auth"),
            PrefectAuth::Bearer("legacy-token".to_string())
        );
    }

    #[test]
    fn auth_supports_explicit_basic_credentials() {
        assert_eq!(
            resolve_prefect_auth(Some("basic"), None, Some("operator"), Some("secret"))
                .expect("resolve auth"),
            PrefectAuth::Basic {
                username: "operator".to_string(),
                password: "secret".to_string(),
            }
        );
    }

    #[test]
    fn auth_fails_closed_when_selected_credentials_are_missing() {
        let error = resolve_prefect_auth(Some("basic"), None, Some("operator"), None)
            .expect_err("missing password must fail");
        assert!(error.message.contains("BASIC_AUTH_PASSWORD"));

        let error = resolve_prefect_auth(Some("bearer"), None, None, None)
            .expect_err("missing token must fail");
        assert!(error.message.contains("DATAOPS_PREFECT_API_KEY"));
    }
}
