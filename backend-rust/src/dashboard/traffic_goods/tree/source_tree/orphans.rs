use std::collections::HashMap;

use serde_json::Value;

use super::super::super::model::DashboardTrafficGoodsMetricRow;
use super::super::{
    aggregate::aggregate_traffic_goods_rows, node::build_traffic_goods_source_node_value,
    ordering::sort_traffic_goods_rows,
};

pub(super) fn build_unmatched_source_root_node(
    mut orphan_level2_rows: Vec<DashboardTrafficGoodsMetricRow>,
    mut orphan_level3_rows: Vec<DashboardTrafficGoodsMetricRow>,
    level3_by_parent: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>,
) -> Option<Value> {
    if orphan_level2_rows.is_empty() && orphan_level3_rows.is_empty() {
        return None;
    }

    sort_traffic_goods_rows(orphan_level2_rows.as_mut_slice());
    sort_traffic_goods_rows(orphan_level3_rows.as_mut_slice());

    let extra_synthetic_node = usize::from(!orphan_level3_rows.is_empty());
    let mut orphan_level2_nodes =
        Vec::<Value>::with_capacity(orphan_level2_rows.len() + extra_synthetic_node);
    let mut orphan_level2_aggregate_rows = Vec::<DashboardTrafficGoodsMetricRow>::with_capacity(
        orphan_level2_rows.len() + extra_synthetic_node,
    );

    for level2_row in orphan_level2_rows {
        orphan_level2_nodes.push(build_orphan_level2_node(&level2_row, level3_by_parent));
        orphan_level2_aggregate_rows.push(level2_row);
    }

    if !orphan_level3_rows.is_empty() {
        let synthetic_level2_row = build_synthetic_level2_row(orphan_level3_rows.as_slice());
        let orphan_level3_nodes = orphan_level3_rows
            .into_iter()
            .map(|level3_row| build_traffic_goods_source_node_value(&level3_row, Vec::new()))
            .collect::<Vec<_>>();
        orphan_level2_aggregate_rows.push(synthetic_level2_row.clone());
        orphan_level2_nodes.push(build_traffic_goods_source_node_value(
            &synthetic_level2_row,
            orphan_level3_nodes,
        ));
    }

    let synthetic_level1_row = build_synthetic_level1_row(orphan_level2_aggregate_rows.as_slice());
    Some(build_traffic_goods_source_node_value(
        &synthetic_level1_row,
        orphan_level2_nodes,
    ))
}

fn build_orphan_level2_node(
    level2_row: &DashboardTrafficGoodsMetricRow,
    level3_by_parent: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>,
) -> Value {
    let level3_children_rows = level3_by_parent
        .remove(level2_row.source_name.as_str())
        .unwrap_or_default();
    let level3_nodes = level3_children_rows
        .into_iter()
        .map(|level3_row| build_traffic_goods_source_node_value(&level3_row, Vec::new()))
        .collect::<Vec<_>>();

    build_traffic_goods_source_node_value(level2_row, level3_nodes)
}

fn build_synthetic_level2_row(
    orphan_level3_rows: &[DashboardTrafficGoodsMetricRow],
) -> DashboardTrafficGoodsMetricRow {
    let (product_id, product_name) = sample_product_identity(orphan_level3_rows);
    aggregate_traffic_goods_rows(
        orphan_level3_rows,
        product_id.as_str(),
        product_name.as_str(),
        2,
        "未匹配二级来源",
        "未知来源",
    )
}

fn build_synthetic_level1_row(
    orphan_level2_aggregate_rows: &[DashboardTrafficGoodsMetricRow],
) -> DashboardTrafficGoodsMetricRow {
    let (product_id, product_name) = sample_product_identity(orphan_level2_aggregate_rows);
    aggregate_traffic_goods_rows(
        orphan_level2_aggregate_rows,
        product_id.as_str(),
        product_name.as_str(),
        1,
        "未知来源",
        "All",
    )
}

fn sample_product_identity(rows: &[DashboardTrafficGoodsMetricRow]) -> (String, String) {
    rows.first()
        .map(|sample| (sample.product_id.clone(), sample.product_name.clone()))
        .unwrap_or_else(|| ("UNKNOWN_PRODUCT".to_string(), "(未命名商品)".to_string()))
}
