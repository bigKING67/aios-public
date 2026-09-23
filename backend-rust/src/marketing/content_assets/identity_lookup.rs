use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::AppResult;

use super::write_errors::map_write_error;

pub(super) async fn find_platform_video_identity(
    pool: &PgPool,
    platform: &str,
    account_id: Option<&str>,
    external_video_id: Option<&str>,
    external_item_id: Option<&str>,
    external_note_id: Option<&str>,
) -> AppResult<Option<(Uuid, Uuid)>> {
    let row = sqlx::query(
        r#"
        SELECT platform_video_id, asset_id
        FROM ads.marketing_content_platform_videos
        WHERE platform = $1
          AND COALESCE(account_id, '') = COALESCE($2, '')
          AND COALESCE(external_video_id, '') = COALESCE($3, '')
          AND COALESCE(external_item_id, '') = COALESCE($4, '')
          AND COALESCE(external_note_id, '') = COALESCE($5, '')
          AND relation_status = 'active'
        LIMIT 1
        "#,
    )
    .bind(platform)
    .bind(account_id)
    .bind(external_video_id)
    .bind(external_item_id)
    .bind(external_note_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "find marketing content platform video identity failed"))?;
    Ok(row.map(|row| {
        (
            row.get::<Uuid, _>("platform_video_id"),
            row.get::<Uuid, _>("asset_id"),
        )
    }))
}

pub(super) async fn find_platform_video_by_platform_external_video_id(
    pool: &PgPool,
    platform: &str,
    asset_id: Uuid,
    external_video_id: Option<&str>,
) -> AppResult<Option<(Uuid, Uuid)>> {
    let Some(external_video_id) = external_video_id else {
        return Ok(None);
    };
    let row = sqlx::query(
        r#"
        SELECT platform_video_id, asset_id
        FROM ads.marketing_content_platform_videos
        WHERE platform = $1
          AND external_video_id = $2
          AND relation_status = 'active'
        ORDER BY
          CASE WHEN asset_id = $3 THEN 0 ELSE 1 END ASC,
          updated_at DESC,
          created_at DESC
        LIMIT 1
        "#,
    )
    .bind(platform)
    .bind(external_video_id)
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| {
        map_write_error(
            err,
            "find marketing content platform video by external video id failed",
        )
    })?;
    Ok(row.map(|row| {
        (
            row.get::<Uuid, _>("platform_video_id"),
            row.get::<Uuid, _>("asset_id"),
        )
    }))
}

pub(super) async fn find_asset_platform_video_external_video_id(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
) -> AppResult<Option<String>> {
    let row = sqlx::query(
        r#"
        SELECT external_video_id
        FROM ads.marketing_content_platform_videos
        WHERE asset_id = $1
          AND platform_video_id = $2
          AND relation_status = 'active'
        LIMIT 1
        "#,
    )
    .bind(asset_id)
    .bind(platform_video_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "find asset platform video link details failed"))?;
    Ok(row.and_then(|row| row.get::<Option<String>, _>("external_video_id")))
}

pub(super) async fn find_asset_platform_video_for_ad_material(
    pool: &PgPool,
    asset_id: Uuid,
    external_video_id: Option<&str>,
    external_material_id: &str,
    ad_platform: &str,
) -> AppResult<Option<(Uuid, Option<String>)>> {
    let row = sqlx::query(
        r#"
        SELECT platform_video_id, external_video_id
        FROM ads.marketing_content_platform_videos
        WHERE asset_id = $1
          AND relation_status = 'active'
          AND (
            ($2::TEXT IS NOT NULL AND external_video_id = $2)
            OR ($4 IN ('qianchuan', '千川') AND external_item_id = $3)
          )
        ORDER BY
          CASE
            WHEN $2::TEXT IS NOT NULL AND external_video_id = $2 THEN 0
            WHEN $4 IN ('qianchuan', '千川') AND external_item_id = $3 THEN 1
            ELSE 2
          END ASC,
          updated_at DESC,
          created_at DESC
        LIMIT 1
        "#,
    )
    .bind(asset_id)
    .bind(external_video_id)
    .bind(external_material_id)
    .bind(ad_platform)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "find platform video for ad material failed"))?;
    Ok(row.map(|row| {
        (
            row.get::<Uuid, _>("platform_video_id"),
            row.get::<Option<String>, _>("external_video_id"),
        )
    }))
}

pub(super) async fn find_ad_material_identity(
    pool: &PgPool,
    ad_platform: &str,
    account_id: Option<&str>,
    external_material_id: &str,
) -> AppResult<Option<(Uuid, Uuid)>> {
    let row = sqlx::query(
        r#"
        SELECT ad_material_id, asset_id
        FROM ads.marketing_content_ad_materials
        WHERE ad_platform = $1
          AND COALESCE(account_id, '') = COALESCE($2, '')
          AND external_material_id = $3
          AND relation_status = 'active'
        LIMIT 1
        "#,
    )
    .bind(ad_platform)
    .bind(account_id)
    .bind(external_material_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "find marketing content ad material identity failed"))?;
    Ok(row.map(|row| {
        (
            row.get::<Uuid, _>("ad_material_id"),
            row.get::<Uuid, _>("asset_id"),
        )
    }))
}
