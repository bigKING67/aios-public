use serde_json::Value;
use sqlx::{PgPool, Row};

use super::overview::build_overview_details_refund_nowcast_patch_sql;
use super::overview_nowcast::build_overview_refund_nowcast_patch_sql;
use super::overview_nowcast_patch::{
    apply_overview_details_nowcast_patch, apply_overview_nowcast_patch,
    is_nowcast_dependency_missing, OverviewDetailsNowcastPatch, OverviewNowcastPatch,
};

pub(super) async fn run_dashboard_query_json(pool: &PgPool, sql: &str) -> Result<Value, String> {
    let row = sqlx::query(sql)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;
    let raw = row
        .try_get::<String, _>(0)
        .map_err(|error| error.to_string())?;

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("查询结果为空".to_string());
    }

    serde_json::from_str::<Value>(trimmed).map_err(|error| error.to_string())
}

pub(super) async fn apply_overview_nowcast_prediction(
    pool: &PgPool,
    payload: &mut Value,
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
    platform: &str,
) -> Result<(), String> {
    let patch_sql = build_overview_refund_nowcast_patch_sql(
        start_date,
        end_date,
        prev_start_date,
        prev_end_date,
        platform,
    );

    let patch_value = match run_dashboard_query_json(pool, patch_sql.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            if is_nowcast_dependency_missing(raw_error.as_str()) {
                return Err(
                    "nowcast 表不存在或不可用：请先执行退款预测 nowcast 迁移并刷新快照。"
                        .to_string(),
                );
            }
            return Err(raw_error);
        }
    };

    let patch = serde_json::from_value::<OverviewNowcastPatch>(patch_value)
        .map_err(|error| error.to_string())?;
    apply_overview_nowcast_patch(payload, patch);
    Ok(())
}

pub(super) async fn apply_overview_details_nowcast_prediction(
    pool: &PgPool,
    payload: &mut Value,
    start_date: &str,
    end_date: &str,
    platform: &str,
) -> Result<(), String> {
    let patch_sql = build_overview_details_refund_nowcast_patch_sql(start_date, end_date, platform);

    let patch_value = match run_dashboard_query_json(pool, patch_sql.as_str()).await {
        Ok(value) => value,
        Err(raw_error) => {
            if is_nowcast_dependency_missing(raw_error.as_str()) {
                return Err(
                    "nowcast 表不存在或不可用：请先执行退款预测 nowcast 迁移并刷新快照。"
                        .to_string(),
                );
            }
            return Err(raw_error);
        }
    };

    let patch = serde_json::from_value::<OverviewDetailsNowcastPatch>(patch_value)
        .map_err(|error| error.to_string())?;
    apply_overview_details_nowcast_patch(payload, patch);

    Ok(())
}
