use serde_json::Value;

use super::types::DashboardLiveGoodsMetricRow;

pub(super) fn live_goods_metric_row_from_value(
    value: &Value,
) -> Result<DashboardLiveGoodsMetricRow, String> {
    let Some(object) = value.as_object() else {
        return Err("直播商品维度查询失败：返回数据结构异常".to_string());
    };

    let stat_date = to_string_field(object.get("stat_date"));
    let live_start_time = to_string_field(object.get("live_start_time"));
    let product_id = to_string_field(object.get("product_id"));
    if stat_date.is_empty() || live_start_time.is_empty() || product_id.is_empty() {
        return Err("直播商品维度查询失败：返回数据缺少关键字段".to_string());
    }

    let live_end_time = {
        let value = to_string_field(object.get("live_end_time"));
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    };

    Ok(DashboardLiveGoodsMetricRow {
        stat_date,
        live_start_time,
        live_end_time,
        anchor_douyin_id: to_string_field(object.get("anchor_douyin_id")),
        anchor_nickname: to_string_field(object.get("anchor_nickname")),
        anchor_type: to_string_field(object.get("anchor_type")),
        shop_id: to_string_field(object.get("shop_id")),
        shop_name: to_string_field(object.get("shop_name")),
        live_identity_type: to_string_field(object.get("live_identity_type")),
        live_duration_minutes: to_finite_number(object.get("live_duration_minutes")),
        product_name: to_string_field(object.get("product_name")),
        product_id,
        sku_name: to_string_field(object.get("sku_name")),
        sku_row_type: to_string_field(object.get("sku_row_type")),
        product_image_url: to_string_field(object.get("product_image_url")),
        product_user_pay_amount: to_finite_number(object.get("product_user_pay_amount")),
        product_sales_volume: to_finite_number(object.get("product_sales_volume")),
        product_buyer_count: to_finite_number(object.get("product_buyer_count")),
        product_order_count: to_finite_number(object.get("product_order_count")),
        presale_order_count: to_finite_number(object.get("presale_order_count")),
        presale_full_amount: to_finite_number(object.get("presale_full_amount")),
        product_exposure_user_count: to_finite_number(object.get("product_exposure_user_count")),
        product_click_user_count: to_finite_number(object.get("product_click_user_count")),
        product_exposure_to_click_rate_user: to_finite_number(
            object.get("product_exposure_to_click_rate_user"),
        ),
        product_click_to_pay_rate_user: to_finite_number(
            object.get("product_click_to_pay_rate_user"),
        ),
        refund_user_count: to_finite_number(object.get("refund_user_count")),
        refund_amount: to_finite_number(object.get("refund_amount")),
        refund_order_count: to_finite_number(object.get("refund_order_count")),
    })
}

fn to_finite_number(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(number)) => number.as_f64().unwrap_or(0.0),
        Some(Value::String(raw)) => raw.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn to_string_field(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(raw)) => raw.trim().to_string(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}
