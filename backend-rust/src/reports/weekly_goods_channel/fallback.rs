use chrono::{Duration, NaiveDate};
use sqlx::{PgPool, Row};
use tracing::{error, warn};

use super::super::{
    periods::{normalize_week_period_for_api, normalize_week_period_for_db, parse_week_period},
    summary_storage::is_undefined_table,
    GoodsChannelAttributionData,
};
use super::{rows, sql};
use crate::error::{AppError, AppResult};

pub(super) async fn build_from_dwd(
    pool: &PgPool,
    week_period: &str,
) -> AppResult<Vec<GoodsChannelAttributionData>> {
    let normalized = normalize_week_period_for_db(week_period);
    let (week_start, week_end) = parse_week_period(week_period)?;

    let scope_row = match sqlx::query(sql::FALLBACK_SCOPE_QUERY)
        .bind(normalized.as_str())
        .bind(week_end)
        .fetch_optional(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly goods channel attribution fallback skipped, source tables missing"
            );
            return Ok(Vec::new());
        }
        Err(error) => {
            error!(
                ?error,
                "query weekly goods channel attribution scope failed"
            );
            return Err(AppError::Internal);
        }
    };

    let Some(scope_row) = scope_row else {
        return Ok(Vec::new());
    };

    let as_of_date = scope_row
        .try_get::<Option<NaiveDate>, _>("as_of_date")
        .unwrap_or(None)
        .unwrap_or(week_end);

    let prev_start = week_start - Duration::days(7);
    let prev_end = as_of_date - Duration::days(7);

    let channel_rows = match sqlx::query(sql::FALLBACK_CHANNELS_QUERY)
        .bind(week_start)
        .bind(as_of_date)
        .bind(prev_start)
        .bind(prev_end)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(error) if is_undefined_table(&error) => {
            warn!(
                ?error,
                "weekly goods channel attribution fallback query skipped, dwd table missing"
            );
            return Ok(Vec::new());
        }
        Err(error) => {
            error!(
                ?error,
                "query weekly goods channel attribution fallback failed"
            );
            return Err(AppError::Internal);
        }
    };

    if channel_rows.is_empty() {
        return Ok(Vec::new());
    }

    let mapped_rows = rows::map_channel_rows(channel_rows);
    Ok(vec![GoodsChannelAttributionData {
        platform: "taobao".to_string(),
        week_period: normalize_week_period_for_api(week_period),
        as_of_date: Some(as_of_date.to_string()),
        total_pay_amount: mapped_rows.total_pay_amount,
        total_prev_pay_amount: mapped_rows.total_prev_pay_amount,
        items: mapped_rows.items,
    }])
}
