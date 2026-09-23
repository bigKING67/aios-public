use chrono::NaiveDate;
use sqlx::{PgPool, Row};
use tracing::error;

use super::types::CardAdsSummary;
use crate::{
    error::{AppError, AppResult},
    reports::summary_storage::is_undefined_table,
};

pub(super) async fn query_weekly_card_ads_summary(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<CardAdsSummary>> {
    let summary_row = match sqlx::query(
        r#"
        SELECT
            COUNT(*)::BIGINT AS row_count,
            MAX(as_of_date) AS as_of_date,
            MAX(observed_days)::INTEGER AS observed_days,
            COALESCE(SUM(COALESCE(curr_card_user_pay_amount, 0)) FILTER (WHERE metric_scope = 'product'), 0)::DOUBLE PRECISION AS total_curr_gmv,
            COALESCE(SUM(COALESCE(prev_card_user_pay_amount, 0)) FILTER (WHERE metric_scope = 'product'), 0)::DOUBLE PRECISION AS total_prev_gmv
        FROM ads.report_douyin_trade_sale_card_metrics_week
        WHERE week_period = $1
        "#,
    )
    .bind(normalized_week_period)
    .fetch_one(pool)
    .await
    {
        Ok(row) => row,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query ads douyin card attribution summary failed");
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

    Ok(Some(CardAdsSummary {
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
