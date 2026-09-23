use chrono::NaiveDate;
use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::summary_storage::is_undefined_table;

const ADS_LIVE_SUMMARY_SQL: &str = include_str!("../ads_live_summary.sql");

pub(super) struct AdsLiveSummary {
    pub(super) as_of_date: Option<NaiveDate>,
    pub(super) observed_days: Option<i32>,
    pub(super) total_curr_gmv: f64,
    pub(super) total_prev_gmv: f64,
}

pub(super) async fn fetch_ads_live_summary(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<AdsLiveSummary>> {
    let summary_row = match sqlx::query(ADS_LIVE_SUMMARY_SQL)
        .bind(normalized_week_period)
        .fetch_one(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query ads douyin live attribution summary failed");
            return Err(AppError::Internal);
        }
    };

    let row_count = summary_row
        .try_get::<Option<i64>, _>("row_count")
        .unwrap_or(None)
        .unwrap_or(0);
    if row_count <= 0 {
        return Ok(None);
    }

    Ok(Some(AdsLiveSummary {
        as_of_date: summary_row
            .try_get::<Option<NaiveDate>, _>("as_of_date")
            .unwrap_or(None),
        observed_days: summary_row
            .try_get::<Option<i32>, _>("observed_days")
            .unwrap_or(None)
            .map(|value| value.clamp(1, 7)),
        total_curr_gmv: summary_row
            .try_get::<Option<f64>, _>("total_curr_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
        total_prev_gmv: summary_row
            .try_get::<Option<f64>, _>("total_prev_gmv")
            .unwrap_or(None)
            .unwrap_or(0.0),
    }))
}
