use serde_json::Value;

pub(super) fn integer_source_value(source_data: Option<&Value>, key: &str) -> i64 {
    source_data
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
}

pub(super) fn numeric_source_value(source_data: Option<&Value>, key: &str) -> f64 {
    source_data
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_f64())
        .unwrap_or(0.0)
}
