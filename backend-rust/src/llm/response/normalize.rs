use serde_json::Value;

pub(super) fn normalize_content(value: Value) -> anyhow::Result<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() {
                anyhow::bail!("llm content is empty");
            }
            Ok(trimmed)
        }
        Value::Object(map) => {
            let text = map
                .get("text")
                .or_else(|| map.get("content"))
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .trim();

            if text.is_empty() {
                anyhow::bail!("llm content object has no text");
            }

            Ok(text.to_string())
        }
        Value::Array(items) => {
            let mut merged = Vec::new();
            for item in items {
                if let Value::Object(map) = item {
                    let text = map
                        .get("text")
                        .or_else(|| map.get("content"))
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .trim();
                    if !text.is_empty() {
                        merged.push(text.to_string());
                    }
                }
            }

            if merged.is_empty() {
                anyhow::bail!("llm content array has no text");
            }

            Ok(merged.join("\n"))
        }
        _ => anyhow::bail!("llm content format is unsupported"),
    }
}
