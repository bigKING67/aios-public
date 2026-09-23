use super::super::pg_row_parse::{
    finite_number_from_pg_row, optional_finite_number_from_pg_row,
    required_string_field_from_pg_row, string_field_from_pg_row,
};

#[derive(Debug, Clone)]
pub(in crate::dashboard) struct DashboardGoodsMetricRow {
    pub(in crate::dashboard) product_id: String,
    pub(in crate::dashboard) product_name: String,
    pub(in crate::dashboard) curr_gmv: f64,
    pub(in crate::dashboard) prev_gmv: f64,
    pub(in crate::dashboard) gmv_delta: f64,
    pub(in crate::dashboard) curr_gsv: f64,
    pub(in crate::dashboard) gsv_wow: Option<f64>,
    pub(in crate::dashboard) curr_refund_amount: f64,
    pub(in crate::dashboard) refund_wow: Option<f64>,
    pub(in crate::dashboard) sales_share: Option<f64>,
    pub(in crate::dashboard) gmv_wow: Option<f64>,
    pub(in crate::dashboard) curr_pay_buyer_count: f64,
    pub(in crate::dashboard) pay_buyer_wow: Option<f64>,
    pub(in crate::dashboard) curr_visitor_count: f64,
    pub(in crate::dashboard) visitor_wow: Option<f64>,
    pub(in crate::dashboard) pay_conversion_rate: Option<f64>,
    pub(in crate::dashboard) pay_conversion_rate_wow: Option<f64>,
    pub(in crate::dashboard) avg_order_value: Option<f64>,
    pub(in crate::dashboard) avg_order_value_wow: Option<f64>,
    pub(in crate::dashboard) total_curr_gmv: f64,
    pub(in crate::dashboard) total_prev_gmv: f64,
}

pub(in crate::dashboard) fn goods_metric_row_from_pg_row(
    row: &sqlx::postgres::PgRow,
) -> Result<DashboardGoodsMetricRow, String> {
    Ok(DashboardGoodsMetricRow {
        product_id: required_string_field_from_pg_row(
            row,
            "product_id",
            "商品经营数据查询失败：返回数据缺少 product_id",
        )?,
        product_name: string_field_from_pg_row(row, "product_name", "")?,
        curr_gmv: finite_number_from_pg_row(row, "curr_gmv")?,
        prev_gmv: finite_number_from_pg_row(row, "prev_gmv")?,
        gmv_delta: finite_number_from_pg_row(row, "gmv_delta")?,
        curr_gsv: finite_number_from_pg_row(row, "curr_gsv")?,
        gsv_wow: optional_finite_number_from_pg_row(row, "gsv_wow")?,
        curr_refund_amount: finite_number_from_pg_row(row, "curr_refund_amount")?,
        refund_wow: optional_finite_number_from_pg_row(row, "refund_wow")?,
        sales_share: optional_finite_number_from_pg_row(row, "sales_share")?,
        gmv_wow: optional_finite_number_from_pg_row(row, "gmv_wow")?,
        curr_pay_buyer_count: finite_number_from_pg_row(row, "curr_pay_buyer_count")?,
        pay_buyer_wow: optional_finite_number_from_pg_row(row, "pay_buyer_wow")?,
        curr_visitor_count: finite_number_from_pg_row(row, "curr_visitor_count")?,
        visitor_wow: optional_finite_number_from_pg_row(row, "visitor_wow")?,
        pay_conversion_rate: optional_finite_number_from_pg_row(row, "pay_conversion_rate")?,
        pay_conversion_rate_wow: optional_finite_number_from_pg_row(
            row,
            "pay_conversion_rate_wow",
        )?,
        avg_order_value: optional_finite_number_from_pg_row(row, "avg_order_value")?,
        avg_order_value_wow: optional_finite_number_from_pg_row(row, "avg_order_value_wow")?,
        total_curr_gmv: finite_number_from_pg_row(row, "total_curr_gmv")?,
        total_prev_gmv: finite_number_from_pg_row(row, "total_prev_gmv")?,
    })
}
