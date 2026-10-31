//! Source-aware calendar filtering and bounded pages for the competitor library.
use super::{
    competitor::{video_from_row, VIDEO_SELECT},
    competitor_types::{CompetitorVideoListQuery, CompetitorVideoListResponse},
    error::StudioResult,
    overview_types::StudioOverviewPeriod,
    overview_window::{resolve_calendar, shanghai_date, CalendarQuery},
    repository::db_error,
};
use crate::{config::Settings, error::AppError};
use chrono::{NaiveDate, Utc};
use sqlx::{PgPool, Row};

// One row per film, even across rooms/dates or both provenance memberships. Historical compass
// films with no remaining daily fact stay in ALL by first collection date, never in the rank view.
const SCOPED: &str = "WITH ranked AS (
 SELECT t.aweme_id, MAX(t.data_date) AS latest_ranking_date,
 COUNT(DISTINCT t.data_date) AS ranking_days, MIN(r.rank) AS best_rank
 FROM competitor.compass_traffic_videos_daily t
 JOIN competitor.compass_live_rooms_daily r USING (data_date, list_scope, live_room_id)
 WHERE ($2::DATE IS NULL OR t.data_date BETWEEN $2 AND $3) GROUP BY t.aweme_id
), members AS (
 SELECT v.*, COALESCE(v.manual_added_at, CASE WHEN v.source = 'manual' THEN v.first_seen_at END)
 AT TIME ZONE 'Asia/Shanghai' AS manual_time,
 v.first_seen_at AT TIME ZONE 'Asia/Shanghai' AS first_time,
 NOT EXISTS(SELECT 1 FROM competitor.compass_traffic_videos_daily t WHERE t.aweme_id = v.aweme_id) AS no_ranking
 FROM competitor.videos v
), scoped AS (
 SELECT v.aweme_id, r.latest_ranking_date, COALESCE(r.ranking_days, 0) AS ranking_days, r.best_rank,
 GREATEST(
   CASE WHEN $1 IN ('all', 'compass') THEN r.latest_ranking_date END,
   CASE WHEN $1 IN ('all', 'manual') AND ($2 IS NULL OR v.manual_time::DATE BETWEEN $2 AND $3) THEN v.manual_time::DATE END,
   CASE WHEN $1 = 'all' AND v.no_ranking AND v.manual_time IS NULL THEN v.first_time::DATE END
 ) AS sort_date
 FROM members v LEFT JOIN ranked r ON r.aweme_id = v.aweme_id
 WHERE ($1 IN ('all', 'compass') AND r.aweme_id IS NOT NULL)
 OR ($1 IN ('all', 'manual') AND v.manual_time IS NOT NULL AND ($2 IS NULL OR v.manual_time::DATE BETWEEN $2 AND $3))
 OR ($1 = 'all' AND v.no_ranking AND v.manual_time IS NULL AND ($2 IS NULL OR v.first_time::DATE BETWEEN $2 AND $3))
)";

fn parameters(query: &CompetitorVideoListQuery) -> StudioResult<(&str, i64, i64, bool)> {
    let source = query.source.as_deref().unwrap_or("all");
    if !["all", "compass", "manual"].contains(&source) {
        return Err(AppError::bad_request("source 只能是 all、compass 或 manual").into());
    }
    let legacy = query.source.is_none()
        && query.unit.is_none()
        && query.date.is_none()
        && query.from.is_none()
        && query.to.is_none()
        && query.page.is_none()
        && query.page_size.is_none();
    let page = query.page.unwrap_or(1);
    let size = query.page_size.unwrap_or(if legacy { 200 } else { 20 });
    if !(1..=100_000).contains(&page) || !(1..=if legacy { 200 } else { 100 }).contains(&size) {
        return Err(AppError::bad_request("page 需要 1–100000，pageSize 需要 1–100").into());
    }
    Ok((source, page, size, legacy))
}

pub(super) async fn list_videos(
    pool: &PgPool,
    settings: &Settings,
    query: &CompetitorVideoListQuery,
) -> StudioResult<CompetitorVideoListResponse> {
    let (source, requested_page, page_size, legacy) = parameters(query)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let today = shanghai_date(Utc::now());
    let latest: Option<NaiveDate> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "{SCOPED} SELECT MAX(sort_date) FROM scoped WHERE sort_date <= $4"
    )))
    .bind(source)
    .bind(None::<NaiveDate>)
    .bind(None::<NaiveDate>)
    .bind(today)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let window = if legacy {
        None
    } else {
        resolve_calendar(
            CalendarQuery {
                unit: Some(query.unit.as_deref().unwrap_or("month")),
                date: query.date.as_deref(),
                from: query.from.as_deref(),
                to: query.to.as_deref(),
            },
            today,
            latest,
        )?
    };
    let from = window.as_ref().map(|w| w.from);
    let to = window.as_ref().map(|w| w.to);
    let total: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "{SCOPED} SELECT COUNT(*) FROM scoped"
    )))
    .bind(source)
    .bind(from)
    .bind(to)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let page = requested_page.min(((total + page_size - 1) / page_size).max(1));
    let select = VIDEO_SELECT.replacen("SELECT ", "SELECT s.latest_ranking_date::TEXT, s.ranking_days, s.best_rank, s.sort_date::TEXT AS relevant_date, ", 1);
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "{SCOPED} {select} JOIN scoped s ON s.aweme_id = v.aweme_id ORDER BY s.sort_date DESC, v.first_seen_at DESC, v.aweme_id LIMIT $4 OFFSET $5")))
        .bind(source).bind(from).bind(to).bind(page_size).bind((page - 1) * page_size)
        .fetch_all(&mut *tx).await.map_err(db_error)?;
    let meta = sqlx::query("SELECT MAX(imported_at)::TEXT AS synced, MAX(data_date)::TEXT AS day FROM competitor.compass_imports")
        .fetch_one(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    let items = rows
        .iter()
        .map(|row| {
            let mut video = video_from_row(row, Some(settings));
            video.latest_ranking_date = row.get("latest_ranking_date");
            video.ranking_days = row.get("ranking_days");
            video.best_rank = row.get("best_rank");
            video.relevant_date = row.get("relevant_date");
            video
        })
        .collect();
    Ok(CompetitorVideoListResponse {
        items,
        total,
        page,
        page_size,
        period: window.map(|w| StudioOverviewPeriod {
            key: w.key,
            from: w.from.to_string(),
            to: w.to.to_string(),
            today: today.to_string(),
            latest_activity_date: latest.map(|d| d.to_string()),
        }),
        latest_sync_at: meta.get("synced"),
        latest_ranking_date: meta.get("day"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_or_unknown_filters() {
        for value in [
            r#"{"page":0}"#,
            r#"{"pageSize":201}"#,
            r#"{"source":"invalid"}"#,
        ] {
            assert!(parameters(&serde_json::from_str(value).unwrap()).is_err());
        }
        assert_eq!(
            parameters(&CompetitorVideoListQuery::default()).unwrap(),
            ("all", 1, 200, true)
        );
    }
}
