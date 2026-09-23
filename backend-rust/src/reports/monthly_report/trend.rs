use std::collections::HashMap;

use chrono::{Duration, NaiveDate};
use sqlx::{PgPool, Row};
use tracing::error;

use super::super::{summary_storage::is_undefined_table, TrendData, TrendPoint};
use crate::error::{AppError, AppResult};

pub(super) async fn build_monthly_trend_chart(
    pool: &PgPool,
    year: i32,
    month: u32,
) -> AppResult<Vec<TrendData>> {
    let start = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::bad_request("Invalid month"))?;
    let end_exclusive = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    };

    let rows = sqlx::query(
        r#"
        SELECT
            CAST("date" AS DATE) AS stat_date,
            COALESCE(SUM(gmv), 0) AS gmv,
            COALESCE(SUM(order_count), 0) AS order_count,
            COALESCE(SUM(buyer_count), 0) AS buyer_count
        FROM ads.all_trade_overview
        WHERE "date" >= $1
          AND "date" < $2
        GROUP BY CAST("date" AS DATE)
        ORDER BY stat_date ASC
        "#,
    )
    .bind(start)
    .bind(end_exclusive)
    .fetch_all(pool)
    .await;

    let rows = match rows {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(Vec::new()),
        Err(error) => {
            error!(?error, "query monthly trends failed");
            return Err(AppError::Internal);
        }
    };

    let mut daily_data = HashMap::<NaiveDate, (f64, f64, f64)>::new();
    for row in rows {
        let Some(stat_date) = row
            .try_get::<Option<NaiveDate>, _>("stat_date")
            .ok()
            .flatten()
        else {
            continue;
        };
        let gmv = row.try_get::<f64, _>("gmv").unwrap_or(0.0);
        let order_count = row.try_get::<f64, _>("order_count").unwrap_or(0.0);
        let buyer_count = row.try_get::<f64, _>("buyer_count").unwrap_or(0.0);
        daily_data.insert(stat_date, (gmv, order_count, buyer_count));
    }

    let day_count = (end_exclusive - start).num_days().max(0) as u32;
    let build_metric = |metric: &str, idx: usize| -> TrendData {
        TrendData {
            metric: metric.to_string(),
            points: (0..day_count)
                .map(|offset| {
                    let day = start + Duration::days(offset as i64);
                    let values = daily_data.get(&day).copied().unwrap_or((0.0, 0.0, 0.0));
                    let value = match idx {
                        0 => values.0,
                        1 => values.1,
                        _ => values.2,
                    };
                    TrendPoint {
                        date: day.to_string(),
                        value,
                    }
                })
                .collect(),
        }
    };

    Ok(vec![
        build_metric("gmv", 0),
        build_metric("orders", 1),
        build_metric("uv", 2),
    ])
}
