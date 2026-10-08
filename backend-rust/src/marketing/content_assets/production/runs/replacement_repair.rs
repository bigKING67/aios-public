//! One bounded repair attempt: select, adopt and enqueue; never loops after rendering.
use super::{domain, replacement_apply, replacement_candidates, replacement_selection, repository};
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

pub(in crate::marketing::content_assets::production) async fn repair(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<replacement_candidates::Request>,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, true)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    // Check execution consent before a potentially billable selection, not only at apply.
    if run.status != "waiting" || run.pause_requested || run.active_attempt.is_some() {
        return Err(domain::conflict());
    }
    if !state.settings.content_production_planning_enabled || !run.request.model_call_confirmed {
        return Err(AppError::Forbidden);
    }
    let Json(input) = replacement_candidates::search(
        State(state.clone()),
        user.clone(),
        Path(id),
        Json(request.clone()),
    )
    .await?;
    let saved: Option<Value> = sqlx::query_scalar(
        "SELECT receipt->'host_replacement_selection' FROM ads.content_production_jobs WHERE job_id=$1",
    ).bind(request.job_id).fetch_one(&state.pool).await.map_err(super::super::repository::db_error)?;
    let reused = saved.is_some();
    let selection = if let Some(saved) = saved {
        if saved["input"] != input
            || !["draft_proposed", "evidence_required"]
                .iter()
                .any(|s| saved["status"] == *s)
        {
            return Err(AppError::Conflict(
                "选材记录尚未完成或已变化；不会重复调用模型".into(),
            ));
        }
        saved
    } else {
        replacement_selection::select(
            State(state.clone()),
            user.clone(),
            Path(id),
            Json(request.clone()),
        )
        .await?
        .0
    };
    if selection["status"] != "draft_proposed" {
        return Ok(Json(
            json!({"schema":"aios.replacement-repair.v1", "status":selection["status"],
            "selectionReused":reused, "sourceJobId":request.job_id, "deliveryApproved":false}),
        ));
    }
    // apply reconstructs and verifies the persisted decision and draft, and atomically
    // freezes a new version plus job. Concurrent/duplicate requests cannot enqueue twice.
    let Json(detail) =
        replacement_apply::apply(State(state), user, Path(id), Json(request.clone())).await?;
    Ok(Json(
        json!({"schema":"aios.replacement-repair.v1", "status":"production_queued",
        "selectionReused":reused, "sourceJobId":request.job_id, "detail":detail, "deliveryApproved":false}),
    ))
}
