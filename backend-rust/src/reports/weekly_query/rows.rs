use chrono::NaiveDate;
use sqlx::Row;

use super::super::WeeklyRow;

pub(super) fn map_weekly_row(row: sqlx::postgres::PgRow) -> WeeklyRow {
    WeeklyRow {
        week_period: row.try_get::<String, _>("week_period").unwrap_or_default(),
        as_of_date: row
            .try_get::<Option<NaiveDate>, _>("as_of_date")
            .unwrap_or(None),
        curr_gmv: row.try_get::<f64, _>("curr_gmv").unwrap_or(0.0),
        curr_order_count: row.try_get::<i64, _>("curr_order_count").unwrap_or(0),
        curr_buyer_count: row.try_get::<i64, _>("curr_buyer_count").unwrap_or(0),
        curr_refund_amount_refund_time: row
            .try_get::<f64, _>("curr_refund_amount_refund_time")
            .unwrap_or(0.0),
        curr_refund_amount_pay_time: row
            .try_get::<f64, _>("curr_refund_amount_pay_time")
            .unwrap_or(0.0),
        prev_gmv: row.try_get::<f64, _>("prev_gmv").unwrap_or(0.0),
        prev_order_count: row.try_get::<i64, _>("prev_order_count").unwrap_or(0),
        prev_buyer_count: row.try_get::<i64, _>("prev_buyer_count").unwrap_or(0),
        prev_refund_amount_refund_time: row
            .try_get::<f64, _>("prev_refund_amount_refund_time")
            .unwrap_or(0.0),
        prev_refund_amount_pay_time: row
            .try_get::<f64, _>("prev_refund_amount_pay_time")
            .unwrap_or(0.0),
    }
}
