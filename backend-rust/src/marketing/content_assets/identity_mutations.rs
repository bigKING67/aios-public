use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::events::insert_event;
use super::guards::{ensure_asset_exists, ensure_platform_video_belongs_to_asset, ensure_updated};
use super::identity_lookup::{
    find_ad_material_identity, find_asset_platform_video_external_video_id,
    find_asset_platform_video_for_ad_material, find_platform_video_by_platform_external_video_id,
    find_platform_video_identity,
};
use super::identity_metadata::{
    refresh_existing_ad_material_metadata, refresh_existing_platform_video_metadata,
    sync_asset_platform_binding,
};
pub(super) use super::identity_unmatched_bindings::bind_unmatched_stats;
use super::mutation_types::{
    NormalizedContentAssetAdMaterialCreate, NormalizedContentAssetPlatformVideoCreate,
};
use super::write_errors::map_write_error;

pub(super) async fn create_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetPlatformVideoCreate,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    ensure_asset_exists(pool, asset_id).await?;
    ensure_qianchuan_material_id_available_for_platform_video(pool, asset_id, &payload).await?;
    if let Some((existing_platform_video_id, existing_asset_id)) = find_platform_video_identity(
        pool,
        &payload.platform,
        payload.account_id.as_deref(),
        payload.external_video_id.as_deref(),
        payload.external_item_id.as_deref(),
        payload.external_note_id.as_deref(),
    )
    .await?
    {
        if existing_asset_id != asset_id {
            return Err(AppError::Conflict(
                "该平台视频 ID 已绑定到其他内容资产".to_string(),
            ));
        }
        refresh_existing_platform_video_metadata(
            pool,
            asset_id,
            existing_platform_video_id,
            &payload,
        )
        .await?;
        sync_asset_platform_binding(pool, asset_id, &payload.platform).await?;
        sync_qianchuan_ad_material_from_platform_video(
            pool,
            asset_id,
            existing_platform_video_id,
            &payload,
            actor,
        )
        .await?;
        return Ok(existing_platform_video_id);
    }
    if let Some((existing_platform_video_id, existing_asset_id)) =
        find_platform_video_by_platform_external_video_id(
            pool,
            &payload.platform,
            asset_id,
            payload.external_video_id.as_deref(),
        )
        .await?
    {
        if existing_asset_id != asset_id {
            return Err(AppError::Conflict(
                "该平台视频 ID 已绑定到其他内容资产".to_string(),
            ));
        }
        refresh_existing_platform_video_metadata(
            pool,
            asset_id,
            existing_platform_video_id,
            &payload,
        )
        .await?;
        sync_asset_platform_binding(pool, asset_id, &payload.platform).await?;
        sync_qianchuan_ad_material_from_platform_video(
            pool,
            asset_id,
            existing_platform_video_id,
            &payload,
            actor,
        )
        .await?;
        return Ok(existing_platform_video_id);
    }

    let platform_video_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_platform_videos (
          platform_video_id,
          asset_id,
          platform,
          account_id,
          account_name,
          advertiser_id,
          external_video_id,
          external_item_id,
          external_note_id,
          external_url,
          publish_title,
          publish_status,
          source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual')
        "#,
    )
    .bind(platform_video_id)
    .bind(asset_id)
    .bind(&payload.platform)
    .bind(&payload.account_id)
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
    .map_err(|err| map_write_error(err, "create marketing content platform video failed"))?;

    sync_asset_platform_binding(pool, asset_id, &payload.platform).await?;
    sync_qianchuan_ad_material_from_platform_video(
        pool,
        asset_id,
        platform_video_id,
        &payload,
        actor,
    )
    .await?;

    insert_event(
        pool,
        asset_id,
        "platform_video_created",
        actor,
        Some("已新增平台视频/笔记身份"),
        json!({
            "platform_video_id": platform_video_id,
            "platform": payload.platform,
            "external_video_id": payload.external_video_id,
            "external_item_id": payload.external_item_id,
            "external_note_id": payload.external_note_id
        }),
    )
    .await?;
    Ok(platform_video_id)
}

pub(super) async fn update_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
    payload: NormalizedContentAssetPlatformVideoCreate,
    actor: Option<&str>,
) -> AppResult<()> {
    ensure_asset_exists(pool, asset_id).await?;
    ensure_qianchuan_material_id_available_for_platform_video(pool, asset_id, &payload).await?;
    let previous_identity =
        find_platform_video_sync_identity(pool, asset_id, platform_video_id).await?;
    if let Some((existing_platform_video_id, existing_asset_id)) =
        find_platform_video_by_platform_external_video_id(
            pool,
            &payload.platform,
            asset_id,
            payload.external_video_id.as_deref(),
        )
        .await?
    {
        if existing_platform_video_id != platform_video_id || existing_asset_id != asset_id {
            return Err(AppError::Conflict(
                "该平台视频 ID 已绑定到其他内容资产或当前资产的其他身份".to_string(),
            ));
        }
    }
    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_platform_videos
        SET
          platform = $3,
          account_id = $4,
          account_name = $5,
          advertiser_id = $6,
          external_video_id = $7,
          external_item_id = $8,
          external_note_id = $9,
          external_url = $10,
          publish_title = $11,
          publish_status = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE platform_video_id = $1
          AND asset_id = $2
          AND relation_status <> 'archived'
        "#,
    )
    .bind(platform_video_id)
    .bind(asset_id)
    .bind(&payload.platform)
    .bind(&payload.account_id)
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
    .map_err(|err| map_write_error(err, "update marketing content platform video failed"))?
    .rows_affected();

    ensure_updated(rows_affected)?;
    sync_asset_platform_name(pool, asset_id, &payload.platform).await?;
    let archived_stale_materials = archive_stale_qianchuan_material_for_platform_video(
        pool,
        asset_id,
        platform_video_id,
        previous_identity.as_ref(),
        payload.external_item_id.as_deref(),
    )
    .await?;
    sync_qianchuan_ad_material_from_platform_video(
        pool,
        asset_id,
        platform_video_id,
        &payload,
        actor,
    )
    .await?;
    insert_event(
        pool,
        asset_id,
        "platform_video_updated",
        actor,
        Some("平台视频/笔记身份已更新"),
        json!({
            "platform_video_id": platform_video_id,
            "platform": payload.platform,
            "external_video_id": payload.external_video_id,
            "external_item_id": payload.external_item_id,
            "external_note_id": payload.external_note_id,
            "archived_stale_qianchuan_materials": archived_stale_materials
        }),
    )
    .await?;
    Ok(())
}

async fn find_platform_video_sync_identity(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
) -> AppResult<Option<(String, Option<String>)>> {
    let row = sqlx::query(
        r#"
        SELECT platform, external_item_id
        FROM ads.marketing_content_platform_videos
        WHERE platform_video_id = $1
          AND asset_id = $2
          AND relation_status <> 'archived'
        LIMIT 1
        "#,
    )
    .bind(platform_video_id)
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|err| map_write_error(err, "find platform video sync identity failed"))?;
    Ok(row.map(|row| {
        (
            row.get::<String, _>("platform"),
            row.get::<Option<String>, _>("external_item_id"),
        )
    }))
}

async fn archive_stale_qianchuan_material_for_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
    previous_identity: Option<&(String, Option<String>)>,
    next_external_item_id: Option<&str>,
) -> AppResult<u64> {
    let Some((previous_platform, previous_external_item_id)) = previous_identity else {
        return Ok(0);
    };
    if previous_platform != "douyin" {
        return Ok(0);
    }
    let Some(previous_external_item_id) =
        normalized_optional_text(previous_external_item_id.as_deref())
    else {
        return Ok(0);
    };
    let next_external_item_id = normalized_optional_text(next_external_item_id);
    if Some(previous_external_item_id.as_str()) == next_external_item_id.as_deref() {
        return Ok(0);
    }

    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_ad_materials
        SET
          relation_status = 'archived',
          raw_payload = raw_payload || JSONB_BUILD_OBJECT(
            'archived_reason',
            'platform_video_material_id_replaced',
            'archived_from_platform_video_id',
            $2::TEXT,
            'replaced_by_external_material_id',
            $4
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE asset_id = $1
          AND platform_video_id = $2
          AND relation_status = 'active'
          AND ad_platform = 'qianchuan'
          AND NULLIF(BTRIM(external_material_id), '') = $3
        "#,
    )
    .bind(asset_id)
    .bind(platform_video_id)
    .bind(&previous_external_item_id)
    .bind(next_external_item_id.as_deref())
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "archive stale qianchuan ad material failed"))?
    .rows_affected();

    Ok(rows_affected)
}

fn normalized_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

async fn ensure_qianchuan_material_id_available_for_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    payload: &NormalizedContentAssetPlatformVideoCreate,
) -> AppResult<()> {
    if payload.platform != "douyin" {
        return Ok(());
    }
    let Some(external_material_id) = payload.external_item_id.as_deref() else {
        return Ok(());
    };
    let Some((_existing_ad_material_id, existing_asset_id)) = find_ad_material_identity(
        pool,
        "qianchuan",
        payload.account_id.as_deref(),
        external_material_id,
    )
    .await?
    else {
        return Ok(());
    };
    if existing_asset_id != asset_id {
        return Err(AppError::Conflict(
            "该千川素材 ID 已绑定到其他内容资产".to_string(),
        ));
    }
    Ok(())
}

async fn sync_qianchuan_ad_material_from_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    platform_video_id: Uuid,
    payload: &NormalizedContentAssetPlatformVideoCreate,
    actor: Option<&str>,
) -> AppResult<Option<Uuid>> {
    if payload.platform != "douyin" {
        return Ok(None);
    }
    let Some(external_material_id) = payload.external_item_id.clone() else {
        return Ok(None);
    };
    let material_payload = NormalizedContentAssetAdMaterialCreate {
        platform_video_id: Some(platform_video_id),
        ad_platform: "qianchuan".to_string(),
        account_id: payload.account_id.clone(),
        account_name: payload.account_name.clone(),
        advertiser_id: payload.advertiser_id.clone(),
        external_material_id,
        external_video_id: payload.external_video_id.clone(),
        material_name: None,
        material_title: payload.publish_title.clone(),
        material_status: "unknown".to_string(),
    };
    create_ad_material(pool, asset_id, material_payload, actor)
        .await
        .map(Some)
}

async fn sync_asset_platform_name(pool: &PgPool, asset_id: Uuid, platform: &str) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET
          platform = COALESCE(NULLIF(platform, ''), $2),
          platform_names = CASE
            WHEN platform_names && ARRAY[$2]::TEXT[] THEN platform_names
            ELSE platform_names || ARRAY[$2]::TEXT[]
          END
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .bind(platform)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "sync content asset platform names failed"))?;
    Ok(())
}

pub(super) async fn create_ad_material(
    pool: &PgPool,
    asset_id: Uuid,
    payload: NormalizedContentAssetAdMaterialCreate,
    actor: Option<&str>,
) -> AppResult<Uuid> {
    ensure_asset_exists(pool, asset_id).await?;
    let (platform_video_id, external_video_id) =
        resolve_ad_material_platform_video(pool, asset_id, &payload).await?;
    if let Some((existing_ad_material_id, existing_asset_id)) = find_ad_material_identity(
        pool,
        &payload.ad_platform,
        payload.account_id.as_deref(),
        &payload.external_material_id,
    )
    .await?
    {
        if existing_asset_id != asset_id {
            return Err(AppError::Conflict(
                "该广告素材 ID 已绑定到其他内容资产".to_string(),
            ));
        }
        refresh_existing_ad_material_metadata(
            pool,
            asset_id,
            existing_ad_material_id,
            platform_video_id,
            external_video_id.as_deref(),
            &payload,
        )
        .await?;
        sync_asset_material_status(pool, asset_id).await?;
        insert_event(
            pool,
            asset_id,
            "ad_material_updated",
            actor,
            Some("广告素材实例已补充更新"),
            json!({
                "ad_material_id": existing_ad_material_id,
                "ad_platform": payload.ad_platform,
                "external_material_id": payload.external_material_id,
                "external_video_id": external_video_id,
                "platform_video_id": platform_video_id
            }),
        )
        .await?;
        return Ok(existing_ad_material_id);
    }
    let ad_material_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO ads.marketing_content_ad_materials (
          ad_material_id,
          asset_id,
          platform_video_id,
          ad_platform,
          account_id,
          account_name,
          advertiser_id,
          external_material_id,
          external_video_id,
          material_name,
          material_title,
          material_status,
          source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual')
        "#,
    )
    .bind(ad_material_id)
    .bind(asset_id)
    .bind(platform_video_id)
    .bind(&payload.ad_platform)
    .bind(&payload.account_id)
    .bind(&payload.account_name)
    .bind(&payload.advertiser_id)
    .bind(&payload.external_material_id)
    .bind(&external_video_id)
    .bind(&payload.material_name)
    .bind(&payload.material_title)
    .bind(&payload.material_status)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "create marketing content ad material failed"))?;

    sync_asset_material_status(pool, asset_id).await?;

    insert_event(
        pool,
        asset_id,
        "ad_material_created",
        actor,
        Some("已新增广告素材实例"),
        json!({
            "ad_material_id": ad_material_id,
            "ad_platform": payload.ad_platform,
            "external_material_id": payload.external_material_id,
            "external_video_id": external_video_id,
            "platform_video_id": platform_video_id
        }),
    )
    .await?;
    Ok(ad_material_id)
}

async fn sync_asset_material_status(pool: &PgPool, asset_id: Uuid) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE ads.marketing_content_assets
        SET profile_status = CASE
          WHEN profile_status IN ('incomplete', 'basic_complete', 'platform_bound')
            THEN 'performance_ready'
          ELSE profile_status
        END
        WHERE asset_id = $1 AND is_deleted = FALSE
        "#,
    )
    .bind(asset_id)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "sync content asset material status failed"))?;
    Ok(())
}

pub(super) async fn update_ad_material(
    pool: &PgPool,
    asset_id: Uuid,
    ad_material_id: Uuid,
    payload: NormalizedContentAssetAdMaterialCreate,
    actor: Option<&str>,
) -> AppResult<()> {
    ensure_asset_exists(pool, asset_id).await?;
    let (platform_video_id, external_video_id) =
        resolve_ad_material_platform_video(pool, asset_id, &payload).await?;
    if let Some((existing_ad_material_id, existing_asset_id)) = find_ad_material_identity(
        pool,
        &payload.ad_platform,
        payload.account_id.as_deref(),
        &payload.external_material_id,
    )
    .await?
    {
        if existing_asset_id != asset_id || existing_ad_material_id != ad_material_id {
            return Err(AppError::Conflict(
                "该广告素材 ID 已绑定到其他内容资产或当前资产的其他素材实例".to_string(),
            ));
        }
    }
    let rows_affected = sqlx::query(
        r#"
        UPDATE ads.marketing_content_ad_materials
        SET
          platform_video_id = $3,
          ad_platform = $4,
          account_id = $5,
          account_name = $6,
          advertiser_id = $7,
          external_material_id = $8,
          external_video_id = $9,
          material_name = $10,
          material_title = $11,
          material_status = $12,
          updated_at = CURRENT_TIMESTAMP
        WHERE ad_material_id = $1
          AND asset_id = $2
          AND relation_status <> 'archived'
        "#,
    )
    .bind(ad_material_id)
    .bind(asset_id)
    .bind(platform_video_id)
    .bind(&payload.ad_platform)
    .bind(&payload.account_id)
    .bind(&payload.account_name)
    .bind(&payload.advertiser_id)
    .bind(&payload.external_material_id)
    .bind(&external_video_id)
    .bind(&payload.material_name)
    .bind(&payload.material_title)
    .bind(&payload.material_status)
    .execute(pool)
    .await
    .map_err(|err| map_write_error(err, "update marketing content ad material failed"))?
    .rows_affected();

    ensure_updated(rows_affected)?;
    insert_event(
        pool,
        asset_id,
        "ad_material_updated",
        actor,
        Some("广告素材实例已更新"),
        json!({
            "ad_material_id": ad_material_id,
            "ad_platform": payload.ad_platform,
            "external_material_id": payload.external_material_id,
            "external_video_id": external_video_id,
            "platform_video_id": platform_video_id
        }),
    )
    .await?;
    Ok(())
}

async fn resolve_ad_material_platform_video(
    pool: &PgPool,
    asset_id: Uuid,
    payload: &NormalizedContentAssetAdMaterialCreate,
) -> AppResult<(Option<Uuid>, Option<String>)> {
    if let Some(platform_video_id) = payload.platform_video_id {
        ensure_platform_video_belongs_to_asset(pool, asset_id, platform_video_id).await?;
        let linked_external_video_id =
            find_asset_platform_video_external_video_id(pool, asset_id, platform_video_id).await?;
        return Ok((
            Some(platform_video_id),
            payload
                .external_video_id
                .clone()
                .or(linked_external_video_id),
        ));
    }

    if let Some((platform_video_id, linked_external_video_id)) =
        find_asset_platform_video_for_ad_material(
            pool,
            asset_id,
            payload.external_video_id.as_deref(),
            &payload.external_material_id,
            &payload.ad_platform,
        )
        .await?
    {
        return Ok((
            Some(platform_video_id),
            payload
                .external_video_id
                .clone()
                .or(linked_external_video_id),
        ));
    }

    Ok((None, payload.external_video_id.clone()))
}
