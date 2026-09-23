use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use tracing::{error, warn};

use crate::state::AppState;

use super::{
    errors::{
        normalize_goods_card_error_message, normalize_goods_error_message,
        normalize_live_error_message, normalize_overview_error_message,
        normalize_qianchuan_error_message, normalize_shortvideo_error_message,
        normalize_traffic_error_message,
    },
    responses::{json_message_response, json_response},
    validation::{is_supported_platform, normalize_platform},
};

#[derive(Debug, Deserialize)]
pub(super) struct DashboardDateBoundsQueryParams {
    pub(super) platform: Option<String>,
    pub(super) dimension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardDateBoundsResponse {
    min_date: Option<String>,
    max_date: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DashboardDateBoundsSource {
    Business,
    Goods,
    Traffic,
    Live,
    ShortVideo,
    GoodsCard,
    Qianchuan,
    Empty,
}

const BUSINESS_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN("date")::TEXT AS min_date,
  MAX("date")::TEXT AS max_date
FROM ads.all_trade_overview
WHERE ($1::TEXT = 'overview' OR platform = $1::TEXT)
"#;

const GOODS_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.taobao_trade_sale_goods_daily
"#;

const TRAFFIC_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.taobao_traffic_shop_daily
"#;

const LIVE_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.douyin_live_detail
"#;

const SHORT_VIDEO_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.douyin_shortvideo_detail
WHERE (
    detail_grain = 'trade_video_day'
    AND COALESCE(NULLIF(BTRIM(account_type), ''), '') LIKE '%合作%'
    AND COALESCE(NULLIF(BTRIM(account_type), ''), '') NOT LIKE '%自营%'
  )
  OR (
    detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
    AND (
      COALESCE(array_length(qianchuan_material_ids, 1), 0) > 0
      OR NULLIF(BTRIM(qianchuan_material_key), '') IS NOT NULL
      OR COALESCE(qianchuan_metric_attributed, FALSE)
      OR COALESCE(qianchuan_overall_impression_count, 0) > 0
      OR COALESCE(qianchuan_overall_click_count, 0) > 0
      OR COALESCE(qianchuan_overall_click_rate, 0) > 0
      OR COALESCE(qianchuan_overall_conversion_rate, 0) > 0
      OR COALESCE(qianchuan_overall_cost, 0) > 0
      OR COALESCE(qianchuan_overall_order_count, 0) > 0
      OR COALESCE(qianchuan_overall_gmv, 0) > 0
      OR COALESCE(qianchuan_overall_pay_roi, 0) > 0
      OR COALESCE(qianchuan_overall_order_cost, 0) > 0
      OR COALESCE(qianchuan_user_pay_amount, 0) > 0
      OR COALESCE(qianchuan_overall_cpm, 0) > 0
      OR COALESCE(qianchuan_overall_cpc, 0) > 0
      OR COALESCE(qianchuan_smart_coupon_amount, 0) > 0
      OR COALESCE(qianchuan_platform_subsidy_amount, 0) > 0
      OR COALESCE(qianchuan_net_gmv_roi, 0) > 0
      OR COALESCE(qianchuan_net_gmv, 0) <> 0
      OR COALESCE(qianchuan_net_order_count, 0) > 0
      OR COALESCE(qianchuan_net_order_cost, 0) > 0
      OR COALESCE(qianchuan_net_gmv_settlement_rate, 0) > 0
      OR COALESCE(qianchuan_refund_rate_1h, 0) > 0
    )
  )
"#;

const SHORT_VIDEO_DATE_BOUNDS_LEGACY_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.douyin_shortvideo_detail
"#;

const GOODS_CARD_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN("date")::TEXT AS min_date,
  MAX("date")::TEXT AS max_date
FROM ads.douyin_trade_sale_carrier_daily
WHERE carrier_type = '商品卡'
"#;

const QIANCHUAN_DATE_BOUNDS_SQL: &str = r#"
SELECT
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date
FROM ads.douyin_qianchuan_live_all_domain_material_daily
"#;

pub(crate) async fn get_dashboard_date_bounds(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DashboardDateBoundsQueryParams>,
) -> Response {
    let platform = normalize_platform(query.platform.as_deref());
    if !is_supported_platform(platform.as_str()) {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：platform 不在主看板支持范围内",
        );
    }

    let dimension = normalize_dashboard_dimension(query.dimension.as_deref());
    let Some(dimension) = dimension else {
        return json_message_response(
            StatusCode::BAD_REQUEST,
            "参数校验失败：dimension 不在主看板支持范围内",
        );
    };

    let source = resolve_date_bounds_source(platform.as_str(), dimension);
    let bounds = match fetch_dashboard_date_bounds(&state.pool, source, platform.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            let message = normalize_date_bounds_error_message(source, raw_error.as_str());
            error!(
                target: "dashboard-date-bounds",
                platform = %platform,
                dimension = %dimension,
                raw_error = %raw_error,
                "query failed"
            );
            return json_message_response(StatusCode::SERVICE_UNAVAILABLE, message.as_str());
        }
    };

    json_response(
        StatusCode::OK,
        DashboardDateBoundsResponse {
            min_date: bounds.0,
            max_date: bounds.1,
        },
    )
}

fn normalize_dashboard_dimension(raw: Option<&str>) -> Option<&'static str> {
    match raw.unwrap_or("business").trim() {
        "" | "business" => Some("business"),
        "goods" => Some("goods"),
        "note" => Some("note"),
        "traffic" => Some("traffic"),
        "wanxiangtai" => Some("wanxiangtai"),
        "live" => Some("live"),
        "shortVideo" | "short_video" | "short-video" => Some("shortVideo"),
        "goodsCard" | "goods_card" | "goods-card" => Some("goodsCard"),
        "qianchuan" => Some("qianchuan"),
        "xingtu" => Some("xingtu"),
        "promotion" => Some("promotion"),
        _ => None,
    }
}

fn resolve_date_bounds_source(platform: &str, dimension: &str) -> DashboardDateBoundsSource {
    match (platform, dimension) {
        (_, "business") => DashboardDateBoundsSource::Business,
        ("taobao", "goods") => DashboardDateBoundsSource::Goods,
        ("taobao", "traffic") => DashboardDateBoundsSource::Traffic,
        ("douyin", "live") => DashboardDateBoundsSource::Live,
        ("douyin", "shortVideo") => DashboardDateBoundsSource::ShortVideo,
        ("douyin", "goodsCard") => DashboardDateBoundsSource::GoodsCard,
        ("douyin", "qianchuan") => DashboardDateBoundsSource::Qianchuan,
        _ => DashboardDateBoundsSource::Empty,
    }
}

async fn fetch_dashboard_date_bounds(
    pool: &PgPool,
    source: DashboardDateBoundsSource,
    platform: &str,
) -> Result<(Option<String>, Option<String>), String> {
    if source == DashboardDateBoundsSource::Empty {
        return Ok((None, None));
    }

    let row = match source {
        DashboardDateBoundsSource::Business => {
            sqlx::query(BUSINESS_DATE_BOUNDS_SQL)
                .bind(platform)
                .fetch_one(pool)
                .await
        }
        DashboardDateBoundsSource::Goods => {
            sqlx::query(GOODS_DATE_BOUNDS_SQL).fetch_one(pool).await
        }
        DashboardDateBoundsSource::Traffic => {
            sqlx::query(TRAFFIC_DATE_BOUNDS_SQL).fetch_one(pool).await
        }
        DashboardDateBoundsSource::Live => sqlx::query(LIVE_DATE_BOUNDS_SQL).fetch_one(pool).await,
        DashboardDateBoundsSource::ShortVideo => fetch_short_video_date_bounds_row(pool).await,
        DashboardDateBoundsSource::GoodsCard => {
            sqlx::query(GOODS_CARD_DATE_BOUNDS_SQL)
                .fetch_one(pool)
                .await
        }
        DashboardDateBoundsSource::Qianchuan => {
            sqlx::query(QIANCHUAN_DATE_BOUNDS_SQL).fetch_one(pool).await
        }
        DashboardDateBoundsSource::Empty => {
            unreachable!("empty date bounds source is handled before querying")
        }
    }
    .map_err(|error| error.to_string())?;

    let min_date = row
        .try_get::<Option<String>, _>("min_date")
        .map_err(|error| error.to_string())?;
    let max_date = row
        .try_get::<Option<String>, _>("max_date")
        .map_err(|error| error.to_string())?;

    Ok((min_date, max_date))
}

async fn fetch_short_video_date_bounds_row(
    pool: &PgPool,
) -> Result<sqlx::postgres::PgRow, sqlx::Error> {
    match sqlx::query(SHORT_VIDEO_DATE_BOUNDS_SQL)
        .fetch_one(pool)
        .await
    {
        Ok(row) => Ok(row),
        Err(error) if is_missing_detail_grain_error(&error) => {
            warn!(
                target: "dashboard-date-bounds",
                "ads.douyin_shortvideo_detail lacks detail_grain; using legacy short-video date bounds query"
            );
            sqlx::query(SHORT_VIDEO_DATE_BOUNDS_LEGACY_SQL)
                .fetch_one(pool)
                .await
        }
        Err(error) => Err(error),
    }
}

fn is_missing_detail_grain_error(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .map(|database_error| {
            database_error.code().as_deref() == Some("42703")
                && database_error.message().contains("detail_grain")
        })
        .unwrap_or(false)
}

fn normalize_date_bounds_error_message(
    source: DashboardDateBoundsSource,
    raw_error: &str,
) -> String {
    match source {
        DashboardDateBoundsSource::Business => normalize_overview_error_message(raw_error),
        DashboardDateBoundsSource::Goods => normalize_goods_error_message(raw_error),
        DashboardDateBoundsSource::Traffic => normalize_traffic_error_message(raw_error),
        DashboardDateBoundsSource::Live => normalize_live_error_message(raw_error),
        DashboardDateBoundsSource::ShortVideo => normalize_shortvideo_error_message(raw_error),
        DashboardDateBoundsSource::GoodsCard => normalize_goods_card_error_message(raw_error),
        DashboardDateBoundsSource::Qianchuan => normalize_qianchuan_error_message(raw_error),
        DashboardDateBoundsSource::Empty => "当前维度暂无可用数据日期".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        resolve_date_bounds_source, DashboardDateBoundsSource, SHORT_VIDEO_DATE_BOUNDS_SQL,
    };

    #[test]
    fn date_bounds_source_maps_only_connected_dimensions_to_fact_sources() {
        assert_eq!(
            resolve_date_bounds_source("overview", "business"),
            DashboardDateBoundsSource::Business
        );
        assert_eq!(
            resolve_date_bounds_source("taobao", "goods"),
            DashboardDateBoundsSource::Goods
        );
        assert_eq!(
            resolve_date_bounds_source("taobao", "traffic"),
            DashboardDateBoundsSource::Traffic
        );
        assert_eq!(
            resolve_date_bounds_source("douyin", "live"),
            DashboardDateBoundsSource::Live
        );
        assert_eq!(
            resolve_date_bounds_source("douyin", "shortVideo"),
            DashboardDateBoundsSource::ShortVideo
        );
        assert_eq!(
            resolve_date_bounds_source("douyin", "goodsCard"),
            DashboardDateBoundsSource::GoodsCard
        );
        assert_eq!(
            resolve_date_bounds_source("douyin", "qianchuan"),
            DashboardDateBoundsSource::Qianchuan
        );
    }

    #[test]
    fn date_bounds_source_returns_empty_for_placeholder_or_cross_platform_dimensions() {
        assert_eq!(
            resolve_date_bounds_source("douyin", "xingtu"),
            DashboardDateBoundsSource::Empty
        );
        assert_eq!(
            resolve_date_bounds_source("taobao", "wanxiangtai"),
            DashboardDateBoundsSource::Empty
        );
        assert_eq!(
            resolve_date_bounds_source("xhs", "note"),
            DashboardDateBoundsSource::Empty
        );
        assert_eq!(
            resolve_date_bounds_source("xhs", "goods"),
            DashboardDateBoundsSource::Empty
        );
    }

    #[test]
    fn short_video_date_bounds_include_qianchuan_material_scope() {
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("'qianchuan_video_day'"),
            "main short-video date bounds should include Qianchuan video-grain rows"
        );
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("'qianchuan_material_day'"),
            "main short-video date bounds should include Qianchuan material-grain rows"
        );
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("qianchuan_material_ids"),
            "main short-video date bounds should retain material-id signals"
        );
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("qianchuan_overall_impression_count"),
            "main short-video date bounds should retain Qianchuan exposure fact signals"
        );
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("qianchuan_overall_click_count"),
            "main short-video date bounds should retain Qianchuan click fact signals"
        );
        assert!(
            SHORT_VIDEO_DATE_BOUNDS_SQL.contains("qianchuan_user_pay_amount"),
            "main short-video date bounds should retain Qianchuan payment fact signals"
        );
    }
}
