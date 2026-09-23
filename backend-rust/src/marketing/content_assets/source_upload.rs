use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{Datelike, Utc};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    asset_mutations::{prepare_existing_asset_source_upload, ManualUploadActor},
    delivery::build_upload_url,
    mutation_types::{ContentAssetUploadCreateRequest, ContentAssetUploadCreateResponse},
    permissions::ensure_content_asset_edit_permission,
    repository::query_duplicate_asset_by_sha256,
    types::ContentAssetItem,
    validation::normalize_upload_create,
};

pub(super) async fn create_source_upload_request(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<ContentAssetUploadCreateRequest>,
) -> AppResult<Json<ContentAssetUploadCreateResponse>> {
    ensure_content_asset_edit_permission(&state.pool, &current_user, asset_id).await?;
    let normalized = normalize_upload_create(payload)?;
    if let Some(raw_sha256) = normalized.raw_sha256.as_deref() {
        if let Some(duplicate) =
            query_duplicate_asset_by_sha256(&state.pool, raw_sha256, Some(asset_id)).await?
        {
            return Err(duplicate_asset_conflict(&duplicate));
        }
    }

    let object_key = build_raw_object_key(asset_id, &normalized.file_ext);
    let upload = build_upload_url(&state.settings, &object_key, &normalized.content_type)?;
    prepare_existing_asset_source_upload(
        &state.pool,
        asset_id,
        &state.settings.tos_bucket,
        &state.settings.tos_region,
        &object_key,
        normalized,
        ManualUploadActor {
            username: current_user.username.as_deref(),
            user_id: Some(current_user.user_id.as_str()),
        },
    )
    .await?;
    Ok(Json(ContentAssetUploadCreateResponse {
        asset_id,
        bucket: state.settings.tos_bucket.clone(),
        object_key,
        upload_url: upload.url,
        method: "PUT".to_string(),
        expires_at: upload.expires_at,
        headers: upload.headers,
    }))
}

fn build_raw_object_key(asset_id: Uuid, file_ext: &str) -> String {
    let now = Utc::now();
    format!(
        "raw/{:04}/{:02}/{}.{}",
        now.year(),
        now.month(),
        asset_id,
        file_ext
    )
}

fn duplicate_asset_conflict(duplicate: &ContentAssetItem) -> AppError {
    AppError::Conflict(format!(
        "该视频已存在于素材库：{}（asset_id: {}），请勿重复上传。",
        duplicate.title, duplicate.asset_id
    ))
}
