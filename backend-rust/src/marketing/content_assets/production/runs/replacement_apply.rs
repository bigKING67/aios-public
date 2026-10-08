//! Adopt only a current persisted selection, preserving history and dispatching atomically.
use super::{
    domain, execution, replacement_candidates, repository as repo, selected_revision, types::*,
};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

pub(in crate::marketing::content_assets::production) async fn apply(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<replacement_candidates::Request>,
) -> AppResult<Json<RunDetail>> {
    let Json(input) = replacement_candidates::search(
        State(state.clone()),
        user.clone(),
        Path(id),
        Json(request.clone()),
    )
    .await?;
    let selection:Option<Value>=sqlx::query_scalar("SELECT receipt->'host_replacement_selection' FROM ads.content_production_jobs WHERE job_id=$1")
        .bind(request.job_id).fetch_one(&state.pool).await.map_err(super::super::repository::db_error)?;
    let selection = selection.ok_or_else(domain::conflict)?;
    let index = super::replacement_selection::persisted_choice(&selection, &input)?;
    let draft_request=serde_json::from_value(json!({"expectedVersion":input["expectedVersion"],"expectedPlanRevision":input["expectedPlanRevision"],
        "jobId":request.job_id,"replacements":[input["candidates"][index]["replacement"]]})).map_err(|_|AppError::Internal)?;
    let Json(draft) = selected_revision::draft(
        State(state.clone()),
        user.clone(),
        Path(id),
        Json(draft_request),
    )
    .await?;
    if draft != selection["draft"] {
        return Err(domain::conflict());
    }
    let revision: RevisePlanRequest =
        serde_json::from_value(draft["revisionRequest"].clone()).map_err(|_| AppError::Internal)?;
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(super::super::repository::db_error)?;
    let mut run = repo::lock(&mut tx, &user.user_id, id).await?;
    repo::check_version(&run, revision.expected_version)?;
    if run.status != "waiting"
        || run.pause_requested
        || run.active_attempt.is_some()
        || run.plan_revision != revision.expected_plan_revision
        || run.render_job_id != Some(request.job_id)
    {
        return Err(domain::conflict());
    }
    // Run -> job lock ordering matches existing cancellation/dispatch behavior.
    let locked:Option<Value>=sqlx::query_scalar("SELECT receipt->'host_replacement_selection' FROM ads.content_production_jobs WHERE job_id=$1 FOR UPDATE")
        .bind(request.job_id).fetch_one(&mut *tx).await.map_err(super::super::repository::db_error)?;
    if locked.as_ref() != Some(&selection) {
        return Err(domain::conflict());
    }
    let old = repo::plan(&mut tx, id, run.plan_revision)
        .await?
        .ok_or_else(domain::conflict)?;
    domain::validate_plan(&revision.document, &run.request, &run.sources)?;
    domain::preserve_locks(&old.document, &revision.document, &[])?;
    super::treated_captions::preserve(&mut tx, &user.user_id, &run, &revision.document).await?;
    run.execution_version = repo::next(run.execution_version)?;
    run.render_job_id = None;
    repo::insert_plan(&mut tx, &mut run, &revision.document, "model", None).await?;
    let expected = run.project_revision;
    execution::enqueue(&mut tx, &user.user_id, &mut run, expected).await?;
    let applied = json!({"schema":"aios.replacement-application.v1","sourceJobId":request.job_id,"selectionInputSha256":selection["inputSha256"],
        "planRevision":run.plan_revision,"projectRevision":run.project_revision,"renderJobId":run.render_job_id,"deliveryApproved":false});
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=jsonb_set(receipt,'{host_replacement_application}',$2) WHERE job_id=$1")
        .bind(request.job_id).bind(applied).execute(&mut *tx).await.map_err(super::super::repository::db_error)?;
    repo::save(&mut tx, &mut run).await?;
    tx.commit()
        .await
        .map_err(super::super::repository::db_error)?;
    Ok(Json(repo::detail(&state.pool, &user.user_id, id).await?))
}
