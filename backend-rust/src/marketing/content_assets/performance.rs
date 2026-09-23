use chrono::NaiveDate;
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::error::AppResult;

use super::write_errors::map_write_error;

#[derive(Debug, Default)]
pub(super) struct AssetPerformanceRollupRefresh {
    pub(super) daily_rows: i64,
    pub(super) lifetime_rows: i64,
    pub(super) asset_snapshot_rows: i64,
    pub(super) first_stat_date: Option<NaiveDate>,
    pub(super) last_stat_date: Option<NaiveDate>,
}

pub(super) async fn refresh_asset_performance_rollups_tx(
    tx: &mut Transaction<'_, Postgres>,
    asset_id: Uuid,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
) -> AppResult<AssetPerformanceRollupRefresh> {
    let row = sqlx::query(
        r#"
        SELECT
          daily_rows,
          lifetime_rows,
          asset_snapshot_rows,
          first_stat_date,
          last_stat_date
        FROM ads.refresh_marketing_content_asset_performance($1, $2, $3)
        "#,
    )
    .bind(asset_id)
    .bind(start_date)
    .bind(end_date)
    .fetch_one(&mut **tx)
    .await
    .map_err(|err| map_write_error(err, "refresh content asset performance rollups failed"))?;

    Ok(AssetPerformanceRollupRefresh {
        daily_rows: row.get::<i64, _>("daily_rows"),
        lifetime_rows: row.get::<i64, _>("lifetime_rows"),
        asset_snapshot_rows: row.get::<i64, _>("asset_snapshot_rows"),
        first_stat_date: row.get::<Option<NaiveDate>, _>("first_stat_date"),
        last_stat_date: row.get::<Option<NaiveDate>, _>("last_stat_date"),
    })
}
