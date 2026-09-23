pub(super) fn round_to(value: f64, digits: i32) -> f64 {
    if !value.is_finite() {
        return value;
    }

    let factor = 10_f64.powi(digits);
    (value * factor).round() / factor
}

pub(super) fn normalized_percent(value: f64, decimals: i32) -> f64 {
    // 比率字段多数是 0~1，统一折算为百分比；已经是百分比的值保持量纲不变。
    let as_percent = if value.abs() <= 1.0 {
        value * 100.0
    } else {
        value
    };
    round_to(as_percent, decimals)
}

pub(super) fn json_number_from_f64(value: f64) -> serde_json::Value {
    serde_json::Number::from_f64(value)
        .map(serde_json::Value::Number)
        .unwrap_or(serde_json::Value::Null)
}
