use serde_json::Value;

use super::{DataOpsTriggerParameterSpec, ParameterValidationResult};

pub(super) fn validate_boolean_parameter(
    spec: &DataOpsTriggerParameterSpec,
    value: &Value,
    result: &mut ParameterValidationResult,
) {
    let Some(value) = parse_boolean(value) else {
        result
            .errors
            .push(format!("参数 {} 必须是布尔值", spec.key));
        return;
    };

    result
        .parameters
        .insert(spec.key.clone(), Value::Bool(value));
}

fn parse_boolean(value: &Value) -> Option<bool> {
    value.as_bool().or_else(|| {
        value
            .as_str()
            .and_then(|text| match text.trim().to_lowercase().as_str() {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            })
    })
}
