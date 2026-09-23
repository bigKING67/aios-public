use serde_json::Value;

pub(in crate::llm) fn extract_provider_error(error_value: Option<&Value>) -> Option<String> {
    let error_value = error_value?;

    if let Some(text) = error_value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(object) = error_value.as_object() {
        let message = object
            .get("message")
            .and_then(|value| value.as_str())
            .or_else(|| object.get("msg").and_then(|value| value.as_str()))
            .or_else(|| object.get("error").and_then(|value| value.as_str()));

        if let Some(text) = message {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}
