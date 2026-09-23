use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use tracing::warn;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    recording_segments, repository, storage_objects,
    types::{
        LiveCenterAnalysisCreateRequest, LiveCenterDateBoundsResponse,
        LiveCenterExistingUploadSegment, LiveCenterMultipartResumeRequest,
        LiveCenterMultipartResumeResponse, LiveCenterPlaybackUrlResponse,
        LiveCenterRecordingSegmentCleanupResponse, LiveCenterSessionDetailResponse,
        LiveCenterSessionListResponse, LiveCenterSessionQuery,
        LiveCenterUploadCompletePartResponse, LiveCenterUploadCompleteRequest,
        LiveCenterUploadCreateRequest, LiveCenterUploadCreateResponse, LiveCenterUploadInsert,
        LiveCenterUploadPartUrl, NormalizedLiveCenterUploadCreate,
    },
    uploads,
    validation::{
        normalize_analysis_create, normalize_multipart_resume, normalize_query,
        normalize_session_id, normalize_upload_complete, normalize_upload_create,
    },
};

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/date-bounds", get(get_date_bounds))
        .route("/sessions", get(list_sessions))
        .route("/sessions/{session_id}", get(get_session_detail))
        .route(
            "/sessions/{session_id}/recordings/uploads",
            post(create_recording_upload),
        )
        .route(
            "/recordings/{recording_id}/segments/{segment_id}/complete",
            post(complete_segment_upload),
        )
        .route(
            "/recordings/{recording_id}/segments/{segment_id}/multipart/resume",
            post(resume_segment_multipart_upload),
        )
        .route(
            "/recordings/{recording_id}/segments/{segment_id}/playback-url",
            post(create_segment_playback_url),
        )
        .route(
            "/recordings/{recording_id}/segments/{segment_id}/cleanup",
            post(cleanup_recording_segment),
        )
        .route("/sessions/{session_id}/analysis", post(create_analysis_job))
}

async fn get_date_bounds(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
) -> AppResult<Json<LiveCenterDateBoundsResponse>> {
    repository::get_date_bounds(&state.pool).await.map(Json)
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Query(query): Query<LiveCenterSessionQuery>,
) -> AppResult<Json<LiveCenterSessionListResponse>> {
    let normalized = normalize_query(query)?;
    repository::list_sessions(&state.pool, &normalized)
        .await
        .map(Json)
}

async fn get_session_detail(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Path(session_id): Path<String>,
) -> AppResult<Json<LiveCenterSessionDetailResponse>> {
    let session_id = normalize_session_id(session_id.as_str())?;
    repository::get_session_detail(&state.pool, session_id.as_str())
        .await
        .map(Json)
}

async fn create_recording_upload(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(session_id): Path<String>,
    Json(payload): Json<LiveCenterUploadCreateRequest>,
) -> AppResult<Json<LiveCenterUploadCreateResponse>> {
    let session_id = normalize_session_id(session_id.as_str())?;
    let normalized = normalize_upload_create(payload)?;
    let segment_id = Uuid::new_v4();
    let object_key = uploads::build_raw_object_key(
        session_id.as_str(),
        normalized.segment_index,
        segment_id,
        normalized.file_ext.as_str(),
    );
    let use_multipart = normalized
        .file_size_bytes
        .map(|size| size >= uploads::LARGE_RECORDING_MULTIPART_THRESHOLD_BYTES)
        .unwrap_or(false);
    let bucket = state.settings.tos_bucket.clone();

    if let Some(existing) = repository::get_existing_active_upload_segment(
        &state.pool,
        session_id.as_str(),
        normalized.segment_index,
    )
    .await?
    {
        return Ok(Json(
            build_existing_recording_upload_response(
                state.as_ref(),
                &normalized,
                use_multipart,
                existing,
            )
            .await?,
        ));
    }

    if !use_multipart {
        let upload = uploads::build_upload_url(
            state.settings.as_ref(),
            object_key.as_str(),
            normalized.content_type.as_str(),
        )?;
        let insert = LiveCenterUploadInsert {
            segment_id,
            object_key: object_key.clone(),
            bucket: bucket.clone(),
            normalized,
            uploaded_by_user_id: current_user.user_id,
        };
        let (recording_id, segment_id) =
            repository::create_upload_segment(&state.pool, session_id.as_str(), insert).await?;

        return Ok(Json(LiveCenterUploadCreateResponse {
            recording_id,
            segment_id,
            bucket,
            object_key,
            upload_strategy: "single_put".to_string(),
            upload_url: Some(upload.url),
            method: "PUT".to_string(),
            expires_at: upload.expires_at,
            headers: upload.headers,
            upload_id: None,
            part_size_bytes: None,
            parts: Vec::new(),
            completed_parts: Vec::new(),
        }));
    }

    let file_size_bytes = normalized
        .file_size_bytes
        .ok_or_else(|| AppError::bad_request("录屏分片上传缺少文件大小"))?;
    let content_type = normalized.content_type.clone();
    let insert = LiveCenterUploadInsert {
        segment_id,
        object_key: object_key.clone(),
        bucket: bucket.clone(),
        normalized,
        uploaded_by_user_id: current_user.user_id,
    };
    let (recording_id, segment_id) =
        repository::create_upload_segment(&state.pool, session_id.as_str(), insert).await?;
    let multipart = match uploads::build_multipart_upload_urls(
        &state.http_client,
        state.settings.as_ref(),
        object_key.as_str(),
        content_type.as_str(),
        file_size_bytes,
    )
    .await
    {
        Ok(multipart) => multipart,
        Err(error) => {
            let _ = recording_segments::mark_segment_upload_failed(
                &state.pool,
                recording_id,
                segment_id,
            )
            .await;
            return Err(error);
        }
    };
    let multipart_expires_at = parse_rfc3339_utc(multipart.expires_at.as_str())
        .unwrap_or_else(|| Utc::now() + chrono::Duration::seconds(15 * 60));
    if let Err(error) = repository::attach_segment_multipart_upload(
        &state.pool,
        recording_id,
        segment_id,
        multipart.upload_id.as_str(),
        multipart.part_size_bytes,
        multipart_expires_at,
    )
    .await
    {
        if let Err(abort_error) = uploads::abort_multipart_upload(
            &state.http_client,
            state.settings.as_ref(),
            object_key.as_str(),
            multipart.upload_id.as_str(),
        )
        .await
        {
            warn!(
                ?abort_error,
                recording_id = %recording_id,
                segment_id = %segment_id,
                "live-center multipart metadata attach failed and abort cleanup also failed"
            );
        }
        let _ =
            recording_segments::mark_segment_upload_failed(&state.pool, recording_id, segment_id)
                .await;
        return Err(error);
    }

    Ok(Json(LiveCenterUploadCreateResponse {
        recording_id,
        segment_id,
        bucket,
        object_key,
        upload_strategy: "multipart".to_string(),
        upload_url: None,
        method: "MULTIPART".to_string(),
        expires_at: multipart.expires_at,
        headers: Default::default(),
        upload_id: Some(multipart.upload_id),
        part_size_bytes: Some(multipart.part_size_bytes),
        parts: multipart
            .parts
            .into_iter()
            .map(to_upload_part_url)
            .collect(),
        completed_parts: Vec::new(),
    }))
}

async fn build_existing_recording_upload_response(
    state: &AppState,
    normalized: &NormalizedLiveCenterUploadCreate,
    use_multipart: bool,
    existing: LiveCenterExistingUploadSegment,
) -> AppResult<LiveCenterUploadCreateResponse> {
    if existing.upload_status != "uploading" {
        return Err(AppError::Conflict(
            "该录屏分段已存在且当前不可恢复，请刷新直播详情后重新选择分段序号".to_string(),
        ));
    }

    if existing.file_name != normalized.file_name
        || existing.file_size_bytes != normalized.file_size_bytes
    {
        return Err(AppError::Conflict(
            "该录屏分段已有未完成上传，且文件信息与本次选择不一致，请刷新直播详情后重新选择分段序号".to_string(),
        ));
    }

    let bucket = state.settings.tos_bucket.clone();
    if !use_multipart {
        let upload = uploads::build_upload_url(
            state.settings.as_ref(),
            existing.raw_object_key.as_str(),
            normalized.content_type.as_str(),
        )?;
        return Ok(LiveCenterUploadCreateResponse {
            recording_id: existing.recording_id,
            segment_id: existing.segment_id,
            bucket,
            object_key: existing.raw_object_key,
            upload_strategy: "single_put".to_string(),
            upload_url: Some(upload.url),
            method: "PUT".to_string(),
            expires_at: upload.expires_at,
            headers: upload.headers,
            upload_id: None,
            part_size_bytes: None,
            parts: Vec::new(),
            completed_parts: Vec::new(),
        });
    }

    let file_size_bytes = normalized
        .file_size_bytes
        .ok_or_else(|| AppError::bad_request("录屏分片上传缺少文件大小"))?;
    let upload_id = existing.multipart_upload_id.as_deref().ok_or_else(|| {
        AppError::Conflict(
            "该录屏分段已有未完成上传但缺少可恢复 uploadId，请刷新直播详情后重试".to_string(),
        )
    })?;
    let part_size_bytes = existing.multipart_part_size_bytes.ok_or_else(|| {
        AppError::Conflict(
            "该录屏分段已有未完成上传但缺少分片大小，请刷新直播详情后重试".to_string(),
        )
    })?;
    let multipart = uploads::build_existing_multipart_upload_urls_with_part_size(
        state.settings.as_ref(),
        existing.raw_object_key.as_str(),
        upload_id,
        file_size_bytes,
        part_size_bytes,
    )?;
    let completed_parts = uploads::list_multipart_uploaded_parts(
        &state.http_client,
        state.settings.as_ref(),
        existing.raw_object_key.as_str(),
        upload_id,
    )
    .await?;

    Ok(LiveCenterUploadCreateResponse {
        recording_id: existing.recording_id,
        segment_id: existing.segment_id,
        bucket,
        object_key: existing.raw_object_key,
        upload_strategy: "multipart".to_string(),
        upload_url: None,
        method: "MULTIPART".to_string(),
        expires_at: multipart.expires_at,
        headers: Default::default(),
        upload_id: Some(multipart.upload_id),
        part_size_bytes: Some(multipart.part_size_bytes),
        parts: multipart
            .parts
            .into_iter()
            .map(to_upload_part_url)
            .collect(),
        completed_parts: completed_parts
            .into_iter()
            .map(to_completed_upload_part_response)
            .collect(),
    })
}

async fn resume_segment_multipart_upload(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Path((recording_id, segment_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<LiveCenterMultipartResumeRequest>,
) -> AppResult<Json<LiveCenterMultipartResumeResponse>> {
    let normalized = normalize_multipart_resume(payload)?;
    let segment = recording_segments::get_segment_for_upload_completion(
        &state.pool,
        recording_id,
        segment_id,
    )
    .await?;

    if segment.upload_status != "uploading" {
        return Err(AppError::bad_request("该录屏分段当前不可恢复上传"));
    }
    if segment.session_key != normalized.session_id {
        return Err(AppError::bad_request("录屏分片上传恢复场次不匹配"));
    }
    let expected_size_bytes = segment
        .file_size_bytes
        .ok_or_else(|| AppError::bad_request("录屏分片上传恢复缺少已登记文件大小"))?;
    if expected_size_bytes != normalized.file_size_bytes {
        return Err(AppError::bad_request("录屏分片上传恢复文件大小不匹配"));
    }
    let expected_upload_id = segment
        .multipart_upload_id
        .as_deref()
        .ok_or_else(|| AppError::bad_request("录屏分段缺少可恢复的 uploadId"))?;
    if expected_upload_id != normalized.upload_id {
        return Err(AppError::bad_request("录屏分片上传恢复 uploadId 不匹配"));
    }
    let part_size_bytes = segment
        .multipart_part_size_bytes
        .ok_or_else(|| AppError::bad_request("录屏分段缺少可恢复的分片大小"))?;

    let upload = uploads::build_existing_multipart_upload_urls_with_part_size(
        state.settings.as_ref(),
        segment.raw_object_key.as_str(),
        normalized.upload_id.as_str(),
        normalized.file_size_bytes,
        part_size_bytes,
    )?;
    let completed_parts = uploads::list_multipart_uploaded_parts(
        &state.http_client,
        state.settings.as_ref(),
        segment.raw_object_key.as_str(),
        normalized.upload_id.as_str(),
    )
    .await?;

    Ok(Json(LiveCenterMultipartResumeResponse {
        recording_id,
        segment_id,
        bucket: state.settings.tos_bucket.clone(),
        object_key: segment.raw_object_key,
        upload_strategy: "multipart".to_string(),
        upload_id: normalized.upload_id,
        part_size_bytes: upload.part_size_bytes,
        expires_at: upload.expires_at,
        parts: upload.parts.into_iter().map(to_upload_part_url).collect(),
        completed_parts: completed_parts
            .into_iter()
            .map(to_completed_upload_part_response)
            .collect(),
    }))
}

async fn complete_segment_upload(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Path((recording_id, segment_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<LiveCenterUploadCompleteRequest>,
) -> AppResult<Json<super::types::LiveCenterRecordingSegment>> {
    let normalized = normalize_upload_complete(payload)?;
    let segment = recording_segments::get_segment_for_upload_completion(
        &state.pool,
        recording_id,
        segment_id,
    )
    .await?;
    if segment.upload_status == "deleted" {
        return Err(AppError::NotFound);
    }
    if let Some(upload_id) = normalized.multipart_upload_id.as_deref() {
        let expected_upload_id = segment
            .multipart_upload_id
            .as_deref()
            .ok_or_else(|| AppError::bad_request("分片上传完成缺少服务端 uploadId 记录"))?;
        if expected_upload_id != upload_id {
            return Err(AppError::bad_request("分片上传完成 uploadId 不匹配"));
        }
        let parts = normalized
            .multipart_parts
            .iter()
            .map(|part| uploads::CompletedMultipartUploadPart {
                part_number: part.part_number,
                etag: part.etag.clone(),
            })
            .collect::<Vec<_>>();
        uploads::complete_multipart_upload(
            &state.http_client,
            state.settings.as_ref(),
            segment.raw_object_key.as_str(),
            upload_id,
            parts.as_slice(),
        )
        .await?;
    }
    let expected_size_bytes = normalized
        .file_size_bytes
        .or(segment.file_size_bytes)
        .ok_or_else(|| AppError::bad_request("录屏上传完成缺少文件大小"))?;
    uploads::verify_object_size(
        &state.http_client,
        state.settings.as_ref(),
        segment.raw_object_key.as_str(),
        expected_size_bytes,
    )
    .await?;
    repository::complete_segment_upload(&state.pool, recording_id, segment_id, &normalized)
        .await
        .map(Json)
}

async fn create_segment_playback_url(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Path((recording_id, segment_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<LiveCenterPlaybackUrlResponse>> {
    let segment =
        recording_segments::get_segment_for_playback(&state.pool, recording_id, segment_id).await?;
    if segment.upload_status != "uploaded" {
        return Err(AppError::bad_request("该录屏分段尚未完成上传，暂不可播放"));
    }
    if segment.raw_object_key.trim().is_empty() {
        return Err(AppError::bad_request("该录屏分段缺少可播放对象路径"));
    }
    let (url, expires_at) =
        uploads::build_playback_url(state.settings.as_ref(), segment.raw_object_key.as_str())?;

    Ok(Json(LiveCenterPlaybackUrlResponse {
        url,
        variant: "raw".to_string(),
        expires_at,
        provider: "tos_signed_url".to_string(),
        content_type: segment
            .mime_type
            .unwrap_or_else(|| "application/octet-stream".to_string()),
        file_size_bytes: segment.file_size_bytes,
    }))
}

async fn cleanup_recording_segment(
    State(state): State<Arc<AppState>>,
    _current_user: CurrentUser,
    Path((recording_id, segment_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<LiveCenterRecordingSegmentCleanupResponse>> {
    let segment =
        recording_segments::get_segment_for_cleanup(&state.pool, recording_id, segment_id).await?;
    if segment.upload_status == "uploaded" {
        return Err(AppError::bad_request(
            "已上传完成的录屏暂不支持清理，请先确认影响范围。",
        ));
    }

    if let Some(upload_id) = segment.multipart_upload_id.as_deref() {
        if let Err(error) = uploads::abort_multipart_upload(
            &state.http_client,
            state.settings.as_ref(),
            segment.raw_object_key.as_str(),
            upload_id,
        )
        .await
        {
            warn!(
                ?error,
                recording_id = %recording_id,
                segment_id = %segment_id,
                "live-center manual segment cleanup multipart abort failed; continuing with object delete"
            );
        }
    }
    if !segment.raw_object_key.trim().is_empty() {
        storage_objects::delete_object(
            &state.http_client,
            state.settings.as_ref(),
            segment.raw_object_key.as_str(),
        )
        .await?;
    }
    recording_segments::mark_segment_deleted(&state.pool, recording_id, segment_id).await?;

    Ok(Json(LiveCenterRecordingSegmentCleanupResponse {
        recording_id,
        segment_id,
        upload_status: "deleted".to_string(),
        processing_status: "skipped".to_string(),
    }))
}

fn to_upload_part_url(part: uploads::PresignedUploadPartUrl) -> LiveCenterUploadPartUrl {
    LiveCenterUploadPartUrl {
        part_number: part.part_number,
        start_byte: part.start_byte,
        end_byte_exclusive: part.end_byte_exclusive,
        upload_url: part.url,
        method: "PUT".to_string(),
        expires_at: part.expires_at,
        headers: part.headers,
    }
}

fn to_completed_upload_part_response(
    part: uploads::CompletedMultipartUploadPart,
) -> LiveCenterUploadCompletePartResponse {
    LiveCenterUploadCompletePartResponse {
        part_number: part.part_number,
        etag: part.etag,
    }
}

fn parse_rfc3339_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.with_timezone(&Utc))
}

async fn create_analysis_job(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(session_id): Path<String>,
    Json(payload): Json<LiveCenterAnalysisCreateRequest>,
) -> AppResult<Json<super::types::LiveCenterAnalysisJob>> {
    let session_id = normalize_session_id(session_id.as_str())?;
    let normalized = normalize_analysis_create(payload)?;
    repository::create_analysis_job(
        &state.pool,
        session_id.as_str(),
        &normalized,
        current_user.user_id.as_str(),
    )
    .await
    .map(Json)
}
