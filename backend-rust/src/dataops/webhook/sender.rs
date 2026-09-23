use reqwest::Method;
use serde_json::{json, Value};

use crate::state::AppState;

use super::super::prefect::request_http_text;

pub(super) async fn send_feishu_webhook_text(
    state: &AppState,
    webhook_url: &str,
    text: &str,
) -> Result<(), String> {
    let normalized = text.trim();
    if normalized.is_empty() {
        return Err("Webhook 消息体不能为空".to_string());
    }

    let payload = json!({
        "msg_type": "text",
        "content": {
            "text": normalized,
        }
    });

    let response = request_http_text(
        state,
        Method::POST,
        webhook_url,
        Some(payload),
        Some(8_000),
        None,
    )
    .await
    .map_err(|error| error.message)?;

    if !response.0.is_success() {
        return Err(format!("飞书返回错误({})", response.0.as_u16()));
    }

    let parsed = serde_json::from_str::<Value>(response.1.as_str()).unwrap_or_else(|_| json!({}));
    if let Some(code) = parsed.get("code").and_then(|value| value.as_i64()) {
        if code != 0 {
            let message = parsed
                .get("msg")
                .and_then(|value| value.as_str())
                .unwrap_or("未知错误");
            return Err(format!("飞书返回错误({}): {}", code, message));
        }
    }

    Ok(())
}
