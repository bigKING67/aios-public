use serde_json::Value;

pub(in crate::dashboard::overview_nowcast_patch) fn apply_nowcast_quality_patch(
    payload: &mut Value,
    nowcast_quality: &Value,
) {
    if nowcast_quality.is_null() {
        return;
    }

    if let Some(record) = payload.as_object_mut() {
        record.insert("nowcastQuality".to_string(), nowcast_quality.clone());
    }
}
