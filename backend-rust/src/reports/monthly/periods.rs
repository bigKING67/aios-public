use std::cmp;

use sqlx::{PgPool, Row};
use tracing::error;

use super::super::{summary_storage::is_undefined_table, PeriodOption};
use crate::error::{AppError, AppResult};

pub(crate) async fn get_latest_month_period(pool: &PgPool) -> AppResult<Option<String>> {
    let row = sqlx::query(
        r#"
        SELECT year, month
        FROM ads.report_all_trade_month
        ORDER BY year DESC, month DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await;

    let row = match row {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query latest month period failed");
            return Err(AppError::Internal);
        }
    };

    Ok(row.map(|row| {
        let year = row.try_get::<i32, _>("year").unwrap_or(0);
        let month = row.try_get::<i32, _>("month").unwrap_or(0);
        format!("{year}-{month:02}")
    }))
}

pub(crate) async fn get_all_month_periods(
    pool: &PgPool,
    limit: i64,
) -> AppResult<Vec<PeriodOption>> {
    let safe_limit = cmp::min(limit.max(1), 200);

    let rows = sqlx::query(
        r#"
        SELECT year, month
        FROM ads.report_all_trade_month
        ORDER BY year DESC, month DESC
        LIMIT $1
        "#,
    )
    .bind(safe_limit)
    .fetch_all(pool)
    .await;

    let rows = match rows {
        Ok(value) => value,
        Err(error) if is_undefined_table(&error) => return Ok(Vec::new()),
        Err(error) => {
            error!(?error, "query all month periods failed");
            return Err(AppError::Internal);
        }
    };

    let periods = rows
        .into_iter()
        .map(|row| {
            let year = row.try_get::<i32, _>("year").unwrap_or(0);
            let month = row.try_get::<i32, _>("month").unwrap_or(0);
            PeriodOption {
                value: format!("{year}-{month:02}"),
                label: format!("{year}年{month}月"),
            }
        })
        .collect();

    Ok(periods)
}
