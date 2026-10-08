//! Explicit per-run opt-in. A durable reservation consumes a round even after a crash.
use super::super::repository::db_error;
use super::{repository, types::Run};
use crate::{
    error::{AppError, AppResult},
    state::AppState,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

pub(super) struct Claim {
    pub owner: String,
    pub run: Run,
    pub job: Uuid,
    token: Uuid,
}

pub(super) async fn claim(pool: &PgPool) -> AppResult<Option<Claim>> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    // The Run lock serializes the per-run budget across processes. No TTL/reclaim:
    // outcome-unknown reservations must never result in an automatic paid retry.
    let candidate: Option<(Uuid, String, Uuid)> = sqlx::query_as(
        "SELECT r.run_id,r.owner_user_id,r.render_job_id FROM ads.content_production_runs r
         JOIN ads.content_production_jobs j ON j.job_id=r.render_job_id
         WHERE r.status='waiting' AND NOT r.pause_requested AND r.active_attempt IS NULL
         AND r.waiting_reason='caption_quality_pending' AND j.status='completed'
         AND r.request->>'maxAutoRepairs' IN ('1','2')
         AND r.request->>'taskType'='picture_remix' AND r.request->>'modelCallConfirmed'='true'
         AND COALESCE(r.request->>'reviewBeforeProduction','false')='false'
         AND NOT (j.receipt ? 'host_auto_repair')
         AND j.receipt #>> '{host_selected_semantic_review,followUp,status}'='revision_proposed'
         AND (SELECT COUNT(*) FROM ads.content_production_run_renders l
              JOIN ads.content_production_jobs previous ON previous.job_id=l.job_id
              WHERE l.run_id=r.run_id AND previous.receipt ? 'host_auto_repair')
             < CASE r.request->>'maxAutoRepairs' WHEN '1' THEN 1 WHEN '2' THEN 2 ELSE 0 END
         ORDER BY r.updated_at,r.run_id LIMIT 1 FOR UPDATE OF r SKIP LOCKED",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    let Some((id, owner, job)) = candidate else {
        return Ok(None);
    };
    let run = repository::lock(&mut tx, &owner, id).await?;
    let token = Uuid::new_v4();
    let reserved = json!({"schema":"aios.auto-repair.v1","token":token,"status":"reserved_outcome_unknown","runId":id,"sourceJobId":job,"version":run.version,"deliveryApproved":false});
    let changed = sqlx::query("UPDATE ads.content_production_jobs SET receipt=jsonb_set(receipt,'{host_auto_repair}',$2) WHERE job_id=$1 AND status='completed' AND NOT (receipt ? 'host_auto_repair')")
        .bind(job).bind(reserved).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
    if changed != 1 {
        return Err(super::domain::conflict());
    }
    tx.commit().await.map_err(db_error)?;
    Ok(Some(Claim {
        owner,
        run,
        job,
        token,
    }))
}

pub(super) async fn step(state: &AppState) -> AppResult<bool> {
    if !state.settings.content_production_enabled
        || !state.settings.content_production_runs_enabled
        || !state.settings.content_production_planning_enabled
    {
        return Ok(false);
    }
    let Some(claim) = claim(&state.pool).await? else {
        return Ok(false);
    };
    let outcome = tokio::time::timeout(Duration::from_secs(180), execute(state, &claim)).await;
    let status = match &outcome {
        Ok(Ok(value)) => value["status"].as_str().unwrap_or("outcome_unknown"),
        Ok(Err(AppError::Forbidden | AppError::Unauthorized)) => "access_denied",
        Ok(Err(_)) => "blocked",
        Err(_) => "outcome_unknown",
    };
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=jsonb_set(receipt,'{host_auto_repair,status}',to_jsonb($3::text)) WHERE job_id=$1 AND receipt #>> '{host_auto_repair,token}'=$2")
        .bind(claim.job).bind(claim.token.to_string()).bind(status).execute(&state.pool).await.map_err(db_error)?;
    Ok(true)
}

async fn execute(state: &AppState, claim: &Claim) -> AppResult<Value> {
    let user = super::planner::owner(state, &claim.owner).await?;
    let result = super::output::read(state, &user, claim.run.run_id).await?;
    let proposal = result["selectedReview"]["followUp"]["proposals"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["action"] == "reselect_source")
        });
    let Some(proposal) = proposal else {
        return Ok(json!({"status":"evidence_required"}));
    };
    let request = serde_json::from_value(json!({"expectedVersion":claim.run.version,"expectedPlanRevision":claim.run.plan_revision,"jobId":claim.job,"clipId":proposal["target"]["clipId"]})).map_err(|_|AppError::Internal)?;
    Ok(super::replacement_repair::repair(
        axum::extract::State(Arc::new(state.clone())),
        user,
        axum::extract::Path(claim.run.run_id),
        axum::Json(request),
    )
    .await?
    .0)
}
