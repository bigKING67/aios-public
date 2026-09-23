use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::detail_types::{
    ContentAssetLiveAcceptanceSnapshot, ContentAssetPerformanceMaterial,
    ContentAssetPerformanceSnapshot, ContentAssetPerformanceTotals,
};

pub(super) async fn query_performance_snapshot(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Option<ContentAssetPerformanceSnapshot>> {
    let table_presence = query_table_presence(pool).await?;
    if !table_presence.summary_exists {
        return Ok(None);
    }

    let acceptance_columns = if table_presence.acceptance_exists {
        r#"
          acceptance.stat_date::TEXT AS acceptance_stat_date,
          acceptance.douyin_account_display_id AS acceptance_douyin_account_display_id,
          acceptance.anchor_nickname,
          acceptance.live_watch_user_count::BIGINT AS live_watch_user_count,
          acceptance.live_product_click_user::BIGINT AS live_product_click_user,
          acceptance.product_click_rate_user::FLOAT8 AS product_click_rate_user,
          acceptance.watch_to_pay_rate_user::FLOAT8 AS watch_to_pay_rate_user,
          acceptance.click_to_pay_rate_user::FLOAT8 AS click_to_pay_rate_user,
          acceptance.live_order_count::BIGINT AS live_order_count,
          acceptance.live_gmv::FLOAT8 AS live_gmv,
          acceptance.acceptance_quality_status"#
    } else {
        r#"
          NULL::TEXT AS acceptance_stat_date,
          NULL::TEXT AS acceptance_douyin_account_display_id,
          NULL::TEXT AS anchor_nickname,
          NULL::BIGINT AS live_watch_user_count,
          NULL::BIGINT AS live_product_click_user,
          NULL::FLOAT8 AS product_click_rate_user,
          NULL::FLOAT8 AS watch_to_pay_rate_user,
          NULL::FLOAT8 AS click_to_pay_rate_user,
          NULL::BIGINT AS live_order_count,
          NULL::FLOAT8 AS live_gmv,
          NULL::TEXT AS acceptance_quality_status"#
    };

    let acceptance_join = if table_presence.acceptance_exists {
        r#"
        LEFT JOIN LATERAL (
          SELECT
            acceptance.*
          FROM dws.marketing_content_qianchuan_live_room_acceptance_di acceptance
          WHERE summary.objective = 'live_all_domain_shortvideo'
            AND acceptance.douyin_account_display_id = summary.douyin_account_display_id
            AND acceptance.stat_date BETWEEN summary.first_stat_date AND summary.last_stat_date
          ORDER BY acceptance.stat_date DESC
          LIMIT 1
        ) acceptance ON TRUE"#
    } else {
        ""
    };

    let query = format!(
        r#"
        SELECT
          summary.material_id,
          summary.ad_material_id,
          summary.platform_video_id,
          summary.objective,
          summary.source_table,
          summary.material_video_name,
          summary.live_room_name,
          summary.douyin_account_display_id,
          summary.first_stat_date::TEXT AS first_stat_date,
          summary.last_stat_date::TEXT AS last_stat_date,
          summary.active_days,
          summary.total_impressions,
          summary.total_clicks,
          summary.total_cost::FLOAT8 AS total_cost,
          summary.total_orders,
          summary.total_gmv::FLOAT8 AS total_gmv,
          summary.total_net_gmv::FLOAT8 AS total_net_gmv,
          summary.total_net_orders,
          summary.ctr::FLOAT8 AS ctr,
          summary.cvr::FLOAT8 AS cvr,
          summary.pay_roi::FLOAT8 AS pay_roi,
          summary.net_gmv_roi::FLOAT8 AS net_gmv_roi,
          summary.order_cost::FLOAT8 AS order_cost,
          summary.net_order_cost::FLOAT8 AS net_order_cost,
          summary.refund_rate_1h::FLOAT8 AS refund_rate_1h,
          summary.video_play_count,
          summary.video_complete_play_rate::FLOAT8 AS video_complete_play_rate,
          summary.avg_watch_duration::FLOAT8 AS avg_watch_duration,
          summary.play_rate_5s::FLOAT8 AS play_rate_5s,
          summary.play_rate_10s::FLOAT8 AS play_rate_10s,
          summary.latest_live_acceptance_status,
          summary.data_quality_status,
          summary.sample_quality_status,
          summary.diagnosis_status,
          summary.latest_metrics,
          {acceptance_columns}
        FROM dws.marketing_content_qianchuan_material_summary summary
        {acceptance_join}
        WHERE summary.asset_id = $1
        ORDER BY
          CASE summary.objective
            WHEN 'product_all_domain_shortvideo' THEN 0
            WHEN 'live_all_domain_shortvideo' THEN 1
            ELSE 2
          END,
          summary.last_stat_date DESC NULLS LAST,
          summary.total_cost DESC,
          summary.material_id
        "#
    );

    let rows = sqlx::query(&query)
        .bind(asset_id)
        .fetch_all(pool)
        .await
        .map_err(|err| {
            error!(?err, %asset_id, "query qianchuan performance snapshot failed");
            AppError::Internal
        })?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut materials = Vec::with_capacity(rows.len());
    let mut totals = ContentAssetPerformanceTotals::default();
    let mut latest_stat_date: Option<String> = None;
    let mut quality_flags: Vec<String> = Vec::new();

    for row in rows {
        let objective = row.try_get::<String, _>("objective").unwrap_or_default();
        let total_impressions = row.try_get::<i64, _>("total_impressions").unwrap_or(0);
        let total_clicks = row.try_get::<i64, _>("total_clicks").unwrap_or(0);
        let total_cost = row.try_get::<f64, _>("total_cost").unwrap_or(0.0);
        let total_orders = row.try_get::<i64, _>("total_orders").unwrap_or(0);
        let total_gmv = row.try_get::<f64, _>("total_gmv").unwrap_or(0.0);
        let total_net_gmv = row.try_get::<f64, _>("total_net_gmv").unwrap_or(0.0);
        let total_net_orders = row.try_get::<i64, _>("total_net_orders").unwrap_or(0);
        let last_stat_date = row
            .try_get::<Option<String>, _>("last_stat_date")
            .ok()
            .flatten();
        let data_quality_status = row
            .try_get::<String, _>("data_quality_status")
            .unwrap_or_else(|_| "unknown".to_string());
        let sample_quality_status = row
            .try_get::<String, _>("sample_quality_status")
            .unwrap_or_else(|_| "unknown".to_string());

        totals.material_count += 1;
        if objective == "product_all_domain_shortvideo" {
            totals.product_material_count += 1;
        }
        if objective == "live_all_domain_shortvideo" {
            totals.live_material_count += 1;
        }
        totals.total_impressions += total_impressions;
        totals.total_clicks += total_clicks;
        totals.total_cost += total_cost;
        totals.total_orders += total_orders;
        totals.total_gmv += total_gmv;
        totals.total_net_gmv += total_net_gmv;
        totals.total_net_orders += total_net_orders;

        if let Some(candidate) = last_stat_date.as_deref() {
            if latest_stat_date
                .as_deref()
                .is_none_or(|current| candidate > current)
            {
                latest_stat_date.clone_from(&last_stat_date);
            }
        }
        push_quality_flag(&mut quality_flags, &data_quality_status);
        push_quality_flag(&mut quality_flags, &sample_quality_status);

        materials.push(ContentAssetPerformanceMaterial {
            material_id: row.try_get("material_id").unwrap_or_default(),
            ad_material_id: row.try_get("ad_material_id").ok(),
            platform_video_id: row.try_get("platform_video_id").ok(),
            objective,
            source_table: row.try_get("source_table").unwrap_or_default(),
            material_video_name: row.try_get("material_video_name").ok(),
            live_room_name: row.try_get("live_room_name").ok(),
            douyin_account_display_id: row.try_get("douyin_account_display_id").ok(),
            first_stat_date: row.try_get("first_stat_date").ok(),
            last_stat_date,
            active_days: row.try_get("active_days").unwrap_or(0),
            total_impressions,
            total_clicks,
            total_cost,
            total_orders,
            total_gmv,
            total_net_gmv,
            total_net_orders,
            ctr: optional_f64(&row, "ctr"),
            cvr: optional_f64(&row, "cvr"),
            pay_roi: optional_f64(&row, "pay_roi"),
            net_gmv_roi: optional_f64(&row, "net_gmv_roi"),
            order_cost: optional_f64(&row, "order_cost"),
            net_order_cost: optional_f64(&row, "net_order_cost"),
            refund_rate_1h: optional_f64(&row, "refund_rate_1h"),
            video_play_count: optional_i64(&row, "video_play_count"),
            video_complete_play_rate: optional_f64(&row, "video_complete_play_rate"),
            avg_watch_duration: optional_f64(&row, "avg_watch_duration"),
            play_rate_5s: optional_f64(&row, "play_rate_5s"),
            play_rate_10s: optional_f64(&row, "play_rate_10s"),
            latest_live_acceptance_status: optional_string(&row, "latest_live_acceptance_status"),
            data_quality_status,
            sample_quality_status,
            diagnosis_status: row
                .try_get("diagnosis_status")
                .unwrap_or_else(|_| "pending".to_string()),
            latest_metrics: row
                .try_get("latest_metrics")
                .unwrap_or_else(|_| serde_json::json!({})),
            live_acceptance: live_acceptance_from_row(&row),
        });
    }

    totals.ctr = ratio(totals.total_clicks, totals.total_impressions);
    totals.cvr = ratio(totals.total_orders, totals.total_clicks);
    totals.pay_roi = decimal_ratio(totals.total_gmv, totals.total_cost);
    totals.net_gmv_roi = decimal_ratio(totals.total_net_gmv, totals.total_cost);

    Ok(Some(ContentAssetPerformanceSnapshot {
        delivery_mode: "qianchuan_all_domain".to_string(),
        has_qianchuan_performance: true,
        latest_stat_date,
        totals,
        materials,
        quality_flags,
    }))
}

struct PerformanceTablePresence {
    summary_exists: bool,
    acceptance_exists: bool,
}

async fn query_table_presence(pool: &PgPool) -> AppResult<PerformanceTablePresence> {
    let row = sqlx::query(
        r#"
        SELECT
          to_regclass('dws.marketing_content_qianchuan_material_summary') IS NOT NULL AS summary_exists,
          to_regclass('dws.marketing_content_qianchuan_live_room_acceptance_di') IS NOT NULL AS acceptance_exists
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|err| {
        error!(?err, "check qianchuan performance snapshot tables failed");
        AppError::Internal
    })?;
    Ok(PerformanceTablePresence {
        summary_exists: row.try_get::<bool, _>("summary_exists").unwrap_or(false),
        acceptance_exists: row.try_get::<bool, _>("acceptance_exists").unwrap_or(false),
    })
}

fn live_acceptance_from_row(
    row: &sqlx::postgres::PgRow,
) -> Option<ContentAssetLiveAcceptanceSnapshot> {
    let stat_date = row
        .try_get::<Option<String>, _>("acceptance_stat_date")
        .ok()
        .flatten()?;
    Some(ContentAssetLiveAcceptanceSnapshot {
        attribution_level: "account_date_environment".to_string(),
        stat_date,
        douyin_account_display_id: row
            .try_get("acceptance_douyin_account_display_id")
            .unwrap_or_default(),
        anchor_nickname: optional_string(row, "anchor_nickname"),
        live_watch_user_count: optional_i64(row, "live_watch_user_count"),
        live_product_click_user: optional_i64(row, "live_product_click_user"),
        product_click_rate_user: optional_f64(row, "product_click_rate_user"),
        watch_to_pay_rate_user: optional_f64(row, "watch_to_pay_rate_user"),
        click_to_pay_rate_user: optional_f64(row, "click_to_pay_rate_user"),
        live_order_count: optional_i64(row, "live_order_count"),
        live_gmv: optional_f64(row, "live_gmv"),
        acceptance_quality_status: row
            .try_get("acceptance_quality_status")
            .unwrap_or_else(|_| "unknown".to_string()),
    })
}

fn optional_string(row: &sqlx::postgres::PgRow, column: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(column).ok().flatten()
}

fn optional_i64(row: &sqlx::postgres::PgRow, column: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(column).ok().flatten()
}

fn optional_f64(row: &sqlx::postgres::PgRow, column: &str) -> Option<f64> {
    row.try_get::<Option<f64>, _>(column).ok().flatten()
}

fn ratio(numerator: i64, denominator: i64) -> Option<f64> {
    if denominator == 0 {
        None
    } else {
        Some(numerator as f64 / denominator as f64)
    }
}

fn decimal_ratio(numerator: f64, denominator: f64) -> Option<f64> {
    if denominator == 0.0 {
        None
    } else {
        Some(numerator / denominator)
    }
}

fn push_quality_flag(flags: &mut Vec<String>, value: &str) {
    if value.is_empty() || value == "ok" {
        return;
    }
    if !flags.iter().any(|item| item == value) {
        flags.push(value.to_string());
    }
}

#[cfg(test)]
mod tests {
    use std::env;

    use sqlx::{postgres::PgPoolOptions, PgPool};
    use uuid::Uuid;

    use super::query_performance_snapshot;

    async fn fixture_pool() -> Option<PgPool> {
        let Ok(database_url) = env::var("AIOS_QC_FIXTURE_DATABASE_URL") else {
            eprintln!(
                "skipping qianchuan fixture-backed snapshot test: AIOS_QC_FIXTURE_DATABASE_URL is not set"
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

    #[tokio::test]
    async fn query_performance_snapshot_reads_populated_qianchuan_fixture_when_configured() {
        let Some(pool) = fixture_pool().await else {
            return;
        };
        let asset_id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();

        let snapshot = query_performance_snapshot(&pool, asset_id)
            .await
            .expect("snapshot query should succeed")
            .expect("fixture asset should have performance snapshot");

        assert_eq!(snapshot.delivery_mode, "qianchuan_all_domain");
        assert!(snapshot.has_qianchuan_performance);
        assert_eq!(snapshot.latest_stat_date.as_deref(), Some("2026-06-18"));
        assert_eq!(snapshot.totals.material_count, 2);
        assert_eq!(snapshot.totals.product_material_count, 1);
        assert_eq!(snapshot.totals.live_material_count, 1);
        assert_eq!(snapshot.totals.total_impressions, 30_000);
        assert_eq!(snapshot.totals.total_clicks, 2_000);
        assert_eq!(snapshot.totals.total_orders, 70);
        assert!((snapshot.totals.total_cost - 2_000.0).abs() < 0.0001);
        assert!((snapshot.totals.total_gmv - 6_800.0).abs() < 0.0001);
        assert_close(snapshot.totals.pay_roi, 3.4);

        let product = snapshot
            .materials
            .iter()
            .find(|material| material.material_id == "MAT-PRODUCT-001")
            .expect("product material should be present");
        assert_eq!(product.objective, "product_all_domain_shortvideo");
        assert_eq!(product.source_table, "ods.douyin_qianchuan_shortvideo_raw");
        assert_eq!(product.data_quality_status, "ok");

        let live = snapshot
            .materials
            .iter()
            .find(|material| material.material_id == "MAT-LIVE-001")
            .expect("live material should be present");
        assert_eq!(live.objective, "live_all_domain_shortvideo");
        assert_eq!(live.source_table, "ods.douyin_qianchuan_live_video_raw");
        assert_eq!(live.latest_live_acceptance_status.as_deref(), Some("ok"));
        assert_eq!(
            live.latest_metrics
                .get("boostPolicy")
                .and_then(|value| value.as_str()),
            Some("boost metrics are explanatory only; do not add to overall metrics")
        );
        let live_acceptance = live
            .live_acceptance
            .as_ref()
            .expect("live material should carry account/date acceptance context");
        assert_eq!(
            live_acceptance.attribution_level,
            "account_date_environment"
        );
        assert_eq!(live_acceptance.douyin_account_display_id, "dy_live_001");
        assert_eq!(live_acceptance.acceptance_quality_status, "ok");
    }

    #[tokio::test]
    async fn query_performance_snapshot_preserves_conflict_primary_source_when_configured() {
        let Some(pool) = fixture_pool().await else {
            return;
        };
        let asset_id = Uuid::parse_str("11111111-1111-1111-1111-111111111113").unwrap();

        let snapshot = query_performance_snapshot(&pool, asset_id)
            .await
            .expect("snapshot query should succeed")
            .expect("conflict fixture should still return the primary material snapshot");

        assert_eq!(snapshot.totals.material_count, 1);
        assert!(snapshot
            .quality_flags
            .iter()
            .any(|flag| flag == "cross_source_conflict"));
        let material = snapshot
            .materials
            .iter()
            .find(|material| material.material_id == "MAT-CONFLICT-001")
            .expect("conflict material should be present");
        assert_eq!(material.objective, "product_all_domain_shortvideo");
        assert_eq!(material.source_table, "ods.douyin_qianchuan_shortvideo_raw");
        assert_eq!(material.data_quality_status, "cross_source_conflict");
        assert!((material.total_cost - 600.0).abs() < 0.0001);
        assert!((material.total_gmv - 2_400.0).abs() < 0.0001);
    }
}
