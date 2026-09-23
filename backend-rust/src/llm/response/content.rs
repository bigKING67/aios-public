use serde_json::Value;

use super::{normalize::normalize_content, types::ChatCompletionResponse};

pub(in crate::llm) fn extract_response_content(payload: &Value) -> anyhow::Result<String> {
    if let Ok(parsed) = serde_json::from_value::<ChatCompletionResponse>(payload.clone()) {
        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("llm response choices is empty"))?;

        if !choice.message.content.is_null() {
            if let Ok(text) = normalize_content(choice.message.content) {
                return Ok(text);
            }
        }
    }

    if let Some(choices) = payload.get("choices").and_then(|value| value.as_array()) {
        if let Some(text) = extract_choices_text(choices) {
            return Ok(text);
        }
    }

    if let Some(text) = payload.get("output_text").and_then(|value| value.as_str()) {
        let normalized = text.trim();
        if !normalized.is_empty() {
            return Ok(normalized.to_string());
        }
    }

    if let Some(outputs) = payload.get("output").and_then(|value| value.as_array()) {
        if let Some(text) = extract_outputs_text(outputs) {
            return Ok(text);
        }
    }

    anyhow::bail!("llm response has no usable content")
}

fn extract_choices_text(choices: &[Value]) -> Option<String> {
    for choice in choices {
        if let Some(message) = choice.get("message") {
            if let Some(content) = message.get("content") {
                if !content.is_null() {
                    if let Ok(text) = normalize_content(content.clone()) {
                        return Some(text);
                    }
                }
            }
        }

        if let Some(text) = choice.get("text").and_then(|value| value.as_str()) {
            let normalized = text.trim();
            if !normalized.is_empty() {
                return Some(normalized.to_string());
            }
        }
    }

    None
}

fn extract_outputs_text(outputs: &[Value]) -> Option<String> {
    for output in outputs {
        if let Some(contents) = output.get("content").and_then(|value| value.as_array()) {
            let mut merged: Vec<String> = Vec::new();
            for content_item in contents {
                if let Some(text) = extract_output_content_item_text(content_item) {
                    merged.push(text);
                }
            }

            if !merged.is_empty() {
                return Some(merged.join("\n"));
            }
        }
    }

    None
}

fn extract_output_content_item_text(content_item: &Value) -> Option<String> {
    if let Some(text) = content_item.get("text").and_then(|value| value.as_str()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(text) = content_item.get("content").and_then(|value| value.as_str()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    None
}
