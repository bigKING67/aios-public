//! Read-only worker gate. A queue token never replaces authenticated owner rights.
use super::{assets, guard, repository};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    claim_token: Uuid,
}

async fn binding(state: &AppState, user: &CurrentUser, job: Uuid, token: Uuid) -> AppResult<Value> {
    let row = sqlx::query("SELECT r.run_id,j.asset_id,j.input_object_key,j.metadata,r.source_snapshot FROM ads.marketing_content_asset_processing_jobs j JOIN ads.content_production_runs r ON r.run_id::text=j.metadata->'caption_request'->>'runId' WHERE j.job_id=$1 AND r.owner_user_id=$2 AND j.job_type='analysis' AND j.status='running' AND j.attempts=1 AND j.max_attempts=1 AND j.started_at>clock_timestamp()-INTERVAL '20 minutes' AND j.metadata->>'operation'='source_caption_preflight_v1' AND j.metadata->>'caption_claim_token'=$3 AND r.status='running' AND r.stage='planning' AND NOT r.pause_requested AND to_jsonb(r.execution_version)=j.metadata->'caption_request'->'executionVersion'")
        .bind(job).bind(&user.user_id).bind(token.to_string()).fetch_optional(&state.pool).await
        .map_err(super::super::repository::db_error)?.ok_or(AppError::Forbidden)?;
    Ok(
        json!({"runId":row.get::<Uuid,_>("run_id"),"assetId":row.get::<Uuid,_>("asset_id"),
        "objectKey":row.get::<Option<String>,_>("input_object_key"),
        "metadata":row.get::<Value,_>("metadata"),"snapshot":row.get::<Value,_>("source_snapshot")}),
    )
}

pub(crate) async fn authorize(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(job): Path<Uuid>,
    Json(request): Json<Request>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let before = binding(&state, &user, job, request.claim_token).await?;
    let id = serde_json::from_value(before["runId"].clone()).map_err(|_| AppError::Internal)?;
    let run = repository::get(&state.pool, &user.user_id, id).await?;
    assets::revalidate(&state, &user, &run.sources).await?;
    let input = &before["metadata"]["caption_request"];
    let source = run
        .sources
        .assets
        .iter()
        .find(|s| json!(s.asset_id) == before["assetId"])
        .ok_or(AppError::Forbidden)?;
    if source.sha256.len() != 64
        || !source.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || json!(source.object_key) != before["objectKey"]
        || json!(source.sha256) != input["sourceSha256"]
        || json!(format!("{}-{}", source.asset_id, &source.sha256[..16])) != input["assetVersionId"]
    {
        return Err(AppError::Forbidden);
    }
    // Detect cancellation, source replacement or expiry while rights were checked.
    if binding(&state, &user, job, request.claim_token).await? != before
        || serde_json::to_value(&run.sources).map_err(|_| AppError::Internal)? != before["snapshot"]
    {
        return Err(AppError::Forbidden);
    }
    Ok(Json(
        json!({"ownerUserId":user.user_id,"sourceSnapshot":run.sources}),
    ))
}

/// Narrow DB-claim capability, not a user login or general service credential.
pub(crate) async fn authorize_worker(
    State(state): State<Arc<AppState>>,
    Path(job): Path<Uuid>,
    headers: HeaderMap,
    Json(request): Json<Request>,
) -> AppResult<Json<Value>> {
    let secret = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|v| {
            v.len() == 43
                && v.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
        .ok_or(AppError::Unauthorized)?;
    let digest = format!("{:x}", Sha256::digest(secret.as_bytes()));
    let owner: String = sqlx::query_scalar("SELECT r.owner_user_id FROM ads.marketing_content_asset_processing_jobs j JOIN ads.content_production_runs r ON r.run_id::text=j.metadata->'caption_request'->>'runId' WHERE j.job_id=$1 AND j.job_type='analysis' AND j.status='running' AND j.attempts=1 AND j.max_attempts=1 AND j.started_at>clock_timestamp()-INTERVAL '20 minutes' AND j.metadata->>'operation'='source_caption_preflight_v1' AND j.metadata->>'caption_claim_token'=$2 AND j.metadata->>'caption_authorization_sha256'=$3")
        .bind(job).bind(request.claim_token.to_string()).bind(&digest).fetch_optional(&state.pool).await
        .map_err(super::super::repository::db_error)?.ok_or(AppError::Forbidden)?;
    // Reuse the planner's live active-user and write-policy lookup. Never accept
    // an owner supplied by the worker or treat the capability as business rights.
    let user = super::planner::owner(&state, &owner).await?;
    let result = authorize(State(state.clone()), user, Path(job), Json(request)).await?;
    let valid: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ads.marketing_content_asset_processing_jobs WHERE job_id=$1 AND status='running' AND started_at>clock_timestamp()-INTERVAL '20 minutes' AND metadata->>'caption_authorization_sha256'=$2)")
        .bind(job).bind(digest).fetch_one(&state.pool).await.map_err(super::super::repository::db_error)?;
    if !valid {
        return Err(AppError::Forbidden);
    }
    Ok(result)
}
