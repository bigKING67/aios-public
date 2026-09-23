use sqlx::PgPool;
use tracing::error;

use super::super::super::{summary_storage::is_undefined_table, MonthlyAggregate};
use super::period::overview_range;
use super::row_mapping::{monthly_aggregate_from_row, row_has_overview_months};
use crate::error::{AppError, AppResult};

pub(super) async fn query_monthly_aggregate_from_overview(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Option<MonthlyAggregate>> {
    let range = overview_range(year, month)?;

    let row = sqlx::query(
        r#"
        SELECT
            COALESCE(SUM(gmv) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_gmv,
            COALESCE(SUM(order_count) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_orders,
            COALESCE(SUM(buyer_count) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_buyers,
            COALESCE(SUM(refund_amount_refund_time) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_refund_refund_time,
            COALESCE(SUM(refund_amount_pay_time) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_refund_pay_time,
            COUNT(*) FILTER (WHERE "date" >= $1 AND "date" < $2) AS curr_rows,
            COALESCE(SUM(gmv) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_gmv,
            COALESCE(SUM(order_count) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_orders,
            COALESCE(SUM(buyer_count) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_buyers,
            COALESCE(SUM(refund_amount_refund_time) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_refund_refund_time,
            COALESCE(SUM(refund_amount_pay_time) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_refund_pay_time,
            COUNT(*) FILTER (WHERE "date" >= $3 AND "date" < $1) AS prev_rows
        FROM ads.all_trade_overview
        WHERE "date" >= $3
          AND "date" < $2
        "#,
    )
    .bind(range.curr_start)
    .bind(range.curr_end_exclusive)
    .bind(range.prev_start)
    .fetch_optional(pool)
    .await;

    let row = match row {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(
                ?error,
                "query monthly aggregate from all_trade_overview failed"
            );
            return Err(AppError::Internal);
        }
    };

    let Some(row) = row else {
        return Ok(None);
    };

    if !row_has_overview_months(&row) {
        return Ok(None);
    }

    Ok(Some(monthly_aggregate_from_row(&row)))
}
