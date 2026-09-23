use std::collections::HashMap;

use serde_json::{json, Value};

use super::types::DashboardGoodsCardTrafficMetricRow;
use crate::dashboard::metric_values::build_traffic_metric_triplet_value;

fn build_goods_card_traffic_metrics_value(row: &DashboardGoodsCardTrafficMetricRow) -> Value {
    json!({
        "cardExposureUserCount": build_traffic_metric_triplet_value(
            row.curr_card_exposure_user_count,
            row.prev_card_exposure_user_count
        ),
        "cardClickUserCount": build_traffic_metric_triplet_value(
            row.curr_card_click_user_count,
            row.prev_card_click_user_count
        ),
        "cardClickRateUser": build_traffic_metric_triplet_value(
            row.curr_card_click_rate_user,
            row.prev_card_click_rate_user
        ),
        "cardBuyerCount": build_traffic_metric_triplet_value(
            row.curr_card_buyer_count,
            row.prev_card_buyer_count
        ),
        "cardClickToPayRateUser": build_traffic_metric_triplet_value(
            row.curr_card_click_to_pay_rate_user,
            row.prev_card_click_to_pay_rate_user
        ),
        "cardExposureToPayRateUser": build_traffic_metric_triplet_value(
            row.curr_card_exposure_to_pay_rate_user,
            row.prev_card_exposure_to_pay_rate_user
        ),
        "cardUserPayAmount": build_traffic_metric_triplet_value(
            row.curr_card_user_pay_amount,
            row.prev_card_user_pay_amount
        ),
        "cardOrderCount": build_traffic_metric_triplet_value(
            row.curr_card_order_count,
            row.prev_card_order_count
        ),
        "cardCartUserCount": build_traffic_metric_triplet_value(
            row.curr_card_cart_user_count,
            row.prev_card_cart_user_count
        ),
        "cardFavoriteUserCount": build_traffic_metric_triplet_value(
            row.curr_card_favorite_user_count,
            row.prev_card_favorite_user_count
        ),
        "cardBounceUserCount": build_traffic_metric_triplet_value(
            row.curr_card_bounce_user_count,
            row.prev_card_bounce_user_count
        ),
    })
}

fn goods_card_traffic_row_key(row: &DashboardGoodsCardTrafficMetricRow) -> String {
    format!("GC|L{}|{}", row.source_level, row.source_key)
}

fn sort_goods_card_traffic_rows(rows: &mut [DashboardGoodsCardTrafficMetricRow]) {
    rows.sort_by(|left, right| {
        let exposure_cmp = right
            .curr_card_exposure_user_count
            .partial_cmp(&left.curr_card_exposure_user_count)
            .unwrap_or(std::cmp::Ordering::Equal);
        if exposure_cmp != std::cmp::Ordering::Equal {
            return exposure_cmp;
        }

        let click_cmp = right
            .curr_card_click_user_count
            .partial_cmp(&left.curr_card_click_user_count)
            .unwrap_or(std::cmp::Ordering::Equal);
        if click_cmp != std::cmp::Ordering::Equal {
            return click_cmp;
        }

        let amount_cmp = right
            .curr_card_user_pay_amount
            .partial_cmp(&left.curr_card_user_pay_amount)
            .unwrap_or(std::cmp::Ordering::Equal);
        if amount_cmp != std::cmp::Ordering::Equal {
            return amount_cmp;
        }

        left.source_name.cmp(&right.source_name)
    });
}

fn build_goods_card_traffic_node_value(
    row: &DashboardGoodsCardTrafficMetricRow,
    children: Vec<Value>,
) -> Value {
    json!({
        "key": goods_card_traffic_row_key(row),
        "sourceKey": row.source_key,
        "parentSourceKey": row.parent_source_key,
        "sourceLevel": row.source_level,
        "sourceName": row.source_name,
        "parentSourceName": row.parent_source_name,
        "metrics": build_goods_card_traffic_metrics_value(row),
        "children": children,
    })
}

fn build_goods_card_traffic_children(
    parent_source_key: &str,
    rows_by_parent: &mut HashMap<String, Vec<DashboardGoodsCardTrafficMetricRow>>,
) -> Vec<Value> {
    let mut rows = rows_by_parent.remove(parent_source_key).unwrap_or_default();
    sort_goods_card_traffic_rows(rows.as_mut_slice());

    rows.into_iter()
        .map(|row| {
            let children =
                build_goods_card_traffic_children(row.source_key.as_str(), rows_by_parent);
            build_goods_card_traffic_node_value(&row, children)
        })
        .collect()
}

pub(crate) fn build_goods_card_traffic_tree(
    rows: &[DashboardGoodsCardTrafficMetricRow],
) -> Vec<Value> {
    let mut rows_by_parent = HashMap::<String, Vec<DashboardGoodsCardTrafficMetricRow>>::new();
    for row in rows {
        rows_by_parent
            .entry(row.parent_source_key.clone())
            .or_default()
            .push(row.clone());
    }

    build_goods_card_traffic_children("ROOT", &mut rows_by_parent)
}
