use sqlx::PgPool;
use tracing::error;

use self::{
    overview_fallback::query_monthly_aggregate_from_overview,
    period::previous_month,
    row_mapping::{monthly_aggregate_from_row, row_has_previous_period},
};
use super::super::{summary_storage::is_undefined_table, MonthlyAggregate};
use crate::error::{AppError, AppResult};

mod overview_fallback;
mod period;
mod row_mapping;

pub(super) async fn query_monthly_aggregate(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Option<MonthlyAggregate>> {
    let (prev_year, prev_month) = previous_month(year, month);

    let row = sqlx::query(
        r#"
        SELECT
            curr.gmv::double precision AS curr_gmv,
            curr.order_count AS curr_orders,
            curr.buyer_count AS curr_buyers,
            curr.refund_amount_refund_time::double precision AS curr_refund_refund_time,
            curr.refund_amount_pay_time::double precision AS curr_refund_pay_time,
            prev.year AS prev_year,
            prev.gmv::double precision AS prev_gmv,
            prev.order_count AS prev_orders,
            prev.buyer_count AS prev_buyers,
            prev.refund_amount_refund_time::double precision AS prev_refund_refund_time,
            prev.refund_amount_pay_time::double precision AS prev_refund_pay_time
        FROM ads.report_all_trade_month curr
        LEFT JOIN ads.report_all_trade_month prev
          ON prev.year = $3
         AND prev.month = $4
        WHERE curr.year = $1
          AND curr.month = $2
        LIMIT 1
        "#,
    )
    .bind(year)
    .bind(month as i32)
    .bind(prev_year)
    .bind(prev_month as i32)
    .fetch_optional(pool)
    .await;

    let row = match row {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => {
            return query_monthly_aggregate_from_overview(pool, year, month).await;
        }
        Err(error) => {
            error!(?error, "query monthly aggregate failed");
            return Err(AppError::Internal);
        }
    };

    let Some(row) = row else {
        return query_monthly_aggregate_from_overview(pool, year, month).await;
    };

    if !row_has_previous_period(&row) {
        return query_monthly_aggregate_from_overview(pool, year, month).await;
    }

    Ok(Some(monthly_aggregate_from_row(&row)))
}
