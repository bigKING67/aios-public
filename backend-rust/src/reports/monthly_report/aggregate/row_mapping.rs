use sqlx::{postgres::PgRow, Row};

use super::super::super::MonthlyAggregate;

pub(super) fn row_has_previous_period(row: &PgRow) -> bool {
    row.try_get::<Option<i32>, _>("prev_year")
        .ok()
        .flatten()
        .is_some()
}

pub(super) fn row_has_overview_months(row: &PgRow) -> bool {
    let curr_rows = row.try_get::<i64, _>("curr_rows").unwrap_or(0);
    let prev_rows = row.try_get::<i64, _>("prev_rows").unwrap_or(0);
    curr_rows > 0 && prev_rows > 0
}

pub(super) fn monthly_aggregate_from_row(row: &PgRow) -> MonthlyAggregate {
    MonthlyAggregate {
        curr_gmv: row.try_get::<f64, _>("curr_gmv").unwrap_or(0.0),
        curr_orders: row.try_get::<i64, _>("curr_orders").unwrap_or(0),
        curr_buyers: row.try_get::<i64, _>("curr_buyers").unwrap_or(0),
        curr_refund_refund_time: row
            .try_get::<f64, _>("curr_refund_refund_time")
            .unwrap_or(0.0),
        curr_refund_pay_time: row.try_get::<f64, _>("curr_refund_pay_time").unwrap_or(0.0),
        prev_gmv: row.try_get::<f64, _>("prev_gmv").unwrap_or(0.0),
        prev_orders: row.try_get::<i64, _>("prev_orders").unwrap_or(0),
        prev_buyers: row.try_get::<i64, _>("prev_buyers").unwrap_or(0),
        prev_refund_refund_time: row
            .try_get::<f64, _>("prev_refund_refund_time")
            .unwrap_or(0.0),
        prev_refund_pay_time: row.try_get::<f64, _>("prev_refund_pay_time").unwrap_or(0.0),
    }
}
