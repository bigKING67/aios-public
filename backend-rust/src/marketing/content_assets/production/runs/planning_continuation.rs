//! Explicit continuation of a current fallback draft, using the existing queue.
use super::{repository as repo, types::Run};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::repository::db_error,
};
use serde_json::{json, Value};
use sqlx::PgConnection;

pub(super) async fn freeze(db: &mut PgConnection, run: &Run) -> AppResult<Value> {
    if run.request.task_type != "picture_remix"
        || run.status != "waiting"
        || run.waiting_reason.as_deref() != Some("missing_material")
        || run.pause_requested
        || run.active_attempt.is_some()
        || run.project_id.is_some()
        || run.render_job_id.is_some()
        || !run.request.model_call_confirmed
    {
        return Err(super::domain::conflict());
    }
    let plan = repo::plan(db, run.run_id, run.plan_revision)
        .await?
        .ok_or(AppError::Internal)?;
    if plan.execution_version != run.execution_version
        || plan.document.gaps.is_empty()
        || !plan.document.locked_clip_ids.is_empty()
        || plan.origin != "model"
    {
        return Err(super::domain::conflict());
    }
    let receipt: Option<Value> = sqlx::query_scalar("SELECT a.result FROM ads.content_production_plans p JOIN ads.content_production_plan_attempts a ON a.attempt_id=p.attempt_id AND a.run_id=p.run_id WHERE p.run_id=$1 AND p.revision=$2 AND a.execution_version=$3 AND a.status='succeeded'")
        .bind(run.run_id).bind(run.plan_revision).bind(run.execution_version)
        .fetch_optional(&mut *db).await.map_err(db_error)?;
    let receipt = receipt.ok_or_else(super::domain::conflict)?;
    let fallback = &receipt["correction"]["preservationFallback"];
    if fallback["schema"] != "aios.planning-preservation-fallback.v1"
        || fallback["status"] != "draft_requires_review"
        || fallback["deliveryApproved"] != false
    {
        return Err(super::domain::conflict());
    }
    Ok(
        json!({"schema":"aios.planning-continuation.v1","fromPlanRevision":run.plan_revision,
        "fromExecutionVersion":run.execution_version,"previousDocument":plan.document,
        "failedClipIds":fallback["replacedClipIds"],"previousChecks":receipt["correction"]["selectionTextReview"]["checks"],
        "scope":"fresh_plan_and_independent_review_required","deliveryApproved":false}),
    )
}

pub(super) async fn load(db: &mut PgConnection, run: &Run) -> AppResult<Option<Value>> {
    if run.plan_revision == 0 {
        return Ok(None);
    }
    let input: Value = sqlx::query_scalar("SELECT input FROM ads.content_production_plan_attempts WHERE attempt_id=$1 AND run_id=$2 AND execution_version=$3 AND status='running'")
        .bind(run.active_attempt).bind(run.run_id).bind(run.execution_version)
        .fetch_optional(&mut *db).await.map_err(db_error)?.ok_or_else(super::domain::conflict)?;
    let context = &input["continuation"];
    if context["schema"] != "aios.planning-continuation.v1"
        || context["fromPlanRevision"] != run.plan_revision
        || context["fromExecutionVersion"].as_i64() != Some(i64::from(run.execution_version) - 1)
    {
        return Err(super::domain::conflict());
    }
    Ok(Some(context.clone()))
}
