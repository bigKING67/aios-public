use std::collections::HashMap;

use serde_json::Value;

pub(super) fn parse_numeric(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64().filter(|value| value.is_finite()),
        Value::String(raw) => raw
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite()),
        _ => None,
    }
}

pub(super) fn parse_numeric_record(value: &Value) -> HashMap<String, f64> {
    let Some(object) = value.as_object() else {
        return HashMap::new();
    };

    object
        .iter()
        .filter_map(|(key, raw)| parse_numeric(raw).map(|parsed| (key.clone(), parsed)))
        .collect()
}

pub(super) fn round_to(value: f64, digits: i32) -> f64 {
    let factor = 10_f64.powi(digits);
    (value * factor).round() / factor
}
