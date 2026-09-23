use std::{sync::Arc, time::Duration};

use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE},
    redirect::Policy,
    Client, Url,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::{
    asset_mutations::{create_manual_upload_asset, ManualUploadActor},
    delivery::{build_upload_url, PresignedUploadUrl},
    douyin_video_link::{
        is_qianchuan_material_video_url, preview_video_links, VideoLinkPreviewCandidate,
        VideoLinkSourceType,
    },
    douyin_video_source::resolve_douyin_remote_video_source,
    handler_support::{build_raw_object_key, duplicate_asset_conflict, with_detail_delivery_urls},
    identity_mutations::create_platform_video,
    mutation_types::{
        ContentAssetPlatformVideoCreateRequest, ContentAssetUploadCreateRequest,
        ContentAssetVideoLinkImportRequest, NormalizedContentAssetUploadComplete,
    },
    permissions::{ensure_content_asset_owner_option, ensure_content_asset_upload_permission},
    prefect_trigger::spawn_processing_job_prefect_trigger,
    processing_mutations::complete_manual_upload_asset,
    repository::query_duplicate_asset_by_sha256,
    repository_detail::query_asset_detail,
    types::{
        ContentAssetVideoLinkDownloadAttemptResponse, ContentAssetVideoLinkImportResponse,
        ContentAssetVideoLinkNextActionResponse,
    },
    upload_verification::verify_raw_upload_sha256,
    validation::{normalize_platform_video_create, normalize_upload_create},
};

const VIDEO_LINK_IMPORT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AIOSContentAssetImporter/1.0";
const VIDEO_LINK_IMPORT_TIMEOUT_SECONDS: u64 = 30;
const MAX_REMOTE_VIDEO_BYTES: u64 = 300 * 1024 * 1024;
const DOUYIN_AWAITING_MANUAL_UPLOAD_REASON: &str = "douyin_risk_control_or_restricted";
const DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE: &str =
    "当前抖音链接无法直接下载原视频，可能是作品访问受限或抖音接口风控。";
const DOUYIN_MANUAL_UPLOAD_FALLBACK_MESSAGES: [&str; 2] = [
    "当前抖音链接无法直接下载原视频，可能是作品访问受限或抖音接口风控。请改用本地视频上传，上传后再绑定抖音视频 ID。",
    "当前抖音链接无法直接下载原视频，可能是作品访问受限或抖音接口风控。请上传本地视频文件，上传完成后系统会自动绑定该抖音视频 ID。",
];

struct RemoteVideoDownload {
    bytes: Vec<u8>,
    size_bytes: i64,
    sha256: String,
    content_type: String,
}

struct ResolvedVideoLinkImportSource {
    source_type: VideoLinkSourceType,
    download_url: Url,
    download_headers: Vec<(String, String)>,
    content_type_hint: Option<String>,
    default_title: Option<String>,
    file_name_prefix: String,
    source_label: &'static str,
}

pub(super) async fn import_content_asset_from_video_link(
    state: &Arc<AppState>,
    current_user: &CurrentUser,
    payload: ContentAssetVideoLinkImportRequest,
) -> AppResult<ContentAssetVideoLinkImportResponse> {
    ensure_content_asset_upload_permission(current_user)?;

    let candidates = tokio::time::timeout(
        Duration::from_secs(10),
        preview_video_links(payload.input.as_str()),
    )
    .await
    .map_err(|_| AppError::bad_request("视频链接解析超时，请稍后重试或手动填写素材ID"))??;
    let candidate = select_video_link_import_candidate(candidates, payload.candidate_index)?;
    let import_source = match resolve_video_link_import_source(&candidate).await {
        Ok(import_source) => import_source,
        Err(error) if can_defer_douyin_candidate_to_manual_upload(&candidate) => {
            return Ok(build_awaiting_manual_upload_response(&candidate, error));
        }
        Err(error) => return Err(error),
    };
    let remote_video = match download_remote_video(&import_source).await {
        Ok(remote_video) => remote_video,
        Err(error) if can_defer_douyin_candidate_to_manual_upload(&candidate) => {
            return Ok(build_awaiting_manual_upload_response(&candidate, error));
        }
        Err(error) => return Err(error),
    };
    if let Some(duplicate) =
        query_duplicate_asset_by_sha256(&state.pool, remote_video.sha256.as_str(), None).await?
    {
        return Err(duplicate_asset_conflict(&duplicate));
    }

    let asset_id = Uuid::new_v4();
    let file_name = infer_video_link_file_name(
        &candidate,
        &import_source,
        asset_id,
        remote_video.content_type.as_str(),
    );
    let normalized = normalize_upload_create(ContentAssetUploadCreateRequest {
        file_name,
        content_type: Some(remote_video.content_type.clone()),
        file_size_bytes: Some(remote_video.size_bytes),
        title: payload
            .title
            .clone()
            .or_else(|| infer_video_link_title(&candidate, &payload, &import_source)),
        platform: payload
            .platform
            .clone()
            .or_else(|| Some("douyin".to_string())),
        platform_names: Some(ensure_douyin_platform_names(payload.platform_names.clone())),
        product_name: payload.product_name.clone(),
        product_names: payload.product_names.clone(),
        sku_names: payload.sku_names.clone(),
        creator_name: payload.creator_name.clone(),
        video_type: payload.video_type.clone(),
        content_scene: payload.content_scene.clone(),
        content_scene_group: payload.content_scene_group.clone(),
        content_scene_subtype: payload.content_scene_subtype.clone(),
        owner_name: payload.owner_name.clone(),
        owner_user_id: payload.owner_user_id.clone(),
        raw_sha256: Some(remote_video.sha256.clone()),
        tags: payload.tags.clone(),
        notes: payload.notes.clone(),
    })?;
    ensure_content_asset_owner_option(&state.pool, normalized.owner_user_id.as_deref()).await?;

    let object_key = build_raw_object_key(asset_id, &normalized.file_ext);
    let upload = build_upload_url(&state.settings, &object_key, &normalized.content_type)?;
    create_manual_upload_asset(
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

    upload_downloaded_video_to_tos(&state.http_client, &upload, remote_video.bytes).await?;
    let verified = verify_raw_upload_sha256(
        &state.pool,
        &state.http_client,
        state.settings.as_ref(),
        asset_id,
        Some(remote_video.sha256.as_str()),
    )
    .await?;
    if let Some(duplicate) =
        query_duplicate_asset_by_sha256(&state.pool, verified.sha256.as_str(), Some(asset_id))
            .await?
    {
        return Err(duplicate_asset_conflict(&duplicate));
    }

    let queued_jobs = complete_manual_upload_asset(
        &state.pool,
        asset_id,
        NormalizedContentAssetUploadComplete {
            file_size_bytes: Some(verified.size_bytes),
            raw_sha256: Some(verified.sha256.clone()),
        },
        current_user.username.as_deref(),
    )
    .await?;

    if let Some(platform_video_payload) = build_platform_video_payload(&payload, &candidate) {
        let normalized_platform_video = normalize_platform_video_create(platform_video_payload)?;
        create_platform_video(
            &state.pool,
            asset_id,
            normalized_platform_video,
            current_user.username.as_deref(),
        )
        .await?;
    }

    for job in queued_jobs {
        spawn_processing_job_prefect_trigger(
            Arc::clone(state),
            asset_id,
            job.job_id,
            job.job_type.as_str(),
        );
    }

    Ok(ContentAssetVideoLinkImportResponse::Imported {
        detail: Box::new(with_detail_delivery_urls(
            query_asset_detail(&state.pool, asset_id).await?,
            state.settings.as_ref(),
            current_user,
        )),
    })
}

fn can_defer_douyin_candidate_to_manual_upload(candidate: &VideoLinkPreviewCandidate) -> bool {
    candidate.source_type == VideoLinkSourceType::DouyinVideo
        && candidate
            .external_video_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
}

fn build_awaiting_manual_upload_response(
    candidate: &VideoLinkPreviewCandidate,
    error: AppError,
) -> ContentAssetVideoLinkImportResponse {
    let external_video_id = candidate
        .external_video_id
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_string();
    let message = normalize_douyin_download_failure_detail(error.detail().as_str()).map_or_else(
        || DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE.to_string(),
        |failure_detail| {
            format!(
                "{} 自动下载失败：{}",
                DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE, failure_detail
            )
        },
    );
    ContentAssetVideoLinkImportResponse::AwaitingManualUpload {
        platform: "douyin".to_string(),
        external_video_id,
        source_url: candidate.source_url.clone(),
        resolved_url: candidate.resolved_url.clone(),
        can_bind_after_upload: true,
        download_attempt: Box::new(ContentAssetVideoLinkDownloadAttemptResponse {
            status: "failed".to_string(),
            reason: DOUYIN_AWAITING_MANUAL_UPLOAD_REASON.to_string(),
            message,
        }),
        next_action: ContentAssetVideoLinkNextActionResponse {
            action_type: "manual_upload".to_string(),
            label: "上传本地视频并绑定抖音视频 ID".to_string(),
        },
    }
}

fn normalize_douyin_download_failure_detail(failure_detail: &str) -> Option<String> {
    let mut detail = failure_detail.trim().to_string();
    if detail.is_empty() {
        return None;
    }
    for fallback_message in DOUYIN_MANUAL_UPLOAD_FALLBACK_MESSAGES {
        detail = detail.replace(fallback_message, "");
    }
    detail = detail.replace("；；", "；").replace("。。", "。");
    let detail = detail
        .trim()
        .trim_matches('；')
        .trim_matches(';')
        .trim_matches('。')
        .trim()
        .to_string();
    if detail.is_empty() || detail == DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE.trim_end_matches('。')
    {
        return None;
    }
    let has_sentence_ending = detail.ends_with('。')
        || detail.ends_with('！')
        || detail.ends_with('!')
        || detail.ends_with('？')
        || detail.ends_with('?');
    Some(if has_sentence_ending {
        detail
    } else {
        format!("{detail}。")
    })
}

fn select_video_link_import_candidate(
    candidates: Vec<VideoLinkPreviewCandidate>,
    candidate_index: Option<usize>,
) -> AppResult<VideoLinkPreviewCandidate> {
    let candidate = match candidate_index {
        Some(index) => candidates
            .get(index)
            .cloned()
            .ok_or_else(|| AppError::bad_request("选择的视频链接已失效，请重新解析后再导入"))?,
        None if candidates.len() == 1 => candidates
            .into_iter()
            .next()
            .ok_or_else(|| AppError::bad_request("未识别到支持的视频链接"))?,
        None => {
            return Err(AppError::bad_request(
                "识别到多个视频链接，请先选择一个视频链接再导入",
            ))
        }
    };
    Ok(candidate)
}

async fn resolve_video_link_import_source(
    candidate: &VideoLinkPreviewCandidate,
) -> AppResult<ResolvedVideoLinkImportSource> {
    match candidate.source_type {
        VideoLinkSourceType::QianchuanMaterialVideo => {
            let source_url = Url::parse(candidate.resolved_url.as_str())
                .map_err(|_| AppError::bad_request("千川视频链接不合法，无法导入"))?;
            ensure_importable_qianchuan_video_url(&source_url)?;
            Ok(ResolvedVideoLinkImportSource {
                source_type: VideoLinkSourceType::QianchuanMaterialVideo,
                download_url: source_url,
                download_headers: vec![
                    (
                        "User-Agent".to_string(),
                        VIDEO_LINK_IMPORT_USER_AGENT.to_string(),
                    ),
                    (
                        "Accept".to_string(),
                        "video/*,application/octet-stream;q=0.9,*/*;q=0.1".to_string(),
                    ),
                ],
                content_type_hint: Some("video/mp4".to_string()),
                default_title: None,
                file_name_prefix: candidate
                    .external_item_id
                    .as_ref()
                    .map(|material_id| format!("qianchuan-material-{material_id}"))
                    .unwrap_or_else(|| "qianchuan-video".to_string()),
                source_label: "千川视频",
            })
        }
        VideoLinkSourceType::DouyinVideo => {
            let external_video_id = candidate
                .external_video_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::bad_request("抖音链接未解析到视频 ID，无法下载原视频"))?;
            let source = resolve_douyin_remote_video_source(external_video_id).await?;
            Ok(ResolvedVideoLinkImportSource {
                source_type: VideoLinkSourceType::DouyinVideo,
                download_url: source.download_url,
                download_headers: source.download_headers,
                content_type_hint: source.content_type_hint,
                default_title: source.title,
                file_name_prefix: format!("douyin-video-{}", source.aweme_id),
                source_label: "抖音原视频",
            })
        }
    }
}

fn ensure_importable_qianchuan_video_url(url: &Url) -> AppResult<()> {
    if is_qianchuan_material_video_url(url) {
        Ok(())
    } else {
        Err(AppError::bad_request(
            "当前仅支持 allowlist 内的千川素材视频直链导入",
        ))
    }
}

async fn download_remote_video(
    source: &ResolvedVideoLinkImportSource,
) -> AppResult<RemoteVideoDownload> {
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(VIDEO_LINK_IMPORT_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| AppError::Internal)?;
    let mut request = client.get(source.download_url.clone());
    for (key, value) in &source.download_headers {
        request = request.header(key.as_str(), value.as_str());
    }
    let mut response = request.send().await.map_err(|_| {
        AppError::bad_request(format!(
            "{}下载失败，请确认链接未过期且作品可访问后重试",
            source.source_label
        ))
    })?;

    if response.status().is_redirection() {
        return Err(AppError::bad_request(format!(
            "{}下载地址发生跳转，当前为安全起见不自动跟随跳转，请重新解析链接后重试",
            source.source_label
        )));
    }
    if !response.status().is_success() {
        return Err(AppError::bad_request(format!(
            "{}下载失败（HTTP {}），请确认链接未过期且作品可访问后重试",
            source.source_label,
            response.status().as_u16()
        )));
    }

    let content_type = normalize_remote_video_content_type(
        &source.download_url,
        response.headers().get(CONTENT_TYPE),
        source.content_type_hint.as_deref(),
        source.source_label,
    )?;
    if let Some(content_length) = parse_content_length(response.headers().get(CONTENT_LENGTH))? {
        if content_length > MAX_REMOTE_VIDEO_BYTES {
            return Err(AppError::bad_request(format!(
                "{}文件超过导入上限（最大 {}MB）",
                source.source_label,
                MAX_REMOTE_VIDEO_BYTES / 1024 / 1024
            )));
        }
    }

    let mut bytes = Vec::new();
    let mut hasher = Sha256::new();
    let mut size_bytes: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| AppError::bad_request(format!("{}下载中断，请重试", source.source_label)))?
    {
        size_bytes = size_bytes.saturating_add(chunk.len() as u64);
        if size_bytes > MAX_REMOTE_VIDEO_BYTES {
            return Err(AppError::bad_request(format!(
                "{}文件超过导入上限（最大 {}MB）",
                source.source_label,
                MAX_REMOTE_VIDEO_BYTES / 1024 / 1024
            )));
        }
        hasher.update(&chunk);
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err(AppError::bad_request(format!(
            "{}链接返回空文件，无法导入",
            source.source_label
        )));
    }

    Ok(RemoteVideoDownload {
        bytes,
        size_bytes: size_bytes as i64,
        sha256: format!("{:x}", hasher.finalize()),
        content_type,
    })
}

fn normalize_remote_video_content_type(
    url: &Url,
    content_type: Option<&reqwest::header::HeaderValue>,
    content_type_hint: Option<&str>,
    source_label: &str,
) -> AppResult<String> {
    let normalized = content_type
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase);
    if let Some(content_type) = normalized {
        if content_type.starts_with("video/") || content_type == "application/octet-stream" {
            return Ok(content_type);
        }
        let has_video_query_hint = url.query_pairs().any(|(key, value)| {
            key.eq_ignore_ascii_case("mime_type") && value.eq_ignore_ascii_case("video_mp4")
        });
        if !has_video_query_hint {
            return Err(AppError::bad_request(format!(
                "{}链接返回的内容不是视频文件",
                source_label
            )));
        }
    }
    Ok(content_type_hint.unwrap_or("video/mp4").to_string())
}

fn parse_content_length(value: Option<&reqwest::header::HeaderValue>) -> AppResult<Option<u64>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value
        .to_str()
        .map_err(|_| AppError::bad_request("千川视频文件大小响应头不合法"))?;
    value
        .parse::<u64>()
        .map(Some)
        .map_err(|_| AppError::bad_request("千川视频文件大小响应头不合法"))
}

async fn upload_downloaded_video_to_tos(
    http_client: &Client,
    upload: &PresignedUploadUrl,
    bytes: Vec<u8>,
) -> AppResult<()> {
    let mut request = http_client.put(upload.url.as_str()).body(bytes);
    for (key, value) in &upload.headers {
        request = request.header(key, value);
    }
    let response = request
        .send()
        .await
        .map_err(|_| AppError::bad_request("上传远程视频到 TOS 失败，请稍后重试"))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    let detail = detail.trim();
    if detail.is_empty() {
        return Err(AppError::bad_request(format!(
            "上传远程视频到 TOS 失败（HTTP {}）",
            status.as_u16()
        )));
    }
    Err(AppError::bad_request(format!(
        "上传远程视频到 TOS 失败（HTTP {}）：{}",
        status.as_u16(),
        detail.chars().take(120).collect::<String>()
    )))
}

fn build_platform_video_payload(
    payload: &ContentAssetVideoLinkImportRequest,
    candidate: &VideoLinkPreviewCandidate,
) -> Option<ContentAssetPlatformVideoCreateRequest> {
    let external_video_id = payload
        .external_video_id
        .clone()
        .or_else(|| candidate.external_video_id.clone())
        .filter(|value| !value.trim().is_empty());
    let external_item_id = payload
        .external_item_id
        .clone()
        .or_else(|| candidate.external_item_id.clone())
        .filter(|value| !value.trim().is_empty());
    let external_note_id = payload
        .external_note_id
        .clone()
        .filter(|value| !value.trim().is_empty());
    if external_video_id.is_none() && external_item_id.is_none() && external_note_id.is_none() {
        return None;
    }
    Some(ContentAssetPlatformVideoCreateRequest {
        platform: resolve_platform_for_identity(payload),
        account_id: None,
        account_name: payload.creator_name.clone(),
        advertiser_id: None,
        external_video_id,
        external_item_id,
        external_note_id,
        external_url: Some(candidate.resolved_url.clone()),
        publish_title: payload.title.clone(),
        publish_status: Some("unknown".to_string()),
    })
}

fn resolve_platform_for_identity(payload: &ContentAssetVideoLinkImportRequest) -> String {
    payload
        .platform
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .or_else(|| {
            payload.platform_names.as_ref().and_then(|values| {
                values
                    .iter()
                    .find(|value| !value.trim().is_empty())
                    .cloned()
            })
        })
        .unwrap_or_else(|| "douyin".to_string())
}

fn ensure_douyin_platform_names(values: Option<Vec<String>>) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values.unwrap_or_default() {
        let item = value.trim();
        if item.is_empty() {
            continue;
        }
        if normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(item))
        {
            continue;
        }
        normalized.push(item.to_string());
        if normalized.len() >= 10 {
            break;
        }
    }
    if !normalized.iter().any(|value| {
        let value = value.trim().to_ascii_lowercase();
        value == "douyin" || value == "抖音"
    }) {
        normalized.insert(0, "douyin".to_string());
        normalized.truncate(10);
    }
    normalized
}

fn infer_video_link_title(
    candidate: &VideoLinkPreviewCandidate,
    payload: &ContentAssetVideoLinkImportRequest,
    import_source: &ResolvedVideoLinkImportSource,
) -> Option<String> {
    if let Some(title) = import_source.default_title.clone() {
        return Some(title);
    }
    match candidate.source_type {
        VideoLinkSourceType::QianchuanMaterialVideo => payload
            .external_item_id
            .as_ref()
            .or(candidate.external_item_id.as_ref())
            .map(|material_id| format!("千川素材视频 {material_id}")),
        VideoLinkSourceType::DouyinVideo => candidate
            .external_video_id
            .as_ref()
            .map(|video_id| format!("抖音视频 {video_id}")),
    }
}

fn infer_video_link_file_name(
    candidate: &VideoLinkPreviewCandidate,
    import_source: &ResolvedVideoLinkImportSource,
    asset_id: Uuid,
    content_type: &str,
) -> String {
    let ext = match content_type {
        "video/quicktime" => "mov",
        "video/webm" => "webm",
        "video/x-msvideo" => "avi",
        "video/x-matroska" => "mkv",
        "video/x-m4v" => "m4v",
        _ => "mp4",
    };
    if candidate.source_type == VideoLinkSourceType::QianchuanMaterialVideo {
        if let Ok(url) = Url::parse(candidate.resolved_url.as_str()) {
            if let Some(segment) = url
                .path_segments()
                .and_then(|mut segments| segments.next_back())
                .map(str::trim)
                .filter(|segment| !segment.is_empty())
                .filter(|segment| segment.contains('.'))
            {
                return segment.to_string();
            }
        }
    }
    if import_source.source_type == VideoLinkSourceType::DouyinVideo {
        return format!("{}.{}", import_source.file_name_prefix, ext);
    }
    if let Ok(url) = Url::parse(candidate.resolved_url.as_str()) {
        if let Some(segment) = url
            .path_segments()
            .and_then(|mut segments| segments.next_back())
            .map(str::trim)
            .filter(|segment| !segment.is_empty())
            .filter(|segment| segment.contains('.'))
        {
            return segment.to_string();
        }
    }
    if let Some(material_id) = candidate.external_item_id.as_deref() {
        return format!("qianchuan-material-{material_id}.{ext}");
    }
    format!("qianchuan-video-{asset_id}.{ext}")
}

#[cfg(test)]
mod tests {
    use reqwest::header::HeaderValue;

    use super::*;

    fn qianchuan_candidate(external_item_id: Option<&str>) -> VideoLinkPreviewCandidate {
        VideoLinkPreviewCandidate {
            source_type: VideoLinkSourceType::QianchuanMaterialVideo,
            source_url:
                "https://v6-adadmin.oceanengine.com/video/tos/cn/test.mp4?mime_type=video_mp4"
                    .to_string(),
            resolved_url:
                "https://v6-adadmin.oceanengine.com/video/tos/cn/test.mp4?mime_type=video_mp4"
                    .to_string(),
            external_video_id: None,
            external_item_id: external_item_id.map(str::to_string),
        }
    }

    fn douyin_candidate(external_video_id: &str) -> VideoLinkPreviewCandidate {
        VideoLinkPreviewCandidate {
            source_type: VideoLinkSourceType::DouyinVideo,
            source_url: format!("https://www.douyin.com/video/{external_video_id}"),
            resolved_url: format!("https://www.douyin.com/video/{external_video_id}"),
            external_video_id: Some(external_video_id.to_string()),
            external_item_id: None,
        }
    }

    #[test]
    fn selects_single_qianchuan_candidate_for_import() {
        let candidate = select_video_link_import_candidate(vec![qianchuan_candidate(None)], None)
            .expect("single Qianchuan candidate should import");

        assert_eq!(
            candidate.source_type,
            VideoLinkSourceType::QianchuanMaterialVideo
        );
    }

    #[test]
    fn selects_single_douyin_candidate_for_import() {
        let candidate =
            select_video_link_import_candidate(vec![douyin_candidate("7649697971252261370")], None)
                .expect("single Douyin candidate should import");

        assert_eq!(candidate.source_type, VideoLinkSourceType::DouyinVideo);
        assert_eq!(
            candidate.external_video_id.as_deref(),
            Some("7649697971252261370")
        );
    }

    #[test]
    fn requires_explicit_candidate_index_when_multiple_links_exist() {
        let error = select_video_link_import_candidate(
            vec![
                qianchuan_candidate(Some("7650741360182509595")),
                qianchuan_candidate(None),
            ],
            None,
        )
        .expect_err("multiple candidates should require selection");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn accepts_video_content_type() {
        let url =
            Url::parse("https://v6-adadmin.oceanengine.com/video/tos/cn/test?mime_type=video_mp4")
                .expect("test url parses");
        let content_type = HeaderValue::from_static("video/mp4; charset=utf-8");

        let normalized =
            normalize_remote_video_content_type(&url, Some(&content_type), None, "千川视频")
                .expect("video response content type should normalize");

        assert_eq!(normalized, "video/mp4");
    }

    #[test]
    fn rejects_non_video_content_without_video_query_hint() {
        let url = Url::parse("https://v6-adadmin.oceanengine.com/video/tos/cn/test")
            .expect("test url parses");
        let content_type = HeaderValue::from_static("text/html");

        let error =
            normalize_remote_video_content_type(&url, Some(&content_type), None, "千川视频")
                .expect_err("non-video response should reject");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn keeps_query_hint_as_mp4_when_response_content_type_is_missing() {
        let url =
            Url::parse("https://v6-adadmin.oceanengine.com/video/tos/cn/test?mime_type=video_mp4")
                .expect("test url parses");

        let normalized =
            normalize_remote_video_content_type(&url, None, Some("video/mp4"), "千川视频")
                .expect("missing response content type should fall back to video/mp4");

        assert_eq!(normalized, "video/mp4");
    }

    #[test]
    fn rejects_non_video_content_even_when_hint_exists_without_video_query_hint() {
        let url =
            Url::parse("https://v26-web.douyinvod.com/video/source").expect("test url parses");
        let content_type = HeaderValue::from_static("text/html");

        let error = normalize_remote_video_content_type(
            &url,
            Some(&content_type),
            Some("video/mp4"),
            "抖音原视频",
        )
        .expect_err("non-video response should reject without a URL video hint");

        assert!(matches!(error, AppError::BadRequest(_)));
    }

    #[test]
    fn builds_platform_video_payload_from_douyin_candidate_video_id() {
        let payload = ContentAssetVideoLinkImportRequest {
            input: "https://www.douyin.com/video/7649697971252261370".to_string(),
            candidate_index: None,
            title: None,
            platform: None,
            platform_names: None,
            product_name: None,
            product_names: None,
            sku_names: None,
            creator_name: None,
            video_type: None,
            content_scene: None,
            content_scene_group: None,
            content_scene_subtype: None,
            owner_name: None,
            owner_user_id: None,
            external_video_id: None,
            external_item_id: None,
            external_note_id: None,
            tags: None,
            notes: None,
        };

        let platform_video =
            build_platform_video_payload(&payload, &douyin_candidate("7649697971252261370"))
                .expect("Douyin candidate should create identity payload");

        assert_eq!(
            platform_video.external_video_id.as_deref(),
            Some("7649697971252261370")
        );
        assert_eq!(platform_video.platform, "douyin");
    }

    #[test]
    fn builds_awaiting_manual_upload_response_for_douyin_download_failure() {
        let candidate = douyin_candidate("7655200558651573888");

        let response = build_awaiting_manual_upload_response(
            &candidate,
            AppError::bad_request("抖音视频详情获取失败"),
        );

        let ContentAssetVideoLinkImportResponse::AwaitingManualUpload {
            platform,
            external_video_id,
            source_url,
            resolved_url,
            can_bind_after_upload,
            download_attempt,
            next_action,
        } = response
        else {
            panic!("Douyin fallback should return awaiting manual upload");
        };

        assert_eq!(platform, "douyin");
        assert_eq!(external_video_id, "7655200558651573888");
        assert_eq!(
            source_url,
            "https://www.douyin.com/video/7655200558651573888"
        );
        assert_eq!(
            resolved_url,
            "https://www.douyin.com/video/7655200558651573888"
        );
        assert!(can_bind_after_upload);
        assert_eq!(download_attempt.status, "failed");
        assert_eq!(
            download_attempt.reason,
            DOUYIN_AWAITING_MANUAL_UPLOAD_REASON
        );
        assert!(download_attempt
            .message
            .contains(DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE));
        assert!(download_attempt.message.contains("抖音视频详情获取失败"));
        assert_eq!(next_action.action_type, "manual_upload");
    }

    #[test]
    fn strips_repeated_manual_upload_message_from_douyin_download_failure() {
        let candidate = douyin_candidate("7655200558651573888");

        let response = build_awaiting_manual_upload_response(
            &candidate,
            AppError::bad_request(
                "当前抖音链接无法直接下载原视频，可能是作品访问受限或抖音接口风控。请改用本地视频上传，上传后再绑定抖音视频 ID。",
            ),
        );

        let ContentAssetVideoLinkImportResponse::AwaitingManualUpload {
            download_attempt, ..
        } = response
        else {
            panic!("Douyin fallback should return awaiting manual upload");
        };

        assert_eq!(
            download_attempt.message,
            DOUYIN_DIRECT_DOWNLOAD_FAILURE_MESSAGE
        );
    }

    #[test]
    fn infers_douyin_file_name_from_aweme_id() {
        let candidate = douyin_candidate("7649697971252261370");
        let import_source = ResolvedVideoLinkImportSource {
            source_type: VideoLinkSourceType::DouyinVideo,
            download_url: Url::parse("https://v26-web.douyinvod.com/video/source").unwrap(),
            download_headers: Vec::new(),
            content_type_hint: Some("video/mp4".to_string()),
            default_title: None,
            file_name_prefix: "douyin-video-7649697971252261370".to_string(),
            source_label: "抖音原视频",
        };

        let file_name =
            infer_video_link_file_name(&candidate, &import_source, Uuid::nil(), "video/mp4");

        assert_eq!(file_name, "douyin-video-7649697971252261370.mp4");
    }

    #[test]
    fn enforces_import_host_and_video_shape() {
        let url =
            Url::parse("https://v6-adadmin.oceanengine.com/video/tos/cn/test?mime_type=video_mp4")
                .expect("test url parses");

        assert!(ensure_importable_qianchuan_video_url(&url).is_ok());
    }
}
