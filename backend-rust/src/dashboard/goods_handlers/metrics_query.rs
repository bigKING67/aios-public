use sqlx::{pool::PoolConnection, Postgres};

use super::super::goods::{
    get_goods_metrics_sql, goods_metric_row_from_pg_row, DashboardGoodsMetricRow,
};
use super::super::pg_row_parse::optional_string_field_from_pg_row;
use super::request::ValidatedGoodsQuery;

pub(super) struct GoodsMetricsFetchResult {
    pub(super) as_of_date: Option<String>,
    pub(super) rows: Vec<DashboardGoodsMetricRow>,
}

pub(super) async fn fetch_goods_metrics_rows(
    connection: &mut PoolConnection<Postgres>,
    query: &ValidatedGoodsQuery,
) -> Result<GoodsMetricsFetchResult, String> {
    let metrics_payload_rows = sqlx::query(get_goods_metrics_sql())
        .bind(query.start_date.as_str())
        .bind(query.end_date.as_str())
        .bind(query.prev_start_date.as_str())
        .bind(query.prev_end_date.as_str())
        .bind(query.score_pool_n as i64)
        .fetch_all(&mut **connection)
        .await
        .map_err(|error| error.to_string())?;

    let mut as_of_date = None;
    let mut metrics_rows = Vec::<DashboardGoodsMetricRow>::new();
    for row in metrics_payload_rows {
        if as_of_date.is_none() {
            as_of_date = optional_string_field_from_pg_row(&row, "as_of_date")?;
        }
        let metric_row = goods_metric_row_from_pg_row(&row)?;

        metrics_rows.push(metric_row);
    }

    Ok(GoodsMetricsFetchResult {
        as_of_date,
        rows: metrics_rows,
    })
}
