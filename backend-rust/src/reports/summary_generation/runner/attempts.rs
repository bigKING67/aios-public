use std::time::Duration as StdDuration;

use tracing::warn;

use crate::{
    llm::{call_chat_completion, LlmCallOptions},
    state::AppState,
};

use super::super::super::{
    summary_conclusions::{
        has_forbidden_placeholder_terms, parse_conclusions_from_llm, validate_conclusions_quality,
    },
    summary_jobs::{is_deepseek_reasoner_model, is_llm_empty_content_error, is_llm_timeout_error},
};
use super::types::GeneratedSummary;

pub(super) async fn generate_weekly_summary(
    state: &AppState,
    provider: &str,
    model: &str,
    normalized_scope: &str,
    prompt: &(String, String),
) -> anyhow::Result<GeneratedSummary> {
    let mut last_error: Option<anyhow::Error> = None;
    // 0: 原模型；1: deepseek-chat(thinking)；2: deepseek-chat(non-thinking)
    let mut fallback_mode: u8 = 0;
    let should_allow_reasoner_fallback = is_deepseek_reasoner_model(provider, model);

    for attempt in 0..3 {
        let (attempt_model, attempt_thinking_enabled) = match fallback_mode {
            1 => ("deepseek-chat".to_string(), true),
            2 => ("deepseek-chat".to_string(), false),
            _ => (model.to_string(), false),
        };

        match call_chat_completion(
            &state.http_client,
            &state.settings,
            LlmCallOptions {
                provider: Some(provider.to_string()),
                model: Some(attempt_model.clone()),
                thinking_enabled: attempt_thinking_enabled,
                request_scope: Some(normalized_scope.to_string()),
                system_prompt: prompt.0.clone(),
                user_prompt: prompt.1.clone(),
            },
        )
        .await
        {
            Ok(result) => match parse_conclusions_from_llm(result.content.as_str()) {
                Ok(conclusions) => {
                    if has_forbidden_placeholder_terms(&conclusions) {
                        last_error = Some(anyhow::anyhow!(
                            "llm output contains forbidden placeholder terms"
                        ));
                        continue;
                    }
                    if let Err(quality_error) = validate_conclusions_quality(&conclusions) {
                        last_error = Some(anyhow::anyhow!(
                            "llm output quality check failed: {quality_error}"
                        ));
                        continue;
                    }
                    let summary_text =
                        serde_json::to_string(&conclusions).unwrap_or_else(|_| "{}".to_string());

                    return Ok(GeneratedSummary {
                        summary_text,
                        provider: result.provider,
                        model: result.model,
                    });
                }
                Err(error) => {
                    if fallback_mode == 1 {
                        warn!(
                            "weekly summary deepseek-chat(thinking) parse failed, fallback to deepseek-chat(non-thinking) for scope={}",
                            normalized_scope
                        );
                        fallback_mode = 2;
                    }
                    last_error = Some(error);
                }
            },
            Err(error) => {
                if should_allow_reasoner_fallback
                    && fallback_mode == 0
                    && (is_llm_timeout_error(&error) || is_llm_empty_content_error(&error))
                {
                    warn!(
                        "weekly summary reasoner fallback triggered, fallback to deepseek-chat(thinking) for scope={}",
                        normalized_scope
                    );
                    fallback_mode = 1;
                } else if fallback_mode == 1 && is_llm_empty_content_error(&error) {
                    warn!(
                        "weekly summary deepseek-chat(thinking) empty content, fallback to deepseek-chat(non-thinking) for scope={}",
                        normalized_scope
                    );
                    fallback_mode = 2;
                }
                last_error = Some(error);
            }
        }

        if attempt < 2 {
            tokio::time::sleep(StdDuration::from_secs(2_u64.pow(attempt as u32))).await;
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("summary generation failed")))
}
