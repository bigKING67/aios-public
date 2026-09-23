use serde_json::{json, Value};

use super::super::super::metric_values::build_traffic_metric_triplet_value;
use super::super::model::DashboardTrafficMetricRow;

pub(super) fn build_traffic_metrics_value(row: &DashboardTrafficMetricRow) -> Value {
    json!({
        "visitorCount": build_traffic_metric_triplet_value(row.curr_visitor_count, row.prev_visitor_count),
        "newVisitorCount": build_traffic_metric_triplet_value(row.curr_new_visitor_count, row.prev_new_visitor_count),
        "avgStayDuration": build_traffic_metric_triplet_value(row.curr_avg_stay_duration, row.prev_avg_stay_duration),
        "view3sUserCount": build_traffic_metric_triplet_value(row.curr_view_3s_user_count, row.prev_view_3s_user_count),
        "productClickUserCount": build_traffic_metric_triplet_value(
            row.curr_product_click_user_count,
            row.prev_product_click_user_count
        ),
        "payBuyerCount": build_traffic_metric_triplet_value(row.curr_pay_buyer_count, row.prev_pay_buyer_count),
        "payAmount": build_traffic_metric_triplet_value(row.curr_pay_amount, row.prev_pay_amount),
        "followShopUserCount": build_traffic_metric_triplet_value(
            row.curr_follow_shop_user_count,
            row.prev_follow_shop_user_count
        ),
        "productFavoriteUserCount": build_traffic_metric_triplet_value(
            row.curr_product_favorite_user_count,
            row.prev_product_favorite_user_count
        ),
        "cartUserCount": build_traffic_metric_triplet_value(row.curr_cart_user_count, row.prev_cart_user_count),
        "cartCount": build_traffic_metric_triplet_value(row.curr_cart_count, row.prev_cart_count),
        "payConversionRate": build_traffic_metric_triplet_value(
            row.curr_pay_conversion_rate,
            row.prev_pay_conversion_rate
        ),
        "uvValue": build_traffic_metric_triplet_value(row.curr_uv_value, row.prev_uv_value),
        "avgOrderValue": build_traffic_metric_triplet_value(row.curr_avg_order_value, row.prev_avg_order_value),
    })
}
