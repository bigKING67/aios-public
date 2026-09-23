use serde_json::{json, Value};

use super::super::{
    numeric::{parse_numeric, round_to},
    types::SeriesPredictedTotals,
};

pub(in crate::dashboard::overview_nowcast_patch) fn collect_series_predicted_totals(
    series: &[Value],
) -> Option<SeriesPredictedTotals> {
    let mut predicted_total = 0_f64;
    let mut gmv_total = 0_f64;
    let mut has_predicted = false;
    let mut has_gmv = false;

    for item in series {
        let Some(row) = item.as_object() else {
            continue;
        };

        if let Some(predicted_value) = row
            .get("refund_amount_pay_time_predicted")
            .and_then(parse_numeric)
        {
            predicted_total += predicted_value;
            has_predicted = true;
        }

        if let Some(gmv_value) = row.get("gmv").and_then(parse_numeric) {
            gmv_total += gmv_value;
            has_gmv = true;
        }
    }

    if !has_predicted {
        return None;
    }

    Some(SeriesPredictedTotals {
        predicted_total: round_to(predicted_total, 2),
        gmv_total: if has_gmv {
            Some(round_to(gmv_total, 2))
        } else {
            None
        },
    })
}

pub(in crate::dashboard::overview_nowcast_patch) fn patch_overview_totals_with_predicted(
    totals: &mut Value,
    series_totals: Option<SeriesPredictedTotals>,
    fallback_predicted_total: Option<f64>,
) {
    let Some(record) = totals.as_object_mut() else {
        return;
    };

    let predicted_total = series_totals
        .map(|value| value.predicted_total)
        .or(fallback_predicted_total);
    let Some(predicted_total) = predicted_total else {
        return;
    };

    record.insert(
        "refund_amount_pay_time_predicted".to_string(),
        json!(predicted_total),
    );

    let gmv_total = series_totals
        .and_then(|value| value.gmv_total)
        .or_else(|| record.get("gmv").and_then(parse_numeric));

    if let Some(gmv_total) = gmv_total {
        record.insert(
            "gsv_pay_time_predicted".to_string(),
            json!(round_to(gmv_total - predicted_total, 2)),
        );

        if gmv_total > 0.0 {
            record.insert(
                "refund_rate_pay_time_predicted".to_string(),
                json!(round_to(predicted_total / gmv_total, 6)),
            );
        } else {
            record.insert("refund_rate_pay_time_predicted".to_string(), Value::Null);
        }
    }
}
