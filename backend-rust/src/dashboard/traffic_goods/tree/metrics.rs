use serde_json::{json, Value};

use super::super::super::metric_values::build_traffic_metric_triplet_value;
use super::super::model::DashboardTrafficGoodsMetricRow;

pub(super) fn build_traffic_goods_metrics_value(row: &DashboardTrafficGoodsMetricRow) -> Value {
    json!({
        "visitorCount": build_traffic_metric_triplet_value(row.curr_visitor_count, row.prev_visitor_count),
        "pageView": build_traffic_metric_triplet_value(row.curr_page_view, row.prev_page_view),
        "productFavoriteUserCount": build_traffic_metric_triplet_value(
            row.curr_product_favorite_user_count,
            row.prev_product_favorite_user_count
        ),
        "cartUserCount": build_traffic_metric_triplet_value(row.curr_cart_user_count, row.prev_cart_user_count),
        "orderBuyerCount": build_traffic_metric_triplet_value(row.curr_order_buyer_count, row.prev_order_buyer_count),
        "payBuyerCount": build_traffic_metric_triplet_value(row.curr_pay_buyer_count, row.prev_pay_buyer_count),
        "payQuantity": build_traffic_metric_triplet_value(row.curr_pay_quantity, row.prev_pay_quantity),
        "payAmount": build_traffic_metric_triplet_value(row.curr_pay_amount, row.prev_pay_amount),
        "payConversionRate": build_traffic_metric_triplet_value(
            row.curr_pay_conversion_rate,
            row.prev_pay_conversion_rate
        ),
        "avgOrderValue": build_traffic_metric_triplet_value(row.curr_avg_order_value, row.prev_avg_order_value),
    })
}
