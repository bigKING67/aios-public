use sqlx::PgPool;
use tracing::error;

use super::super::super::{summary_storage::is_undefined_table, PlatformData};
use super::rows::map_monthly_platform_rows;
use crate::error::{AppError, AppResult};

pub(super) async fn query_monthly_platform_from_ads(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Option<Vec<PlatformData>>> {
    let (prev_year, prev_month) = if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    };

    let rows = sqlx::query(
        r#"
        SELECT
            curr.platform,
            curr.gmv::double precision AS curr_gmv,
            curr.order_count AS curr_order_count,
            curr.buyer_count AS curr_buyer_count,
            curr.refund_amount_refund_time::double precision AS curr_refund_amount_refund_time,
            curr.refund_amount_pay_time::double precision AS curr_refund_amount_pay_time,
            COALESCE(prev.gmv::double precision, 0) AS prev_gmv,
            COALESCE(prev.refund_amount_refund_time::double precision, 0) AS prev_refund_amount_refund_time,
            COALESCE(prev.refund_amount_pay_time::double precision, 0) AS prev_refund_amount_pay_time
        FROM ads.report_all_trade_month_platform curr
        LEFT JOIN ads.report_all_trade_month_platform prev
          ON prev.platform = curr.platform
         AND prev.year = $3
         AND prev.month = $4
        WHERE curr.year = $1
          AND curr.month = $2
        ORDER BY CASE curr.platform
            WHEN 'taobao' THEN 1
            WHEN 'douyin' THEN 2
            WHEN 'xhs' THEN 3
            WHEN 'wx' THEN 4
            WHEN 'jd' THEN 5
            ELSE 99
        END, curr.platform
        "#,
    )
    .bind(year)
    .bind(month as i32)
    .bind(prev_year)
    .bind(prev_month as i32)
    .fetch_all(pool)
    .await;

    let rows = match rows {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query monthly platform data from ads failed");
            return Err(AppError::Internal);
        }
    };

    if rows.is_empty() {
        return Ok(None);
    }

    let result = map_monthly_platform_rows(rows, false);
    if result.is_empty() {
        return Ok(None);
    }

    Ok(Some(result))
}
