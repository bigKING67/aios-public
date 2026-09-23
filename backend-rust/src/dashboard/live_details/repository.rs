use serde_json::Value;
use sqlx::PgPool;

use super::{row_mapping::live_detail_payload_from_row, sql::live_detail_rows_sql};

pub(crate) async fn fetch_douyin_live_detail_rows_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<(Vec<Value>, Vec<Value>), String> {
    let rows = sqlx::query(live_detail_rows_sql())
        .bind(start_date)
        .bind(end_date)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())?;

    let mut self_rows = Vec::<Value>::new();
    let mut influencer_rows = Vec::<Value>::new();
    for row in rows {
        let (live_identity_type, payload_row) = live_detail_payload_from_row(&row)?;
        if live_identity_type == "self" {
            self_rows.push(payload_row);
        } else if live_identity_type == "influencer" {
            influencer_rows.push(payload_row);
        }
    }

    Ok((self_rows, influencer_rows))
}
