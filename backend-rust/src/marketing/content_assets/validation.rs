use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

use super::text_normalization::{
    clean_platform_code, clean_required_ad_platform_code, clean_required_platform_code,
};
use super::validation_taxonomy::{
    normalize_content_scene_fields, normalize_content_scene_group, normalize_product_display_name,
    normalize_product_name, normalize_product_name_list, normalize_video_type,
};
use super::validation_text::{normalize_optional_text, normalize_required_text};
use super::{
    mutation_types::{
        ContentAssetAdMaterialCreateRequest, ContentAssetAiJobBackfillRequest,
        ContentAssetAnalysisJobCreateRequest, ContentAssetPlatformVideoCreateRequest,
        ContentAssetProfileUpdateRequest, ContentAssetTranscriptJobCreateRequest,
        ContentAssetUploadCompleteRequest, ContentAssetUploadCreateRequest,
        NormalizedContentAssetAdMaterialCreate, NormalizedContentAssetAiJobBackfill,
        NormalizedContentAssetAnalysisJobCreate, NormalizedContentAssetPlatformVideoCreate,
        NormalizedContentAssetProfileUpdate, NormalizedContentAssetTranscriptJobCreate,
        NormalizedContentAssetUploadComplete, NormalizedContentAssetUploadCreate,
    },
    types::{
        ContentAssetProcessingJobQuery, ContentAssetQuery, ContentAssetSort,
        ContentAssetUnmatchedStatsQuery, NormalizedContentAssetProcessingJobQuery,
        NormalizedContentAssetQuery, NormalizedContentAssetUnmatchedStatsQuery,
    },
};

const DEFAULT_PAGE_SIZE: i64 = 24;
const MAX_PAGE_SIZE: i64 = 100;
const MAX_PROCESSING_JOB_LIMIT: i64 = 100;
const MAX_UNMATCHED_STATS_LIMIT: i64 = 100;
const MAX_AI_BACKFILL_LIMIT: i64 = 500;

pub(super) fn normalize_query(query: ContentAssetQuery) -> AppResult<NormalizedContentAssetQuery> {
    Ok(NormalizedContentAssetQuery {
        keyword: normalize_optional_text(query.keyword, 120),
        platform: clean_platform_code(query.platform, 80),
        product_name: normalize_product_name(query.product_name),
        creator_name: normalize_optional_text(query.creator_name, 120),
        owner_user_id: normalize_optional_text(query.owner_user_id, 120),
        video_type: normalize_video_type(query.video_type),
        content_scene: normalize_optional_text(query.content_scene, 120),
        content_scene_group: normalize_content_scene_group(query.content_scene_group),
        content_scene_subtype: normalize_optional_text(query.content_scene_subtype, 120),
        tags: normalize_query_tags(query.tag, query.tags),
        asset_status: normalize_optional_text(query.asset_status, 40),
        lifecycle_status: normalize_optional_text(query.lifecycle_status, 40),
        external_only: normalize_optional_bool(query.external_only)?,
        todo: normalize_todo_filter(query.todo)?,
        page: query.page.unwrap_or(1).clamp(1, 10_000),
        page_size: query
            .page_size
            .unwrap_or(DEFAULT_PAGE_SIZE)
            .clamp(1, MAX_PAGE_SIZE),
        sort: normalize_sort(query.sort),
    })
}

fn normalize_todo_filter(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = normalize_optional_text(value, 48) else {
        return Ok(None);
    };
    normalize_enum(
        Some(value),
        &[
            "missing_ai",
            "missing_transcript",
            "missing_platform_video",
            "missing_ad_material",
            "authorization_unknown",
            "repurpose_unknown",
        ],
        "内容待办筛选不合法",
    )
    .map(Some)
}

pub(super) fn normalize_processing_job_query(
    query: ContentAssetProcessingJobQuery,
) -> AppResult<NormalizedContentAssetProcessingJobQuery> {
    let status = match normalize_optional_text(query.status, 40) {
        Some(value) => Some(normalize_enum(
            Some(value),
            &["queued", "running", "succeeded", "failed", "cancelled"],
            "处理任务状态不合法",
        )?),
        None => None,
    };
    let job_type = match normalize_optional_text(query.job_type, 40) {
        Some(value) => Some(normalize_enum(
            Some(value),
            &["preview", "cover", "frames", "transcript", "analysis"],
            "处理任务类型不合法",
        )?),
        None => None,
    };
    Ok(NormalizedContentAssetProcessingJobQuery {
        asset_id: query.asset_id,
        status,
        job_type,
        limit: query.limit.unwrap_or(50).clamp(1, MAX_PROCESSING_JOB_LIMIT),
    })
}

pub(super) fn normalize_unmatched_stats_query(
    query: ContentAssetUnmatchedStatsQuery,
) -> AppResult<NormalizedContentAssetUnmatchedStatsQuery> {
    let match_type = match normalize_optional_text(query.match_type, 40) {
        Some(value) => Some(normalize_enum(
            Some(value),
            &["ad_material", "platform_video"],
            "匹配类型必须是 ad_material / platform_video",
        )?),
        None => None,
    };
    Ok(NormalizedContentAssetUnmatchedStatsQuery {
        match_type,
        limit: query
            .limit
            .unwrap_or(50)
            .clamp(1, MAX_UNMATCHED_STATS_LIMIT),
    })
}

pub(super) fn normalize_ai_job_backfill(
    payload: ContentAssetAiJobBackfillRequest,
) -> AppResult<NormalizedContentAssetAiJobBackfill> {
    let limit = payload.limit.unwrap_or(100);
    if !(1..=MAX_AI_BACKFILL_LIMIT).contains(&limit) {
        return Err(AppError::bad_request("批量任务 limit 必须在 1 到 500 之间"));
    }
    let job_type = normalize_enum(
        Some(normalize_optional_text(Some(payload.job_type), 32).unwrap_or_default()),
        &["analysis", "transcript"],
        "批量任务类型必须是 analysis / transcript",
    )?;
    let source = normalize_optional_text(payload.source, 24).unwrap_or_else(|| "auto".to_string());
    let source = normalize_enum(
        Some(source),
        &["preview", "raw", "auto"],
        "批量任务来源必须是 preview / raw / auto",
    )?;
    let profile = match normalize_optional_text(payload.profile, 40) {
        Some(value) => Some(normalize_enum(
            Some(value),
            &["preview_fast", "raw_deep", "action_detail"],
            "AI 分析 profile 不合法",
        )?),
        None => None,
    };
    if job_type == "transcript" && profile.is_some() {
        return Err(AppError::bad_request("脚本/SRT 批量任务不支持 profile"));
    }
    Ok(NormalizedContentAssetAiJobBackfill {
        job_type,
        source,
        profile,
        limit,
    })
}

pub(super) fn normalize_import_mode(mode: Option<String>) -> AppResult<String> {
    let mode = normalize_optional_text(mode, 32).unwrap_or_else(|| "dry_run".to_string());
    let normalized = mode.replace('-', "_");
    match normalized.as_str() {
        "dry_run" | "sample_upload" | "full_upload" => Ok(normalized),
        _ => Err(AppError::bad_request(
            "导入模式必须是 dry_run / sample_upload / full_upload",
        )),
    }
}

pub(super) fn normalize_analysis_job_create(
    payload: ContentAssetAnalysisJobCreateRequest,
) -> AppResult<NormalizedContentAssetAnalysisJobCreate> {
    let source =
        normalize_optional_text(payload.source, 24).unwrap_or_else(|| "preview".to_string());
    Ok(NormalizedContentAssetAnalysisJobCreate {
        source: normalize_enum(
            Some(source),
            &["preview", "raw", "auto"],
            "AI 分析来源必须是 preview / raw / auto",
        )?,
        profile: match normalize_optional_text(payload.profile, 40) {
            Some(value) => Some(normalize_enum(
                Some(value),
                &["preview_fast", "raw_deep", "action_detail"],
                "AI 分析 profile 必须是 preview_fast / raw_deep / action_detail",
            )?),
            None => None,
        },
        force: payload.force.unwrap_or(false),
    })
}

pub(super) fn normalize_transcript_job_create(
    payload: ContentAssetTranscriptJobCreateRequest,
) -> AppResult<NormalizedContentAssetTranscriptJobCreate> {
    let source = normalize_optional_text(payload.source, 24).unwrap_or_else(|| "auto".to_string());
    Ok(NormalizedContentAssetTranscriptJobCreate {
        source: normalize_enum(
            Some(source),
            &["raw", "preview", "auto"],
            "脚本抽取来源必须是 raw / preview / auto",
        )?,
        force: payload.force.unwrap_or(false),
    })
}

pub(super) fn normalize_sheet_ids(values: Option<Vec<String>>) -> Vec<String> {
    values
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value), 40))
        .collect()
}

pub(super) fn normalize_profile_update(
    payload: ContentAssetProfileUpdateRequest,
) -> AppResult<NormalizedContentAssetProfileUpdate> {
    let product_names = normalize_product_name_list(payload.product_names);
    let sku_names = normalize_string_list(payload.sku_names, 120, 30);
    let product_name = normalize_product_display_name(payload.product_name, &product_names);
    let (platform, platform_names) =
        normalize_platform_fields(payload.platform, payload.platform_names);
    let video_type = normalize_video_type(payload.video_type);
    let (content_scene, content_scene_group, content_scene_subtype) =
        normalize_content_scene_fields(
            video_type.as_deref(),
            payload.content_scene,
            payload.content_scene_group,
            payload.content_scene_subtype,
        )?;
    Ok(NormalizedContentAssetProfileUpdate {
        title: normalize_required_text(Some(payload.title), 160, "标题不能为空")?,
        platform,
        platform_names,
        product_name,
        product_names,
        sku_names,
        creator_name: normalize_optional_text(payload.creator_name, 120),
        video_type,
        content_scene,
        content_scene_group,
        content_scene_subtype,
        owner_name: normalize_optional_text(payload.owner_name, 80),
        owner_user_id: normalize_optional_text(payload.owner_user_id, 120),
        tags: normalize_tags(payload.tags),
        notes: normalize_optional_text(payload.notes, 2000),
        profile_status: normalize_enum(
            Some(payload.profile_status),
            &[
                "incomplete",
                "basic_complete",
                "platform_bound",
                "performance_ready",
                "verified",
            ],
            "档案状态不合法",
        )?,
        lifecycle_status: normalize_enum(
            Some(payload.lifecycle_status),
            &[
                "draft",
                "waiting_analysis",
                "testable",
                "testing",
                "scaling",
                "repurpose",
                "rejected",
                "expired",
            ],
            "流转阶段不合法",
        )?,
        authorization_status: normalize_enum(
            Some(payload.authorization_status),
            &["unknown", "authorized", "pending", "expired", "restricted"],
            "授权状态不合法",
        )?,
        commercial_use_allowed: payload.commercial_use_allowed,
        repurpose_allowed: payload.repurpose_allowed,
        authorization_starts_at: normalize_optional_date(payload.authorization_starts_at)?,
        authorization_expires_at: normalize_optional_date(payload.authorization_expires_at)?,
        authorization_notes: normalize_optional_text(payload.authorization_notes, 1000),
    })
}

pub(super) fn normalize_upload_create(
    payload: ContentAssetUploadCreateRequest,
) -> AppResult<NormalizedContentAssetUploadCreate> {
    let file_name = normalize_required_text(Some(payload.file_name), 240, "文件名不能为空")?;
    let file_ext = infer_video_file_ext(&file_name)?;
    let content_type = normalize_upload_content_type(payload.content_type, &file_ext)?;
    let provided_title = normalize_optional_text(payload.title, 160);
    let (title, title_source) = match provided_title {
        Some(title) => (title, "upload".to_string()),
        None => (
            title_from_file_name(&file_name).unwrap_or_else(|| "未命名素材".to_string()),
            "file_name".to_string(),
        ),
    };
    let file_size_bytes = normalize_optional_file_size(payload.file_size_bytes)?;
    let tags = normalize_tags(payload.tags.unwrap_or_default());
    let tags_source = if tags.is_empty() {
        "empty".to_string()
    } else {
        "upload".to_string()
    };
    let product_names = normalize_product_name_list(payload.product_names);
    let sku_names = normalize_string_list(payload.sku_names, 120, 30);
    let product_name = normalize_product_display_name(payload.product_name, &product_names);
    let (platform, platform_names) =
        normalize_platform_fields(payload.platform, payload.platform_names);
    let video_type = normalize_video_type(payload.video_type);
    let (content_scene, content_scene_group, content_scene_subtype) =
        normalize_content_scene_fields(
            video_type.as_deref(),
            payload.content_scene,
            payload.content_scene_group,
            payload.content_scene_subtype,
        )?;
    Ok(NormalizedContentAssetUploadCreate {
        file_name,
        file_ext,
        content_type,
        file_size_bytes,
        title,
        title_source,
        platform,
        platform_names,
        product_name,
        product_names,
        sku_names,
        creator_name: normalize_optional_text(payload.creator_name, 120),
        video_type,
        content_scene,
        content_scene_group,
        content_scene_subtype,
        owner_name: normalize_optional_text(payload.owner_name, 80),
        owner_user_id: normalize_optional_text(payload.owner_user_id, 120),
        raw_sha256: normalize_optional_sha256(payload.raw_sha256)?,
        tags,
        tags_source,
        notes: normalize_optional_text(payload.notes, 2000),
    })
}

pub(super) fn normalize_upload_complete(
    payload: ContentAssetUploadCompleteRequest,
) -> AppResult<NormalizedContentAssetUploadComplete> {
    Ok(NormalizedContentAssetUploadComplete {
        file_size_bytes: normalize_optional_file_size(payload.file_size_bytes)?,
        raw_sha256: normalize_optional_sha256(payload.raw_sha256)?,
    })
}

fn normalize_string_list(
    values: Option<Vec<String>>,
    max_len: usize,
    max_count: usize,
) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values.unwrap_or_default() {
        let Some(item) = normalize_optional_text(Some(value), max_len) else {
            continue;
        };
        if normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&item))
        {
            continue;
        }
        normalized.push(item);
        if normalized.len() >= max_count {
            break;
        }
    }
    normalized
}

fn normalize_platform_fields(
    platform: Option<String>,
    platform_names: Option<Vec<String>>,
) -> (Option<String>, Vec<String>) {
    let primary_platform = clean_platform_code(platform, 80);
    let mut normalized = Vec::new();
    for value in platform_names.unwrap_or_default() {
        let Some(item) = clean_platform_code(Some(value), 80) else {
            continue;
        };
        if normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&item))
        {
            continue;
        }
        normalized.push(item);
        if normalized.len() >= 10 {
            break;
        }
    }
    if let Some(primary) = &primary_platform {
        if !normalized
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(primary))
        {
            normalized.insert(0, primary.clone());
            normalized.truncate(10);
        }
    }
    let platform = primary_platform.or_else(|| normalized.first().cloned());
    (platform, normalized)
}

fn normalize_optional_sha256(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = normalize_optional_text(value, 80) else {
        return Ok(None);
    };
    let normalized = value.to_lowercase();
    if normalized.len() != 64 || !normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(AppError::bad_request("文件 SHA-256 格式不合法"));
    }
    Ok(Some(normalized))
}

pub(super) fn normalize_platform_video_create(
    payload: ContentAssetPlatformVideoCreateRequest,
) -> AppResult<NormalizedContentAssetPlatformVideoCreate> {
    let normalized = NormalizedContentAssetPlatformVideoCreate {
        platform: clean_required_platform_code(Some(payload.platform), 80, "平台不能为空")?,
        account_id: normalize_optional_text(payload.account_id, 80),
        account_name: normalize_optional_text(payload.account_name, 120),
        advertiser_id: normalize_optional_text(payload.advertiser_id, 80),
        external_video_id: normalize_optional_text(payload.external_video_id, 160),
        external_item_id: normalize_optional_text(payload.external_item_id, 160),
        external_note_id: normalize_optional_text(payload.external_note_id, 160),
        external_url: normalize_optional_text(payload.external_url, 600),
        publish_title: normalize_optional_text(payload.publish_title, 240),
        publish_status: normalize_optional_text(payload.publish_status, 60)
            .unwrap_or_else(|| "unknown".to_string()),
    };
    if normalized.external_video_id.is_none()
        && normalized.external_item_id.is_none()
        && normalized.external_note_id.is_none()
    {
        return Err(AppError::bad_request(
            "平台视频身份至少需要填写 video_id / item_id / note_id 之一",
        ));
    }
    Ok(normalized)
}

pub(super) fn normalize_ad_material_create(
    payload: ContentAssetAdMaterialCreateRequest,
) -> AppResult<NormalizedContentAssetAdMaterialCreate> {
    Ok(NormalizedContentAssetAdMaterialCreate {
        platform_video_id: payload.platform_video_id,
        ad_platform: clean_required_ad_platform_code(
            Some(payload.ad_platform),
            80,
            "广告平台不能为空",
        )?,
        account_id: normalize_optional_text(payload.account_id, 80),
        account_name: normalize_optional_text(payload.account_name, 120),
        advertiser_id: normalize_optional_text(payload.advertiser_id, 80),
        external_material_id: normalize_required_text(
            Some(payload.external_material_id),
            180,
            "素材 ID 不能为空",
        )?,
        external_video_id: normalize_optional_text(payload.external_video_id, 160),
        material_name: normalize_optional_text(payload.material_name, 240),
        material_title: normalize_optional_text(payload.material_title, 240),
        material_status: normalize_optional_text(payload.material_status, 60)
            .unwrap_or_else(|| "unknown".to_string()),
    })
}

fn normalize_enum(
    value: Option<String>,
    allowed: &[&str],
    error_message: &str,
) -> AppResult<String> {
    let normalized = normalize_required_text(value, 80, error_message)?;
    if allowed.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::bad_request(error_message))
    }
}

fn normalize_tags(values: Vec<String>) -> Vec<String> {
    let mut tags = Vec::new();
    for value in values {
        if let Some(tag) = normalize_optional_text(Some(value), 40) {
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
        if tags.len() >= 20 {
            break;
        }
    }
    tags
}

fn normalize_query_tags(tag: Option<String>, tags: Option<String>) -> Vec<String> {
    let mut values = Vec::new();
    if let Some(tag) = tag {
        values.push(tag);
    }
    if let Some(tags) = tags {
        values.extend(
            tags.split([',', '，', '、', '/', ';', '；', '\n'])
                .map(str::to_string),
        );
    }
    normalize_tags(values)
}

fn infer_video_file_ext(file_name: &str) -> AppResult<String> {
    let ext = file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.trim().to_lowercase())
        .filter(|ext| !ext.is_empty())
        .ok_or_else(|| AppError::bad_request("视频文件必须包含扩展名"))?;
    match ext.as_str() {
        "mp4" | "mov" | "m4v" | "webm" | "avi" | "mkv" => Ok(ext),
        _ => Err(AppError::bad_request(
            "仅支持 mp4 / mov / m4v / webm / avi / mkv 视频源文件",
        )),
    }
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
        Err(AppError::bad_request("上传素材必须是视频文件"))
    }
}

fn normalize_optional_file_size(value: Option<i64>) -> AppResult<Option<i64>> {
    match value {
        Some(size) if size <= 0 => Err(AppError::bad_request("文件大小必须大于 0")),
        Some(size) => Ok(Some(size)),
        None => Ok(None),
    }
}

fn title_from_file_name(file_name: &str) -> Option<String> {
    let stem = file_name
        .rsplit_once('/')
        .map(|(_, value)| value)
        .unwrap_or(file_name)
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);
    normalize_optional_text(Some(stem.replace(['_', '-'], " ")), 160)
}

fn normalize_optional_date(value: Option<String>) -> AppResult<Option<NaiveDate>> {
    let Some(value) = normalize_optional_text(value, 20) else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map(Some)
        .map_err(|_| AppError::bad_request("日期必须使用 YYYY-MM-DD 格式"))
}

fn normalize_optional_bool(value: Option<String>) -> AppResult<Option<bool>> {
    let Some(value) = normalize_optional_text(value, 16) else {
        return Ok(None);
    };
    match value.to_lowercase().as_str() {
        "1" | "true" | "yes" | "y" | "on" => Ok(Some(true)),
        "0" | "false" | "no" | "n" | "off" => Ok(Some(false)),
        _ => Err(AppError::bad_request("external_only 必须是 true/false")),
    }
}

fn normalize_sort(value: Option<String>) -> ContentAssetSort {
    match normalize_optional_text(value, 40).as_deref() {
        Some("recommended") => ContentAssetSort::Recommended,
        Some("uploaded_desc") => ContentAssetSort::UploadedDesc,
        Some("title_asc") => ContentAssetSort::TitleAsc,
        Some("roi_desc") => ContentAssetSort::RoiDesc,
        Some("updated_desc") => ContentAssetSort::UpdatedDesc,
        _ => ContentAssetSort::Recommended,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_query, ContentAssetQuery};

    #[test]
    fn normalizes_content_asset_query_tags_from_single_and_list_params() {
        let normalized = normalize_query(ContentAssetQuery {
            tag: Some(" 控油 ".to_string()),
            tags: Some("痛点钩子，控油/转化".to_string()),
            ..Default::default()
        })
        .expect("content asset query should normalize");

        assert_eq!(normalized.tags, vec!["控油", "痛点钩子", "转化"]);
    }

    #[test]
    fn caps_content_asset_query_tags_to_twenty() {
        let raw_tags = (0..25)
            .map(|index| format!("标签{index}"))
            .collect::<Vec<_>>()
            .join(",");
        let normalized = normalize_query(ContentAssetQuery {
            tags: Some(raw_tags),
            ..Default::default()
        })
        .expect("content asset query should normalize");

        assert_eq!(normalized.tags.len(), 20);
        assert_eq!(normalized.tags.first().map(String::as_str), Some("标签0"));
        assert_eq!(normalized.tags.last().map(String::as_str), Some("标签19"));
    }

    #[test]
    fn normalizes_legacy_chinese_platform_to_canonical_code() {
        let normalized = normalize_query(ContentAssetQuery {
            platform: Some(" 千川 ".to_string()),
            ..Default::default()
        })
        .expect("content asset query should normalize");

        assert_eq!(normalized.platform.as_deref(), Some("qianchuan"));
    }

    #[test]
    fn normalizes_owner_user_id_query_filter() {
        let normalized = normalize_query(ContentAssetQuery {
            owner_user_id: Some(" owner-001 ".to_string()),
            ..Default::default()
        })
        .expect("content asset query should normalize owner filter");

        assert_eq!(normalized.owner_user_id.as_deref(), Some("owner-001"));
    }
}
