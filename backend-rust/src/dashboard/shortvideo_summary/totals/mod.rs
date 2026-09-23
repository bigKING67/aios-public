use serde_json::Value;
use sqlx::{PgPool, Row};

use self::payload::totals_bundle_from_payload;

mod empty;
mod payload;

const TOTALS_BUNDLE_SQL: &str = include_str!("totals_bundle.sql");

pub(in crate::dashboard) async fn fetch_douyin_shortvideo_totals_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
) -> Result<(Value, Value, Value, Value, Value, Value), String> {
    let row = sqlx::query(TOTALS_BUNDLE_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(prev_start_date)
        .bind(prev_end_date)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;

    let payload = row
        .try_get::<Value, _>("totals_payload")
        .map_err(|error| error.to_string())?;

    Ok(totals_bundle_from_payload(&payload))
}
