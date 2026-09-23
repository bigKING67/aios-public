use super::{
    assets,
    repository::db_error,
    types::{Clip, SaveRequest},
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
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    asset_id: Uuid,
    rights_confirmed: bool,
}
fn guard(state: &AppState, user: &CurrentUser, write: bool) -> AppResult<()> {
    super::guard(state, user, write)?;
    if !state.settings.content_production_shot_extraction_enabled {
        return Err(AppError::ServiceUnavailable("镜头提取尚未启用".into()));
    }
    Ok(())
}
pub(super) async fn enqueue(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<Request>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let snapshot = assets::bind_assets(
        &state,
        &user,
        SaveRequest {
            expected_revision: None,
            title: "镜头提取".into(),
            aspect: "portrait".into(),
            rights_confirmed: request.rights_confirmed,
            clips: vec![Clip {
                id: "source".into(),
                asset_id: request.asset_id,
                start_ms: 0,
                end_ms: 100,
                caption: String::new(),
                volume: 1.0,
            }],
        },
    )
    .await?;
    let row=sqlx::query("INSERT INTO ads.content_production_shot_jobs(job_id,owner_user_id,asset_id,raw_sha256,snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_user_id,asset_id,raw_sha256) WHERE status IN ('queued','running','cancel_requested') DO UPDATE SET asset_id=EXCLUDED.asset_id RETURNING job_id,status")
        .bind(Uuid::new_v4()).bind(&user.user_id).bind(request.asset_id).bind(&snapshot.assets[0].sha256).bind(serde_json::to_value(&snapshot).map_err(|_|AppError::Internal)?).fetch_one(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"jobId":row.get::<Uuid,_>("job_id"),"status":row.get::<String,_>("status")}),
    ))
}
pub(super) async fn list(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    let rows=sqlx::query("SELECT job_id,asset_id,status,stage,catalog_id,error_message,created_at::TEXT AS created_at FROM ads.content_production_shot_jobs WHERE owner_user_id=$1 ORDER BY created_at DESC,job_id LIMIT 20")
        .bind(&user.user_id).fetch_all(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"items":rows.into_iter().map(|r|json!({"jobId":r.get::<Uuid,_>("job_id"),"assetId":r.get::<Uuid,_>("asset_id"),"status":r.get::<String,_>("status"),"stage":r.get::<String,_>("stage"),"catalogId":r.get::<Option<Uuid>,_>("catalog_id"),"errorMessage":r.get::<Option<String>,_>("error_message"),"createdAt":r.get::<String,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn cancel(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let row=sqlx::query("UPDATE ads.content_production_shot_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancel_requested' END,stage='正在取消',finished_at=CASE WHEN status='queued' THEN NOW() ELSE NULL END WHERE job_id=$1 AND owner_user_id=$2 AND status IN ('queued','running','cancel_requested') RETURNING status")
        .bind(id).bind(&user.user_id).fetch_optional(&state.pool).await.map_err(db_error)?.ok_or_else(||AppError::Conflict("任务已结束或不可访问".into()))?;
    Ok(Json(json!({"status":row.get::<String,_>("status")})))
}
