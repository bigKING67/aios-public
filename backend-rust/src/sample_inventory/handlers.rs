use std::sync::Arc;

use axum::{
    body::Body,
    extract::{
        multipart::{MultipartError, MultipartRejection},
        DefaultBodyLimit, Multipart, Path, Query, State,
    },
    middleware,
    response::Response,
    routing::{get, patch, post},
    Json, Router,
};
use tracing::warn;

use crate::{
    config::SampleInventoryAccessMode,
    error::{AppError, AppResult},
    state::AppState,
    xlsx::{validate_xlsx_upload_metadata, xlsx_response},
};

use super::{
    access::{enforce_sample_inventory_access, SampleInventoryActor},
    repository, service,
    types::{
        ArchiveSampleInventorySampleRequest, BatchArchiveSampleInventoryOutboundRequest,
        BatchArchiveSampleInventorySamplesRequest, BatchEditSampleInventoryOutboundRequest,
        BatchTransitionSampleInventoryOutboundRequest,
        BatchUpdateSampleInventoryOutboundTrackingRequest, BatchVoidSampleInventoryInboundsRequest,
        CreateSampleInventoryInboundBatchRequest, CreateSampleInventoryInboundRequest,
        CreateSampleInventoryOutboundBatchRequest, CreateSampleInventoryOutboundRequest,
        CreateSampleInventorySampleRequest, ImportSampleInventoryInboundsRequest,
        ImportSampleInventorySamplesRequest, InboundListQuery, OutboundListQuery,
        ParseSampleInventoryBackupRequest, RestoreSampleInventoryBackupRequest,
        SampleInventoryAccessPolicyResponse, SampleInventoryAdjustmentRequest,
        SampleInventoryBackupPlanResponse, SampleInventoryBackupRestoreResponse,
        SampleInventoryBatchMutationResponse, SampleInventoryInboundBatchMutationResponse,
        SampleInventoryInboundBatchResponse, SampleInventoryInboundItem,
        SampleInventoryInboundListResponse, SampleInventoryInboundXlsxParseResponse,
        SampleInventoryOutboundBatchResponse, SampleInventoryOutboundItem,
        SampleInventoryOutboundListResponse, SampleInventorySampleBatchMutationResponse,
        SampleInventorySampleImportResponse, SampleInventorySampleItem,
        SampleInventorySampleListResponse, SampleInventorySampleXlsxParseResponse,
        SampleInventorySettingsResponse, SampleInventorySummary, SampleListQuery,
        TransitionSampleInventoryOutboundRequest, UpdateSampleInventoryOutboundRequest,
        UpdateSampleInventoryOutboundTrackingRequest, UpdateSampleInventorySampleRequest,
        UpdateSampleInventorySettingsRequest, VoidSampleInventoryInboundRequest,
    },
    validation,
    xlsx::{
        build_inbound_export, build_inbound_template, build_outbound_export, build_sample_export,
        build_sample_template, parse_inbound_xlsx, parse_sample_xlsx, XLSX_BODY_LIMIT_BYTES,
    },
};

pub(crate) fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let domain_routes = Router::new()
        .route("/summary", get(get_summary))
        .route("/settings", get(get_settings).patch(update_settings))
        .route("/samples", get(list_samples).post(create_sample))
        .route("/samples/template.xlsx", get(download_sample_template))
        .route(
            "/samples/parse-xlsx",
            post(parse_sample_xlsx_upload).layer(DefaultBodyLimit::max(XLSX_BODY_LIMIT_BYTES)),
        )
        .route("/samples/import", post(import_samples))
        .route("/samples/export.xlsx", get(export_samples))
        .route("/samples/{sample_id}", patch(update_sample))
        .route("/samples/{sample_id}/archive", post(archive_sample))
        .route("/samples/batch-archive", post(batch_archive_samples))
        .route("/samples/{sample_id}/adjustments", post(adjust_sample))
        .route("/inbound-records", get(list_inbounds).post(create_inbound))
        .route("/inbound-records/batch", post(create_inbound_batch))
        .route(
            "/inbound-records/template.xlsx",
            get(download_inbound_template),
        )
        .route(
            "/inbound-records/parse-xlsx",
            post(parse_inbound_xlsx_upload).layer(DefaultBodyLimit::max(XLSX_BODY_LIMIT_BYTES)),
        )
        .route("/inbound-records/import", post(import_inbounds))
        .route("/inbound-records/export.xlsx", get(export_inbounds))
        .route("/inbound-records/{inbound_id}/void", post(void_inbound))
        .route("/inbound-records/batch-void", post(batch_void_inbounds))
        .route(
            "/outbound-requests",
            get(list_outbounds).post(create_outbound),
        )
        .route("/outbound-requests/batch", post(create_outbound_batch))
        .route("/outbound-requests/batch-edit", post(batch_edit_outbounds))
        .route(
            "/outbound-requests/batch-transition",
            post(batch_transition_outbounds),
        )
        .route(
            "/outbound-requests/batch-archive",
            post(batch_archive_outbounds),
        )
        .route("/outbound-requests/export.xlsx", get(export_outbounds))
        .route("/outbound-requests/{request_id}", patch(update_outbound))
        .route(
            "/outbound-requests/{request_id}/tracking",
            patch(update_outbound_tracking),
        )
        .route(
            "/outbound-requests/batch-tracking",
            patch(batch_update_outbound_tracking),
        )
        .route(
            "/outbound-requests/{request_id}/transition",
            post(transition_outbound),
        )
        .route("/backup.json", get(download_backup))
        .route(
            "/backup/parse",
            post(parse_backup).layer(DefaultBodyLimit::max(service::BACKUP_BODY_LIMIT_BYTES)),
        )
        .route(
            "/backup/restore",
            post(restore_backup).layer(DefaultBodyLimit::max(service::BACKUP_BODY_LIMIT_BYTES)),
        )
        .layer(middleware::from_fn_with_state(
            state,
            enforce_sample_inventory_access,
        ));

    Router::new()
        .route("/access-policy", get(get_access_policy))
        .merge(domain_routes)
}

async fn get_access_policy(
    State(state): State<Arc<AppState>>,
) -> Json<SampleInventoryAccessPolicyResponse> {
    let is_public =
        state.settings.sample_inventory_access_mode == SampleInventoryAccessMode::Public;
    Json(SampleInventoryAccessPolicyResponse {
        mode: state
            .settings
            .sample_inventory_access_mode
            .as_str()
            .to_string(),
        anonymous_read: is_public,
        anonymous_write: is_public,
    })
}

async fn get_settings(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Json<SampleInventorySettingsResponse>> {
    Ok(Json(repository::get_settings(&state.pool).await?))
}

async fn get_summary(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Json<SampleInventorySummary>> {
    Ok(Json(repository::get_summary(&state.pool).await?))
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<UpdateSampleInventorySettingsRequest>,
) -> AppResult<Json<SampleInventorySettingsResponse>> {
    Ok(Json(
        service::update_settings(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn list_samples(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
    Query(query): Query<SampleListQuery>,
) -> AppResult<Json<SampleInventorySampleListResponse>> {
    let query = validation::normalize_sample_query(query)?;
    Ok(Json(repository::list_samples(&state.pool, &query).await?))
}

async fn create_sample(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<CreateSampleInventorySampleRequest>,
) -> AppResult<Json<SampleInventorySampleItem>> {
    let input = validation::normalize_sample_create(input)?;
    Ok(Json(
        service::create_sample(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn update_sample(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(sample_id): Path<i64>,
    Json(input): Json<UpdateSampleInventorySampleRequest>,
) -> AppResult<Json<SampleInventorySampleItem>> {
    let input = validation::normalize_sample_update(input)?;
    Ok(Json(
        service::update_sample(&state.pool, sample_id, input, actor.actor_user_id()).await?,
    ))
}

async fn archive_sample(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(sample_id): Path<i64>,
    Json(input): Json<ArchiveSampleInventorySampleRequest>,
) -> AppResult<Json<SampleInventorySampleItem>> {
    Ok(Json(
        service::archive_sample(&state.pool, sample_id, input, actor.actor_user_id()).await?,
    ))
}

async fn batch_archive_samples(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<BatchArchiveSampleInventorySamplesRequest>,
) -> AppResult<Json<SampleInventorySampleBatchMutationResponse>> {
    validation::validate_version_targets(&input.items)?;
    Ok(Json(
        service::archive_sample_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn adjust_sample(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(sample_id): Path<i64>,
    Json(input): Json<SampleInventoryAdjustmentRequest>,
) -> AppResult<Json<SampleInventorySampleItem>> {
    Ok(Json(
        service::adjust_sample(&state.pool, sample_id, input, actor.actor_user_id()).await?,
    ))
}

async fn list_inbounds(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
    Query(query): Query<InboundListQuery>,
) -> AppResult<Json<SampleInventoryInboundListResponse>> {
    let query = validation::normalize_inbound_query(query)?;
    Ok(Json(repository::list_inbounds(&state.pool, &query).await?))
}

async fn create_inbound(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<CreateSampleInventoryInboundRequest>,
) -> AppResult<Json<SampleInventoryInboundItem>> {
    let input = validation::normalize_inbound_create(input)?;
    Ok(Json(
        service::create_inbound(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn create_inbound_batch(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(mut input): Json<CreateSampleInventoryInboundBatchRequest>,
) -> AppResult<Json<SampleInventoryInboundBatchResponse>> {
    input.items = input
        .items
        .into_iter()
        .map(validation::normalize_inbound_item)
        .collect::<AppResult<Vec<_>>>()?;
    Ok(Json(
        service::create_inbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn void_inbound(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(inbound_id): Path<i64>,
    Json(input): Json<VoidSampleInventoryInboundRequest>,
) -> AppResult<Json<SampleInventoryInboundItem>> {
    Ok(Json(
        service::void_inbound(&state.pool, inbound_id, input, actor.actor_user_id()).await?,
    ))
}

async fn batch_void_inbounds(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<BatchVoidSampleInventoryInboundsRequest>,
) -> AppResult<Json<SampleInventoryInboundBatchMutationResponse>> {
    validation::validate_version_targets(&input.items)?;
    Ok(Json(
        service::void_inbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn list_outbounds(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
    Query(query): Query<OutboundListQuery>,
) -> AppResult<Json<SampleInventoryOutboundListResponse>> {
    let query = validation::normalize_outbound_query(query)?;
    Ok(Json(repository::list_outbounds(&state.pool, &query).await?))
}

async fn create_outbound(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<CreateSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryOutboundItem>> {
    let input = validation::normalize_outbound_create(input)?;
    Ok(Json(
        service::create_outbound(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn create_outbound_batch(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(mut input): Json<CreateSampleInventoryOutboundBatchRequest>,
) -> AppResult<Json<SampleInventoryOutboundBatchResponse>> {
    if input.items.is_empty() || input.items.len() > 100 {
        return Err(AppError::bad_request("批量出库数量必须在1到100之间"));
    }
    input.items = input
        .items
        .into_iter()
        .map(validation::normalize_outbound_item)
        .collect::<AppResult<Vec<_>>>()?;
    let mut sample_ids = std::collections::HashSet::with_capacity(input.items.len());
    if input
        .items
        .iter()
        .any(|item| !sample_ids.insert(item.sample_id))
    {
        return Err(AppError::bad_request("批量出库不能重复选择同一个样品"));
    }
    Ok(Json(
        service::create_outbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn update_outbound(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(request_id): Path<i64>,
    Json(input): Json<UpdateSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryOutboundItem>> {
    let input = validation::normalize_outbound_update(input)?;
    Ok(Json(
        service::update_outbound(&state.pool, request_id, input, actor.actor_user_id()).await?,
    ))
}

async fn update_outbound_tracking(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(request_id): Path<i64>,
    Json(mut input): Json<UpdateSampleInventoryOutboundTrackingRequest>,
) -> AppResult<Json<SampleInventoryOutboundItem>> {
    if request_id <= 0 || input.expected_version <= 0 {
        return Err(AppError::bad_request("出库记录或expectedVersion无效"));
    }
    input.tracking_number = validation::normalize_tracking_number(input.tracking_number)?;
    Ok(Json(
        service::update_outbound_tracking(&state.pool, request_id, input, actor.actor_user_id())
            .await?,
    ))
}

async fn batch_update_outbound_tracking(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(mut input): Json<BatchUpdateSampleInventoryOutboundTrackingRequest>,
) -> AppResult<Json<SampleInventoryBatchMutationResponse>> {
    validation::validate_batch_tracking_updates(&mut input.items)?;
    Ok(Json(
        service::update_outbound_tracking_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn transition_outbound(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Path(request_id): Path<i64>,
    Json(input): Json<TransitionSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryOutboundItem>> {
    let target_status = validation::normalize_status(&input.target_status)?;
    Ok(Json(
        service::transition_outbound(
            &state.pool,
            request_id,
            input,
            &target_status,
            actor.actor_user_id(),
        )
        .await?,
    ))
}

async fn batch_transition_outbounds(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(mut input): Json<BatchTransitionSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryBatchMutationResponse>> {
    validation::validate_version_targets(&input.items)?;
    input.target_status = validation::normalize_status(&input.target_status)?;
    Ok(Json(
        service::transition_outbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn batch_edit_outbounds(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(mut input): Json<BatchEditSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryBatchMutationResponse>> {
    validation::validate_batch_edits(&mut input.items)?;
    Ok(Json(
        service::edit_outbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn batch_archive_outbounds(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<BatchArchiveSampleInventoryOutboundRequest>,
) -> AppResult<Json<SampleInventoryBatchMutationResponse>> {
    validation::validate_version_targets(&input.items)?;
    Ok(Json(
        service::archive_outbound_batch(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn read_xlsx_upload(multipart: Result<Multipart, MultipartRejection>) -> AppResult<Vec<u8>> {
    let mut multipart = multipart.map_err(|error| {
        warn!(?error, "reject sample inventory xlsx multipart request");
        AppError::bad_request("XLSX 上传请求格式无效")
    })?;
    while let Some(field) = multipart.next_field().await.map_err(map_multipart_error)? {
        if field.name() != Some("file") {
            continue;
        }
        validate_xlsx_upload_metadata(field.file_name(), field.content_type())?;
        return field
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(map_multipart_error);
    }
    Err(AppError::bad_request("缺少名为file的XLSX上传字段"))
}

fn map_multipart_error(error_value: MultipartError) -> AppError {
    warn!(error = ?error_value, "read sample inventory xlsx upload failed");
    AppError::bad_request("XLSX 上传内容读取失败")
}

async fn download_sample_template(_actor: SampleInventoryActor) -> AppResult<Response> {
    Ok(xlsx_response(
        "sample_inventory_template.xlsx",
        build_sample_template()?,
    ))
}

async fn parse_sample_xlsx_upload(
    _actor: SampleInventoryActor,
    multipart: Result<Multipart, MultipartRejection>,
) -> AppResult<Json<SampleInventorySampleXlsxParseResponse>> {
    Ok(Json(parse_sample_xlsx(
        &read_xlsx_upload(multipart).await?,
    )?))
}

async fn import_samples(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<ImportSampleInventorySamplesRequest>,
) -> AppResult<Json<SampleInventorySampleImportResponse>> {
    let input = ImportSampleInventorySamplesRequest {
        submission_key: input.submission_key,
        rows: validation::validate_sample_import_rows(input.rows)?,
    };
    Ok(Json(
        service::import_sample_rows(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn export_samples(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Response> {
    let items = repository::export_samples(&state.pool).await?;
    Ok(xlsx_response(
        "sample_inventory_samples.xlsx",
        build_sample_export(&items)?,
    ))
}

async fn download_inbound_template(_actor: SampleInventoryActor) -> AppResult<Response> {
    Ok(xlsx_response(
        "sample_inventory_inbound_template.xlsx",
        build_inbound_template()?,
    ))
}

async fn parse_inbound_xlsx_upload(
    _actor: SampleInventoryActor,
    multipart: Result<Multipart, MultipartRejection>,
) -> AppResult<Json<SampleInventoryInboundXlsxParseResponse>> {
    Ok(Json(parse_inbound_xlsx(
        &read_xlsx_upload(multipart).await?,
    )?))
}

async fn import_inbounds(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<ImportSampleInventoryInboundsRequest>,
) -> AppResult<Json<SampleInventoryInboundBatchResponse>> {
    let input = ImportSampleInventoryInboundsRequest {
        submission_key: input.submission_key,
        rows: validation::validate_inbound_import_rows(input.rows)?,
    };
    Ok(Json(
        service::import_inbound_rows(&state.pool, input, actor.actor_user_id()).await?,
    ))
}

async fn export_inbounds(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Response> {
    let items = repository::export_inbounds(&state.pool).await?;
    Ok(xlsx_response(
        "sample_inventory_inbounds.xlsx",
        build_inbound_export(&items)?,
    ))
}

async fn export_outbounds(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Response> {
    let items = repository::export_outbounds(&state.pool).await?;
    Ok(xlsx_response(
        "sample_inventory_outbounds.xlsx",
        build_outbound_export(&items)?,
    ))
}

async fn download_backup(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
) -> AppResult<Response> {
    let backup = service::export_backup(&state.pool).await?;
    let body = serde_json::to_vec_pretty(&backup).map_err(|_| AppError::Internal)?;
    Response::builder()
        .header("content-type", "application/json; charset=utf-8")
        .header(
            "content-disposition",
            "attachment; filename=sample_inventory_backup.json",
        )
        .body(Body::from(body))
        .map_err(|_| AppError::Internal)
}

async fn parse_backup(
    State(state): State<Arc<AppState>>,
    _actor: SampleInventoryActor,
    Json(input): Json<ParseSampleInventoryBackupRequest>,
) -> AppResult<Json<SampleInventoryBackupPlanResponse>> {
    Ok(Json(service::parse_backup(&state.pool, input).await?))
}

async fn restore_backup(
    State(state): State<Arc<AppState>>,
    actor: SampleInventoryActor,
    Json(input): Json<RestoreSampleInventoryBackupRequest>,
) -> AppResult<Json<SampleInventoryBackupRestoreResponse>> {
    Ok(Json(
        service::restore_backup(&state.pool, input, actor.actor_user_id()).await?,
    ))
}
