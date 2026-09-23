use serde_json::{Map, Value};

use super::types::OverviewDetailsNowcastPatch;

mod amount;
mod quality;

pub(crate) fn apply_overview_details_nowcast_patch(
    payload: &mut Value,
    patch: OverviewDetailsNowcastPatch,
) {
    apply_as_of_date(payload, patch.as_of_date.as_deref());

    let by_row = patch
        .by_row
        .as_object()
        .cloned()
        .unwrap_or_else(Map::<String, Value>::new);

    let Some(rows) = payload.get_mut("rows").and_then(Value::as_array_mut) else {
        return;
    };

    for row_item in rows.iter_mut() {
        let Some(row) = row_item.as_object_mut() else {
            continue;
        };

        let row_patch = row_patch_for(row, &by_row);
        amount::apply_prediction_amount_patch(row, row_patch);
        quality::apply_prediction_quality_patch(row, row_patch);
    }
}

fn apply_as_of_date(payload: &mut Value, as_of_date: Option<&str>) {
    let Some(as_of_date) = as_of_date.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    if let Some(record) = payload.as_object_mut() {
        record.insert(
            "nowcastAsOfDate".to_string(),
            Value::String(as_of_date.to_string()),
        );
    }
}

fn row_patch_for<'a>(
    row: &Map<String, Value>,
    by_row: &'a Map<String, Value>,
) -> Option<&'a Map<String, Value>> {
    let date_key = row.get("date").and_then(Value::as_str).unwrap_or_default();
    let platform_label = row
        .get("platform")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if date_key.is_empty() || platform_label.is_empty() {
        return None;
    }

    let patch_key = format!("{date_key}|{platform_label}");
    by_row.get(patch_key.as_str()).and_then(Value::as_object)
}
