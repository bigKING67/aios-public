use super::super::delivery::build_object_read_url;
use super::{
    assets, catalog_domain,
    repository::db_error,
    types::{BoundAsset, Clip, SaveRequest, Snapshot},
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
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ImportRequest {
    catalog: Value,
    rights_confirmed: bool,
}
#[derive(Serialize, Deserialize)]
struct Stored {
    source: BoundAsset,
    clips: Vec<Clip>,
}

pub(super) async fn import(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Json(request): Json<ImportRequest>,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, true)?;
    if !request.rights_confirmed {
        return Err(AppError::bad_request("请确认目录原片可用于本次剪辑"));
    }
    let (asset_id, hash, duration, clips) = catalog_domain::parse(&request.catalog)?;
    let mut binding = assets::bind_assets(
        &state,
        &user,
        SaveRequest {
            expected_revision: None,
            title: "镜头目录".into(),
            aspect: "portrait".into(),
            rights_confirmed: true,
            clips: vec![Clip {
                id: "check".into(),
                asset_id,
                start_ms: 0,
                end_ms: 100,
                caption: String::new(),
                volume: 1.0,
            }],
        },
    )
    .await?;
    let source = binding.assets.remove(0);
    if source.sha256 != hash || source.duration_ms.abs_diff(duration) > 1 {
        return Err(AppError::Conflict(
            "目录原片身份或时长与当前资产不一致，请重新提取".into(),
        ));
    }
    // Local frame paths, annotations, arbitrary metadata and URLs never enter persistent state.
    let snapshot =
        serde_json::to_value(Stored { source, clips }).map_err(|_| AppError::Internal)?;
    let digest = format!("{:x}", Sha256::digest(snapshot.to_string()));
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_production_shot_catalogs(catalog_id,owner_user_id,asset_id,content_hash,snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (owner_user_id,asset_id,content_hash) DO NOTHING")
        .bind(id).bind(&user.user_id).bind(asset_id).bind(&digest).bind(snapshot).execute(&state.pool).await.map_err(db_error)?;
    let id:Uuid=sqlx::query_scalar("SELECT catalog_id FROM ads.content_production_shot_catalogs WHERE owner_user_id=$1 AND asset_id=$2 AND content_hash=$3")
        .bind(&user.user_id).bind(asset_id).bind(digest).fetch_one(&state.pool).await.map_err(db_error)?;
    Ok(Json(json!({"catalogId":id})))
}
pub(super) async fn list(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, false)?;
    let rows=sqlx::query("SELECT c.catalog_id,c.asset_id,a.title,c.created_at::TEXT AS created_at,jsonb_array_length(c.snapshot->'clips') AS shot_count FROM ads.content_production_shot_catalogs c JOIN ads.marketing_content_assets a USING(asset_id) WHERE c.owner_user_id=$1 ORDER BY c.created_at DESC,c.catalog_id LIMIT 50")
        .bind(&user.user_id).fetch_all(&state.pool).await.map_err(db_error)?;
    Ok(Json(
        json!({"items":rows.into_iter().map(|r|json!({"catalogId":r.get::<Uuid,_>("catalog_id"),"assetId":r.get::<Uuid,_>("asset_id"),"title":r.get::<String,_>("title"),"createdAt":r.get::<String,_>("created_at"),"shotCount":r.get::<i32,_>("shot_count")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn detail(
    State(state): State<Arc<AppState>>,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    super::guard(&state, &user, false)?;
    let snapshot = load_bound(&state, &user, id).await?;
    let playback = build_object_read_url(&state.settings, &snapshot.assets[0].object_key)?;
    Ok(Json(
        json!({"catalogId":id,"assetId":snapshot.assets[0].asset_id,"clips":snapshot.clips,"playbackUrl":playback,"semanticStatus":"not_analyzed","boundaryStatus":"cut_candidates_need_review"}),
    ))
}

pub(super) async fn load_bound(
    state: &AppState,
    user: &CurrentUser,
    id: Uuid,
) -> AppResult<Snapshot> {
    let value:Value=sqlx::query_scalar("SELECT snapshot FROM ads.content_production_shot_catalogs WHERE catalog_id=$1 AND owner_user_id=$2").bind(id).bind(&user.user_id).fetch_optional(&state.pool).await.map_err(db_error)?.ok_or(AppError::NotFound)?;
    let stored: Stored = serde_json::from_value(value).map_err(|_| AppError::Internal)?;
    let snapshot = Snapshot {
        title: "镜头目录".into(),
        aspect: "portrait".into(),
        clips: stored.clips,
        assets: vec![stored.source],
        rights_confirmed: true,
    };
    assets::revalidate(state, user, &snapshot).await?;
    Ok(snapshot)
}
