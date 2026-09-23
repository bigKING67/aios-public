use chrono::{Datelike, Utc};
use uuid::Uuid;

use crate::{auth::CurrentUser, config::Settings, error::AppError};

use super::{
    delivery::build_optional_cover_url,
    permissions::can_edit_content_asset,
    types::{
        ContentAssetDeliveryHealth, ContentAssetDetailResponse, ContentAssetItem,
        ContentAssetStorageHealth,
    },
};

pub(super) fn build_storage_health(settings: &Settings) -> ContentAssetStorageHealth {
    let credentials_configured = !settings.tos_access_key_id.trim().is_empty()
        && !settings.tos_secret_access_key.trim().is_empty();
    let base_configured = !settings.tos_bucket.trim().is_empty()
        && !settings.tos_region.trim().is_empty()
        && !settings.tos_endpoint.trim().is_empty();
    ContentAssetStorageHealth {
        status: if credentials_configured && base_configured {
            "ok"
        } else {
            "degraded"
        }
        .to_string(),
        provider: "tos".to_string(),
        bucket: settings.tos_bucket.clone(),
        region: settings.tos_region.clone(),
        endpoint: settings.tos_endpoint.clone(),
        credentials_configured,
    }
}

pub(super) fn build_delivery_health(
    settings: &Settings,
    storage_ready: bool,
) -> ContentAssetDeliveryHealth {
    let provider = settings
        .content_asset_delivery_provider
        .trim()
        .to_lowercase();
    let cdn_base_url = if settings.content_asset_cdn_base_url.trim().is_empty() {
        None
    } else {
        Some(settings.content_asset_cdn_base_url.clone())
    };
    let provider_ready = match provider.as_str() {
        "tos_signed_url" => storage_ready,
        "volc_cdn" => cdn_base_url.is_some(),
        _ => false,
    };
    ContentAssetDeliveryHealth {
        status: if provider_ready { "ok" } else { "degraded" }.to_string(),
        provider,
        cdn_base_url,
        signed_url_ttl_seconds: settings.content_asset_signed_url_ttl_seconds,
    }
}

pub(super) fn build_raw_object_key(asset_id: Uuid, file_ext: &str) -> String {
    let now = Utc::now();
    format!(
        "raw/{:04}/{:02}/{}.{}",
        now.year(),
        now.month(),
        asset_id,
        file_ext
    )
}

pub(super) fn attach_cover_urls(items: &mut [ContentAssetItem], settings: &Settings) {
    for item in items {
        item.cover_url = build_optional_cover_url(settings, item);
    }
}

pub(super) fn with_detail_delivery_urls(
    mut detail: ContentAssetDetailResponse,
    settings: &Settings,
    current_user: &CurrentUser,
) -> ContentAssetDetailResponse {
    detail.asset.cover_url = build_optional_cover_url(settings, &detail.asset);
    detail.asset.can_edit = can_edit_content_asset(current_user, &detail.asset);
    detail
}

pub(super) fn duplicate_asset_conflict(duplicate: &ContentAssetItem) -> AppError {
    AppError::Conflict(format!(
        "该视频已存在于素材库：{}（asset_id: {}），请勿重复上传。",
        duplicate.title, duplicate.asset_id
    ))
}
