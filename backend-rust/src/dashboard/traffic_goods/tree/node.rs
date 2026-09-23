use serde_json::{json, Value};

use super::super::model::DashboardTrafficGoodsMetricRow;
use super::metrics::build_traffic_goods_metrics_value;

fn traffic_goods_row_key(row: &DashboardTrafficGoodsMetricRow) -> String {
    format!(
        "{}|L{}|{}|{}",
        row.product_id, row.source_level, row.parent_source_name, row.source_name
    )
}

pub(super) fn build_traffic_goods_source_node_value(
    row: &DashboardTrafficGoodsMetricRow,
    children: Vec<Value>,
) -> Value {
    json!({
        "key": traffic_goods_row_key(row),
        "productId": row.product_id,
        "productName": row.product_name,
        "sourceLevel": row.source_level,
        "sourceName": row.source_name,
        "parentSourceName": row.parent_source_name,
        "metrics": build_traffic_goods_metrics_value(row),
        "children": children,
    })
}
