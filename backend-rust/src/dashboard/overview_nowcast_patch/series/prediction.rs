use std::collections::HashMap;

use serde_json::{json, Map, Value};

use super::super::numeric::{parse_numeric, round_to};

pub(in crate::dashboard::overview_nowcast_patch) fn patch_series_with_nowcast_prediction(
    series: &mut [Value],
    by_date: &HashMap<String, f64>,
) {
    for item in series.iter_mut() {
        let Some(row) = item.as_object_mut() else {
            continue;
        };

        let date_key = row.get("date").and_then(Value::as_str).unwrap_or_default();
        let patched_predicted_value = if date_key.is_empty() {
            None
        } else {
            by_date.get(date_key).copied()
        };

        apply_predicted_refund_patch_to_series_row(row, patched_predicted_value);
    }
}

fn apply_predicted_refund_patch_to_series_row(
    row: &mut Map<String, Value>,
    patched_predicted_value: Option<f64>,
) {
    let predicted_value = patched_predicted_value.or_else(|| {
        row.get("refund_amount_pay_time_predicted")
            .and_then(parse_numeric)
    });

    let Some(predicted_value) = predicted_value else {
        return;
    };

    let normalized_predicted = round_to(predicted_value, 2);
    row.insert(
        "refund_amount_pay_time_predicted".to_string(),
        json!(normalized_predicted),
    );

    if let Some(gmv) = row.get("gmv").and_then(parse_numeric) {
        row.insert(
            "gsv_pay_time_predicted".to_string(),
            json!(round_to(gmv - normalized_predicted, 2)),
        );

        if gmv > 0.0 {
            row.insert(
                "refund_rate_pay_time_predicted".to_string(),
                json!(round_to(normalized_predicted / gmv, 6)),
            );
        } else {
            row.insert("refund_rate_pay_time_predicted".to_string(), Value::Null);
        }
    }
}
