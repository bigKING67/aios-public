use super::{daily_remix_types::*, error::StudioResult, repository::db_error};
use crate::{config::Settings, error::AppError};
use chrono::NaiveDate;
use sqlx::{PgPool, Row};

pub(super) async fn read(
    pool: &PgPool,
    settings: &Settings,
    date: NaiveDate,
) -> StudioResult<DailyRemixPlanResponse> {
    let row = sqlx::query("SELECT snapshot, structure_results, paused, dispatch_complete, stop_reason, budget_micros, estimated_cost_micros FROM ads.content_daily_remix_plans WHERE plan_date=$1")
        .bind(date).fetch_optional(pool).await.map_err(db_error)?;
    let mut result = DailyRemixPlanResponse {
        date: date.to_string(),
        status: "not_started".into(),
        requested_count: 100,
        planned_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        active_count: 0,
        shortfall: 100,
        dispatch_complete: false,
        stop_reason: None,
        budget_yuan: settings
            .daily_remix
            .budget_micros
            .map(|v| v as f64 / 1_000_000.0),
        estimated_cost_yuan: 0.0,
        structure_pool: None,
        batches: Vec::new(),
        structures: Vec::new(),
    };
    let Some(row) = row else {
        return Ok(result);
    };
    if let Some(snapshot) = row.get::<Option<serde_json::Value>, _>("snapshot") {
        let frozen: FrozenPlan = serde_json::from_value(snapshot).map_err(|error| {
            tracing::error!(?error, "invalid frozen daily remix plan");
            AppError::Internal
        })?;
        if frozen.enterprise_tag != settings.content_ai_studio_enterprise_tag {
            return Err(AppError::Forbidden.into());
        }
        result.structure_pool = Some(frozen.pool);
    }
    let counts = sqlx::query("SELECT COUNT(*) AS planned, COUNT(*) FILTER (WHERE r.status='succeeded') AS succeeded, COUNT(*) FILTER (WHERE r.status IN ('failed','cancelled')) AS failed, COUNT(*) FILTER (WHERE r.status NOT IN ('succeeded','failed','cancelled')) AS active FROM ads.content_daily_remix_batches d JOIN ads.content_remix_batch_runs br USING(batch_id) JOIN ads.content_production_runs r USING(run_id) WHERE d.plan_date=$1")
        .bind(date).fetch_one(pool).await.map_err(db_error)?;
    result.planned_count = counts.get("planned");
    result.succeeded_count = counts.get("succeeded");
    result.failed_count = counts.get("failed");
    result.active_count = counts.get("active");
    result.shortfall = 100 - result.planned_count;
    result.dispatch_complete = row.get("dispatch_complete");
    result.structures = serde_json::from_value(row.get("structure_results")).map_err(|error| {
        tracing::error!(?error, "invalid daily remix structure results");
        AppError::Internal
    })?;
    result.stop_reason = row.get("stop_reason");
    result.budget_yuan = row
        .get::<Option<i64>, _>("budget_micros")
        .map(|v| v as f64 / 1_000_000.0);
    result.estimated_cost_yuan = row.get::<i64, _>("estimated_cost_micros") as f64 / 1_000_000.0;
    result.status = if row.get::<bool, _>("paused") || !settings.daily_remix.enabled {
        "paused"
    } else if result.stop_reason.as_deref() == Some("over_budget") {
        "over_budget"
    } else if result.dispatch_complete && result.active_count == 0 {
        "done"
    } else if result.structure_pool.is_none() {
        "waiting_sources"
    } else {
        "running"
    }
    .into();
    result.batches = sqlx::query("SELECT d.batch_id, d.structure_index, b.planned_count FROM ads.content_daily_remix_batches d JOIN ads.content_remix_batches b USING(batch_id) WHERE d.plan_date=$1 ORDER BY b.created_at, d.batch_id")
        .bind(date).fetch_all(pool).await.map_err(db_error)?.iter().map(|r| DailyRemixBatch {
            batch_id: r.get("batch_id"), structure_index: r.get("structure_index"), planned_count: r.get("planned_count")
        }).collect();
    Ok(result)
}
