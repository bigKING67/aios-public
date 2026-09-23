mod aggregate;
mod metrics;
mod node;
mod ordering;
mod source_tree;

use std::collections::HashMap;

use serde_json::{json, Value};

use self::aggregate::aggregate_traffic_goods_rows;
use self::metrics::build_traffic_goods_metrics_value;
use self::ordering::sort_traffic_goods_rows;
use self::source_tree::build_traffic_goods_source_tree;
use super::model::DashboardTrafficGoodsMetricRow;

pub(crate) fn build_traffic_goods_tree(rows: &[DashboardTrafficGoodsMetricRow]) -> Vec<Value> {
    let mut rows_by_product = HashMap::<String, Vec<DashboardTrafficGoodsMetricRow>>::new();
    for row in rows {
        rows_by_product
            .entry(row.product_id.clone())
            .or_default()
            .push(row.clone());
    }

    let mut product_ids = rows_by_product.keys().cloned().collect::<Vec<_>>();
    product_ids.sort();

    let mut root_nodes = Vec::<Value>::with_capacity(product_ids.len());
    for product_id in product_ids {
        let Some(mut product_rows) = rows_by_product.remove(product_id.as_str()) else {
            continue;
        };
        if product_rows.is_empty() {
            continue;
        }
        sort_traffic_goods_rows(product_rows.as_mut_slice());

        let product_name = product_rows
            .iter()
            .find_map(|row| {
                let trimmed = row.product_name.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .unwrap_or_else(|| "(未命名商品)".to_string());

        let product_summary_row = aggregate_traffic_goods_rows(
            product_rows.as_slice(),
            product_id.as_str(),
            product_name.as_str(),
            0,
            "商品汇总",
            "All",
        );

        let source_children = build_traffic_goods_source_tree(product_rows.as_slice());
        root_nodes.push(json!({
            "key": format!("P|{}", product_id),
            "productId": product_id,
            "productName": product_name,
            "sourceLevel": 0,
            "sourceName": "商品汇总",
            "parentSourceName": "All",
            "metrics": build_traffic_goods_metrics_value(&product_summary_row),
            "children": source_children,
        }));
    }

    root_nodes
}
