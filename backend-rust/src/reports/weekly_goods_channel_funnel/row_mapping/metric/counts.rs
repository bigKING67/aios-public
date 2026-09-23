use sqlx::postgres::PgRow;

use super::super::readers::read_i64;

#[derive(Debug, Clone, Copy)]
pub(super) struct MetricCounts {
    pub(super) curr_impression_count: i64,
    pub(super) prev_impression_count: i64,
    pub(super) curr_click_count: i64,
    pub(super) prev_click_count: i64,
    pub(super) curr_cart_count: i64,
    pub(super) prev_cart_count: i64,
    pub(super) curr_pay_buyer_count: i64,
    pub(super) prev_pay_buyer_count: i64,
}

pub(super) fn read_metric_counts(row: &PgRow) -> MetricCounts {
    MetricCounts {
        curr_impression_count: read_i64(row, "curr_impression_count"),
        prev_impression_count: read_i64(row, "prev_impression_count"),
        curr_click_count: read_i64(row, "curr_click_count"),
        prev_click_count: read_i64(row, "prev_click_count"),
        curr_cart_count: read_i64(row, "curr_cart_count"),
        prev_cart_count: read_i64(row, "prev_cart_count"),
        curr_pay_buyer_count: read_i64(row, "curr_pay_buyer_count"),
        prev_pay_buyer_count: read_i64(row, "prev_pay_buyer_count"),
    }
}
