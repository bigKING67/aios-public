use serde_json::Value;

use super::{
    numeric::{parse_numeric, parse_numeric_record},
    series::{
        apply_nowcast_quality_patch, collect_series_predicted_totals,
        patch_overview_totals_with_predicted, patch_series_with_nowcast_prediction,
    },
    types::OverviewNowcastPatch,
};

pub(crate) fn is_nowcast_dependency_missing(raw_error: &str) -> bool {
    raw_error
        .to_lowercase()
        .contains("all_trade_overview_refund_nowcast")
}

pub(crate) fn apply_overview_nowcast_patch(payload: &mut Value, patch: OverviewNowcastPatch) {
    let current_by_date = parse_numeric_record(&patch.current_by_date);
    let previous_by_date = parse_numeric_record(&patch.previous_by_date);
    let current_total = parse_numeric(&patch.current_total);
    let previous_total = parse_numeric(&patch.previous_total);
    apply_nowcast_quality_patch(payload, &patch.nowcast_quality);

    if let Some(as_of_date) = patch
        .as_of_date
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(record) = payload.as_object_mut() {
            record.insert(
                "nowcastAsOfDate".to_string(),
                Value::String(as_of_date.to_string()),
            );
        }
    }

    let mut current_series_totals = None;
    if let Some(current_series) = payload
        .get_mut("currentSeries")
        .and_then(Value::as_array_mut)
    {
        patch_series_with_nowcast_prediction(current_series, &current_by_date);
        current_series_totals = collect_series_predicted_totals(current_series);
    }

    let mut previous_series_totals = None;
    if let Some(previous_series) = payload
        .get_mut("previousSeries")
        .and_then(Value::as_array_mut)
    {
        patch_series_with_nowcast_prediction(previous_series, &previous_by_date);
        previous_series_totals = collect_series_predicted_totals(previous_series);
    }

    if let Some(current_totals) = payload.get_mut("currentTotals") {
        patch_overview_totals_with_predicted(current_totals, current_series_totals, current_total);
    }

    if let Some(previous_totals) = payload.get_mut("previousTotals") {
        patch_overview_totals_with_predicted(
            previous_totals,
            previous_series_totals,
            previous_total,
        );
    }
}
