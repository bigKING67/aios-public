mod query;
mod row_mapping;

use serde_json::Value;
use sqlx::PgPool;

pub(super) async fn fetch_douyin_shortvideo_detail_rows_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<(Vec<Value>, Vec<Value>), String> {
    let rows = query::fetch_douyin_shortvideo_detail_rows(pool, start_date, end_date).await?;
    row_mapping::split_shortvideo_detail_rows(rows)
}
