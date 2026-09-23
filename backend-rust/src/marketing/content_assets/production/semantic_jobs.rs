use super::super::delivery::build_object_read_url;
use super::{catalogs, repository::db_error, types::SearchQuery};
use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{collections::HashSet, sync::Arc};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    catalog_id: Uuid,
    shot_ids: Vec<String>,
    rights_confirmed: bool,
    model_call_confirmed: bool,
}
fn guard(state: &AppState, user: &CurrentUser, write: bool) -> AppResult<()> {
    super::guard(state, user, write)?;
    if !state.settings.content_production_semantics_enabled {
        return Err(AppError::ServiceUnavailable("镜头语义分析尚未启用".into()));
    }
    Ok(())
}
pub(super) async fn enqueue(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<Request>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let selected: HashSet<_> = request.shot_ids.iter().collect();
    if !request.rights_confirmed
        || !request.model_call_confirmed
        || selected.is_empty()
        || selected.len() > 12
        || selected.len() != request.shot_ids.len()
    {
        return Err(AppError::bad_request(
            "请选择1–12个不同镜头，并确认素材用途及模型图片上传费用",
        ));
    }
    let mut snapshot = catalogs::load_bound(&state, &user, request.catalog_id).await?;
    snapshot.clips.retain(|c| selected.contains(&c.id));
    if snapshot.clips.len() != selected.len() {
        return Err(AppError::bad_request("镜头不属于所选目录"));
    }
    let value = serde_json::to_value(snapshot).map_err(|_| AppError::Internal)?;
    let hash = format!("{:x}", Sha256::digest(value.to_string()));
    let row=sqlx::query("INSERT INTO ads.content_production_semantic_jobs(job_id,owner_user_id,catalog_id,request_hash,snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_user_id,catalog_id,request_hash) WHERE status IN ('queued','running','cancel_requested') DO UPDATE SET catalog_id=EXCLUDED.catalog_id RETURNING job_id,status")
        .bind(Uuid::new_v4()).bind(&user.user_id).bind(request.catalog_id).bind(hash).bind(value).fetch_one(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"jobId":row.get::<Uuid,_>("job_id"),"status":row.get::<String,_>("status")}),
    ))
}
pub(super) async fn list(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    let rows=sqlx::query("SELECT job_id,catalog_id,status,stage,error_message,created_at::TEXT AS created_at FROM ads.content_production_semantic_jobs WHERE owner_user_id=$1 ORDER BY created_at DESC,job_id LIMIT 20")
        .bind(&user.user_id).fetch_all(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"items":rows.iter().map(|r|json!({"jobId":r.get::<Uuid,_>("job_id"),"catalogId":r.get::<Uuid,_>("catalog_id"),"status":r.get::<String,_>("status"),"stage":r.get::<String,_>("stage"),"errorMessage":r.get::<Option<String>,_>("error_message"),"createdAt":r.get::<String,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn cancel(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, true)?;
    let row=sqlx::query("UPDATE ads.content_production_semantic_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancel_requested' END,stage='已请求取消，已发出的模型调用可能收费',finished_at=CASE WHEN status='queued' THEN NOW() ELSE NULL END WHERE job_id=$1 AND owner_user_id=$2 AND status IN ('queued','running','cancel_requested') RETURNING status")
        .bind(id).bind(&user.user_id).fetch_optional(&state.pool).await.map_err(db_error)?.ok_or_else(||AppError::Conflict("任务已结束或不可访问".into()))?;
    Ok(Json(json!({"status":row.get::<String,_>("status")})))
}
pub(super) async fn search(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    guard(&state, &user, false)?;
    let q = query.q.trim();
    if q.is_empty() || q.chars().count() > 120 {
        return Err(AppError::bad_request("请输入1–120字关键词"));
    }
    let snapshot = catalogs::load_bound(&state, &user, id).await?;
    let rows=sqlx::query("WITH latest AS (SELECT DISTINCT ON (e->>'shotId') e,j.job_id,j.result->>'model' AS model,j.result->>'promptVersion' AS prompt_version FROM ads.content_production_semantic_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.result->'shots') e WHERE j.catalog_id=$1 AND j.owner_user_id=$2 AND j.status='completed' ORDER BY e->>'shotId',j.finished_at DESC,j.job_id DESC) SELECT * FROM latest WHERE STRPOS(LOWER(e->>'searchText'),LOWER($3))>0 ORDER BY (e->>'startMs')::BIGINT LIMIT 50")
        .bind(id).bind(&user.user_id).bind(q).fetch_all(&state.pool).await.map_err(db_error)?;
    let playback = build_object_read_url(&state.settings, &snapshot.assets[0].object_key)?;
    let mut items = Vec::new();
    for row in rows {
        let e: Value = row.get("e");
        let clip = snapshot
            .clips
            .iter()
            .find(|c| Some(c.id.as_str()) == e["shotId"].as_str())
            .ok_or(AppError::Internal)?;
        if e["startMs"].as_u64() != Some(clip.start_ms.into())
            || e["endMs"].as_u64() != Some(clip.end_ms.into())
        {
            return Err(AppError::Internal);
        }
        items.push(json!({"catalogId":id,"jobId":row.get::<Uuid,_>("job_id"),"assetId":clip.asset_id,"rawSha256":snapshot.assets[0].sha256,"shotId":clip.id,"startMs":clip.start_ms,"endMs":clip.end_ms,"frameSha256":e["frameSha256"],"requestedAtMs":e["requestedAtMs"],"observation":e["observation"],"model":row.get::<String,_>("model"),"promptVersion":row.get::<String,_>("prompt_version"),"playbackUrl":playback}));
    }
    Ok(Json(
        json!({"items":items,"basis":"representative-frame-keyword","notice":"仅检索所选目录已分析镜头的单帧模型描述；非完整动作或质量证明。最多返回50段，请播放原片核对。"}),
    ))
}
