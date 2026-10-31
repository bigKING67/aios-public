//! One spend relation for list filtering, candidate classification and frozen admission.
//! A partial window is visible as a known amount but never qualifies an original.
use super::{error::StudioResult, repository::db_error, types::SourceSpend};
use sqlx::{postgres::PgRow, PgConnection, Row};
use std::collections::HashMap;
use uuid::Uuid;

pub(super) async fn installed(db: &mut PgConnection) -> StudioResult<bool> {
    sqlx::query_scalar("SELECT to_regclass('cloud_video.spend_by_day') IS NOT NULL AND to_regclass('cloud_video.spend_days') IS NOT NULL")
        .fetch_one(db).await.map_err(db_error)
}

/// Only fixed, caller-owned parameter positions may enter this SQL fragment.
pub(super) fn ctes(installed: bool, threshold: &'static str) -> String {
    ctes_at(installed, threshold, "NULL::DATE")
}

pub(super) fn ctes_at(installed: bool, threshold: &'static str, upper: &'static str) -> String {
    if !installed {
        return "WITH admission_window AS (SELECT NULL::DATE AS as_of, 0::BIGINT AS synced_days), admission_spend AS (SELECT NULL::UUID AS asset_id, NULL::FLOAT8 AS spend30d, 'unknown'::TEXT AS spend_class WHERE FALSE)".into();
    }
    format!("WITH admission_anchor AS (
        SELECT MAX(stat_date) AS as_of FROM cloud_video.spend_days
        WHERE one_level_type_id = 73180 AND stat_date <= COALESCE({upper}, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE - 1)
    ), admission_window AS (
        SELECT a.as_of, COUNT(d.stat_date) AS synced_days FROM admission_anchor a
        LEFT JOIN cloud_video.spend_days d ON d.one_level_type_id = 73180 AND d.stat_date BETWEEN a.as_of - 29 AND a.as_of
        GROUP BY a.as_of
    ), admission_spend AS (
        SELECT v.asset_id, COALESCE(SUM(d.spend), 0)::FLOAT8 AS spend30d,
            CASE WHEN w.synced_days <> 30 THEN 'unknown'
                 WHEN COALESCE(SUM(d.spend), 0) >= {threshold}::FLOAT8 THEN 'qualified'
                 ELSE 'low' END AS spend_class
        FROM cloud_video.videos v JOIN ads.marketing_content_assets a ON a.asset_id = v.asset_id AND LOWER(TRIM(a.raw_sha256)) = v.file_sha256 CROSS JOIN admission_window w
        LEFT JOIN cloud_video.spend_by_day d ON d.video_id = v.video_id
            AND d.stat_date BETWEEN w.as_of - 29 AND w.as_of
        WHERE v.asset_id IS NOT NULL AND v.one_level_type_id = 73180 AND v.video_type = 0 GROUP BY v.asset_id, w.synced_days
    )")
}

pub(super) const PROJECTION: &str = "w.as_of::TEXT AS admission_as_of, w.synced_days AS admission_days, spend.spend30d, COALESCE(spend.spend_class, 'unknown') AS spend_class";
pub(super) const JOIN: &str = " CROSS JOIN admission_window w LEFT JOIN admission_spend spend ON spend.asset_id = s.asset_id ";

pub(super) fn from_row(row: &PgRow) -> SourceSpend {
    let days: i64 = row.get("admission_days");
    SourceSpend {
        spend30d: row.get("spend30d"),
        class: row.get("spend_class"),
        as_of: row.get("admission_as_of"),
        complete: days == 30,
        synced_days: days as i32,
        window_days: 30,
    }
}

pub(super) async fn load(
    db: &mut PgConnection,
    ids: &[Uuid],
    min_spend: f64,
    as_of: Option<chrono::NaiveDate>,
) -> StudioResult<HashMap<Uuid, SourceSpend>> {
    let ctes = ctes_at(installed(db).await?, "$1", "$3::DATE");
    // The threshold bind remains present even on databases without the cloud schema.
    let query = format!("{ctes} SELECT s.asset_id, {} FROM UNNEST($2::UUID[]) AS s(asset_id) {} WHERE $1::FLOAT8 > 0 AND ($3::DATE IS NULL OR w.as_of IS NULL OR w.as_of <= $3)", PROJECTION, JOIN);
    let rows = sqlx::query(sqlx::AssertSqlSafe(query))
        .bind(min_spend)
        .bind(ids)
        .bind(as_of)
        .fetch_all(db)
        .await
        .map_err(db_error)?;
    Ok(rows
        .iter()
        .map(|row| (row.get("asset_id"), from_row(row)))
        .collect())
}

pub(super) fn counts<'a>(
    spend: impl Iterator<Item = &'a SourceSpend>,
) -> super::remix_types::SpendCounts {
    let mut counts = super::remix_types::SpendCounts {
        qualified: 0,
        low: 0,
        unknown: 0,
    };
    for source in spend {
        match source.class.as_str() {
            "qualified" => counts.qualified += 1,
            "low" => counts.low += 1,
            _ => counts.unknown += 1,
        }
    }
    counts
}
