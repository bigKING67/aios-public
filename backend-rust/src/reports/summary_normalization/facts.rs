use serde_json::Value;

use super::{
    keys::{is_integer_display_metric_key, is_integer_percent_key, is_two_decimal_rate_key},
    numeric::{json_number_from_f64, normalized_percent, round_to},
};

pub(crate) fn normalize_summary_facts_percentages(facts: Value) -> Value {
    fn normalize_node(current_key: Option<&str>, value: Value) -> Value {
        match value {
            Value::Object(map) => {
                let normalized = map
                    .into_iter()
                    .map(|(key, child)| {
                        let normalized_child = normalize_node(Some(key.as_str()), child);
                        (key, normalized_child)
                    })
                    .collect::<serde_json::Map<String, Value>>();
                Value::Object(normalized)
            }
            Value::Array(items) => Value::Array(
                items
                    .into_iter()
                    .map(|item| normalize_node(current_key, item))
                    .collect(),
            ),
            Value::Number(number) => {
                let Some(raw_value) = number.as_f64() else {
                    return Value::Number(number);
                };

                let Some(key) = current_key.map(|value| value.to_lowercase()) else {
                    return Value::Number(number);
                };

                if is_two_decimal_rate_key(key.as_str()) {
                    return json_number_from_f64(normalized_percent(raw_value, 2));
                }

                if is_integer_percent_key(key.as_str()) {
                    return json_number_from_f64(normalized_percent(raw_value, 0));
                }

                if is_integer_display_metric_key(key.as_str()) {
                    return json_number_from_f64(round_to(raw_value, 0));
                }

                Value::Number(number)
            }
            other => other,
        }
    }

    normalize_node(None, facts)
}
