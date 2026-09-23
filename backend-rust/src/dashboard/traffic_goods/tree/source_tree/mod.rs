use std::collections::HashMap;

use serde_json::Value;

use self::{
    levels::{
        collect_level1_name_set, collect_resolvable_level2_parent_names, group_level2_by_parent,
        group_level3_by_parent, split_source_levels, Level2Groups, Level3Groups, SourceLevelRows,
    },
    orphans::build_unmatched_source_root_node,
};
use super::super::model::DashboardTrafficGoodsMetricRow;
use super::{node::build_traffic_goods_source_node_value, ordering::sort_traffic_goods_rows};

mod levels;
mod orphans;

#[cfg(test)]
mod tests;

pub(super) fn build_traffic_goods_source_tree(
    rows: &[DashboardTrafficGoodsMetricRow],
) -> Vec<Value> {
    let SourceLevelRows {
        mut level1_rows,
        level2_rows,
        level3_rows,
    } = split_source_levels(rows);

    sort_traffic_goods_rows(level1_rows.as_mut_slice());
    let level1_name_set = collect_level1_name_set(level1_rows.as_slice());

    let Level2Groups {
        mut level2_by_parent,
        orphan_level2_rows,
    } = group_level2_by_parent(level2_rows, &level1_name_set);
    sort_grouped_rows(&mut level2_by_parent);

    let resolvable_level2_parent_names =
        collect_resolvable_level2_parent_names(&level2_by_parent, orphan_level2_rows.as_slice());

    let Level3Groups {
        mut level3_by_parent,
        orphan_level3_rows,
    } = group_level3_by_parent(level3_rows, &resolvable_level2_parent_names);
    sort_grouped_rows(&mut level3_by_parent);

    let mut root_nodes =
        build_known_source_roots(level1_rows, &mut level2_by_parent, &mut level3_by_parent);
    if let Some(unmatched_node) = build_unmatched_source_root_node(
        orphan_level2_rows,
        orphan_level3_rows,
        &mut level3_by_parent,
    ) {
        root_nodes.push(unmatched_node);
    }

    root_nodes
}

fn sort_grouped_rows(grouped_rows: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>) {
    for rows in grouped_rows.values_mut() {
        sort_traffic_goods_rows(rows.as_mut_slice());
    }
}

fn build_known_source_roots(
    level1_rows: Vec<DashboardTrafficGoodsMetricRow>,
    level2_by_parent: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>,
    level3_by_parent: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>,
) -> Vec<Value> {
    level1_rows
        .into_iter()
        .map(|level1_row| {
            let level2_children_rows = level2_by_parent
                .remove(level1_row.source_name.as_str())
                .unwrap_or_default();

            let level2_nodes = level2_children_rows
                .into_iter()
                .map(|level2_row| build_level2_source_node(level2_row, level3_by_parent))
                .collect::<Vec<_>>();

            build_traffic_goods_source_node_value(&level1_row, level2_nodes)
        })
        .collect()
}

fn build_level2_source_node(
    level2_row: DashboardTrafficGoodsMetricRow,
    level3_by_parent: &mut HashMap<String, Vec<DashboardTrafficGoodsMetricRow>>,
) -> Value {
    let level3_children_rows = level3_by_parent
        .remove(level2_row.source_name.as_str())
        .unwrap_or_default();
    let level3_nodes = level3_children_rows
        .into_iter()
        .map(|level3_row| build_traffic_goods_source_node_value(&level3_row, Vec::new()))
        .collect::<Vec<_>>();

    build_traffic_goods_source_node_value(&level2_row, level3_nodes)
}
