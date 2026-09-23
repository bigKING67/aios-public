use serde_json::{Map, Value};

pub(super) fn sanitize_batch_parameters(source: &Map<String, Value>) -> Map<String, Value> {
    let mut output = Map::new();

    for (key, value) in source.iter().take(40) {
        let key = key.trim();
        if key.is_empty() {
            continue;
        }

        match value {
            Value::Bool(item) => {
                output.insert(key.to_string(), Value::Bool(*item));
            }
            Value::Number(item) => {
                output.insert(key.to_string(), Value::Number(item.clone()));
            }
            Value::String(item) => {
                let normalized = item.trim();
                if !normalized.is_empty() {
                    output.insert(
                        key.to_string(),
                        Value::String(truncate_text(normalized, 120)),
                    );
                }
            }
            _ => {}
        }
    }

    output
}

pub(super) fn to_non_negative_i64(value: Option<&Value>) -> Option<i64> {
    let value = value?;

    if let Some(number) = value.as_i64() {
        if number >= 0 {
            return Some(number);
        }
        return None;
    }

    if let Some(text) = value.as_str() {
        let normalized = text.trim();
        if normalized.is_empty() || !normalized.chars().all(|char| char.is_ascii_digit()) {
            return None;
        }

        return normalized.parse::<i64>().ok();
    }

    None
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
