use serde_json::{json, Value};

fn compute_change_rate(current: f64, previous: f64) -> Option<f64> {
    if previous.abs() <= f64::EPSILON {
        None
    } else {
        Some((current - previous) / previous)
    }
}

pub(super) fn build_traffic_metric_triplet_value(current: f64, previous: f64) -> Value {
    json!({
        "current": current,
        "previous": previous,
        "wow": compute_change_rate(current, previous),
    })
}
