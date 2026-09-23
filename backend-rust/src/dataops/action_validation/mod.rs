use std::collections::HashSet;

use chrono::NaiveDate;
use serde_json::{Map, Value};

use super::types::DataOpsTriggerParameterSpec;

mod boolean;
mod number;
mod result;
mod text;

pub(in crate::dataops) use result::ParameterValidationResult;

pub(super) fn validate_trigger_parameters(
    pipeline_id: &str,
    raw_parameters: Option<&Map<String, Value>>,
) -> ParameterValidationResult {
    let specs = super::DATAOPS_CONFIG
        .trigger_parameter_specs
        .get(pipeline_id)
        .cloned()
        .unwrap_or_default();

    let mut result = ParameterValidationResult::default();
    let payload = raw_parameters.cloned().unwrap_or_default();
    if specs.is_empty() {
        if !payload.is_empty() {
            result.reject_unsupported_parameters();
        }
        return result;
    }

    reject_unknown_parameters(payload.keys(), specs.as_slice(), &mut result);
    validate_known_parameters(specs.as_slice(), &payload, &mut result);
    validate_pipeline_contract(pipeline_id, &mut result);
    result
}

fn validate_pipeline_contract(pipeline_id: &str, result: &mut ParameterValidationResult) {
    if pipeline_id != "daily_business_brief" {
        return;
    }

    if let Some(target_date) = result.parameters.get("target_date").and_then(Value::as_str) {
        if NaiveDate::parse_from_str(target_date, "%Y-%m-%d").is_err() {
            result
                .errors
                .push("参数 target_date 格式必须为 YYYY-MM-DD".to_string());
        }
    }

    let production_selected = result
        .parameters
        .get("delivery_mode")
        .and_then(Value::as_str)
        == Some("production");
    let production_confirmed = result
        .parameters
        .get("production_confirmed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if production_selected && !production_confirmed {
        result
            .errors
            .push("production 模式必须显式确认正式投递".to_string());
    }
}

fn reject_unknown_parameters<'a>(
    payload_keys: impl Iterator<Item = &'a String>,
    specs: &[DataOpsTriggerParameterSpec],
    result: &mut ParameterValidationResult,
) {
    let allowed_keys = specs
        .iter()
        .map(|item| item.key.clone())
        .collect::<HashSet<_>>();

    for key in payload_keys {
        if !allowed_keys.contains(key) {
            result.reject_unknown_key(key);
        }
    }
}

fn validate_known_parameters(
    specs: &[DataOpsTriggerParameterSpec],
    payload: &Map<String, Value>,
    result: &mut ParameterValidationResult,
) {
    for spec in specs {
        let raw_value = payload.get(spec.key.as_str());
        if is_missing_parameter(raw_value) {
            result.reject_missing_required(spec);
            continue;
        }

        let value = raw_value.expect("checked above");
        match spec.param_type.as_str() {
            "number" => number::validate_number_parameter(spec, value, result),
            "boolean" => boolean::validate_boolean_parameter(spec, value, result),
            _ => text::validate_text_parameter(spec, value, result),
        }
    }
}

fn is_missing_parameter(raw_value: Option<&Value>) -> bool {
    raw_value
        .map(|item| {
            item.is_null()
                || item
                    .as_str()
                    .map(|text| text.trim().is_empty())
                    .unwrap_or(false)
        })
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Map, Value};

    use super::validate_trigger_parameters;

    fn parameters(value: Value) -> Map<String, Value> {
        value.as_object().expect("fixture object").clone()
    }

    #[test]
    fn daily_brief_preview_parameters_are_normalized() {
        let input = parameters(json!({
            "delivery_mode": " preview ",
            "production_confirmed": false,
            "target_date": "2026-08-24"
        }));

        let result = validate_trigger_parameters("daily_business_brief", Some(&input));

        assert!(result.errors.is_empty(), "{:?}", result.errors);
        assert_eq!(
            result.parameters.get("delivery_mode"),
            Some(&json!("preview"))
        );
        assert_eq!(
            result.parameters.get("production_confirmed"),
            Some(&json!(false))
        );
    }

    #[test]
    fn daily_brief_rejects_unknown_delivery_mode() {
        let input = parameters(json!({
            "delivery_mode": "broadcast_everywhere",
            "production_confirmed": true
        }));

        let result = validate_trigger_parameters("daily_business_brief", Some(&input));

        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("delivery_mode")));
        assert!(!result.parameters.contains_key("delivery_mode"));
    }

    #[test]
    fn daily_brief_production_requires_explicit_confirmation() {
        let input = parameters(json!({
            "delivery_mode": "production",
            "production_confirmed": false,
            "target_date": "2026-08-24"
        }));

        let result = validate_trigger_parameters("daily_business_brief", Some(&input));

        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("显式确认正式投递")));
    }

    #[test]
    fn daily_brief_accepts_confirmed_production_with_iso_date() {
        let input = parameters(json!({
            "delivery_mode": "production",
            "production_confirmed": true,
            "target_date": "2026-08-24"
        }));

        let result = validate_trigger_parameters("daily_business_brief", Some(&input));

        assert!(result.errors.is_empty(), "{:?}", result.errors);
    }

    #[test]
    fn daily_brief_rejects_non_iso_target_date() {
        let input = parameters(json!({
            "delivery_mode": "preview",
            "production_confirmed": false,
            "target_date": "yesterday"
        }));

        let result = validate_trigger_parameters("daily_business_brief", Some(&input));

        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("YYYY-MM-DD")));
    }
}
