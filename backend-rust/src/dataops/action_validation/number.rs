use serde_json::Value;

use super::{DataOpsTriggerParameterSpec, ParameterValidationResult};

pub(super) fn validate_number_parameter(
    spec: &DataOpsTriggerParameterSpec,
    value: &Value,
    result: &mut ParameterValidationResult,
) {
    let Some(number) = parse_number(value) else {
        result.errors.push(format!("参数 {} 必须是数字", spec.key));
        return;
    };

    let require_integer = spec.integer.unwrap_or(true);
    if require_integer && number.fract() != 0.0 {
        result.errors.push(format!("参数 {} 必须是整数", spec.key));
        return;
    }

    if let Some(min) = spec.min {
        if number < min {
            result
                .errors
                .push(format!("参数 {} 不能小于 {}", spec.key, min));
            return;
        }
    }

    if let Some(max) = spec.max {
        if number > max {
            result
                .errors
                .push(format!("参数 {} 不能大于 {}", spec.key, max));
            return;
        }
    }

    let normalized = if require_integer {
        Value::from(number.round() as i64)
    } else {
        Value::from(number)
    };
    result.parameters.insert(spec.key.clone(), normalized);
}

fn parse_number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| {
        value
            .as_str()
            .and_then(|text| text.trim().parse::<f64>().ok())
    })
}
