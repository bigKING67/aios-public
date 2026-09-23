use serde_json::Value;

use super::{DataOpsTriggerParameterSpec, ParameterValidationResult};
use crate::dataops::time::MONTH_PERIOD_REGEX;

pub(super) fn validate_text_parameter(
    spec: &DataOpsTriggerParameterSpec,
    value: &Value,
    result: &mut ParameterValidationResult,
) {
    let text = normalize_text_value(value);

    if text.is_empty() {
        result.reject_missing_required(spec);
        return;
    }

    if spec.key == "month_period" && !MONTH_PERIOD_REGEX.is_match(text.as_str()) {
        result
            .errors
            .push("参数 month_period 格式必须为 YYYY-MM".to_string());
        return;
    }

    if !spec.options.is_empty() && !spec.options.iter().any(|option| option.value == text) {
        let allowed = spec
            .options
            .iter()
            .map(|option| option.value.as_str())
            .collect::<Vec<_>>()
            .join("/");
        result
            .errors
            .push(format!("参数 {} 仅支持 {}", spec.key, allowed));
        return;
    }

    result
        .parameters
        .insert(spec.key.clone(), Value::String(text));
}

fn normalize_text_value(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.trim().to_string();
    }

    value.to_string().trim().trim_matches('"').to_string()
}
