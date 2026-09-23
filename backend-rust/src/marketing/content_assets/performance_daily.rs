use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::permissions::ensure_content_asset_read_permission;

const DEFAULT_DAILY_WINDOW_DAYS: i64 = 90;
const MAX_DAILY_WINDOW_DAYS: i64 = 366;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentAssetPerformanceDailyQuery {
    #[serde(alias = "material_id")]
    pub(super) material_id: Option<String>,
    pub(super) objective: Option<String>,
    #[serde(alias = "start_date")]
    pub(super) start_date: Option<String>,
    #[serde(alias = "end_date")]
    pub(super) end_date: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedContentAssetPerformanceDailyQuery {
    material_id: Option<String>,
    objective: Option<String>,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentAssetPerformanceDailyResponse {
    pub(super) asset_id: Uuid,
    pub(super) delivery_mode: String,
    pub(super) default_window_days: i64,
    pub(super) filters: ContentAssetPerformanceDailyFilters,
    pub(super) rows: Vec<ContentAssetPerformanceDailyRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentAssetPerformanceDailyFilters {
    pub(super) material_id: Option<String>,
    pub(super) objective: Option<String>,
    pub(super) start_date: Option<String>,
    pub(super) end_date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContentAssetPerformanceDailyRow {
    pub(super) stat_date: String,
    pub(super) material_id: String,
    pub(super) ad_material_id: Option<Uuid>,
    pub(super) platform_video_id: Option<Uuid>,
    pub(super) delivery_mode: String,
    pub(super) objective: String,
    pub(super) source_table: String,
    pub(super) source_file_name: Option<String>,
    pub(super) source_row_count: i32,
    pub(super) material_video_name: Option<String>,
    pub(super) live_room_name: Option<String>,
    pub(super) douyin_account_display_id: Option<String>,
    pub(super) match_status: String,
    pub(super) data_quality_status: String,
    pub(super) sample_quality_status: String,
    pub(super) overall_impression_count: Option<i64>,
    pub(super) overall_click_count: Option<i64>,
    pub(super) overall_click_rate: Option<f64>,
    pub(super) overall_conversion_rate: Option<f64>,
    pub(super) overall_cost: Option<f64>,
    pub(super) overall_order_count: Option<i32>,
    pub(super) overall_gmv: Option<f64>,
    pub(super) overall_pay_roi: Option<f64>,
    pub(super) overall_order_cost: Option<f64>,
    pub(super) net_gmv: Option<f64>,
    pub(super) net_order_count: Option<i32>,
    pub(super) net_gmv_roi: Option<f64>,
    pub(super) net_order_cost: Option<f64>,
    pub(super) refund_order_count_1h: Option<i32>,
    pub(super) refund_amount_1h: Option<f64>,
    pub(super) refund_rate_1h: Option<f64>,
    pub(super) settlement_roi_7d: Option<f64>,
    pub(super) settlement_amount_7d: Option<f64>,
    pub(super) settlement_order_count_7d: Option<i32>,
    pub(super) video_play_count: Option<i64>,
    pub(super) video_complete_play_rate: Option<f64>,
    pub(super) avg_watch_duration: Option<f64>,
    pub(super) play_rate_5s: Option<f64>,
    pub(super) play_rate_10s: Option<f64>,
    pub(super) legacy_boost_cost: Option<f64>,
    pub(super) legacy_boost_order_count: Option<i32>,
    pub(super) legacy_boost_gmv: Option<f64>,
    pub(super) legacy_boost_roi: Option<f64>,
    pub(super) boost_cost: Option<f64>,
    pub(super) boost_order_count: Option<i32>,
    pub(super) boost_gmv: Option<f64>,
    pub(super) boost_pay_roi: Option<f64>,
    pub(super) boost_impression_count: Option<i64>,
    pub(super) boost_click_count: Option<i64>,
    pub(super) boost_click_rate: Option<f64>,
    pub(super) boost_conversion_rate: Option<f64>,
    pub(super) boost_net_gmv: Option<f64>,
    pub(super) boost_net_gmv_roi: Option<f64>,
    pub(super) boost_net_order_count: Option<i32>,
    pub(super) boost_refund_rate_1h: Option<f64>,
    pub(super) raw_metrics: Value,
    pub(super) diagnosis_json: Value,
}

pub(super) fn normalize_performance_daily_query(
    query: ContentAssetPerformanceDailyQuery,
) -> AppResult<NormalizedContentAssetPerformanceDailyQuery> {
    let material_id = query.material_id.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let objective = match query.objective {
        Some(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else if matches!(
                trimmed.as_str(),
                "product_all_domain_shortvideo" | "live_all_domain_shortvideo"
            ) {
                Some(trimmed)
            } else {
                return Err(AppError::bad_request(
                    "objective 必须是 product_all_domain_shortvideo 或 live_all_domain_shortvideo",
                ));
            }
        }
        None => None,
    };
    let start_date = parse_date_param("startDate", query.start_date)?;
    let end_date = parse_date_param("endDate", query.end_date)?;
    if let (Some(start), Some(end)) = (start_date, end_date) {
        if start > end {
            return Err(AppError::bad_request("startDate 不能晚于 endDate"));
        }
        let window_days = (end - start).num_days() + 1;
        if window_days > MAX_DAILY_WINDOW_DAYS {
            return Err(AppError::bad_request(format!(
                "performance/daily 查询窗口不能超过 {MAX_DAILY_WINDOW_DAYS} 天"
            )));
        }
    }
    Ok(NormalizedContentAssetPerformanceDailyQuery {
        material_id,
        objective,
        start_date,
        end_date,
    })
}

pub(super) async fn get_asset_performance_daily(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Query(query): Query<ContentAssetPerformanceDailyQuery>,
) -> AppResult<Json<ContentAssetPerformanceDailyResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    let normalized = normalize_performance_daily_query(query)?;
    Ok(Json(
        query_performance_daily(&state.pool, asset_id, &normalized).await?,
    ))
}

pub(super) async fn query_performance_daily(
    pool: &PgPool,
    asset_id: Uuid,
    query: &NormalizedContentAssetPerformanceDailyQuery,
) -> AppResult<ContentAssetPerformanceDailyResponse> {
    if !content_asset_exists(pool, asset_id).await? {
        return Err(AppError::NotFound);
    }

    if !qianchuan_daily_table_exists(pool).await? {
        return Ok(ContentAssetPerformanceDailyResponse {
            asset_id,
            delivery_mode: "qianchuan_all_domain".to_string(),
            default_window_days: DEFAULT_DAILY_WINDOW_DAYS,
            filters: query.to_filters(),
            rows: Vec::new(),
        });
    }

    let rows = sqlx::query(
        r#"
        WITH filtered AS (
          SELECT *
          FROM dwd.marketing_content_qianchuan_material_performance_di perf
          WHERE perf.asset_id = $1
            AND ($2::TEXT IS NULL OR perf.material_id = $2)
            AND ($3::TEXT IS NULL OR perf.objective = $3)
        ),
        bounds AS (
          SELECT MAX(stat_date) AS latest_stat_date
          FROM filtered
        )
        SELECT
          perf.stat_date::TEXT AS stat_date,
          perf.material_id,
          perf.ad_material_id,
          perf.platform_video_id,
          perf.delivery_mode,
          perf.objective,
          perf.source_table,
          perf.source_file_name,
          perf.source_row_count,
          perf.material_video_name,
          perf.live_room_name,
          perf.douyin_account_display_id,
          perf.match_status,
          perf.data_quality_status,
          perf.sample_quality_status,
          perf.overall_impression_count,
          perf.overall_click_count,
          perf.overall_click_rate::FLOAT8 AS overall_click_rate,
          perf.overall_conversion_rate::FLOAT8 AS overall_conversion_rate,
          perf.overall_cost::FLOAT8 AS overall_cost,
          perf.overall_order_count,
          perf.overall_gmv::FLOAT8 AS overall_gmv,
          perf.overall_pay_roi::FLOAT8 AS overall_pay_roi,
          perf.overall_order_cost::FLOAT8 AS overall_order_cost,
          perf.net_gmv::FLOAT8 AS net_gmv,
          perf.net_order_count,
          perf.net_gmv_roi::FLOAT8 AS net_gmv_roi,
          perf.net_order_cost::FLOAT8 AS net_order_cost,
          perf.refund_order_count_1h,
          perf.refund_amount_1h::FLOAT8 AS refund_amount_1h,
          perf.refund_rate_1h::FLOAT8 AS refund_rate_1h,
          perf.settlement_roi_7d::FLOAT8 AS settlement_roi_7d,
          perf.settlement_amount_7d::FLOAT8 AS settlement_amount_7d,
          perf.settlement_order_count_7d,
          perf.video_play_count,
          perf.video_complete_play_rate::FLOAT8 AS video_complete_play_rate,
          perf.avg_watch_duration::FLOAT8 AS avg_watch_duration,
          perf.play_rate_5s::FLOAT8 AS play_rate_5s,
          perf.play_rate_10s::FLOAT8 AS play_rate_10s,
          perf.legacy_boost_cost::FLOAT8 AS legacy_boost_cost,
          perf.legacy_boost_order_count,
          perf.legacy_boost_gmv::FLOAT8 AS legacy_boost_gmv,
          perf.legacy_boost_roi::FLOAT8 AS legacy_boost_roi,
          perf.boost_cost::FLOAT8 AS boost_cost,
          perf.boost_order_count,
          perf.boost_gmv::FLOAT8 AS boost_gmv,
          perf.boost_pay_roi::FLOAT8 AS boost_pay_roi,
          perf.boost_impression_count,
          perf.boost_click_count,
          perf.boost_click_rate::FLOAT8 AS boost_click_rate,
          perf.boost_conversion_rate::FLOAT8 AS boost_conversion_rate,
          perf.boost_net_gmv::FLOAT8 AS boost_net_gmv,
          perf.boost_net_gmv_roi::FLOAT8 AS boost_net_gmv_roi,
          perf.boost_net_order_count,
          perf.boost_refund_rate_1h::FLOAT8 AS boost_refund_rate_1h,
          perf.raw_metrics,
          perf.diagnosis_json
        FROM filtered perf
        CROSS JOIN bounds
        WHERE ($4::DATE IS NULL OR perf.stat_date >= $4)
          AND ($5::DATE IS NULL OR perf.stat_date <= $5)
          AND (
            $4::DATE IS NOT NULL
            OR bounds.latest_stat_date IS NULL
            OR perf.stat_date >= bounds.latest_stat_date - ($6::INT - 1)
          )
        ORDER BY
          perf.stat_date ASC,
          CASE perf.objective
            WHEN 'product_all_domain_shortvideo' THEN 0
            WHEN 'live_all_domain_shortvideo' THEN 1
            ELSE 2
          END,
          perf.material_id
        "#,
    )
    .bind(asset_id)
    .bind(query.material_id.as_deref())
    .bind(query.objective.as_deref())
    .bind(query.start_date)
    .bind(query.end_date)
    .bind(DEFAULT_DAILY_WINDOW_DAYS as i32)
    .fetch_all(pool)
    .await
    .map_err(|err| {
        error!(?err, %asset_id, "query qianchuan material daily performance failed");
        AppError::Internal
    })?;

    Ok(ContentAssetPerformanceDailyResponse {
        asset_id,
        delivery_mode: "qianchuan_all_domain".to_string(),
        default_window_days: DEFAULT_DAILY_WINDOW_DAYS,
        filters: query.to_filters(),
        rows: rows.iter().map(daily_row_from_row).collect(),
    })
}

async fn qianchuan_daily_table_exists(pool: &PgPool) -> AppResult<bool> {
    let row = sqlx::query(
        "SELECT to_regclass('dwd.marketing_content_qianchuan_material_performance_di') IS NOT NULL AS exists",
    )
    .fetch_one(pool)
    .await
    .map_err(|err| {
        error!(?err, "check qianchuan material daily performance table failed");
        AppError::Internal
    })?;
    Ok(row.try_get::<bool, _>("exists").unwrap_or(false))
}

async fn content_asset_exists(pool: &PgPool, asset_id: Uuid) -> AppResult<bool> {
    let row = sqlx::query(
        "SELECT EXISTS(
          SELECT 1
          FROM ads.marketing_content_assets
          WHERE asset_id = $1
            AND is_deleted = FALSE
        ) AS exists",
    )
    .bind(asset_id)
    .fetch_one(pool)
    .await
    .map_err(|err| {
        error!(?err, %asset_id, "check marketing content asset existence failed");
        AppError::Internal
    })?;
    Ok(row.try_get::<bool, _>("exists").unwrap_or(false))
}

fn parse_date_param(name: &str, value: Option<String>) -> AppResult<Option<NaiveDate>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| AppError::bad_request(format!("{name} 必须是 YYYY-MM-DD")))
}

impl NormalizedContentAssetPerformanceDailyQuery {
    fn to_filters(&self) -> ContentAssetPerformanceDailyFilters {
        ContentAssetPerformanceDailyFilters {
            material_id: self.material_id.clone(),
            objective: self.objective.clone(),
            start_date: self.start_date.map(|date| date.to_string()),
            end_date: self.end_date.map(|date| date.to_string()),
        }
    }
}

fn daily_row_from_row(row: &sqlx::postgres::PgRow) -> ContentAssetPerformanceDailyRow {
    ContentAssetPerformanceDailyRow {
        stat_date: row.try_get("stat_date").unwrap_or_default(),
        material_id: row.try_get("material_id").unwrap_or_default(),
        ad_material_id: row.try_get("ad_material_id").ok(),
        platform_video_id: row.try_get("platform_video_id").ok(),
        delivery_mode: row.try_get("delivery_mode").unwrap_or_default(),
        objective: row.try_get("objective").unwrap_or_default(),
        source_table: row.try_get("source_table").unwrap_or_default(),
        source_file_name: optional_string(row, "source_file_name"),
        source_row_count: row.try_get("source_row_count").unwrap_or(1),
        material_video_name: optional_string(row, "material_video_name"),
        live_room_name: optional_string(row, "live_room_name"),
        douyin_account_display_id: optional_string(row, "douyin_account_display_id"),
        match_status: row.try_get("match_status").unwrap_or_default(),
        data_quality_status: row.try_get("data_quality_status").unwrap_or_default(),
        sample_quality_status: row.try_get("sample_quality_status").unwrap_or_default(),
        overall_impression_count: optional_i64(row, "overall_impression_count"),
        overall_click_count: optional_i64(row, "overall_click_count"),
        overall_click_rate: optional_f64(row, "overall_click_rate"),
        overall_conversion_rate: optional_f64(row, "overall_conversion_rate"),
        overall_cost: optional_f64(row, "overall_cost"),
        overall_order_count: optional_i32(row, "overall_order_count"),
        overall_gmv: optional_f64(row, "overall_gmv"),
        overall_pay_roi: optional_f64(row, "overall_pay_roi"),
        overall_order_cost: optional_f64(row, "overall_order_cost"),
        net_gmv: optional_f64(row, "net_gmv"),
        net_order_count: optional_i32(row, "net_order_count"),
        net_gmv_roi: optional_f64(row, "net_gmv_roi"),
        net_order_cost: optional_f64(row, "net_order_cost"),
        refund_order_count_1h: optional_i32(row, "refund_order_count_1h"),
        refund_amount_1h: optional_f64(row, "refund_amount_1h"),
        refund_rate_1h: optional_f64(row, "refund_rate_1h"),
        settlement_roi_7d: optional_f64(row, "settlement_roi_7d"),
        settlement_amount_7d: optional_f64(row, "settlement_amount_7d"),
        settlement_order_count_7d: optional_i32(row, "settlement_order_count_7d"),
        video_play_count: optional_i64(row, "video_play_count"),
        video_complete_play_rate: optional_f64(row, "video_complete_play_rate"),
        avg_watch_duration: optional_f64(row, "avg_watch_duration"),
        play_rate_5s: optional_f64(row, "play_rate_5s"),
        play_rate_10s: optional_f64(row, "play_rate_10s"),
        legacy_boost_cost: optional_f64(row, "legacy_boost_cost"),
        legacy_boost_order_count: optional_i32(row, "legacy_boost_order_count"),
        legacy_boost_gmv: optional_f64(row, "legacy_boost_gmv"),
        legacy_boost_roi: optional_f64(row, "legacy_boost_roi"),
        boost_cost: optional_f64(row, "boost_cost"),
        boost_order_count: optional_i32(row, "boost_order_count"),
        boost_gmv: optional_f64(row, "boost_gmv"),
        boost_pay_roi: optional_f64(row, "boost_pay_roi"),
        boost_impression_count: optional_i64(row, "boost_impression_count"),
        boost_click_count: optional_i64(row, "boost_click_count"),
        boost_click_rate: optional_f64(row, "boost_click_rate"),
        boost_conversion_rate: optional_f64(row, "boost_conversion_rate"),
        boost_net_gmv: optional_f64(row, "boost_net_gmv"),
        boost_net_gmv_roi: optional_f64(row, "boost_net_gmv_roi"),
        boost_net_order_count: optional_i32(row, "boost_net_order_count"),
        boost_refund_rate_1h: optional_f64(row, "boost_refund_rate_1h"),
        raw_metrics: row
            .try_get("raw_metrics")
            .unwrap_or_else(|_| serde_json::json!({})),
        diagnosis_json: row
            .try_get("diagnosis_json")
            .unwrap_or_else(|_| serde_json::json!({})),
    }
}

fn optional_string(row: &sqlx::postgres::PgRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

fn optional_i64(row: &sqlx::postgres::PgRow, column: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(column).ok().flatten()
}

fn optional_i32(row: &sqlx::postgres::PgRow, column: &str) -> Option<i32> {
    row.try_get::<Option<i32>, _>(column).ok().flatten()
}

fn optional_f64(row: &sqlx::postgres::PgRow, column: &str) -> Option<f64> {
    row.try_get::<Option<f64>, _>(column).ok().flatten()
}

#[cfg(test)]
mod tests {
    use std::env;

    use sqlx::{postgres::PgPoolOptions, PgPool};
    use uuid::Uuid;

    use super::{
        normalize_performance_daily_query, query_performance_daily,
        ContentAssetPerformanceDailyQuery, MAX_DAILY_WINDOW_DAYS,
    };
    use crate::error::AppError;

    async fn fixture_pool() -> Option<PgPool> {
        let Ok(database_url) = env::var("AIOS_QC_FIXTURE_DATABASE_URL") else {
            eprintln!(
                "skipping qianchuan fixture-backed daily test: AIOS_QC_FIXTURE_DATABASE_URL is not set"
            );
            return None;
        };
        Some(
            PgPoolOptions::new()
                .max_connections(1)
                .connect(&database_url)
                .await
                .expect("connect to AIOS_QC_FIXTURE_DATABASE_URL"),
        )
    }

    fn assert_close(actual: Option<f64>, expected: f64) {
        let actual = actual.expect("expected numeric value");
        assert!(
            (actual - expected).abs() < 0.0001,
            "expected {expected}, got {actual}"
        );
    }

    fn query(
        material_id: Option<&str>,
        objective: Option<&str>,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> ContentAssetPerformanceDailyQuery {
        ContentAssetPerformanceDailyQuery {
            material_id: material_id.map(str::to_string),
            objective: objective.map(str::to_string),
            start_date: start_date.map(str::to_string),
            end_date: end_date.map(str::to_string),
        }
    }

    fn bad_request_detail(result: Result<impl Sized, AppError>) -> String {
        match result {
            Err(AppError::BadRequest(message)) => message,
            Ok(_) => panic!("expected bad request"),
            Err(err) => panic!("expected bad request, got {err:?}"),
        }
    }

    #[test]
    fn normalize_performance_daily_query_trims_material_and_keeps_valid_objective() {
        let normalized = normalize_performance_daily_query(query(
            Some(" 1867666532626867 "),
            Some(" live_all_domain_shortvideo "),
            Some("2026-06-01"),
            Some("2026-06-18"),
        ))
        .expect("performance daily query should normalize valid filters");
        let filters = normalized.to_filters();

        assert_eq!(filters.material_id.as_deref(), Some("1867666532626867"));
        assert_eq!(
            filters.objective.as_deref(),
            Some("live_all_domain_shortvideo")
        );
        assert_eq!(filters.start_date.as_deref(), Some("2026-06-01"));
        assert_eq!(filters.end_date.as_deref(), Some("2026-06-18"));
    }

    #[test]
    fn normalize_performance_daily_query_treats_blank_filters_as_unset() {
        let normalized =
            normalize_performance_daily_query(query(Some("  "), Some(""), Some(" "), Some("")))
                .expect("blank filters should be ignored");
        let filters = normalized.to_filters();

        assert_eq!(filters.material_id, None);
        assert_eq!(filters.objective, None);
        assert_eq!(filters.start_date, None);
        assert_eq!(filters.end_date, None);
    }

    #[test]
    fn normalize_performance_daily_query_rejects_unknown_objective() {
        let detail = bad_request_detail(normalize_performance_daily_query(query(
            None,
            Some("brand_awareness"),
            None,
            None,
        )));

        assert!(detail.contains("product_all_domain_shortvideo"));
        assert!(detail.contains("live_all_domain_shortvideo"));
    }

    #[test]
    fn normalize_performance_daily_query_rejects_invalid_date_format() {
        let detail = bad_request_detail(normalize_performance_daily_query(query(
            None,
            None,
            Some("2026/06/01"),
            None,
        )));

        assert!(detail.contains("YYYY-MM-DD"));
    }

    #[test]
    fn normalize_performance_daily_query_rejects_reversed_date_range() {
        let detail = bad_request_detail(normalize_performance_daily_query(query(
            None,
            None,
            Some("2026-06-18"),
            Some("2026-06-01"),
        )));

        assert!(detail.contains("startDate 不能晚于 endDate"));
    }

    #[test]
    fn normalize_performance_daily_query_caps_explicit_window() {
        let detail = bad_request_detail(normalize_performance_daily_query(query(
            None,
            None,
            Some("2025-01-01"),
            Some("2026-06-01"),
        )));

        assert!(detail.contains(&MAX_DAILY_WINDOW_DAYS.to_string()));
    }

    #[tokio::test]
    async fn query_performance_daily_reads_populated_qianchuan_fixture_when_configured() {
        let Some(pool) = fixture_pool().await else {
            return;
        };
        let asset_id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let normalized = normalize_performance_daily_query(query(None, None, None, None)).unwrap();

        let response = query_performance_daily(&pool, asset_id, &normalized)
            .await
            .expect("daily query should succeed");

        assert_eq!(response.asset_id, asset_id);
        assert_eq!(response.delivery_mode, "qianchuan_all_domain");
        assert_eq!(response.default_window_days, 90);
        assert_eq!(response.filters.material_id, None);
        assert_eq!(response.rows.len(), 2);

        let product = response
            .rows
            .iter()
            .find(|row| row.material_id == "MAT-PRODUCT-001")
            .expect("product fixture daily row should be present");
        assert_eq!(product.stat_date, "2026-06-18");
        assert_eq!(product.objective, "product_all_domain_shortvideo");
        assert_eq!(product.source_table, "ods.douyin_qianchuan_shortvideo_raw");
        assert_eq!(product.data_quality_status, "ok");
        assert_eq!(product.overall_impression_count, Some(10_000));
        assert_eq!(product.overall_click_count, Some(600));
        assert_eq!(product.overall_order_count, Some(40));
        assert_close(product.overall_cost, 800.0);
        assert_close(product.overall_gmv, 4_000.0);

        let live = response
            .rows
            .iter()
            .find(|row| row.material_id == "MAT-LIVE-001")
            .expect("live fixture daily row should be present");
        assert_eq!(live.objective, "live_all_domain_shortvideo");
        assert_eq!(live.source_table, "ods.douyin_qianchuan_live_video_raw");
        assert_eq!(live.live_room_name.as_deref(), Some("Fixture live room"));
        assert_eq!(
            live.douyin_account_display_id.as_deref(),
            Some("dy_live_001")
        );
        assert_eq!(live.overall_impression_count, Some(20_000));
        assert_eq!(live.overall_click_count, Some(1_400));
        assert_eq!(live.overall_order_count, Some(30));
        assert_close(live.overall_cost, 1_200.0);
        assert_close(live.overall_gmv, 2_800.0);
        assert_close(live.boost_cost, 180.0);
        assert_close(live.boost_gmv, 420.0);
    }

    #[tokio::test]
    async fn query_performance_daily_filters_live_material_fixture_when_configured() {
        let Some(pool) = fixture_pool().await else {
            return;
        };
        let asset_id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let normalized = normalize_performance_daily_query(query(
            Some(" MAT-LIVE-001 "),
            Some(" live_all_domain_shortvideo "),
            Some("2026-06-18"),
            Some("2026-06-18"),
        ))
        .unwrap();

        let response = query_performance_daily(&pool, asset_id, &normalized)
            .await
            .expect("filtered live material daily query should succeed");

        assert_eq!(
            response.filters.material_id.as_deref(),
            Some("MAT-LIVE-001")
        );
        assert_eq!(
            response.filters.objective.as_deref(),
            Some("live_all_domain_shortvideo")
        );
        assert_eq!(response.filters.start_date.as_deref(), Some("2026-06-18"));
        assert_eq!(response.filters.end_date.as_deref(), Some("2026-06-18"));
        assert_eq!(response.rows.len(), 1);
        let row = &response.rows[0];
        assert_eq!(row.material_id, "MAT-LIVE-001");
        assert_eq!(row.objective, "live_all_domain_shortvideo");
        assert_eq!(row.source_row_count, 1);
        assert_close(row.overall_pay_roi, 2.333333);
        assert_close(row.boost_pay_roi, 2.333333);
    }

    #[tokio::test]
    async fn query_performance_daily_preserves_conflict_primary_source_when_configured() {
        let Some(pool) = fixture_pool().await else {
            return;
        };
        let asset_id = Uuid::parse_str("11111111-1111-1111-1111-111111111113").unwrap();
        let normalized = normalize_performance_daily_query(query(
            Some("MAT-CONFLICT-001"),
            None,
            Some("2026-06-18"),
            Some("2026-06-18"),
        ))
        .unwrap();

        let response = query_performance_daily(&pool, asset_id, &normalized)
            .await
            .expect("conflict daily query should succeed");

        assert_eq!(response.rows.len(), 1);
        let row = &response.rows[0];
        assert_eq!(row.material_id, "MAT-CONFLICT-001");
        assert_eq!(row.objective, "product_all_domain_shortvideo");
        assert_eq!(row.source_table, "ods.douyin_qianchuan_shortvideo_raw");
        assert_eq!(
            row.source_file_name.as_deref(),
            Some("conflict_product.csv")
        );
        assert_eq!(row.source_row_count, 1);
        assert_eq!(row.data_quality_status, "cross_source_conflict");
        assert_close(row.overall_cost, 600.0);
        assert_close(row.overall_gmv, 2_400.0);
        assert_eq!(
            row.raw_metrics
                .get("crossSourceConflict")
                .and_then(|value| value.get("conflictingObjective"))
                .and_then(|value| value.as_str()),
            Some("live_all_domain_shortvideo")
        );
    }
}
