use reqwest::{Client, StatusCode};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use tracing::{error, warn};
use uuid::Uuid;

use crate::{
    config::Settings,
    error::{AppError, AppResult},
};

use super::delivery::build_tos_object_read_url;

pub(super) struct VerifiedRawUpload {
    pub(super) sha256: String,
    pub(super) size_bytes: i64,
}

pub(super) async fn verify_raw_upload_sha256(
    pool: &PgPool,
    http_client: &Client,
    settings: &Settings,
    asset_id: Uuid,
    client_sha256: Option<&str>,
) -> AppResult<VerifiedRawUpload> {
    let object_key = query_raw_object_key(pool, asset_id).await?;
    let read_url = build_tos_object_read_url(settings, &object_key)?;
    let verified = fetch_raw_object_sha256(http_client, &read_url, asset_id, &object_key).await?;

    if let Some(client_sha256) = client_sha256 {
        if !client_sha256.eq_ignore_ascii_case(&verified.sha256) {
            warn!(
                %asset_id,
                object_key = %object_key,
                client_sha256,
                server_sha256 = %verified.sha256,
                "content asset raw object sha256 mismatch",
            );
            return Err(AppError::bad_request(
                "上传文件校验失败，请重新选择文件后再上传",
            ));
        }
    }

    Ok(verified)
}

async fn query_raw_object_key(pool: &PgPool, asset_id: Uuid) -> AppResult<String> {
    let row = sqlx::query(
        r#"
        SELECT raw_object_key
        FROM ads.marketing_content_assets
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query manual upload raw object key failed");
        AppError::Internal
    })?;

    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let raw_object_key: Option<String> = row.get("raw_object_key");
    raw_object_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::bad_request("该素材缺少 raw 对象路径，无法确认上传完成"))
}

async fn fetch_raw_object_sha256(
    http_client: &Client,
    read_url: &str,
    asset_id: Uuid,
    object_key: &str,
) -> AppResult<VerifiedRawUpload> {
    let mut response = http_client.get(read_url).send().await.map_err(|error| {
        error!(?error, %asset_id, object_key, "fetch content asset raw object failed");
        AppError::bad_request("源视频读取失败，请稍后重试")
    })?;

    let status = response.status();
    if status == StatusCode::NOT_FOUND {
        return Err(AppError::bad_request("源视频尚未上传完成，请稍后重试"));
    }
    if !status.is_success() {
        error!(
            status = %status,
            %asset_id,
            object_key,
            "content asset raw object returned non-success status",
        );
        return Err(AppError::bad_request("源视频读取失败，请稍后重试"));
    }

    let mut hasher = Sha256::new();
    let mut size_bytes: i64 = 0;
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        error!(?error, %asset_id, object_key, "read content asset raw object failed");
        AppError::bad_request("源视频读取失败，请稍后重试")
    })? {
        let chunk_len = i64::try_from(chunk.len()).map_err(|error| {
            error!(?error, %asset_id, object_key, "content asset raw object chunk is too large");
            AppError::bad_request("源视频文件过大，无法完成上传")
        })?;
        size_bytes = size_bytes.checked_add(chunk_len).ok_or_else(|| {
            error!(%asset_id, object_key, "content asset raw object size overflow");
            AppError::bad_request("源视频文件过大，无法完成上传")
        })?;
        hasher.update(&chunk);
    }

    if size_bytes <= 0 {
        return Err(AppError::bad_request("源视频为空，无法完成上传"));
    }

    Ok(VerifiedRawUpload {
        sha256: hex::encode(hasher.finalize()),
        size_bytes,
    })
}
