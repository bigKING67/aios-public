use chrono::NaiveDate;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::error;

use super::super::{periods::normalize_week_period_for_api, summary_storage::is_undefined_table};
use super::{rows, sql};
use crate::error::{AppError, AppResult};

pub(super) async fn try_build_weekly_douyin_shortvideo_attribution_from_ads(
    pool: &PgPool,
    normalized_week_period: &str,
    week_period: &str,
) -> AppResult<Option<Vec<serde_json::Value>>> {
    let summary_row = match sqlx::query(sql::ADS_SUMMARY)
        .bind(normalized_week_period)
        .fetch_one(pool)
        .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(
                ?error,
                "query ads douyin shortvideo attribution summary failed"
            );
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

    let as_of_date = summary_row
        .try_get::<Option<NaiveDate>, _>("as_of_date")
        .unwrap_or(None);
    let observed_days = summary_row
        .try_get::<Option<i32>, _>("observed_days")
        .unwrap_or(None)
        .map(|value| value.clamp(1, 7));
    let total_curr_gmv = summary_row
        .try_get::<Option<f64>, _>("total_curr_gmv")
        .unwrap_or(None)
        .unwrap_or(0.0);
    let total_prev_gmv = summary_row
        .try_get::<Option<f64>, _>("total_prev_gmv")
        .unwrap_or(None)
        .unwrap_or(0.0);

    let attribution_rows = match sqlx::query(sql::ADS_ROWS)
        .bind(normalized_week_period)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(
                ?error,
                "query ads douyin shortvideo attribution rows failed"
            );
            return Err(AppError::Internal);
        }
    };

    Ok(Some(vec![json!({
        "platform": "douyin",
        "week_period": normalize_week_period_for_api(week_period),
        "as_of_date": as_of_date.map(|value| value.to_string()),
        "observed_days": observed_days,
        "total_curr_gmv": total_curr_gmv,
        "total_prev_gmv": total_prev_gmv,
        "items": rows::map_ads_rows(attribution_rows)
    })]))
}
