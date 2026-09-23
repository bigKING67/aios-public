use chrono::NaiveDate;
use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::events::insert_event_tx;
use super::guards::ensure_asset_exists;
use super::identity_lookup::{
    find_ad_material_identity, find_asset_platform_video_for_ad_material,
    find_platform_video_by_platform_external_video_id, find_platform_video_identity,
};
use super::performance::{refresh_asset_performance_rollups_tx, AssetPerformanceRollupRefresh};
use super::text_normalization::{
    clean_required_ad_platform_code, clean_required_platform_code, clean_required_text, clean_text,
};
use super::types::{ContentAssetUnmatchedStatsBindRequest, ContentAssetUnmatchedStatsBindResponse};
use super::write_errors::map_write_error;

pub(super) async fn bind_unmatched_stats(
    pool: &PgPool,
    payload: ContentAssetUnmatchedStatsBindRequest,
    actor: Option<&str>,
) -> AppResult<ContentAssetUnmatchedStatsBindResponse> {
    ensure_asset_exists(pool, payload.asset_id).await?;
    let match_type = clean_text(Some(payload.match_type.clone()), 40);
    match match_type.as_deref() {
        Some("ad_material") => bind_unmatched_ad_material(pool, payload, actor).await,
        Some("platform_video") => bind_unmatched_platform_video(pool, payload, actor).await,
        _ => Err(AppError::bad_request(
            "匹配类型必须是 ad_material / platform_video",
        )),
    }
}

async fn bind_unmatched_ad_material(
    pool: &PgPool,
    payload: ContentAssetUnmatchedStatsBindRequest,
    actor: Option<&str>,
) -> AppResult<ContentAssetUnmatchedStatsBindResponse> {
    let ad_platform =
        clean_required_ad_platform_code(Some(payload.platform), 80, "广告平台不能为空")?;
    let external_material_id =
        clean_required_text(payload.external_material_id, 180, "素材 ID 不能为空")?;
    let account_id = clean_text(payload.account_id, 80);
    let account_name = clean_text(payload.account_name, 120);
    let advertiser_id = clean_text(payload.advertiser_id, 80);
    let external_video_id = clean_text(payload.external_video_id, 160);

    let (platform_video_id, resolved_external_video_id) =
        match find_asset_platform_video_for_ad_material(
            pool,
            payload.asset_id,
            external_video_id.as_deref(),
            &external_material_id,
            &ad_platform,
        )
        .await?
        {
            Some((platform_video_id, linked_external_video_id)) => (
                Some(platform_video_id),
                external_video_id.clone().or(linked_external_video_id),
            ),
            None => (None, external_video_id.clone()),
        };
    let (ad_material_id, identity_exists) = match find_ad_material_identity(
        pool,
        &ad_platform,
        account_id.as_deref(),
        &external_material_id,
    )
    .await?
    {
        Some((existing_id, existing_asset_id)) if existing_asset_id == payload.asset_id => {
            (existing_id, true)
        }
        Some((_existing_id, _existing_asset_id)) => {
            return Err(AppError::Conflict(
                "该广告素材 ID 已绑定到其他内容资产".to_string(),
            ));
        }
        None => (Uuid::new_v4(), false),
    };

    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(err, "begin unmatched ad material bind transaction failed")
    })?;

    if identity_exists {
        sqlx::query(
            r#"
            UPDATE ads.marketing_content_ad_materials
            SET
              platform_video_id = COALESCE($2, platform_video_id),
              account_name = COALESCE($3, account_name),
              advertiser_id = COALESCE($4, advertiser_id),
              external_video_id = COALESCE($5, external_video_id),
              updated_at = CURRENT_TIMESTAMP
            WHERE ad_material_id = $1 AND asset_id = $6 AND relation_status = 'active'
            "#,
        )
        .bind(ad_material_id)
        .bind(platform_video_id)
        .bind(&account_name)
        .bind(&advertiser_id)
        .bind(&resolved_external_video_id)
        .bind(payload.asset_id)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "update unmatched ad material identity failed"))?;
    } else {
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
              material_status,
              source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unknown', 'report_import')
            "#,
        )
        .bind(ad_material_id)
        .bind(payload.asset_id)
        .bind(platform_video_id)
        .bind(&ad_platform)
        .bind(&account_id)
        .bind(&account_name)
        .bind(&advertiser_id)
        .bind(&external_material_id)
        .bind(&resolved_external_video_id)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "insert unmatched ad material identity failed"))?;
    }

    let bind_stats = sqlx::query(
        r#"
        WITH updated AS (
          UPDATE dwd.marketing_content_ad_material_stats_di
          SET
            asset_id = $4,
            platform_video_id = $5,
            ad_material_id = $6,
            match_status = 'matched',
            updated_at = CURRENT_TIMESTAMP
          WHERE ad_platform = $1
            AND COALESCE(account_id, '') = COALESCE($2, '')
            AND external_material_id = $3
            AND match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
          RETURNING stat_date
        )
        SELECT
          COUNT(*)::BIGINT AS affected_rows,
          MIN(stat_date) AS first_stat_date,
          MAX(stat_date) AS last_stat_date
        FROM updated
        "#,
    )
    .bind(&ad_platform)
    .bind(&account_id)
    .bind(&external_material_id)
    .bind(payload.asset_id)
    .bind(platform_video_id)
    .bind(ad_material_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "bind unmatched ad material stats failed"))?;
    let affected_rows = bind_stats.get::<i64, _>("affected_rows");
    let first_stat_date = bind_stats.get::<Option<NaiveDate>, _>("first_stat_date");
    let last_stat_date = bind_stats.get::<Option<NaiveDate>, _>("last_stat_date");
    let refresh = if affected_rows > 0 {
        refresh_asset_performance_rollups_tx(
            &mut tx,
            payload.asset_id,
            first_stat_date,
            last_stat_date,
        )
        .await?
    } else {
        AssetPerformanceRollupRefresh::default()
    };
    let refresh_first_stat_date = refresh.first_stat_date.as_ref().map(ToString::to_string);
    let refresh_last_stat_date = refresh.last_stat_date.as_ref().map(ToString::to_string);

    insert_event_tx(
        &mut tx,
        payload.asset_id,
        "unmatched_stats_bound",
        actor,
        Some("未匹配广告素材日报已绑定到内容资产"),
        json!({
            "match_type": "ad_material",
            "ad_platform": ad_platform,
            "external_material_id": external_material_id,
            "external_video_id": resolved_external_video_id,
            "affected_rows": affected_rows,
            "performance_rollups": {
                "daily_rows": refresh.daily_rows,
                "lifetime_rows": refresh.lifetime_rows,
                "asset_snapshot_rows": refresh.asset_snapshot_rows,
                "first_stat_date": refresh_first_stat_date,
                "last_stat_date": refresh_last_stat_date
            }
        }),
    )
    .await?;
    tx.commit().await.map_err(|err| {
        map_write_error(err, "commit unmatched ad material bind transaction failed")
    })?;

    Ok(ContentAssetUnmatchedStatsBindResponse {
        asset_id: payload.asset_id,
        platform_video_id,
        ad_material_id: Some(ad_material_id),
        affected_rows,
        message: format!(
            "已绑定 {affected_rows} 条广告素材日报记录，并刷新 {} 条素材表现快照",
            refresh.asset_snapshot_rows
        ),
    })
}

async fn bind_unmatched_platform_video(
    pool: &PgPool,
    payload: ContentAssetUnmatchedStatsBindRequest,
    actor: Option<&str>,
) -> AppResult<ContentAssetUnmatchedStatsBindResponse> {
    let platform = clean_required_platform_code(Some(payload.platform), 80, "平台不能为空")?;
    let account_id = clean_text(payload.account_id, 80);
    let account_name = clean_text(payload.account_name, 120);
    let external_video_id = clean_text(payload.external_video_id, 160);
    let external_item_id = clean_text(payload.external_item_id, 160);
    let external_note_id = clean_text(payload.external_note_id, 160);
    if external_video_id.is_none() && external_item_id.is_none() && external_note_id.is_none() {
        return Err(AppError::bad_request(
            "平台视频身份至少需要 video_id / item_id / note_id 之一",
        ));
    }

    let (platform_video_id, identity_exists) = match find_platform_video_identity(
        pool,
        &platform,
        account_id.as_deref(),
        external_video_id.as_deref(),
        external_item_id.as_deref(),
        external_note_id.as_deref(),
    )
    .await?
    {
        Some((existing_id, existing_asset_id)) if existing_asset_id == payload.asset_id => {
            (existing_id, true)
        }
        Some((_existing_id, _existing_asset_id)) => {
            return Err(AppError::Conflict(
                "该平台视频 ID 已绑定到其他内容资产".to_string(),
            ));
        }
        None => match find_platform_video_by_platform_external_video_id(
            pool,
            &platform,
            payload.asset_id,
            external_video_id.as_deref(),
        )
        .await?
        {
            Some((existing_id, existing_asset_id)) if existing_asset_id == payload.asset_id => {
                (existing_id, true)
            }
            Some((_existing_id, _existing_asset_id)) => {
                return Err(AppError::Conflict(
                    "该平台视频 ID 已绑定到其他内容资产".to_string(),
                ));
            }
            None => (Uuid::new_v4(), false),
        },
    };

    let mut tx = pool.begin().await.map_err(|err| {
        map_write_error(
            err,
            "begin unmatched platform video bind transaction failed",
        )
    })?;

    if identity_exists {
        sqlx::query(
            r#"
            UPDATE ads.marketing_content_platform_videos
            SET
              account_name = COALESCE($2, account_name),
              external_video_id = COALESCE($4, external_video_id),
              external_item_id = COALESCE($5, external_item_id),
              external_note_id = COALESCE($6, external_note_id),
              updated_at = CURRENT_TIMESTAMP
            WHERE platform_video_id = $1 AND asset_id = $3 AND relation_status = 'active'
            "#,
        )
        .bind(platform_video_id)
        .bind(&account_name)
        .bind(payload.asset_id)
        .bind(&external_video_id)
        .bind(&external_item_id)
        .bind(&external_note_id)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "update unmatched platform video identity failed"))?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO ads.marketing_content_platform_videos (
              platform_video_id,
              asset_id,
              platform,
              account_id,
              account_name,
              external_video_id,
              external_item_id,
              external_note_id,
              publish_status,
              source
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unknown', 'report_import')
            "#,
        )
        .bind(platform_video_id)
        .bind(payload.asset_id)
        .bind(&platform)
        .bind(&account_id)
        .bind(&account_name)
        .bind(&external_video_id)
        .bind(&external_item_id)
        .bind(&external_note_id)
        .execute(&mut *tx)
        .await
        .map_err(|err| map_write_error(err, "insert unmatched platform video identity failed"))?;
    }

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
    .bind(payload.asset_id)
    .bind(&platform)
    .execute(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "sync unmatched platform video asset platform failed"))?;

    let bind_stats = sqlx::query(
        r#"
        WITH updated AS (
          UPDATE dwd.marketing_content_platform_video_stats_di
          SET
            asset_id = $6,
            platform_video_id = $7,
            match_status = 'matched',
            updated_at = CURRENT_TIMESTAMP
          WHERE platform = $1
            AND COALESCE(account_id, '') = COALESCE($2, '')
            AND COALESCE(external_video_id, '') = COALESCE($3, '')
            AND COALESCE(external_item_id, '') = COALESCE($4, '')
            AND COALESCE(external_note_id, '') = COALESCE($5, '')
            AND match_status IN ('unmatched', 'pending_confirm', 'ambiguous')
            AND COALESCE(NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, '')) IS NOT NULL
          RETURNING stat_date
        )
        SELECT
          COUNT(*)::BIGINT AS affected_rows,
          MIN(stat_date) AS first_stat_date,
          MAX(stat_date) AS last_stat_date
        FROM updated
        "#,
    )
    .bind(&platform)
    .bind(&account_id)
    .bind(&external_video_id)
    .bind(&external_item_id)
    .bind(&external_note_id)
    .bind(payload.asset_id)
    .bind(platform_video_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|err| map_write_error(err, "bind unmatched platform video stats failed"))?;
    let affected_rows = bind_stats.get::<i64, _>("affected_rows");
    let first_stat_date = bind_stats.get::<Option<NaiveDate>, _>("first_stat_date");
    let last_stat_date = bind_stats.get::<Option<NaiveDate>, _>("last_stat_date");
    let refresh = if affected_rows > 0 {
        refresh_asset_performance_rollups_tx(
            &mut tx,
            payload.asset_id,
            first_stat_date,
            last_stat_date,
        )
        .await?
    } else {
        AssetPerformanceRollupRefresh::default()
    };
    let refresh_first_stat_date = refresh.first_stat_date.as_ref().map(ToString::to_string);
    let refresh_last_stat_date = refresh.last_stat_date.as_ref().map(ToString::to_string);

    insert_event_tx(
        &mut tx,
        payload.asset_id,
        "unmatched_stats_bound",
        actor,
        Some("未匹配平台内容日报已绑定到内容资产"),
        json!({
            "match_type": "platform_video",
            "platform": platform,
            "external_video_id": external_video_id,
            "external_item_id": external_item_id,
            "external_note_id": external_note_id,
            "affected_rows": affected_rows,
            "performance_rollups": {
                "daily_rows": refresh.daily_rows,
                "lifetime_rows": refresh.lifetime_rows,
                "asset_snapshot_rows": refresh.asset_snapshot_rows,
                "first_stat_date": refresh_first_stat_date,
                "last_stat_date": refresh_last_stat_date
            }
        }),
    )
    .await?;
    tx.commit().await.map_err(|err| {
        map_write_error(
            err,
            "commit unmatched platform video bind transaction failed",
        )
    })?;

    Ok(ContentAssetUnmatchedStatsBindResponse {
        asset_id: payload.asset_id,
        platform_video_id: Some(platform_video_id),
        ad_material_id: None,
        affected_rows,
        message: format!(
            "已绑定 {affected_rows} 条平台内容日报记录，并刷新 {} 条素材表现快照",
            refresh.asset_snapshot_rows
        ),
    })
}
