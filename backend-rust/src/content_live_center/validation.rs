use std::collections::BTreeSet;

use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

use super::types::{
    LiveCenterAnalysisCreateRequest, LiveCenterMultipartResumeRequest, LiveCenterSessionQuery,
    LiveCenterUploadCompleteRequest, LiveCenterUploadCreateRequest,
    NormalizedLiveCenterAnalysisCreate, NormalizedLiveCenterMultipartResume,
    NormalizedLiveCenterSessionQuery, NormalizedLiveCenterUploadComplete,
    NormalizedLiveCenterUploadCompletePart, NormalizedLiveCenterUploadCreate,
};

const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;
const DEFAULT_LIVE_CENTER_ANALYSIS_PROMPT_VERSION: &str = "v4.4-coverage-aware-review";

pub(super) fn normalize_session_id(raw: &str) -> AppResult<String> {
    let normalized = raw.trim().to_lowercase();
    if normalized.len() != 32 || !normalized.chars().all(|char| char.is_ascii_hexdigit()) {
        return Err(AppError::bad_request("直播场次 ID 不合法"));
    }
    Ok(normalized)
}

pub(super) fn normalize_query(
    query: LiveCenterSessionQuery,
) -> AppResult<NormalizedLiveCenterSessionQuery> {
    let start_date = normalize_optional_date(query.start_date, "startDate")?;
    let end_date = normalize_optional_date(query.end_date, "endDate")?;
    if let (Some(start_date), Some(end_date)) = (start_date, end_date) {
        if start_date > end_date {
            return Err(AppError::bad_request("startDate 不能晚于 endDate"));
        }
    }

    Ok(NormalizedLiveCenterSessionQuery {
        keyword: normalize_optional_text(query.keyword, 120),
        shop_id: normalize_optional_text(query.shop_id, 80),
        anchor_douyin_id: normalize_optional_text(query.anchor_douyin_id, 120),
        start_date,
        end_date,
        page: query.page.unwrap_or(1).clamp(1, 10_000),
        page_size: query
            .page_size
            .unwrap_or(DEFAULT_PAGE_SIZE)
            .clamp(1, MAX_PAGE_SIZE),
    })
}

pub(super) fn normalize_upload_create(
    payload: LiveCenterUploadCreateRequest,
) -> AppResult<NormalizedLiveCenterUploadCreate> {
    let file_name = normalize_required_text(Some(payload.file_name), 240, "文件名不能为空")?;
    let file_ext = infer_video_file_ext(&file_name, payload.content_type.as_deref())?;
    let content_type = normalize_upload_content_type(payload.content_type, &file_ext)?;
    let segment_index = payload.segment_index.unwrap_or(1);
    if segment_index <= 0 || segment_index > 999 {
        return Err(AppError::bad_request("分段序号必须在 1 到 999 之间"));
    }

    Ok(NormalizedLiveCenterUploadCreate {
        file_name,
        content_type,
        file_size_bytes: normalize_optional_file_size(payload.file_size_bytes)?,
        sha256: normalize_optional_sha256(payload.sha256)?,
        segment_index,
        file_ext,
    })
}

pub(super) fn normalize_upload_complete(
    payload: LiveCenterUploadCompleteRequest,
) -> AppResult<NormalizedLiveCenterUploadComplete> {
    if let Some(duration_seconds) = payload.duration_seconds {
        if duration_seconds < 0.0 {
            return Err(AppError::bad_request("视频时长不能为负数"));
        }
    }

    let multipart_upload_id = normalize_optional_text(payload.multipart_upload_id, 512);
    let multipart_parts = normalize_multipart_parts(payload.multipart_parts)?;
    if !multipart_parts.is_empty() && multipart_upload_id.is_none() {
        return Err(AppError::bad_request("分片上传完成缺少 uploadId"));
    }

    Ok(NormalizedLiveCenterUploadComplete {
        file_size_bytes: normalize_optional_file_size(payload.file_size_bytes)?,
        sha256: normalize_optional_sha256(payload.sha256)?,
        duration_seconds: payload.duration_seconds,
        multipart_upload_id,
        multipart_parts,
    })
}

pub(super) fn normalize_multipart_resume(
    payload: LiveCenterMultipartResumeRequest,
) -> AppResult<NormalizedLiveCenterMultipartResume> {
    let session_id = normalize_session_id(payload.session_id.as_str())?;
    let upload_id =
        normalize_required_text(Some(payload.upload_id), 512, "分片上传恢复缺少 uploadId")?;
    let Some(file_size_bytes) = normalize_optional_file_size(Some(payload.file_size_bytes))? else {
        return Err(AppError::bad_request("分片上传恢复缺少文件大小"));
    };

    Ok(NormalizedLiveCenterMultipartResume {
        session_id,
        upload_id,
        file_size_bytes,
    })
}

pub(super) fn normalize_analysis_create(
    payload: LiveCenterAnalysisCreateRequest,
) -> AppResult<NormalizedLiveCenterAnalysisCreate> {
    let analysis_profile =
        normalize_optional_text(payload.analysis_profile, 40).unwrap_or_else(|| "auto".to_string());
    let analysis_profile = analysis_profile.to_ascii_lowercase();
    let analysis_profile = match analysis_profile.as_str() {
        "auto" | "l1_text" | "l2_multimodal" => analysis_profile,
        _ => {
            return Err(AppError::bad_request(
                "analysisProfile 仅支持 auto / l1_text / l2_multimodal",
            ))
        }
    };

    Ok(NormalizedLiveCenterAnalysisCreate {
        model: normalize_optional_text(payload.model, 80)
            .unwrap_or_else(|| "douyin-live-recording-v4".to_string()),
        analysis_profile,
        prompt_version: DEFAULT_LIVE_CENTER_ANALYSIS_PROMPT_VERSION.to_string(),
    })
}

fn normalize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .map(|item| {
            if item.chars().count() > max_len {
                item.chars().take(max_len).collect()
            } else {
                item
            }
        })
}

fn normalize_required_text(
    value: Option<String>,
    max_len: usize,
    error_message: &str,
) -> AppResult<String> {
    normalize_optional_text(value, max_len).ok_or_else(|| AppError::bad_request(error_message))
}

fn normalize_optional_date(value: Option<String>, label: &str) -> AppResult<Option<NaiveDate>> {
    let Some(value) = normalize_optional_text(value, 20) else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(value.as_str(), "%Y-%m-%d")
        .map(Some)
        .map_err(|_| AppError::bad_request(format!("{label} 必须使用 YYYY-MM-DD 格式")))
}

fn normalize_optional_sha256(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = normalize_optional_text(value, 80) else {
        return Ok(None);
    };
    let normalized = value.to_lowercase();
    if normalized.len() != 64 || !normalized.chars().all(|char| char.is_ascii_hexdigit()) {
        return Err(AppError::bad_request("文件 SHA-256 格式不合法"));
    }
    Ok(Some(normalized))
}

fn normalize_optional_file_size(value: Option<i64>) -> AppResult<Option<i64>> {
    match value {
        Some(size) if size <= 0 => Err(AppError::bad_request("文件大小必须大于 0")),
        Some(size) => Ok(Some(size)),
        None => Ok(None),
    }
}

fn normalize_multipart_parts(
    value: Option<Vec<super::types::LiveCenterUploadCompletePartRequest>>,
) -> AppResult<Vec<NormalizedLiveCenterUploadCompletePart>> {
    let Some(parts) = value else {
        return Ok(Vec::new());
    };
    if parts.is_empty() || parts.len() > 10_000 {
        return Err(AppError::bad_request("分片上传完成参数不合法"));
    }

    let mut seen = BTreeSet::new();
    let mut normalized = Vec::with_capacity(parts.len());
    for part in parts {
        if part.part_number <= 0 || part.part_number > 10_000 || !seen.insert(part.part_number) {
            return Err(AppError::bad_request("分片序号不合法"));
        }
        let etag = normalize_required_text(Some(part.etag), 256, "分片 ETag 不能为空")?;
        normalized.push(NormalizedLiveCenterUploadCompletePart {
            part_number: part.part_number,
            etag,
        });
    }
    normalized.sort_by_key(|part| part.part_number);
    Ok(normalized)
}

fn infer_video_file_ext(file_name: &str, content_type: Option<&str>) -> AppResult<String> {
    if let Some((_, ext)) = file_name.rsplit_once('.') {
        let normalized = ext.trim().to_lowercase();
        if is_supported_video_ext(normalized.as_str()) {
            return Ok(normalized);
        }
        if !normalized.is_empty() {
            return Err(AppError::bad_request(
                "仅支持 mp4 / mov / m4v / webm / avi / mkv 视频源文件",
            ));
        }
    }

    let inferred = match content_type
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .as_str()
    {
        "video/quicktime" => "mov",
        "video/x-m4v" => "m4v",
        "video/webm" => "webm",
        "video/x-msvideo" => "avi",
        "video/x-matroska" => "mkv",
        "video/mp4" | "application/octet-stream" | "" => "mp4",
        _ => return Err(AppError::bad_request("直播录屏上传必须是视频文件")),
    };
    Ok(inferred.to_string())
}

fn normalize_upload_content_type(value: Option<String>, file_ext: &str) -> AppResult<String> {
    let content_type = normalize_optional_text(value, 120).unwrap_or_else(|| match file_ext {
        "mov" => "video/quicktime".to_string(),
        "m4v" => "video/x-m4v".to_string(),
        "webm" => "video/webm".to_string(),
        "avi" => "video/x-msvideo".to_string(),
        "mkv" => "video/x-matroska".to_string(),
        _ => "video/mp4".to_string(),
    });
    let lower = content_type.to_lowercase();
    if lower.starts_with("video/") || lower == "application/octet-stream" {
        Ok(content_type)
    } else {
        Err(AppError::bad_request("直播录屏上传必须是视频文件"))
    }
}

fn is_supported_video_ext(ext: &str) -> bool {
    matches!(ext, "mp4" | "mov" | "m4v" | "webm" | "avi" | "mkv")
}
