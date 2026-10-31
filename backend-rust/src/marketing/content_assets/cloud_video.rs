//! 视频云管家 originals (`source_type = 'cloud_video'`): played straight from the vendor. The outer-network
//! address goes first and the inner-network one is the alternate (inside the company only the latter is
//! reachable); both come from `cloud_video.videos`, written by the desktop sync. Nothing is signed and
//! AIOS never proxies the file.
use sqlx::PgPool;
use uuid::Uuid;

use super::delivery::build_playback_url;
use super::types::{ContentAssetItem, PlaybackUrlResponse, PlaybackVariant};
use crate::config::Settings;
use crate::error::{AppError, AppResult};

pub(super) const CLOUD_VIDEO_SOURCE: &str = "cloud_video";

/// The playback URL of any original: the vendor's two addresses for a cloud original, a signed or CDN
/// URL of the stored object otherwise.
pub(super) async fn playback_url(
    pool: &PgPool,
    settings: &Settings,
    asset: &ContentAssetItem,
    variant: PlaybackVariant,
) -> AppResult<PlaybackUrlResponse> {
    if asset.source_type != CLOUD_VIDEO_SOURCE {
        if asset.source_type == "ai_studio_output"
            && asset.raw_object_key.is_none()
            && asset.preview_object_key.is_none()
        {
            let row: Option<(String,String,String)> = sqlx::query_as("SELECT playback_outer_host,playback_inner_host,playback_path FROM cloud_video.pushes WHERE output_asset_id=$1 AND status='succeeded' AND playback_outer_host IS NOT NULL AND playback_inner_host IS NOT NULL AND playback_path IS NOT NULL")
                .bind(asset.asset_id).fetch_optional(pool).await.map_err(|error| {tracing::error!(?error,"read delivered playback failed"); AppError::Internal})?;
            if let Some((outer, inner, path)) = row {
                return Ok(response(
                    asset.file_size_bytes,
                    format!("https://{outer}{path}"),
                    format!("https://{inner}{path}"),
                ));
            }
        }
        return build_playback_url(settings, asset, variant);
    }
    let (outer, inner) = addresses(pool, asset.asset_id).await?;
    Ok(response(asset.file_size_bytes, outer, inner))
}

async fn addresses(pool: &PgPool, asset_id: Uuid) -> AppResult<(String, String)> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT outer_host, inner_host, url_path FROM cloud_video.videos WHERE asset_id = $1 ORDER BY video_id LIMIT 1",
    )
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        tracing::error!(?error, "read cloud video addresses failed");
        AppError::Internal
    })?;
    let (outer, inner, path) =
        row.ok_or_else(|| AppError::bad_request("云管家原片没有同步记录"))?;
    Ok((
        format!("https://{outer}{path}"),
        format!("https://{inner}{path}"),
    ))
}

fn response(file_size_bytes: Option<i64>, outer: String, inner: String) -> PlaybackUrlResponse {
    PlaybackUrlResponse {
        url: outer,
        variant: PlaybackVariant::Raw,
        expires_at: String::new(),
        provider: CLOUD_VIDEO_SOURCE.to_string(),
        content_type: "video/mp4".to_string(),
        file_size_bytes,
        alternate_urls: vec![inner],
    }
}

#[cfg(test)]
mod tests {
    use super::response as cloud_video_playback;

    #[test]
    fn cloud_video_plays_the_outer_address_with_the_inner_one_as_alternate() {
        let response = cloud_video_playback(
            Some(85_004_336),
            "https://youmou-sucaiwang.sucaicloud.com:9001/p/a.mp4".into(),
            "https://youmou-sucaiwang-inner.sucaicloud.com/p/a.mp4".into(),
        );
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(
            json["url"],
            "https://youmou-sucaiwang.sucaicloud.com:9001/p/a.mp4"
        );
        assert_eq!(
            json["alternateUrls"],
            serde_json::json!(["https://youmou-sucaiwang-inner.sucaicloud.com/p/a.mp4"])
        );
        assert_eq!(
            (json["provider"].as_str(), json["fileSizeBytes"].as_i64()),
            (Some("cloud_video"), Some(85_004_336))
        );
    }
}
