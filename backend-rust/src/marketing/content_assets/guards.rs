use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::write_errors::map_write_error;

pub(super) fn ensure_updated(rows_affected: u64) -> AppResult<()> {
    if rows_affected == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(())
    }
}

pub(super) async fn ensure_asset_exists(pool: &PgPool, asset_id: Uuid) -> AppResult<()> {
    let exists = sqlx::query(
        "SELECT 1 FROM ads.marketing_content_assets WHERE asset_id = $1 AND is_deleted = FALSE",
    )
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "check marketing content asset existence failed"))?
    .is_some();
    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

pub(super) async fn ensure_platform_video_belongs_to_asset(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
) -> AppResult<()> {
    let row = sqlx::query(
        r#"
        SELECT asset_id
        FROM ads.marketing_content_platform_videos
        WHERE platform_video_id = $1 AND relation_status <> 'archived'
        "#,
    )
    .bind(platform_video_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "check marketing content platform video failed"))?;
    let Some(row) = row else {
        return Err(AppError::bad_request("选择的平台视频身份不存在"));
    };
    let owner_asset_id: Uuid = row.get("asset_id");
    if owner_asset_id == asset_id {
        Ok(())
    } else {
        Err(AppError::bad_request("平台视频身份不属于当前内容资产"))
    }
}
