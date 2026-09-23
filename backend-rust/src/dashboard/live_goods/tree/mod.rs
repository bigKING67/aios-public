use std::cmp::Ordering;
use std::collections::HashMap;

use serde_json::Value;

use self::{
    aggregate::aggregate_live_goods_summary_rows,
    node_value::build_live_goods_node_value,
    row_keys::{is_live_goods_summary_row, live_goods_group_key},
};
use super::types::DashboardLiveGoodsMetricRow;

mod aggregate;
mod node_value;
mod row_keys;

pub(super) fn build_live_goods_tree(rows: &[DashboardLiveGoodsMetricRow]) -> Vec<Value> {
    let mut rows_by_group = HashMap::<String, Vec<DashboardLiveGoodsMetricRow>>::new();
    for row in rows {
        rows_by_group
            .entry(live_goods_group_key(row))
            .or_default()
            .push(row.clone());
    }

    let mut root_entries = Vec::<(String, f64, String, Value)>::new();
    for (_, group_rows) in rows_by_group {
        if group_rows.is_empty() {
            continue;
        }

        let summary_row = group_rows
            .iter()
            .find(|row| is_live_goods_summary_row(row))
            .cloned()
            .or_else(|| aggregate_live_goods_summary_rows(group_rows.as_slice()));

        let Some(summary_row) = summary_row else {
            continue;
        };

        let mut sku_rows = group_rows
            .iter()
            .filter(|row| !is_live_goods_summary_row(row))
            .cloned()
            .collect::<Vec<_>>();
        sku_rows.sort_by(|left, right| {
            let amount_cmp = right
                .product_user_pay_amount
                .partial_cmp(&left.product_user_pay_amount)
                .unwrap_or(Ordering::Equal);
            if amount_cmp != Ordering::Equal {
                return amount_cmp;
            }
            left.sku_name.cmp(&right.sku_name)
        });

        let children = sku_rows
            .iter()
            .map(|row| build_live_goods_node_value(row, Vec::new()))
            .collect::<Vec<_>>();
        let node = build_live_goods_node_value(&summary_row, children);
        root_entries.push((
            summary_row.live_start_time.clone(),
            summary_row.product_user_pay_amount,
            summary_row.product_name.clone(),
            node,
        ));
    }

    root_entries.sort_by(|left, right| {
        let time_cmp = right.0.cmp(&left.0);
        if time_cmp != Ordering::Equal {
            return time_cmp;
        }
        let amount_cmp = right.1.partial_cmp(&left.1).unwrap_or(Ordering::Equal);
        if amount_cmp != Ordering::Equal {
            return amount_cmp;
        }
        left.2.cmp(&right.2)
    });

    root_entries
        .into_iter()
        .map(|(_, _, _, node)| node)
        .collect()
}
