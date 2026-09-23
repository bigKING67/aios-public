use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppResult;

use super::mutation_types::{
    NormalizedContentAssetAdMaterialCreate, NormalizedContentAssetPlatformVideoCreate,
};
use super::write_errors::map_write_error;

pub(super) async fn refresh_existing_platform_video_metadata(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
    payload: &NormalizedContentAssetPlatformVideoCreate,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_platform_videos
        SET
          account_name = COALESCE($3, account_name),
          advertiser_id = COALESCE($4, advertiser_id),
          external_video_id = COALESCE($5, external_video_id),
          external_item_id = COALESCE($6, external_item_id),
          external_note_id = COALESCE($7, external_note_id),
          external_url = COALESCE($8, external_url),
          publish_title = COALESCE($9, publish_title),
          publish_status = CASE
            WHEN $10 <> 'unknown' THEN $10
            ELSE publish_status
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE platform_video_id = $1
          AND asset_id = $2
          AND relation_status = 'active'
        "#,
    )
    .bind(platform_video_id)
    .bind(asset_id)
    .bind(&payload.account_name)
    .bind(&payload.advertiser_id)
    .bind(&payload.external_video_id)
    .bind(&payload.external_item_id)
    .bind(&payload.external_note_id)
    .bind(&payload.external_url)
    .bind(&payload.publish_title)
    .bind(&payload.publish_status)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "refresh existing platform video metadata failed"))?;
    Ok(())
}

pub(super) async fn sync_asset_platform_binding(
    pool: &PgPool,
    asset_id: Uuid,
    platform: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET
          platform = COALESCE(NULLIF(platform, ''), $2),
          platform_names = CASE
            WHEN platform_names && ARRAY[$2]::TEXT[] THEN platform_names
            ELSE platform_names || ARRAY[$2]::TEXT[]
          END,
          profile_status = CASE
            WHEN profile_status IN ('incomplete', 'basic_complete') THEN 'platform_bound'
            ELSE profile_status
          END
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .bind(platform)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "sync content asset platform status failed"))?;
    Ok(())
}

pub(super) async fn refresh_existing_ad_material_metadata(
    pool: &PgPool,
    asset_id: Uuid,
    ad_material_id: Uuid,
    platform_video_id: Option<Uuid>,
    external_video_id: Option<&str>,
    payload: &NormalizedContentAssetAdMaterialCreate,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_ad_materials
        SET
          platform_video_id = COALESCE($3, platform_video_id),
          account_name = COALESCE($4, account_name),
          advertiser_id = COALESCE($5, advertiser_id),
          external_video_id = COALESCE($6, external_video_id),
          material_name = COALESCE($7, material_name),
          material_title = COALESCE($8, material_title),
          material_status = CASE
            WHEN $9 <> 'unknown' THEN $9
            ELSE material_status
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE ad_material_id = $1
          AND asset_id = $2
          AND relation_status = 'active'
        "#,
    )
    .bind(ad_material_id)
    .bind(asset_id)
    .bind(platform_video_id)
    .bind(&payload.account_name)
    .bind(&payload.advertiser_id)
    .bind(external_video_id)
    .bind(&payload.material_name)
    .bind(&payload.material_title)
    .bind(&payload.material_status)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "refresh existing ad material metadata failed"))?;
    Ok(())
}
