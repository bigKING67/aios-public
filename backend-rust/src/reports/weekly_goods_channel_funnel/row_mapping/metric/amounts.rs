use sqlx::postgres::PgRow;

use super::super::readers::read_f64;

#[derive(Debug, Clone, Copy)]
pub(super) struct MetricAmounts {
    pub(super) curr_pay_amount: f64,
    pub(super) prev_pay_amount: f64,
    pub(super) curr_cost: f64,
    pub(super) prev_cost: f64,
}

pub(super) fn read_metric_amounts(row: &PgRow) -> MetricAmounts {
    MetricAmounts {
        curr_pay_amount: read_f64(row, "curr_pay_amount"),
        prev_pay_amount: read_f64(row, "prev_pay_amount"),
        curr_cost: read_f64(row, "curr_cost"),
        prev_cost: read_f64(row, "prev_cost"),
    }
}
