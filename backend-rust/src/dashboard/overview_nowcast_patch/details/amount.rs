use serde_json::{json, Map, Value};

use super::super::numeric::{parse_numeric, round_to};

pub(super) fn apply_prediction_amount_patch(
    row: &mut Map<String, Value>,
    row_patch: Option<&Map<String, Value>>,
) {
    let mut predicted_refund_amount = row
        .get("refund_amount_pay_time_predicted")
        .and_then(parse_numeric);

    if let Some(row_patch) = row_patch {
        if let Some(patched_predicted) = row_patch
            .get("refund_amount_pay_time_predicted")
            .and_then(parse_numeric)
        {
            predicted_refund_amount = Some(patched_predicted);
        }
    }

    let Some(predicted_refund_amount) = predicted_refund_amount else {
        return;
    };

    let normalized_predicted = round_to(predicted_refund_amount, 2);
    row.insert(
        "refund_amount_pay_time_predicted".to_string(),
        json!(normalized_predicted),
    );

    apply_derived_refund_metrics(row, normalized_predicted);
    apply_completeness_ratio(row, row_patch, normalized_predicted);
}

fn apply_derived_refund_metrics(row: &mut Map<String, Value>, normalized_predicted: f64) {
    let Some(gmv) = row.get("gmv").and_then(parse_numeric) else {
        return;
    };

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

fn apply_completeness_ratio(
    row: &mut Map<String, Value>,
    row_patch: Option<&Map<String, Value>>,
    normalized_predicted: f64,
) {
    if !row_patch
        .map(|value| value.contains_key("completeness_ratio"))
        .unwrap_or(false)
    {
        return;
    }

    let current_refund_amount = row
        .get("refund_amount_pay_time_current")
        .and_then(parse_numeric);
    let completeness = current_refund_amount
        .filter(|_| normalized_predicted > 0.0)
        .map(|value| round_to(value / normalized_predicted, 6));

    match completeness {
        Some(value) => {
            row.insert("completeness_ratio".to_string(), json!(value));
        }
        None => {
            row.insert("completeness_ratio".to_string(), Value::Null);
        }
    }
}
