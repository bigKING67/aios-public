use anyhow::Context;
use reqwest::Client;
use serde_json::Value;
use tracing::info;

use crate::config::Settings;

mod config;
mod request;
mod response;
mod text;
mod types;

pub use types::{LlmCallOptions, LlmCallResult};

pub async fn call_chat_completion(
    client: &Client,
    settings: &Settings,
    options: LlmCallOptions,
) -> anyhow::Result<LlmCallResult> {
    let LlmCallOptions {
        provider,
        model,
        thinking_enabled,
        request_scope,
        system_prompt,
        user_prompt,
    } = options;

    let provider_config = config::resolve_provider_config(settings, provider)?;
    let resolved_model = config::resolve_model(
        settings,
        model,
        provider_config.default_model.as_str(),
        provider_config.provider.as_str(),
    )?;
    let timeout_seconds = config::resolve_timeout_seconds(
        settings,
        provider_config.provider.as_str(),
        resolved_model.as_str(),
        thinking_enabled,
    );
    let max_tokens = config::resolve_max_tokens(
        settings,
        provider_config.provider.as_str(),
        resolved_model.as_str(),
        thinking_enabled,
    );

    let resolved_scope = request_scope
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown");
    info!(
        provider = provider_config.provider.as_str(),
        model = resolved_model.as_str(),
        scope = resolved_scope,
        resolved_timeout_seconds = timeout_seconds,
        resolved_max_tokens = max_tokens,
        thinking_enabled,
        "llm call resolved config"
    );

    let request_body = request::ChatCompletionRequest::new(
        resolved_model.clone(),
        system_prompt,
        user_prompt,
        config::resolve_temperature(
            settings,
            provider_config.provider.as_str(),
            resolved_model.as_str(),
            thinking_enabled,
        ),
        max_tokens,
        config::should_send_thinking_config(
            provider_config.provider.as_str(),
            resolved_model.as_str(),
            thinking_enabled,
        ),
    );

    let url = format!(
        "{}/chat/completions",
        provider_config.base_url.trim_end_matches('/')
    );

    let http_response = client
        .post(url)
        .header(
            "Authorization",
            format!("Bearer {}", provider_config.api_key),
        )
        .header("Content-Type", "application/json")
        // 部分模型网关在压缩响应流上偶发中断，显式请求 identity 降低 body 读取失败概率。
        .header("Accept-Encoding", "identity")
        .timeout(std::time::Duration::from_secs(timeout_seconds))
        .json(&request_body)
        .send()
        .await
        .with_context(|| format!("llm request failed (timeout={}s)", timeout_seconds))?;

    if !http_response.status().is_success() {
        let status = http_response.status();
        let body = http_response.text().await.unwrap_or_default();
        anyhow::bail!("llm http error {status}: {body}");
    }

    let raw_payload_bytes = http_response.bytes().await.with_context(|| {
        format!(
            "llm response body read failed (timeout={}s)",
            timeout_seconds
        )
    })?;
    let raw_payload = String::from_utf8_lossy(raw_payload_bytes.as_ref()).to_string();
    let payload =
        serde_json::from_slice::<Value>(raw_payload_bytes.as_ref()).with_context(|| {
            format!(
                "llm response parse failed: {}",
                text::truncate_text(raw_payload.as_str(), 320)
            )
        })?;

    if let Some(provider_error) = response::extract_provider_error(payload.get("error")) {
        anyhow::bail!("llm provider error: {provider_error}");
    }

    let content = response::extract_response_content(&payload).with_context(|| {
        format!(
            "llm response content missing: {}",
            text::truncate_text(raw_payload.as_str(), 320)
        )
    })?;

    Ok(LlmCallResult {
        provider: provider_config.provider,
        model: resolved_model,
        content,
    })
}
