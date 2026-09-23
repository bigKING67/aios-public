use super::super::pg_row_parse::{
    finite_number_from_pg_row, i32_field_from_pg_row, string_field_from_pg_row,
};

#[derive(Debug, Clone)]
pub(crate) struct DashboardTrafficGoodsMetricRow {
    pub(super) product_id: String,
    pub(super) product_name: String,
    pub(super) source_level: i32,
    pub(super) source_name: String,
    pub(super) parent_source_name: String,
    pub(super) curr_visitor_count: f64,
    pub(super) prev_visitor_count: f64,
    pub(super) curr_page_view: f64,
    pub(super) prev_page_view: f64,
    pub(super) curr_product_favorite_user_count: f64,
    pub(super) prev_product_favorite_user_count: f64,
    pub(super) curr_cart_user_count: f64,
    pub(super) prev_cart_user_count: f64,
    pub(super) curr_order_buyer_count: f64,
    pub(super) prev_order_buyer_count: f64,
    pub(super) curr_pay_buyer_count: f64,
    pub(super) prev_pay_buyer_count: f64,
    pub(super) curr_pay_quantity: f64,
    pub(super) prev_pay_quantity: f64,
    pub(super) curr_pay_amount: f64,
    pub(super) prev_pay_amount: f64,
    pub(super) curr_pay_conversion_rate: f64,
    pub(super) prev_pay_conversion_rate: f64,
    pub(super) curr_avg_order_value: f64,
    pub(super) prev_avg_order_value: f64,
}

pub(crate) fn traffic_goods_metric_row_from_pg_row(
    row: &sqlx::postgres::PgRow,
) -> Result<DashboardTrafficGoodsMetricRow, String> {
    let product_id = string_field_from_pg_row(row, "product_id", "UNKNOWN_PRODUCT")?;
    let product_name = string_field_from_pg_row(row, "product_name", "(未命名商品)")?;
    let source_level = i32_field_from_pg_row(row, "source_level", 3)?.clamp(1, 3);
    let source_name = string_field_from_pg_row(row, "source_name", "未知来源")?;
    let parent_source_name = if source_level == 1 {
        "All".to_string()
    } else {
        string_field_from_pg_row(row, "parent_source_name", "未知父级")?
    };

    Ok(DashboardTrafficGoodsMetricRow {
        product_id,
        product_name,
        source_level,
        source_name,
        parent_source_name,
        curr_visitor_count: finite_number_from_pg_row(row, "curr_visitor_count")?,
        prev_visitor_count: finite_number_from_pg_row(row, "prev_visitor_count")?,
        curr_page_view: finite_number_from_pg_row(row, "curr_page_view")?,
        prev_page_view: finite_number_from_pg_row(row, "prev_page_view")?,
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
        curr_order_buyer_count: finite_number_from_pg_row(row, "curr_order_buyer_count")?,
        prev_order_buyer_count: finite_number_from_pg_row(row, "prev_order_buyer_count")?,
        curr_pay_buyer_count: finite_number_from_pg_row(row, "curr_pay_buyer_count")?,
        prev_pay_buyer_count: finite_number_from_pg_row(row, "prev_pay_buyer_count")?,
        curr_pay_quantity: finite_number_from_pg_row(row, "curr_pay_quantity")?,
        prev_pay_quantity: finite_number_from_pg_row(row, "prev_pay_quantity")?,
        curr_pay_amount: finite_number_from_pg_row(row, "curr_pay_amount")?,
        prev_pay_amount: finite_number_from_pg_row(row, "prev_pay_amount")?,
        curr_pay_conversion_rate: finite_number_from_pg_row(row, "curr_pay_conversion_rate")?,
        prev_pay_conversion_rate: finite_number_from_pg_row(row, "prev_pay_conversion_rate")?,
        curr_avg_order_value: finite_number_from_pg_row(row, "curr_avg_order_value")?,
        prev_avg_order_value: finite_number_from_pg_row(row, "prev_avg_order_value")?,
    })
}
