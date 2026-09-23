use std::collections::HashMap;

use chrono::{Duration, NaiveDate};
use sqlx::{PgPool, Row};
use tracing::error;

use super::{periods::parse_week_period, TrendData, TrendPoint};
use crate::error::{AppError, AppResult};

pub(super) fn extract_period_dates(period: &str) -> AppResult<(String, String)> {
    let (start, end) = parse_week_period(period)?;
    Ok((start.to_string(), end.to_string()))
}

pub(super) async fn build_weekly_trends(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<TrendData>> {
    let (current_start, current_end) = parse_week_period(week_period)?;
    let prev_start = current_start - Duration::days(7);
    let prev_end = current_end - Duration::days(7);

    let end_exclusive = current_end + Duration::days(1);

    let rows = sqlx::query(
        r#"
        SELECT
            CAST("date" AS DATE) AS stat_date,
            COALESCE(SUM(gmv), 0)::DOUBLE PRECISION AS gmv,
            COALESCE(SUM(order_count), 0)::DOUBLE PRECISION AS order_count,
            COALESCE(SUM(buyer_count), 0)::DOUBLE PRECISION AS buyer_count
        FROM ads.all_trade_overview
        WHERE "date" >= $1
          AND "date" < $2
        GROUP BY CAST("date" AS DATE)
        ORDER BY stat_date ASC
        "#,
    )
    .bind(prev_start)
    .bind(end_exclusive)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, "query weekly trends failed");
        AppError::Internal
    })?;

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

    let build_points = |start: NaiveDate, end: NaiveDate, idx: usize| -> Vec<TrendPoint> {
        let days: Vec<NaiveDate> = (0..=(end - start).num_days())
            .map(|offset| start + Duration::days(offset))
            .collect();

        days.into_iter()
            .map(|day| {
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
            .collect()
    };

    Ok(vec![
        TrendData {
            metric: "gmv".to_string(),
            points: build_points(current_start, current_end, 0),
        },
        TrendData {
            metric: "gmv_prev_week".to_string(),
            points: build_points(prev_start, prev_end, 0),
        },
        TrendData {
            metric: "orders".to_string(),
            points: build_points(current_start, current_end, 1),
        },
        TrendData {
            metric: "uv".to_string(),
            points: build_points(current_start, current_end, 2),
        },
    ])
}
