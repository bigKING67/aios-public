use serde_json::{json, Value};

use super::super::model::DashboardTrafficMetricRow;
use super::metrics::build_traffic_metrics_value;
use super::row_ops::traffic_row_key;

pub(super) fn build_traffic_node_value(
    row: &DashboardTrafficMetricRow,
    children: Vec<Value>,
) -> Value {
    json!({
        "key": traffic_row_key(row),
        "sourceLevel": row.source_level,
        "sourceName": row.source_name,
        "parentSourceName": row.parent_source_name,
        "metrics": build_traffic_metrics_value(row),
        "children": children,
    })
}
