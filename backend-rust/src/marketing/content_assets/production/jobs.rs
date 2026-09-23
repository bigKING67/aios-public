use super::super::delivery::build_object_read_url;
use super::{
    assets, guard,
    repository::{self, db_error},
    types::{RenderJob, RenderRequest},
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
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

pub(super) async fn enqueue(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(request): Json<RenderRequest>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let snapshot = repository::snapshot(&state.pool, &user.user_id, id, request.revision).await?;
    assets::revalidate(&state, &user, &snapshot).await?;
    let row=sqlx::query(r#"INSERT INTO ads.content_production_jobs (job_id,project_id,revision,preview)
        VALUES ($1,$2,$3,$4) ON CONFLICT (project_id,revision,preview)
        WHERE status IN ('queued','running','cancel_requested') DO UPDATE SET project_id=EXCLUDED.project_id
        RETURNING job_id,status"#)
        .bind(Uuid::new_v4()).bind(id).bind(request.revision).bind(request.preview)
        .fetch_one(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"jobId":row.get::<Uuid,_>("job_id"),"status":row.get::<String,_>("status")}),
    ))
}

pub(super) async fn cancel(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path((id, job)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    repository::get_project(&state.pool, &user.user_id, id).await?;
    let row=sqlx::query("UPDATE ads.content_production_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancel_requested' END,stage=CASE WHEN status='queued' THEN '已取消' ELSE '取消处理中' END,finished_at=CASE WHEN status='queued' THEN NOW() ELSE NULL END WHERE job_id=$1 AND project_id=$2 AND status IN ('queued','running','cancel_requested') RETURNING status")
        .bind(job).bind(id).fetch_optional(&state.pool).await.map_err(db_error)?.ok_or_else(||AppError::Conflict("任务已结束或不存在".into()))?;
    Ok(Json(json!({"status":row.get::<String,_>("status")})))
}

pub(super) async fn list_jobs(
    state: &AppState,
    user: &CurrentUser,
    id: Uuid,
) -> AppResult<Vec<RenderJob>> {
    let rows=sqlx::query("SELECT job_id,revision,preview,status,stage,error_message,output_object_key,created_at::TEXT AS created_at FROM ads.content_production_jobs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20")
        .bind(id).fetch_all(&state.pool).await.map_err(db_error)?;
    let mut result = Vec::new();
    for row in rows {
        let revision = row.get("revision");
        let status: String = row.get("status");
        let key: Option<String> = row.get("output_object_key");
        let playback_url = if status == "completed" {
            // Old exports must not inherit permissions from only the latest revision.
            let snapshot = repository::snapshot(&state.pool, &user.user_id, id, revision).await?;
            match assets::revalidate(state, user, &snapshot).await {
                Ok(()) => key
                    .map(|key| build_object_read_url(&state.settings, &key))
                    .transpose()?,
                Err(
                    AppError::Forbidden
                    | AppError::NotFound
                    | AppError::Conflict(_)
                    | AppError::BadRequest(_),
                ) => None,
                Err(error) => return Err(error),
            }
        } else {
            None
        };
        result.push(RenderJob {
            job_id: row.get("job_id"),
            revision,
            preview: row.get("preview"),
            status,
            stage: row.get("stage"),
            error_message: row.get("error_message"),
            playback_url,
            created_at: row.get("created_at"),
        });
    }
    Ok(result)
}
