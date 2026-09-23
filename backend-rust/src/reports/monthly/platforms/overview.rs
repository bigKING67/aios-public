use sqlx::PgPool;
use tracing::error;

use super::super::super::{summary_storage::is_undefined_table, PlatformData};
use super::rows::map_monthly_platform_rows;
use crate::error::{AppError, AppResult};

pub(super) async fn query_monthly_platform_from_overview(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Vec<PlatformData>> {
    let curr_start = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::bad_request("Invalid month"))?;
    let curr_end_exclusive = if month == 12 {
        chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    } else {
        chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    };
    let prev_start = if month == 1 {
        chrono::NaiveDate::from_ymd_opt(year - 1, 12, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    } else {
        chrono::NaiveDate::from_ymd_opt(year, month - 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    };

    let rows = sqlx::query(
        r#"
        SELECT
            platform,
            COALESCE(SUM(gmv) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_gmv,
            COALESCE(SUM(order_count) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_order_count,
            COALESCE(SUM(buyer_count) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_buyer_count,
            COALESCE(SUM(refund_amount_refund_time) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_refund_amount_refund_time,
            COALESCE(SUM(refund_amount_pay_time) FILTER (WHERE "date" >= $1 AND "date" < $2), 0) AS curr_refund_amount_pay_time,
            COALESCE(SUM(gmv) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_gmv,
            COALESCE(SUM(refund_amount_refund_time) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_refund_amount_refund_time,
            COALESCE(SUM(refund_amount_pay_time) FILTER (WHERE "date" >= $3 AND "date" < $1), 0) AS prev_refund_amount_pay_time
        FROM ads.all_trade_overview
        WHERE "date" >= $3
          AND "date" < $2
        GROUP BY platform
        ORDER BY CASE platform
            WHEN 'taobao' THEN 1
            WHEN 'douyin' THEN 2
            WHEN 'xhs' THEN 3
            WHEN 'wx' THEN 4
            WHEN 'jd' THEN 5
            ELSE 99
        END, platform
        "#,
    )
    .bind(curr_start)
    .bind(curr_end_exclusive)
    .bind(prev_start)
    .fetch_all(pool)
    .await;

    let rows = match rows {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(Vec::new()),
        Err(error) => {
            error!(
                ?error,
                "query monthly platform data from all_trade_overview failed"
            );
            return Err(AppError::Internal);
        }
    };

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    Ok(map_monthly_platform_rows(rows, true))
}
