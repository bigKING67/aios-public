use std::collections::BTreeMap;

use chrono::{Datelike, SecondsFormat, Utc};
use hmac::{Hmac, Mac};
use reqwest::{
    header::{HeaderMap, CONTENT_LENGTH},
    Client, StatusCode,
};
use sha2::{Digest, Sha256};
use tracing::{error, warn};
use uuid::Uuid;

use crate::{
    config::Settings,
    error::{AppError, AppResult},
};

use super::upload_xml::{
    build_complete_multipart_xml, extract_xml_tag, parse_list_parts_response,
    MultipartListPartsPage,
};

type HmacSha256 = Hmac<Sha256>;

pub(super) const LARGE_RECORDING_MULTIPART_THRESHOLD_BYTES: i64 = 1024 * 1024 * 1024;
pub(super) const LARGE_RECORDING_MULTIPART_PART_SIZE_BYTES: i64 = 128 * 1024 * 1024;
const MAX_MULTIPART_PARTS: i64 = 10_000;
const TOS_CONTROL_REQUEST_TTL_SECONDS: u64 = 15 * 60;
const TOS_LIST_PARTS_PAGE_SIZE: i32 = 1000;

pub(super) struct PresignedUploadUrl {
    pub(super) url: String,
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
}

pub(super) struct MultipartUploadUrlSet {
    pub(super) upload_id: String,
    pub(super) expires_at: String,
    pub(super) part_size_bytes: i64,
    pub(super) parts: Vec<PresignedUploadPartUrl>,
}

pub(super) struct PresignedUploadPartUrl {
    pub(super) part_number: i32,
    pub(super) start_byte: i64,
    pub(super) end_byte_exclusive: i64,
    pub(super) url: String,
    pub(super) expires_at: String,
    pub(super) headers: BTreeMap<String, String>,
}

pub(super) struct CompletedMultipartUploadPart {
    pub(super) part_number: i32,
    pub(super) etag: String,
}

pub(super) fn build_raw_object_key(
    session_id: &str,
    segment_index: i32,
    segment_id: Uuid,
    file_ext: &str,
) -> String {
    let now = Utc::now();
    format!(
        "live-recordings/raw/{:04}/{:02}/{}/{:03}-{}.{}",
        now.year(),
        now.month(),
        session_id,
        segment_index,
        segment_id,
        file_ext
    )
}

pub(super) fn build_upload_url(
    settings: &Settings,
    object_key: &str,
    content_type: &str,
) -> AppResult<PresignedUploadUrl> {
    let ttl_seconds = settings.douyin_live_recording_upload_signed_url_ttl_seconds;
    let expires_at = expires_at(ttl_seconds);
    let url = presign_tos_put(settings, object_key, content_type, ttl_seconds)?;
    let mut headers = BTreeMap::new();
    headers.insert("Content-Type".to_string(), content_type.to_string());
    Ok(PresignedUploadUrl {
        url,
        expires_at,
        headers,
    })
}

pub(super) async fn build_multipart_upload_urls(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    file_size_bytes: i64,
) -> AppResult<MultipartUploadUrlSet> {
    let upload_id =
        initiate_multipart_upload(http_client, settings, object_key, content_type).await?;
    build_existing_multipart_upload_urls(settings, object_key, upload_id.as_str(), file_size_bytes)
}

pub(super) fn build_existing_multipart_upload_urls(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    file_size_bytes: i64,
) -> AppResult<MultipartUploadUrlSet> {
    build_existing_multipart_upload_urls_with_part_size(
        settings,
        object_key,
        upload_id,
        file_size_bytes,
        LARGE_RECORDING_MULTIPART_PART_SIZE_BYTES,
    )
}

pub(super) fn build_existing_multipart_upload_urls_with_part_size(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    file_size_bytes: i64,
    part_size_bytes: i64,
) -> AppResult<MultipartUploadUrlSet> {
    build_multipart_part_urls(
        settings,
        object_key,
        upload_id,
        file_size_bytes,
        part_size_bytes,
    )
}

fn build_multipart_part_urls(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    file_size_bytes: i64,
    part_size_bytes: i64,
) -> AppResult<MultipartUploadUrlSet> {
    if file_size_bytes <= 0 || part_size_bytes <= 0 {
        return Err(AppError::bad_request("文件大小或分片大小不合法"));
    }
    let part_count = (file_size_bytes + part_size_bytes - 1) / part_size_bytes;
    if part_count <= 0 || part_count > MAX_MULTIPART_PARTS {
        return Err(AppError::bad_request(
            "录屏文件过大，无法创建稳定分片上传任务",
        ));
    }

    let ttl_seconds = settings.douyin_live_recording_upload_signed_url_ttl_seconds;
    let expires_at = expires_at(ttl_seconds);
    let mut parts = Vec::with_capacity(part_count as usize);
    for zero_based_index in 0..part_count {
        let part_number = i32::try_from(zero_based_index + 1).map_err(|error| {
            error!(?error, "live-center multipart part number overflow");
            AppError::bad_request("录屏文件分片数量过多，无法上传")
        })?;
        let start_byte = zero_based_index * part_size_bytes;
        let end_byte_exclusive = std::cmp::min(start_byte + part_size_bytes, file_size_bytes);
        let url =
            presign_tos_upload_part(settings, object_key, upload_id, part_number, ttl_seconds)?;
        parts.push(PresignedUploadPartUrl {
            part_number,
            start_byte,
            end_byte_exclusive,
            url,
            expires_at: expires_at.clone(),
            headers: BTreeMap::new(),
        });
    }

    Ok(MultipartUploadUrlSet {
        upload_id: upload_id.to_string(),
        expires_at,
        part_size_bytes,
        parts,
    })
}

pub(super) fn build_playback_url(
    settings: &Settings,
    object_key: &str,
) -> AppResult<(String, String)> {
    let ttl_seconds = settings.content_asset_signed_url_ttl_seconds;
    let url = presign_tos_get(settings, object_key, ttl_seconds)?;
    Ok((url, expires_at(ttl_seconds)))
}

pub(super) async fn complete_multipart_upload(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    parts: &[CompletedMultipartUploadPart],
) -> AppResult<()> {
    if parts.is_empty() {
        return Err(AppError::bad_request("分片上传完成参数为空"));
    }
    let url = presign_tos_complete_multipart(
        settings,
        object_key,
        upload_id,
        TOS_CONTROL_REQUEST_TTL_SECONDS,
    )?;
    let body = build_complete_multipart_xml(parts);
    let response = http_client
        .post(url)
        .header("Content-Type", "application/xml")
        .body(body)
        .send()
        .await
        .map_err(|error| {
            error!(
                ?error,
                object_key, "complete live-center multipart upload failed"
            );
            AppError::bad_request("录屏分片合并失败，请稍后重试")
        })?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        warn!(
            status = %status,
            object_key,
            detail = %detail.chars().take(240).collect::<String>(),
            "live-center multipart complete returned non-success status"
        );
        return Err(AppError::bad_request(format!(
            "录屏分片合并失败（HTTP {status}）"
        )));
    }
    Ok(())
}

pub(super) async fn list_multipart_uploaded_parts(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
) -> AppResult<Vec<CompletedMultipartUploadPart>> {
    let mut parts = Vec::new();
    let mut part_number_marker = None;

    loop {
        let page = list_multipart_uploaded_parts_page(
            http_client,
            settings,
            object_key,
            upload_id,
            part_number_marker,
        )
        .await?;
        let MultipartListPartsPage {
            parts: page_parts,
            next_part_number_marker,
            is_truncated,
        } = page;
        parts.extend(page_parts);

        if !is_truncated {
            break;
        }
        let Some(next_marker) = next_part_number_marker else {
            warn!(
                object_key,
                upload_id, "live-center multipart ListParts truncated without next marker"
            );
            break;
        };
        if Some(next_marker) == part_number_marker || parts.len() > MAX_MULTIPART_PARTS as usize {
            return Err(AppError::bad_request("录屏分片列表异常，无法恢复上传"));
        }
        part_number_marker = Some(next_marker);
    }

    parts.sort_by_key(|part| part.part_number);
    Ok(parts)
}

pub(super) async fn abort_multipart_upload(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
) -> AppResult<()> {
    let url = presign_tos_abort_multipart(
        settings,
        object_key,
        upload_id,
        TOS_CONTROL_REQUEST_TTL_SECONDS,
    )?;
    let response = http_client.delete(url).send().await.map_err(|error| {
        warn!(
            ?error,
            object_key, upload_id, "abort live-center multipart upload failed"
        );
        AppError::bad_request("录屏分片上传清理失败，请稍后重试")
    })?;
    let status = response.status();
    if status.is_success() || status == StatusCode::NOT_FOUND {
        return Ok(());
    }
    let detail = response.text().await.unwrap_or_default();
    warn!(
        status = %status,
        object_key,
        upload_id,
        detail = %detail.chars().take(240).collect::<String>(),
        "live-center multipart abort returned non-success status"
    );
    Err(AppError::bad_request(format!(
        "录屏分片上传清理失败（HTTP {status}）"
    )))
}

pub(super) async fn verify_object_size(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    expected_size_bytes: i64,
) -> AppResult<()> {
    if expected_size_bytes <= 0 {
        return Err(AppError::bad_request("文件大小必须大于 0"));
    }
    let url = presign_tos_head(settings, object_key, TOS_CONTROL_REQUEST_TTL_SECONDS)?;
    let response = http_client.head(url).send().await.map_err(|error| {
        error!(
            ?error,
            object_key, "verify live-center uploaded object failed"
        );
        AppError::bad_request("录屏文件校验失败，请稍后重试")
    })?;
    let status = response.status();
    if status == StatusCode::NOT_FOUND {
        return Err(AppError::bad_request("录屏文件尚未上传完成，请稍后重试"));
    }
    if !status.is_success() {
        warn!(
            status = %status,
            object_key,
            "live-center uploaded object HEAD returned non-success status"
        );
        return Err(AppError::bad_request("录屏文件校验失败，请稍后重试"));
    }

    let actual_size_bytes = parse_head_content_length(response.headers(), object_key)?;
    let expected_size_bytes = u64::try_from(expected_size_bytes).map_err(|error| {
        error!(
            ?error,
            object_key, "expected live-center object size overflow"
        );
        AppError::bad_request("录屏文件大小不合法")
    })?;
    if actual_size_bytes != expected_size_bytes {
        warn!(
            object_key,
            actual_size_bytes, expected_size_bytes, "live-center uploaded object size mismatch"
        );
        return Err(AppError::bad_request(
            "录屏文件校验失败：上传大小与原文件不一致，请重新上传",
        ));
    }
    Ok(())
}

fn parse_head_content_length(headers: &HeaderMap, object_key: &str) -> AppResult<u64> {
    let header = headers.get(CONTENT_LENGTH).ok_or_else(|| {
        warn!(
            object_key,
            "live-center uploaded object HEAD missed content-length"
        );
        AppError::bad_request("录屏文件校验失败：缺少对象大小")
    })?;
    let value = header.to_str().map_err(|error| {
        warn!(
            ?error,
            object_key, "live-center uploaded object HEAD content-length is not valid UTF-8"
        );
        AppError::bad_request("录屏文件校验失败：对象大小不合法")
    })?;
    value.trim().parse::<u64>().map_err(|error| {
        warn!(
            ?error,
            object_key,
            content_length = value,
            "live-center uploaded object HEAD content-length is not a valid integer"
        );
        AppError::bad_request("录屏文件校验失败：对象大小不合法")
    })
}

fn expires_at(ttl_seconds: u64) -> String {
    (Utc::now() + chrono::Duration::seconds(ttl_seconds as i64))
        .to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn presign_tos_get(settings: &Settings, object_key: &str, ttl_seconds: u64) -> AppResult<String> {
    presign_tos_url(
        settings,
        "GET",
        object_key,
        ttl_seconds,
        Vec::new(),
        BTreeMap::new(),
    )
}

fn presign_tos_put(
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    ttl_seconds: u64,
) -> AppResult<String> {
    let mut signed_headers = BTreeMap::new();
    signed_headers.insert("content-type".to_string(), content_type.trim().to_string());
    presign_tos_url(
        settings,
        "PUT",
        object_key,
        ttl_seconds,
        Vec::new(),
        signed_headers,
    )
}

fn presign_tos_head(settings: &Settings, object_key: &str, ttl_seconds: u64) -> AppResult<String> {
    presign_tos_url(
        settings,
        "HEAD",
        object_key,
        ttl_seconds,
        Vec::new(),
        BTreeMap::new(),
    )
}

pub(super) fn build_delete_object_url(settings: &Settings, object_key: &str) -> AppResult<String> {
    presign_tos_url(
        settings,
        "DELETE",
        object_key,
        TOS_CONTROL_REQUEST_TTL_SECONDS,
        Vec::new(),
        BTreeMap::new(),
    )
}

fn presign_tos_initiate_multipart(
    settings: &Settings,
    object_key: &str,
    content_type: &str,
    ttl_seconds: u64,
) -> AppResult<String> {
    let mut signed_headers = BTreeMap::new();
    signed_headers.insert("content-type".to_string(), content_type.trim().to_string());
    presign_tos_url(
        settings,
        "POST",
        object_key,
        ttl_seconds,
        vec![("uploads".to_string(), String::new())],
        signed_headers,
    )
}

fn presign_tos_upload_part(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    part_number: i32,
    ttl_seconds: u64,
) -> AppResult<String> {
    presign_tos_url(
        settings,
        "PUT",
        object_key,
        ttl_seconds,
        vec![
            ("partNumber".to_string(), part_number.to_string()),
            ("uploadId".to_string(), upload_id.to_string()),
        ],
        BTreeMap::new(),
    )
}

fn presign_tos_complete_multipart(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    ttl_seconds: u64,
) -> AppResult<String> {
    let mut signed_headers = BTreeMap::new();
    signed_headers.insert("content-type".to_string(), "application/xml".to_string());
    presign_tos_url(
        settings,
        "POST",
        object_key,
        ttl_seconds,
        vec![("uploadId".to_string(), upload_id.to_string())],
        signed_headers,
    )
}

fn presign_tos_list_parts(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    part_number_marker: Option<i32>,
    ttl_seconds: u64,
) -> AppResult<String> {
    let mut query = vec![
        ("uploadId".to_string(), upload_id.to_string()),
        (
            "max-parts".to_string(),
            TOS_LIST_PARTS_PAGE_SIZE.to_string(),
        ),
    ];
    if let Some(marker) = part_number_marker {
        query.push(("part-number-marker".to_string(), marker.to_string()));
    }
    presign_tos_url(
        settings,
        "GET",
        object_key,
        ttl_seconds,
        query,
        BTreeMap::new(),
    )
}

fn presign_tos_abort_multipart(
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    ttl_seconds: u64,
) -> AppResult<String> {
    presign_tos_url(
        settings,
        "DELETE",
        object_key,
        ttl_seconds,
        vec![("uploadId".to_string(), upload_id.to_string())],
        BTreeMap::new(),
    )
}

fn presign_tos_url(
    settings: &Settings,
    method: &str,
    object_key: &str,
    ttl_seconds: u64,
    extra_query: Vec<(String, String)>,
    mut signed_header_values: BTreeMap<String, String>,
) -> AppResult<String> {
    let normalized_key = object_key.trim();
    if normalized_key.is_empty() {
        return Err(AppError::bad_request(
            "对象路径为空，无法生成 TOS signed URL",
        ));
    }
    let access_key = settings.tos_access_key_id.trim();
    let secret_key = settings.tos_secret_access_key.trim();
    if access_key.is_empty() || secret_key.is_empty() {
        return Err(AppError::bad_request(
            "未配置 TOS_ACCESS_KEY_ID/TOS_SECRET_ACCESS_KEY，无法生成 signed URL",
        ));
    }
    let host = virtual_host(&settings.tos_endpoint, &settings.tos_bucket);
    signed_header_values.insert("host".to_string(), host.clone());
    let signed_headers = signed_header_values
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(";");
    let canonical_headers = signed_header_values
        .iter()
        .map(|(key, value)| format!("{key}:{}\n", value.trim()))
        .collect::<String>();

    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let credential_scope = format!("{date_stamp}/{}/s3/aws4_request", settings.tos_region);
    let credential = format!("{access_key}/{credential_scope}");
    let canonical_uri = format!("/{}", quote_path(normalized_key));
    let mut query_pairs = vec![
        (
            "X-Amz-Algorithm".to_string(),
            "AWS4-HMAC-SHA256".to_string(),
        ),
        ("X-Amz-Credential".to_string(), credential),
        ("X-Amz-Date".to_string(), amz_date.clone()),
        ("X-Amz-Expires".to_string(), ttl_seconds.to_string()),
        ("X-Amz-SignedHeaders".to_string(), signed_headers.clone()),
    ];
    query_pairs.extend(extra_query);
    let canonical_query = canonical_query_string(query_pairs);
    let canonical_request = [
        method,
        canonical_uri.as_str(),
        canonical_query.as_str(),
        canonical_headers.as_str(),
        signed_headers.as_str(),
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

async fn initiate_multipart_upload(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    content_type: &str,
) -> AppResult<String> {
    let url = presign_tos_initiate_multipart(
        settings,
        object_key,
        content_type,
        TOS_CONTROL_REQUEST_TTL_SECONDS,
    )?;
    let response = http_client
        .post(url)
        .header("Content-Type", content_type.to_string())
        .send()
        .await
        .map_err(|error| {
            error!(
                ?error,
                object_key, "initiate live-center multipart upload failed"
            );
            AppError::bad_request("录屏分片上传初始化失败，请稍后重试")
        })?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        warn!(
            status = %status,
            object_key,
            detail = %body.chars().take(240).collect::<String>(),
            "live-center multipart initiate returned non-success status"
        );
        return Err(AppError::bad_request(format!(
            "录屏分片上传初始化失败（HTTP {status}）"
        )));
    }
    extract_xml_tag(body.as_str(), "UploadId")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::bad_request("录屏分片上传初始化失败：缺少 uploadId"))
}

async fn list_multipart_uploaded_parts_page(
    http_client: &Client,
    settings: &Settings,
    object_key: &str,
    upload_id: &str,
    part_number_marker: Option<i32>,
) -> AppResult<MultipartListPartsPage> {
    let url = presign_tos_list_parts(
        settings,
        object_key,
        upload_id,
        part_number_marker,
        TOS_CONTROL_REQUEST_TTL_SECONDS,
    )?;
    let response = http_client.get(url).send().await.map_err(|error| {
        error!(
            ?error,
            object_key, upload_id, "list live-center multipart uploaded parts failed"
        );
        AppError::bad_request("录屏分片恢复失败，请稍后重试")
    })?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        warn!(
            status = %status,
            object_key,
            upload_id,
            detail = %body.chars().take(240).collect::<String>(),
            "live-center multipart ListParts returned non-success status"
        );
        return Err(AppError::bad_request(format!(
            "录屏分片恢复失败（HTTP {status}）"
        )));
    }

    Ok(parse_list_parts_response(body.as_str()))
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

fn canonical_query_string(pairs: Vec<(String, String)>) -> String {
    let mut encoded = pairs
        .into_iter()
        .map(|(key, value)| (quote(&key), quote(&value)))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_head_content_length_header() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, "7809473".parse().expect("header value"));

        assert_eq!(
            parse_head_content_length(&headers, "live-recordings/raw/example.mp4")
                .expect("content length parses"),
            7_809_473
        );
    }

    #[test]
    fn rejects_missing_head_content_length_header() {
        let headers = HeaderMap::new();

        let error = parse_head_content_length(&headers, "live-recordings/raw/example.mp4")
            .expect_err("missing header fails");

        assert_eq!(error.detail(), "录屏文件校验失败：缺少对象大小");
    }
}
