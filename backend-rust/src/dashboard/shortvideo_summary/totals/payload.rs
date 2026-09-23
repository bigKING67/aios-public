use serde_json::Value;

use super::empty::empty_douyin_shortvideo_totals_value;

pub(super) fn totals_bundle_from_payload(
    payload: &Value,
) -> (Value, Value, Value, Value, Value, Value) {
    (
        bucket_totals(payload, "overviewCurrent"),
        bucket_totals(payload, "overviewPrevious"),
        bucket_totals(payload, "selfCurrent"),
        bucket_totals(payload, "selfPrevious"),
        bucket_totals(payload, "cooperationCurrent"),
        bucket_totals(payload, "cooperationPrevious"),
    )
}

fn bucket_totals(payload: &Value, bucket: &str) -> Value {
    payload
        .get(bucket)
        .cloned()
        .unwrap_or_else(empty_douyin_shortvideo_totals_value)
}
