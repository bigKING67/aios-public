use serde_json::Value;
use sqlx::PgPool;

use super::super::tree::build_live_goods_tree;
use super::row_mapping::decode_live_goods_metric_rows;

const LIVE_GOODS_TREE_SQL: &str = include_str!("tree_query.sql");

pub(crate) async fn fetch_douyin_live_goods_tree(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    scope: &str,
) -> Result<Vec<Value>, String> {
    let rows = sqlx::query(LIVE_GOODS_TREE_SQL)
        .bind(start_date)
        .bind(end_date)
        .bind(scope)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())?;

    let metric_rows = decode_live_goods_metric_rows(rows)?;
    Ok(build_live_goods_tree(metric_rows.as_slice()))
}
