use serde_json::{json, Map, Value};

use super::super::types::DashboardLiveGoodsMetricRow;
use super::row_keys::{is_live_goods_summary_row, live_goods_row_key};

pub(super) fn build_live_goods_node_value(
    row: &DashboardLiveGoodsMetricRow,
    children: Vec<Value>,
) -> Value {
    let mut payload = Map::<String, Value>::new();
    payload.insert("key".to_string(), Value::String(live_goods_row_key(row)));
    payload.insert(
        "rowType".to_string(),
        json!(if is_live_goods_summary_row(row) {
            "product_summary"
        } else {
            "sku"
        }),
    );
    payload.insert(
        "stat_date".to_string(),
        Value::String(row.stat_date.clone()),
    );
    payload.insert(
        "live_start_time".to_string(),
        Value::String(row.live_start_time.clone()),
    );
    payload.insert(
        "live_end_time".to_string(),
        row.live_end_time
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    payload.insert(
        "anchor_douyin_id".to_string(),
        Value::String(row.anchor_douyin_id.clone()),
    );
    payload.insert(
        "anchor_nickname".to_string(),
        Value::String(row.anchor_nickname.clone()),
    );
    payload.insert(
        "anchor_type".to_string(),
        Value::String(row.anchor_type.clone()),
    );
    payload.insert("shop_id".to_string(), Value::String(row.shop_id.clone()));
    payload.insert(
        "shop_name".to_string(),
        Value::String(row.shop_name.clone()),
    );
    payload.insert(
        "live_identity_type".to_string(),
        Value::String(row.live_identity_type.clone()),
    );
    payload.insert(
        "live_duration_minutes".to_string(),
        json!(row.live_duration_minutes),
    );
    payload.insert(
        "product_name".to_string(),
        Value::String(row.product_name.clone()),
    );
    payload.insert(
        "product_id".to_string(),
        Value::String(row.product_id.clone()),
    );
    payload.insert("sku_name".to_string(), Value::String(row.sku_name.clone()));
    payload.insert(
        "product_image_url".to_string(),
        Value::String(row.product_image_url.clone()),
    );
    payload.insert(
        "product_user_pay_amount".to_string(),
        json!(row.product_user_pay_amount),
    );
    payload.insert(
        "product_sales_volume".to_string(),
        json!(row.product_sales_volume),
    );
    payload.insert(
        "product_buyer_count".to_string(),
        json!(row.product_buyer_count),
    );
    payload.insert(
        "product_order_count".to_string(),
        json!(row.product_order_count),
    );
    payload.insert(
        "presale_order_count".to_string(),
        json!(row.presale_order_count),
    );
    payload.insert(
        "presale_full_amount".to_string(),
        json!(row.presale_full_amount),
    );
    payload.insert(
        "product_exposure_user_count".to_string(),
        json!(row.product_exposure_user_count),
    );
    payload.insert(
        "product_click_user_count".to_string(),
        json!(row.product_click_user_count),
    );
    payload.insert(
        "product_exposure_to_click_rate_user".to_string(),
        json!(row.product_exposure_to_click_rate_user),
    );
    payload.insert(
        "product_click_to_pay_rate_user".to_string(),
        json!(row.product_click_to_pay_rate_user),
    );
    payload.insert(
        "refund_user_count".to_string(),
        json!(row.refund_user_count),
    );
    payload.insert("refund_amount".to_string(), json!(row.refund_amount));
    payload.insert(
        "refund_order_count".to_string(),
        json!(row.refund_order_count),
    );

    if !children.is_empty() {
        payload.insert("children".to_string(), Value::Array(children));
    }

    Value::Object(payload)
}
