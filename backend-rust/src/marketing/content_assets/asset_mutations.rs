use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::events::insert_event;
use super::guards::ensure_updated;
use super::mutation_types::{
    NormalizedContentAssetProfileUpdate, NormalizedContentAssetUploadCreate,
};
use super::write_errors::map_write_error;

pub(super) struct ManualUploadActor<'a> {
    pub(super) username: Option<&'a str>,
    pub(super) user_id: Option<&'a str>,
}

pub(super) async fn update_asset_profile(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetProfileUpdate,
    actor: Option<&str>,
) -> AppResult<()> {
    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET
          title = $2,
          platform = $3,
          product_name = $4,
          product_names = $5,
          sku_names = $6,
          creator_name = $7,
          video_type = $8,
          content_scene = $9,
          content_scene_group = $10,
          content_scene_subtype = $11,
          owner_name = $12,
          owner_user_id = $13,
          tags = $14,
          notes = $15,
          profile_status = $16,
          lifecycle_status = $17,
          authorization_status = $18,
          commercial_use_allowed = $19,
          repurpose_allowed = $20,
          authorization_starts_at = $21,
          authorization_expires_at = $22,
          authorization_notes = $23,
          platform_names = $24,
          title_source = 'manual',
          tags_source = CASE WHEN CARDINALITY($14::TEXT[]) > 0 THEN 'manual' ELSE 'empty' END
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .bind(&payload.title)
    .bind(&payload.platform)
    .bind(&payload.product_name)
    .bind(&payload.product_names)
    .bind(&payload.sku_names)
    .bind(&payload.creator_name)
    .bind(&payload.video_type)
    .bind(&payload.content_scene)
    .bind(&payload.content_scene_group)
    .bind(&payload.content_scene_subtype)
    .bind(&payload.owner_name)
    .bind(&payload.owner_user_id)
    .bind(&payload.tags)
    .bind(&payload.notes)
    .bind(&payload.profile_status)
    .bind(&payload.lifecycle_status)
    .bind(&payload.authorization_status)
    .bind(payload.commercial_use_allowed)
    .bind(payload.repurpose_allowed)
    .bind(payload.authorization_starts_at)
    .bind(payload.authorization_expires_at)
    .bind(&payload.authorization_notes)
    .bind(&payload.platform_names)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "update marketing content asset profile failed"))?
    .rows_affected();

    ensure_updated(rows_affected)?;
    insert_event(
        pool,
        asset_id,
        "profile_updated",
        actor,
        Some("业务档案已更新"),
        json!({ "title": payload.title }),
    )
    .await?;
    Ok(())
}

pub(super) async fn create_manual_upload_asset(
    pool: &PgPool,
    asset_id: Uuid,
    bucket: &str,
    region: &str,
    object_key: &str,
    payload: NormalizedContentAssetUploadCreate,
    actor: ManualUploadActor<'_>,
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin marketing content asset upload transaction failed",
        )
    })?;
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_assets (
          asset_id,
          title,
          asset_type,
          asset_status,
          profile_status,
          lifecycle_status,
          source_type,
          external_only,
          bucket,
          raw_object_key,
          file_ext,
          mime_type,
          file_size_bytes,
          title_source,
          platform,
          platform_names,
          product_name,
          product_names,
          sku_names,
          creator_name,
          video_type,
          content_scene,
          content_scene_group,
          content_scene_subtype,
          owner_name,
          owner_user_id,
          tags,
          tags_source,
          notes,
          uploaded_by,
          uploaded_by_user_id
        ) VALUES (
          $1, $2, 'video', 'uploading', 'incomplete', 'draft', 'manual_upload',
          FALSE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        )
        "#,
    )
    .bind(asset_id)
    .bind(&payload.title)
    .bind(bucket)
    .bind(object_key)
    .bind(&payload.file_ext)
    .bind(&payload.content_type)
    .bind(payload.file_size_bytes)
    .bind(&payload.title_source)
    .bind(&payload.platform)
    .bind(&payload.platform_names)
    .bind(&payload.product_name)
    .bind(&payload.product_names)
    .bind(&payload.sku_names)
    .bind(&payload.creator_name)
    .bind(&payload.video_type)
    .bind(&payload.content_scene)
    .bind(&payload.content_scene_group)
    .bind(&payload.content_scene_subtype)
    .bind(&payload.owner_name)
    .bind(&payload.owner_user_id)
    .bind(&payload.tags)
    .bind(&payload.tags_source)
    .bind(&payload.notes)
    .bind(actor.username)
    .bind(actor.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "create manual upload marketing content asset failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_objects (
          object_id,
          asset_id,
          object_role,
          storage_provider,
          bucket,
          region,
          object_key,
          content_type,
          file_ext,
          size_bytes,
          status,
          metadata
        ) VALUES ($1, $2, 'raw', 'tos', $3, $4, $5, $6, $7, $8, 'missing', $9)
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(asset_id)
    .bind(bucket)
    .bind(region)
    .bind(object_key)
    .bind(&payload.content_type)
    .bind(&payload.file_ext)
    .bind(payload.file_size_bytes)
    .bind(json!({
        "file_name": &payload.file_name,
        "pending_raw_sha256": &payload.raw_sha256,
        "upload_state": "presigned"
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "create manual upload content asset object failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_sources (
          asset_id,
          source_kind,
          source_title,
          external_status,
          metadata
        ) VALUES ($1, 'manual_upload', $2, 'pending_manual_upload', $3)
        "#,
    )
    .bind(asset_id)
    .bind(&payload.title)
    .bind(json!({
        "file_name": &payload.file_name,
        "content_type": &payload.content_type,
        "file_size_bytes": payload.file_size_bytes,
        "object_key": object_key,
        "pending_raw_sha256": &payload.raw_sha256
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "create manual upload content asset source failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, 'manual_upload_requested', $2, '已创建视频源文件上传任务', $3)
        "#,
    )
    .bind(asset_id)
    .bind(actor.username)
    .bind(json!({
        "bucket": bucket,
        "object_key": object_key,
        "content_type": &payload.content_type,
        "pending_raw_sha256": &payload.raw_sha256
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "insert manual upload request event failed"))?;

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit marketing content asset upload transaction failed",
        )
    })?;
    Ok(())
}

pub(super) async fn prepare_existing_asset_source_upload(
    pool: &PgPool,
    asset_id: Uuid,
    bucket: &str,
    region: &str,
    object_key: &str,
    payload: NormalizedContentAssetUploadCreate,
    actor: ManualUploadActor<'_>,
) -> AppResult<()> {
    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin existing content asset source upload transaction failed",
        )
    })?;

    let row = sqlx::query(
        r#"
        SELECT external_only, raw_object_key
        FROM ads.marketing_content_assets
        WHERE asset_id = $1 AND is_deleted = FALSE
        FOR UPDATE
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "lock existing content asset for source upload failed"))?;

    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let external_only: bool = row.try_get("external_only").unwrap_or(false);
    let raw_object_key: Option<String> = row.try_get("raw_object_key").ok();
    if !external_only
        && raw_object_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    {
        return Err(AppError::bad_request("该素材源文件已入库，无需补传"));
    }

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET
          asset_status = 'uploading',
          bucket = $2,
          raw_object_key = $3,
          file_ext = $4,
          mime_type = $5,
          file_size_bytes = $6,
          uploaded_by = $7,
          uploaded_by_user_id = $8
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .bind(bucket)
    .bind(object_key)
    .bind(&payload.file_ext)
    .bind(&payload.content_type)
    .bind(payload.file_size_bytes)
    .bind(actor.username)
    .bind(actor.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "prepare existing content asset source upload failed"))?;

    let updated_objects = sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_objects
        SET
          storage_provider = 'tos',
          bucket = $2,
          region = $3,
          object_key = $4,
          content_type = $5,
          file_ext = $6,
          size_bytes = $7,
          sha256 = NULL,
          status = 'missing',
          metadata = metadata || $8
        WHERE asset_id = $1
          AND object_role = 'raw'
          AND status <> 'active'
        "#,
    )
    .bind(asset_id)
    .bind(bucket)
    .bind(region)
    .bind(object_key)
    .bind(&payload.content_type)
    .bind(&payload.file_ext)
    .bind(payload.file_size_bytes)
    .bind(json!({
        "file_name": &payload.file_name,
        "upload_state": "presigned",
        "source_upload": true
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "update existing content asset raw object failed"))?
    .rows_affected();

    if updated_objects == 0 {
        sqlx::query(
            r#"
            INSERT INTO ads.marketing_content_asset_objects (
              object_id,
              asset_id,
              object_role,
              storage_provider,
              bucket,
              region,
              object_key,
              content_type,
              file_ext,
              size_bytes,
              status,
              metadata
            ) VALUES ($1, $2, 'raw', 'tos', $3, $4, $5, $6, $7, $8, 'missing', $9)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(asset_id)
        .bind(bucket)
        .bind(region)
        .bind(object_key)
        .bind(&payload.content_type)
        .bind(&payload.file_ext)
        .bind(payload.file_size_bytes)
        .bind(json!({
            "file_name": &payload.file_name,
            "upload_state": "presigned",
            "source_upload": true
        }))
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "insert existing content asset raw object failed"))?;
    }

    sqlx::query(
        r#"
        UPDATE ads.marketing_content_asset_sources
        SET
          external_status = 'pending_manual_upload',
          metadata = metadata || $2
        WHERE asset_id = $1
          AND external_status <> 'ingested'
        "#,
    )
    .bind(asset_id)
    .bind(json!({
        "source_upload_object_key": object_key,
        "source_upload_file_name": &payload.file_name,
        "source_upload_content_type": &payload.content_type,
        "source_upload_file_size_bytes": payload.file_size_bytes
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "mark source upload pending failed"))?;

    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_asset_events (asset_id, event_type, actor, message, payload)
        VALUES ($1, 'source_upload_requested', $2, '已创建待补源视频上传任务', $3)
        "#,
    )
    .bind(asset_id)
    .bind(actor.username)
    .bind(json!({
        "bucket": bucket,
        "object_key": object_key,
        "content_type": &payload.content_type
    }))
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "insert source upload request event failed"))?;

    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit existing content asset source upload transaction failed",
        )
    })?;
    Ok(())
}
