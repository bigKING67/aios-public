//! 竞品爆款 · 爆款分析: reads the locked statistics snapshot of a category and window
//! (`competitor.stat_snapshots`, written by the competitor worker from
//! `competitor_analysis/stats.py`), our confirmed selling-point coverage and our structures.
//! No statistic is computed here; the snapshot is the single source of numbers. A window with
//! analysed films but no snapshot yet is queued in `competitor.stat_requests` for the worker.

use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use super::{
    competitor_overview::SCOPED_CTE,
    competitor_own_structures::own_structures,
    competitor_types::{
        CompetitorPatternCategory, CompetitorPatternSnapshot, CompetitorPatternsQuery,
        CompetitorPatternsResponse, OwnSellingPointCoverage,
    },
    competitor_window::resolve_scope,
    domain::SELLING_POINT_DIMENSION,
    error::StudioResult,
    repository::db_error,
};

// $2..$3 the window's first and last first-seen dates.
const WINDOW_FILMS_SELECT: &str =
    "SELECT COUNT(*) FROM scoped s WHERE s.seen_date BETWEEN $2 AND $3";

// One request per category and window; repeated polls keep their place in the queue.
const REQUEST_INSERT: &str =
    "INSERT INTO competitor.stat_requests (cohort, period) VALUES ($1, $2) \
    ON CONFLICT (cohort, period) DO NOTHING";

const SNAPSHOT_SELECT: &str = "SELECT cohort, period, stats_version, taxonomy_version, \
    normalization_version, input_snapshot, films, families, computed_at::TEXT AS computed_at, payload \
    FROM competitor.stat_snapshots WHERE cohort = $1 AND period = $2 ORDER BY computed_at DESC LIMIT 1";

// Latest all-time snapshot per category, for the category switcher.
const CATEGORIES_SELECT: &str = "SELECT DISTINCT ON (cohort) cohort, films \
    FROM competitor.stat_snapshots WHERE period = 'all' ORDER BY cohort, computed_at DESC";

// Every label of the active selling-point preset (so a label without segments still has its name),
// counted over confirmed segments in the studio overview's scope: current source, live asset, enterprise tag.
const OWN_COVERAGE_SELECT: &str = "SELECT l.key AS label_key, MAX(l.name) AS label_name, \
    COUNT(DISTINCT s.segment_id) AS segments, COUNT(DISTINCT s.asset_id) AS assets \
    FROM (SELECT DISTINCT p.preset_key, x->>'key' AS key, x->>'name' AS name \
          FROM ads.content_segment_presets p CROSS JOIN LATERAL jsonb_array_elements(p.labels) AS x \
          WHERE p.dimension = $1 AND p.status = 'active') l \
    LEFT JOIN (SELECT s.segment_id, s.asset_id, s.preset_key, s.label_key, s.additional_label_keys \
               FROM ads.content_segments s JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id \
               WHERE s.status = 'confirmed' AND a.is_deleted = FALSE \
                 AND LOWER(TRIM(a.raw_sha256)) = s.source_content_hash \
                 AND ($2::TEXT IS NULL OR $2 = ANY(a.tags))) s \
      ON s.preset_key = l.preset_key AND (s.label_key = l.key OR l.key = ANY(s.additional_label_keys)) \
    GROUP BY l.key ORDER BY segments DESC, l.key";

pub(super) async fn patterns(
    pool: &PgPool,
    query: CompetitorPatternsQuery,
    enterprise_tag: Option<&str>,
) -> StudioResult<CompetitorPatternsResponse> {
    let scope = resolve_scope(pool, &query).await?;
    let snapshot = sqlx::query(SNAPSHOT_SELECT)
        .bind(&scope.category)
        .bind(&scope.key)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .map(|row| CompetitorPatternSnapshot {
            cohort: row.get("cohort"),
            period: row.get("period"),
            stats_version: row.get("stats_version"),
            taxonomy_version: row.get("taxonomy_version"),
            normalization_version: row.get("normalization_version"),
            input_snapshot: row.get("input_snapshot"),
            films: row.get("films"),
            families: row.get("families"),
            computed_at: row.get("computed_at"),
            payload: row.get("payload"),
        });
    let categories = sqlx::query(CATEGORIES_SELECT)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| CompetitorPatternCategory {
            key: row.get("cohort"),
            films: row.get("films"),
        })
        .collect();
    let pending = match (&snapshot, scope.bounds()) {
        (None, Some((first, last))) => {
            request_if_films(pool, &scope.category, &scope.key, first, last).await?
        }
        _ => false,
    };
    let own_selling_points = own_coverage(pool, enterprise_tag).await?;
    let own_structures = own_structures(pool, enterprise_tag, scope.bounds()).await?;
    Ok(CompetitorPatternsResponse {
        window: scope.period(),
        category: scope.category,
        period: scope.key,
        categories,
        snapshot,
        pending,
        own_selling_points,
        own_structures,
    })
}

/// Queues a window that has analysed films but no snapshot; false (nothing to wait for) otherwise.
pub(super) async fn request_if_films(
    pool: &PgPool,
    category: &str,
    key: &str,
    first: NaiveDate,
    last: NaiveDate,
) -> StudioResult<bool> {
    let films: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "{SCOPED_CTE} {WINDOW_FILMS_SELECT}"
    )))
    .bind(category)
    .bind(first)
    .bind(last)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if films == 0 {
        return Ok(false);
    }
    sqlx::query(REQUEST_INSERT)
        .bind(category)
        .bind(key)
        .execute(pool)
        .await
        .map_err(db_error)?;
    Ok(true)
}

/// Our confirmed selling-point coverage per label of the active preset.
pub(super) async fn own_coverage(
    pool: &PgPool,
    enterprise_tag: Option<&str>,
) -> StudioResult<Vec<OwnSellingPointCoverage>> {
    Ok(sqlx::query(OWN_COVERAGE_SELECT)
        .bind(SELLING_POINT_DIMENSION)
        .bind(enterprise_tag)
        .fetch_all(pool)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| OwnSellingPointCoverage {
            label_key: row.get("label_key"),
            label_name: row.get("label_name"),
            segments: row.get("segments"),
            assets: row.get("assets"),
        })
        .collect())
}
