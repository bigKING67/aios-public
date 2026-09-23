use std::collections::BTreeMap;

use chrono::{SecondsFormat, Utc};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use crate::{
    config::Settings,
    error::{AppError, AppResult},
};

use super::types::{ContentAssetItem, PlaybackUrlResponse, PlaybackVariant};

type HmacSha256 = Hmac<Sha256>;

pub(super) struct PresignedUploadUrl {
    pub(super) url: String,
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
}

pub(super) fn build_object_read_url(settings: &Settings, object_key: &str) -> AppResult<String> {
    let normalized_key = object_key.trim();
    if normalized_key.is_empty() {
        return Err(AppError::bad_request("对象路径为空，无法生成读取地址"));
    }
    let provider = settings.content_asset_delivery_provider.as_str();
    match provider {
        "volc_cdn" => build_cdn_url(settings, normalized_key),
        "tos_signed_url" | "" => presign_tos_get(
            settings,
            normalized_key,
            settings.content_asset_signed_url_ttl_seconds,
        ),
        _ => Err(AppError::bad_request(
            "CONTENT_ASSET_DELIVERY_PROVIDER 配置不支持",
        )),
    }
}

pub(super) fn build_tos_object_read_url(
    settings: &Settings,
    object_key: &str,
) -> AppResult<String> {
    let normalized_key = object_key.trim();
    if normalized_key.is_empty() {
        return Err(AppError::bad_request("对象路径为空，无法生成读取地址"));
    }
    presign_tos_get(
        settings,
        normalized_key,
        settings.content_asset_signed_url_ttl_seconds,
    )
}

pub(super) fn build_optional_cover_url(
    settings: &Settings,
    asset: &ContentAssetItem,
) -> Option<String> {
    let object_key = asset
        .cover_object_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let provider = settings.content_asset_delivery_provider.as_str();
    match provider {
        "volc_cdn" => build_cdn_url(settings, object_key).ok(),
        "tos_signed_url" | "" => presign_tos_get(
            settings,
            object_key,
            settings.content_asset_signed_url_ttl_seconds,
        )
        .ok(),
        _ => None,
    }
}

pub(super) fn build_playback_url(
    settings: &Settings,
    asset: &ContentAssetItem,
    variant: PlaybackVariant,
) -> AppResult<PlaybackUrlResponse> {
    if asset.external_only {
        return Err(AppError::bad_request(
            "该素材只有外部链接，尚未上传到内容资产桶",
        ));
    }

    let resolved_variant = match variant {
        PlaybackVariant::Preview
            if asset
                .preview_object_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
                && asset
                    .raw_object_key
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some() =>
        {
            PlaybackVariant::Raw
        }
        _ => variant,
    };

    let object_key = match resolved_variant {
        PlaybackVariant::Preview => asset.preview_object_key.as_deref(),
        PlaybackVariant::Raw => asset.raw_object_key.as_deref(),
    }
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| AppError::bad_request("该素材缺少可播放对象路径"))?;

    let ttl_seconds = settings.content_asset_signed_url_ttl_seconds;
    let expires_at = (Utc::now() + chrono::Duration::seconds(ttl_seconds as i64))
        .to_rfc3339_opts(SecondsFormat::Secs, true);
    let provider = settings.content_asset_delivery_provider.as_str();
    let url = match provider {
        "volc_cdn" => build_cdn_url(settings, object_key)?,
        "tos_signed_url" | "" => presign_tos_get(settings, object_key, ttl_seconds)?,
        _ => {
            return Err(AppError::bad_request(
                "CONTENT_ASSET_DELIVERY_PROVIDER 配置不支持",
            ))
        }
    };

    let (content_type, file_size_bytes) = match resolved_variant {
        PlaybackVariant::Preview => ("video/mp4".to_string(), asset.preview_size_bytes),
        PlaybackVariant::Raw => (
            asset
                .mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            asset.file_size_bytes,
        ),
    };

    Ok(PlaybackUrlResponse {
        url,
        variant: resolved_variant,
        expires_at,
        provider: if provider.is_empty() {
            "tos_signed_url".to_string()
        } else {
            provider.to_string()
        },
        content_type,
        file_size_bytes,
    })
}

pub(super) fn build_upload_url(
    settings: &Settings,
    object_key: &str,
    content_type: &str,
) -> AppResult<PresignedUploadUrl> {
    let ttl_seconds = settings.content_asset_signed_url_ttl_seconds;
    let expires_at = (Utc::now() + chrono::Duration::seconds(ttl_seconds as i64))
        .to_rfc3339_opts(SecondsFormat::Secs, true);
    let url = presign_tos_put(settings, object_key, content_type, ttl_seconds)?;
    let mut headers = BTreeMap::new();
    headers.insert("Content-Type".to_string(), content_type.to_string());
    Ok(PresignedUploadUrl {
        url,
        expires_at,
        headers,
    })
}

fn build_cdn_url(settings: &Settings, object_key: &str) -> AppResult<String> {
    let base_url = settings
        .content_asset_cdn_base_url
        .trim()
        .trim_end_matches('/');
    if base_url.is_empty() {
        return Err(AppError::bad_request("未配置 CONTENT_ASSET_CDN_BASE_URL"));
    }
    Ok(format!("{base_url}/{}", quote_path(object_key)))
}

fn presign_tos_get(settings: &Settings, object_key: &str, ttl_seconds: u64) -> AppResult<String> {
    let access_key = settings.tos_access_key_id.trim();
    let secret_key = settings.tos_secret_access_key.trim();
    if access_key.is_empty() || secret_key.is_empty() {
        return Err(AppError::bad_request(
            "未配置 TOS_ACCESS_KEY_ID/TOS_SECRET_ACCESS_KEY，无法生成 signed URL",
        ));
    }
    let host = virtual_host(&settings.tos_endpoint, &settings.tos_bucket);
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let credential_scope = format!("{date_stamp}/{}/s3/aws4_request", settings.tos_region);
    let credential = format!("{access_key}/{credential_scope}");
    let canonical_uri = format!("/{}", quote_path(object_key));
    let canonical_query = canonical_query_string([
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256".to_string()),
        ("X-Amz-Credential", credential),
        ("X-Amz-Date", amz_date.clone()),
        ("X-Amz-Expires", ttl_seconds.to_string()),
        ("X-Amz-SignedHeaders", "host".to_string()),
    ]);
    let canonical_headers = format!("host:{host}\n");
    let canonical_request = [
        "GET",
        canonical_uri.as_str(),
        canonical_query.as_str(),
        canonical_headers.as_str(),
        "host",
        "UNSIGNED-PAYLOAD",
    ]
    .join("\n");
    let string_to_sign = [
        "AWS4-HMAC-SHA256",
        amz_date.as_str(),
        credential_scope.as_str(),
        sha256_hex(canonical_request.as_bytes()).as_str(),
    ]
    .join("\n");
    let signature = hmac_hex(
        &signing_key(secret_key, &date_stamp, &settings.tos_region),
        string_to_sign.as_bytes(),
    );
    Ok(format!(
        "https://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"
    ))
}

fn presign_tos_put(
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    ttl_seconds: u64,
) -> AppResult<String> {
    let access_key = settings.tos_access_key_id.trim();
    let secret_key = settings.tos_secret_access_key.trim();
    if access_key.is_empty() || secret_key.is_empty() {
        return Err(AppError::bad_request(
            "未配置 TOS_ACCESS_KEY_ID/TOS_SECRET_ACCESS_KEY，无法生成上传 signed URL",
        ));
    }
    let host = virtual_host(&settings.tos_endpoint, &settings.tos_bucket);
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let credential_scope = format!("{date_stamp}/{}/s3/aws4_request", settings.tos_region);
    let credential = format!("{access_key}/{credential_scope}");
    let signed_headers = "content-type;host";
    let canonical_uri = format!("/{}", quote_path(object_key));
    let canonical_query = canonical_query_string([
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256".to_string()),
        ("X-Amz-Credential", credential),
        ("X-Amz-Date", amz_date.clone()),
        ("X-Amz-Expires", ttl_seconds.to_string()),
        ("X-Amz-SignedHeaders", signed_headers.to_string()),
    ]);
    let canonical_headers = format!("content-type:{}\nhost:{host}\n", content_type.trim());
    let canonical_request = [
        "PUT",
        canonical_uri.as_str(),
        canonical_query.as_str(),
        canonical_headers.as_str(),
        signed_headers,
        "UNSIGNED-PAYLOAD",
    ]
    .join("\n");
    let string_to_sign = [
        "AWS4-HMAC-SHA256",
        amz_date.as_str(),
        credential_scope.as_str(),
        sha256_hex(canonical_request.as_bytes()).as_str(),
    ]
    .join("\n");
    let signature = hmac_hex(
        &signing_key(secret_key, &date_stamp, &settings.tos_region),
        string_to_sign.as_bytes(),
    );
    Ok(format!(
        "https://{host}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"
    ))
}

fn virtual_host(endpoint: &str, bucket: &str) -> String {
    let host = endpoint
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_matches('/');
    if host.starts_with(&format!("{bucket}.")) {
        host.to_string()
    } else {
        format!("{bucket}.{host}")
    }
}

fn canonical_query_string<const N: usize>(pairs: [(&str, String); N]) -> String {
    let mut encoded = pairs
        .into_iter()
        .map(|(key, value)| (quote(key), quote(&value)))
        .collect::<Vec<_>>();
    encoded.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    encoded
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn quote_path(value: &str) -> String {
    value.split('/').map(quote).collect::<Vec<_>>().join("/")
}

fn quote(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn sha256_hex(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    hex::encode(hasher.finalize())
}

fn hmac_hex(key: &[u8], input: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(input);
    hex::encode(mac.finalize().into_bytes())
}

fn signing_key(secret_key: &str, date_stamp: &str, region: &str) -> Vec<u8> {
    let mut key = format!("AWS4{secret_key}").into_bytes();
    for value in [date_stamp, region, "s3", "aws4_request"] {
        let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC accepts any key length");
        mac.update(value.as_bytes());
        key = mac.finalize().into_bytes().to_vec();
    }
    key
}
