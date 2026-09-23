use serde_json::{Map, Value};

pub(super) fn apply_prediction_quality_patch(
    row: &mut Map<String, Value>,
    row_patch: Option<&Map<String, Value>>,
) {
    let Some(row_patch) = row_patch else {
        return;
    };

    if row_patch.contains_key("prediction_confidence") {
        match row_patch
            .get("prediction_confidence")
            .and_then(parse_prediction_confidence)
        {
            Some(value) => {
                row.insert("prediction_confidence".to_string(), Value::String(value));
            }
            None => {
                row.insert("prediction_confidence".to_string(), Value::Null);
            }
        }
    }

    if row_patch.contains_key("quality_status") {
        match row_patch
            .get("quality_status")
            .and_then(parse_quality_status)
        {
            Some(value) => {
                row.insert("quality_status".to_string(), Value::String(value));
            }
            None => {
                row.insert("quality_status".to_string(), Value::Null);
            }
        }
    }
}

fn parse_prediction_confidence(value: &Value) -> Option<String> {
    let raw = value.as_str()?.trim().to_lowercase();
    match raw.as_str() {
        "high" | "medium" | "low" => Some(raw),
        _ => None,
    }
}

fn parse_quality_status(value: &Value) -> Option<String> {
    let raw = value.as_str()?.trim().to_lowercase();
    match raw.as_str() {
        "pass" | "alert" | "insufficient" => Some(raw),
        _ => None,
    }
}
