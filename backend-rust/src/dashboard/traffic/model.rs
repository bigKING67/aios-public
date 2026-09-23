use super::super::pg_row_parse::{
    finite_number_from_pg_row, i32_field_from_pg_row, string_field_from_pg_row,
};

#[derive(Debug, Clone)]
pub(crate) struct DashboardTrafficMetricRow {
    pub(super) source_level: i32,
    pub(super) source_name: String,
    pub(super) parent_source_name: String,
    pub(super) curr_visitor_count: f64,
    pub(super) prev_visitor_count: f64,
    pub(super) curr_new_visitor_count: f64,
    pub(super) prev_new_visitor_count: f64,
    pub(super) curr_avg_stay_duration: f64,
    pub(super) prev_avg_stay_duration: f64,
    pub(super) curr_view_3s_user_count: f64,
    pub(super) prev_view_3s_user_count: f64,
    pub(super) curr_product_click_user_count: f64,
    pub(super) prev_product_click_user_count: f64,
    pub(super) curr_pay_buyer_count: f64,
    pub(super) prev_pay_buyer_count: f64,
    pub(super) curr_pay_amount: f64,
    pub(super) prev_pay_amount: f64,
    pub(super) curr_follow_shop_user_count: f64,
    pub(super) prev_follow_shop_user_count: f64,
    pub(super) curr_product_favorite_user_count: f64,
    pub(super) prev_product_favorite_user_count: f64,
    pub(super) curr_cart_user_count: f64,
    pub(super) prev_cart_user_count: f64,
    pub(super) curr_cart_count: f64,
    pub(super) prev_cart_count: f64,
    pub(super) curr_pay_conversion_rate: f64,
    pub(super) prev_pay_conversion_rate: f64,
    pub(super) curr_uv_value: f64,
    pub(super) prev_uv_value: f64,
    pub(super) curr_avg_order_value: f64,
    pub(super) prev_avg_order_value: f64,
}

pub(crate) fn traffic_metric_row_from_pg_row(
    row: &sqlx::postgres::PgRow,
) -> Result<DashboardTrafficMetricRow, String> {
    let source_level = i32_field_from_pg_row(row, "source_level", 3)?.clamp(1, 3);
    let source_name = string_field_from_pg_row(row, "source_name", "未知来源")?;
    let parent_source_name = if source_level == 1 {
        "All".to_string()
    } else {
        string_field_from_pg_row(row, "parent_source_name", "未知父级")?
    };

    Ok(DashboardTrafficMetricRow {
        source_level,
        source_name,
        parent_source_name,
        curr_visitor_count: finite_number_from_pg_row(row, "curr_visitor_count")?,
        prev_visitor_count: finite_number_from_pg_row(row, "prev_visitor_count")?,
        curr_new_visitor_count: finite_number_from_pg_row(row, "curr_new_visitor_count")?,
        prev_new_visitor_count: finite_number_from_pg_row(row, "prev_new_visitor_count")?,
        curr_avg_stay_duration: finite_number_from_pg_row(row, "curr_avg_stay_duration")?,
        prev_avg_stay_duration: finite_number_from_pg_row(row, "prev_avg_stay_duration")?,
        curr_view_3s_user_count: finite_number_from_pg_row(row, "curr_view_3s_user_count")?,
        prev_view_3s_user_count: finite_number_from_pg_row(row, "prev_view_3s_user_count")?,
        curr_product_click_user_count: finite_number_from_pg_row(
            row,
            "curr_product_click_user_count",
        )?,
        prev_product_click_user_count: finite_number_from_pg_row(
            row,
            "prev_product_click_user_count",
        )?,
        curr_pay_buyer_count: finite_number_from_pg_row(row, "curr_pay_buyer_count")?,
        prev_pay_buyer_count: finite_number_from_pg_row(row, "prev_pay_buyer_count")?,
        curr_pay_amount: finite_number_from_pg_row(row, "curr_pay_amount")?,
        prev_pay_amount: finite_number_from_pg_row(row, "prev_pay_amount")?,
        curr_follow_shop_user_count: finite_number_from_pg_row(row, "curr_follow_shop_user_count")?,
        prev_follow_shop_user_count: finite_number_from_pg_row(row, "prev_follow_shop_user_count")?,
        curr_product_favorite_user_count: finite_number_from_pg_row(
            row,
            "curr_product_favorite_user_count",
        )?,
        prev_product_favorite_user_count: finite_number_from_pg_row(
            row,
            "prev_product_favorite_user_count",
        )?,
        curr_cart_user_count: finite_number_from_pg_row(row, "curr_cart_user_count")?,
        prev_cart_user_count: finite_number_from_pg_row(row, "prev_cart_user_count")?,
        curr_cart_count: finite_number_from_pg_row(row, "curr_cart_count")?,
        prev_cart_count: finite_number_from_pg_row(row, "prev_cart_count")?,
        curr_pay_conversion_rate: finite_number_from_pg_row(row, "curr_pay_conversion_rate")?,
        prev_pay_conversion_rate: finite_number_from_pg_row(row, "prev_pay_conversion_rate")?,
        curr_uv_value: finite_number_from_pg_row(row, "curr_uv_value")?,
        prev_uv_value: finite_number_from_pg_row(row, "prev_uv_value")?,
        curr_avg_order_value: finite_number_from_pg_row(row, "curr_avg_order_value")?,
        prev_avg_order_value: finite_number_from_pg_row(row, "prev_avg_order_value")?,
    })
}
