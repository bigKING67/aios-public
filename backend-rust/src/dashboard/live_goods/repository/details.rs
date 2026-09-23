use serde_json::{json, Value};
use sqlx::{PgPool, Row};

const LIVE_GOODS_DETAILS_SQL: &str = include_str!("details_query.sql");

pub(crate) async fn fetch_douyin_live_goods_detail_rows(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    scope: &str,
) -> Result<Value, String> {
    let rows = sqlx::query(LIVE_GOODS_DETAILS_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(scope)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())?;

    let mut detail_rows = Vec::<Value>::with_capacity(rows.len());
    for row in rows {
        let payload = row
            .try_get::<String, _>("payload")
            .map_err(|error| error.to_string())?;
        let value =
            serde_json::from_str::<Value>(payload.as_str()).map_err(|error| error.to_string())?;
        detail_rows.push(value);
    }

    Ok(json!({
        "startDate": start_date,
        "endDate": end_date,
        "platform": "douyin",
        "scope": scope,
        "rows": detail_rows,
    }))
}
