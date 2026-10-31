//! The immutable cloud-video identity stays in BoundAsset.object_key; URLs are
//! resolved by the worker from the matching current vendor row, never the client.
use super::repository::db_error;
use crate::error::{AppError, AppResult};

fn video_id(key: &str) -> Option<i64> {
    let text = key.strip_prefix("cloud-video://")?;
    let id = text.parse::<i64>().ok()?;
    (id > 0 && id.to_string() == text).then_some(id)
}

pub(super) async fn validate(
    pool: &sqlx::PgPool,
    asset_id: uuid::Uuid,
    key: &str,
    sha: &str,
) -> AppResult<()> {
    let id = video_id(key).ok_or_else(|| AppError::bad_request("云原片标识无效"))?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM cloud_video.videos WHERE video_id=$1
          AND asset_id=$2 AND file_sha256=LOWER($3) AND video_type=0)",
    )
    .bind(id)
    .bind(asset_id)
    .bind(sha)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if !exists {
        return Err(AppError::bad_request(
            "云原片映射或文件摘要已变化，请等待重新同步",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::video_id;

    #[test]
    fn cloud_identity_is_canonical_positive_bigint() {
        assert_eq!(video_id("cloud-video://1"), Some(1));
        assert_eq!(
            video_id("cloud-video://9223372036854775807"),
            Some(i64::MAX)
        );
        for key in [
            "raw/a.mp4",
            "cloud-video://0",
            "cloud-video://-1",
            "cloud-video://01",
            "cloud-video://+1",
            "cloud-video://1/",
            "cloud-video://1?x",
            "cloud-video://9223372036854775808",
        ] {
            assert_eq!(video_id(key), None, "{key}");
        }
    }
}
