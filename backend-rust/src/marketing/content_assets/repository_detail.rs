use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::{
    performance_snapshot::query_performance_snapshot,
    repository::query_asset_by_id,
    row_mapping::{
        ad_material_from_row, event_from_row, object_from_row, platform_video_from_row,
        source_from_row, transcript_from_row,
    },
    types::{
        ContentAssetAdMaterial, ContentAssetDetailResponse, ContentAssetEvent, ContentAssetObject,
        ContentAssetPlatformVideo, ContentAssetShortVideoProfileHint, ContentAssetSource,
        ContentAssetTranscript,
    },
};

pub(super) async fn query_asset_detail(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<ContentAssetDetailResponse> {
    let asset = query_asset_by_id(pool, asset_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let (
        objects,
        transcript,
        platform_videos,
        ad_materials,
        short_video_profile_hint,
        performance_snapshot,
        sources,
        events,
    ) = tokio::try_join!(
        query_objects(pool, asset_id),
        query_active_transcript(pool, asset_id),
        query_platform_videos(pool, asset_id),
        query_ad_materials(pool, asset_id),
        query_short_video_profile_hint(pool, asset_id),
        query_performance_snapshot(pool, asset_id),
        query_sources(pool, asset_id),
        query_events(pool, asset_id),
    )?;
    Ok(ContentAssetDetailResponse {
        asset,
        objects,
        transcript,
        platform_videos,
        ad_materials,
        short_video_profile_hint,
        performance_snapshot,
        sources,
        events,
    })
}

async fn query_objects(pool: &PgPool, asset_id: Uuid) -> AppResult<Vec<ContentAssetObject>> {
    let rows = sqlx::query(
        r#"
        SELECT
          object_id,
          asset_id,
          object_role,
          storage_provider,
          bucket,
          object_key,
          content_type,
          file_ext,
          size_bytes,
          sha256,
          status,
          metadata,
          created_at::TEXT AS created_at
        FROM ads.marketing_content_asset_objects
        WHERE asset_id = $1 AND status <> 'deleted'
        ORDER BY
          CASE object_role
            WHEN 'raw' THEN 1
            WHEN 'preview' THEN 2
            WHEN 'cover' THEN 3
            WHEN 'frame' THEN 4
            WHEN 'transcript' THEN 5
            WHEN 'analysis' THEN 6
            ELSE 99
          END,
          created_at DESC
        "#,
    )
    .bind(asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content asset objects failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(object_from_row).collect())
}

async fn query_active_transcript(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Option<ContentAssetTranscript>> {
    let row = sqlx::query(
        r#"
        SELECT
          transcript_id,
          asset_id,
          source_object_key,
          transcript_object_key,
          provider,
          model,
          language,
          status,
          transcript_text,
          script_text,
          srt_text,
          segments,
          duration_seconds::FLOAT8 AS duration_seconds,
          word_count,
          confidence::FLOAT8 AS confidence,
          metadata,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM ads.marketing_content_asset_transcripts
        WHERE asset_id = $1
          AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content asset transcript failed");
        AppError::Internal
    })?;
    Ok(row.as_ref().map(transcript_from_row))
}

async fn query_platform_videos(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Vec<ContentAssetPlatformVideo>> {
    let rows = sqlx::query(
        r#"
        WITH ranked_platform_videos AS (
          SELECT
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
            relation_status,
            source,
            created_at,
            updated_at,
            NULLIF(BTRIM(external_video_id), '') AS normalized_external_video_id,
            ROW_NUMBER() OVER (
              PARTITION BY asset_id, platform, NULLIF(BTRIM(external_video_id), '')
              ORDER BY
                CASE WHEN relation_status = 'active' THEN 0 ELSE 1 END ASC,
                CASE WHEN NULLIF(BTRIM(external_item_id), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
                CASE WHEN NULLIF(BTRIM(external_url), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
                CASE WHEN NULLIF(BTRIM(publish_title), '') IS NOT NULL THEN 0 ELSE 1 END ASC,
                updated_at DESC,
                created_at DESC,
                platform_video_id ASC
            ) AS identity_rank
          FROM ads.marketing_content_platform_videos
          WHERE asset_id = $1 AND relation_status <> 'archived'
        )
        SELECT
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
          relation_status,
          source,
          created_at::TEXT AS created_at
        FROM ranked_platform_videos
        WHERE normalized_external_video_id IS NULL OR identity_rank = 1
        ORDER BY created_at DESC
        "#,
    )
    .bind(asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content platform videos failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(platform_video_from_row).collect())
}

async fn query_ad_materials(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Vec<ContentAssetAdMaterial>> {
    let rows = sqlx::query(
        r#"
        SELECT
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
          relation_status,
          source,
          created_at::TEXT AS created_at
        FROM ads.marketing_content_ad_materials
        WHERE asset_id = $1 AND relation_status <> 'archived'
        ORDER BY created_at DESC
        "#,
    )
    .bind(asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content ad materials failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(ad_material_from_row).collect())
}

async fn query_short_video_profile_hint(
    pool: &PgPool,
    asset_id: Uuid,
) -> AppResult<Option<ContentAssetShortVideoProfileHint>> {
    let row = sqlx::query(
        r#"
        WITH identity_keys AS (
          SELECT
            NULLIF(BTRIM(pv.external_video_id), '') AS video_id,
            NULLIF(BTRIM(pv.external_item_id), '') AS material_id
          FROM ads.marketing_content_platform_videos pv
          WHERE pv.asset_id = $1
            AND pv.relation_status = 'active'
          UNION ALL
          SELECT
            NULLIF(BTRIM(material.external_video_id), '') AS video_id,
            NULLIF(BTRIM(material.external_material_id), '') AS material_id
          FROM ads.marketing_content_ad_materials material
          WHERE material.asset_id = $1
            AND material.relation_status = 'active'
        ),
        normalized_identity_keys AS (
          SELECT DISTINCT video_id, material_id
          FROM identity_keys
          WHERE video_id IS NOT NULL OR material_id IS NOT NULL
        ),
        live_identity_values AS (
          SELECT
            NULLIF(BTRIM(pv.external_video_id), '') AS video_id,
            CASE
              WHEN pv.platform = 'douyin' THEN NULLIF(BTRIM(pv.external_item_id), '')
              ELSE NULL::TEXT
            END AS material_id,
            NULLIF(BTRIM(product_item.value), '') AS product_name,
            NULLIF(BTRIM(asset.video_type), '') AS video_type,
            NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
            NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
            NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
          FROM ads.marketing_content_platform_videos pv
          JOIN ads.marketing_content_assets asset
            ON asset.asset_id = pv.asset_id
           AND asset.is_deleted = FALSE
          LEFT JOIN LATERAL unnest(
            CASE
              WHEN COALESCE(array_length(asset.product_names, 1), 0) > 0 THEN asset.product_names
              WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL THEN ARRAY[asset.product_name]
              ELSE '{}'::TEXT[]
            END
          ) AS product_item(value) ON TRUE
          WHERE pv.relation_status = 'active'
            AND (
              pv.asset_id = $1
              OR NULLIF(BTRIM(pv.external_video_id), '') IN (
                SELECT key.video_id
                FROM normalized_identity_keys key
                WHERE key.video_id IS NOT NULL
              )
              OR (
                pv.platform = 'douyin'
                AND NULLIF(BTRIM(pv.external_item_id), '') IN (
                  SELECT key.material_id
                  FROM normalized_identity_keys key
                  WHERE key.material_id IS NOT NULL
                )
              )
            )
          UNION ALL
          SELECT
            NULLIF(BTRIM(material.external_video_id), '') AS video_id,
            NULLIF(BTRIM(material.external_material_id), '') AS material_id,
            NULLIF(BTRIM(product_item.value), '') AS product_name,
            NULLIF(BTRIM(asset.video_type), '') AS video_type,
            NULLIF(BTRIM(asset.content_scene), '') AS content_scene,
            NULLIF(BTRIM(asset.content_scene_group), '') AS content_scene_group,
            NULLIF(BTRIM(asset.content_scene_subtype), '') AS content_scene_subtype
          FROM ads.marketing_content_ad_materials material
          JOIN ads.marketing_content_assets asset
            ON asset.asset_id = material.asset_id
           AND asset.is_deleted = FALSE
          LEFT JOIN LATERAL unnest(
            CASE
              WHEN COALESCE(array_length(asset.product_names, 1), 0) > 0 THEN asset.product_names
              WHEN NULLIF(BTRIM(asset.product_name), '') IS NOT NULL THEN ARRAY[asset.product_name]
              ELSE '{}'::TEXT[]
            END
          ) AS product_item(value) ON TRUE
          WHERE material.relation_status = 'active'
            AND (
              material.asset_id = $1
              OR NULLIF(BTRIM(material.external_video_id), '') IN (
                SELECT key.video_id
                FROM normalized_identity_keys key
                WHERE key.video_id IS NOT NULL
              )
              OR NULLIF(BTRIM(material.external_material_id), '') IN (
                SELECT key.material_id
                FROM normalized_identity_keys key
                WHERE key.material_id IS NOT NULL
              )
            )
        ),
        source_rows AS (
          SELECT
            d.*,
            row_material_keys.material_ids AS row_material_ids
          FROM ads.douyin_shortvideo_detail d
          LEFT JOIN LATERAL (
            SELECT ARRAY(
              SELECT DISTINCT NULLIF(BTRIM(item.value), '')
              FROM unnest(
                COALESCE(d.qianchuan_material_ids, '{}'::TEXT[])
                || CASE
                  WHEN NULLIF(BTRIM(d.qianchuan_material_key), '') IS NOT NULL
                  THEN regexp_split_to_array(NULLIF(BTRIM(d.qianchuan_material_key), ''), '\s*,\s*')
                  ELSE '{}'::TEXT[]
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
              ORDER BY NULLIF(BTRIM(item.value), '')
            ) AS material_ids
          ) row_material_keys ON TRUE
          WHERE d.detail_grain = 'trade_video_day'
            AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%'
            AND COALESCE(NULLIF(BTRIM(d.account_type), ''), '') NOT LIKE '%自营%'
            AND (
              $1 = ANY(COALESCE(d.asset_ids, '{}'::UUID[]))
              OR
              NULLIF(BTRIM(d.video_id), '') IN (
                SELECT key.video_id
                FROM normalized_identity_keys key
                WHERE key.video_id IS NOT NULL
              )
              OR EXISTS (
                SELECT 1
                FROM normalized_identity_keys key
                WHERE key.material_id IS NOT NULL
                  AND key.material_id = ANY(row_material_keys.material_ids)
              )
            )
        ),
        source_values AS (
          SELECT
            NULLIF(BTRIM(source.author_nickname), '') AS creator_name,
            NULLIF(BTRIM(source.author_douyin_id), '') AS creator_account_id,
            NULLIF(BTRIM(source.video_id), '') AS video_id,
            source.row_material_ids AS qianchuan_material_ids,
            ARRAY(
              SELECT NULLIF(BTRIM(item.value), '')
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(source)->'asset_product_names') = 'array'
                  THEN to_jsonb(source)->'asset_product_names'
                  ELSE '[]'::JSONB
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
            ) AS product_names,
            ARRAY(
              SELECT NULLIF(BTRIM(item.value), '')
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(source)->'asset_video_types') = 'array'
                  THEN to_jsonb(source)->'asset_video_types'
                  ELSE '[]'::JSONB
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
            ) AS video_types,
            ARRAY(
              SELECT NULLIF(BTRIM(item.value), '')
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(source)->'asset_content_scenes') = 'array'
                  THEN to_jsonb(source)->'asset_content_scenes'
                  ELSE '[]'::JSONB
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
            ) AS content_scenes,
            ARRAY(
              SELECT NULLIF(BTRIM(item.value), '')
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(source)->'asset_content_scene_groups') = 'array'
                  THEN to_jsonb(source)->'asset_content_scene_groups'
                  ELSE '[]'::JSONB
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
            ) AS content_scene_groups,
            ARRAY(
              SELECT NULLIF(BTRIM(item.value), '')
              FROM jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(to_jsonb(source)->'asset_content_scene_subtypes') = 'array'
                  THEN to_jsonb(source)->'asset_content_scene_subtypes'
                  ELSE '[]'::JSONB
                END
              ) AS item(value)
              WHERE NULLIF(BTRIM(item.value), '') IS NOT NULL
            ) AS content_scene_subtypes
          FROM source_rows source
        )
        SELECT
          (SELECT COUNT(*)::BIGINT FROM source_values) AS matched_row_count,
          ARRAY(
            SELECT DISTINCT item.creator_name
            FROM source_values item
            WHERE item.creator_name IS NOT NULL
            ORDER BY item.creator_name
          ) AS creator_names,
          ARRAY(
            SELECT DISTINCT item.creator_account_id
            FROM source_values item
            WHERE item.creator_account_id IS NOT NULL
            ORDER BY item.creator_account_id
          ) AS creator_account_ids,
          ARRAY(
            SELECT DISTINCT product.value
            FROM (
              SELECT product.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.product_names) AS product(value)
              WHERE product.value IS NOT NULL
              UNION
              SELECT live.product_name AS value
              FROM live_identity_values live
              WHERE live.product_name IS NOT NULL
            ) product
            WHERE product.value IS NOT NULL
            ORDER BY product.value
          ) AS product_names,
          ARRAY(
            SELECT DISTINCT video_type.value
            FROM (
              SELECT video_type.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.video_types) AS video_type(value)
              WHERE video_type.value IS NOT NULL
              UNION
              SELECT live.video_type AS value
              FROM live_identity_values live
              WHERE live.video_type IS NOT NULL
            ) video_type
            WHERE video_type.value IS NOT NULL
            ORDER BY video_type.value
          ) AS video_types,
          ARRAY(
            SELECT DISTINCT scene.value
            FROM (
              SELECT scene.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.content_scenes) AS scene(value)
              WHERE scene.value IS NOT NULL
              UNION
              SELECT live.content_scene AS value
              FROM live_identity_values live
              WHERE live.content_scene IS NOT NULL
            ) scene
            WHERE scene.value IS NOT NULL
            ORDER BY scene.value
          ) AS content_scenes,
          ARRAY(
            SELECT DISTINCT scene_group.value
            FROM (
              SELECT scene_group.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.content_scene_groups) AS scene_group(value)
              WHERE scene_group.value IS NOT NULL
              UNION
              SELECT live.content_scene_group AS value
              FROM live_identity_values live
              WHERE live.content_scene_group IS NOT NULL
            ) scene_group
            WHERE scene_group.value IS NOT NULL
            ORDER BY scene_group.value
          ) AS content_scene_groups,
          ARRAY(
            SELECT DISTINCT scene_subtype.value
            FROM (
              SELECT scene_subtype.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.content_scene_subtypes) AS scene_subtype(value)
              WHERE scene_subtype.value IS NOT NULL
              UNION
              SELECT live.content_scene_subtype AS value
              FROM live_identity_values live
              WHERE live.content_scene_subtype IS NOT NULL
            ) scene_subtype
            WHERE scene_subtype.value IS NOT NULL
            ORDER BY scene_subtype.value
          ) AS content_scene_subtypes,
          ARRAY(
            SELECT DISTINCT material.value
            FROM (
              SELECT material.value
              FROM source_values item
              CROSS JOIN LATERAL unnest(item.qianchuan_material_ids) AS material(value)
              WHERE material.value IS NOT NULL
              UNION
              SELECT key.material_id AS value
              FROM normalized_identity_keys key
              WHERE key.material_id IS NOT NULL
              UNION
              SELECT live.material_id AS value
              FROM live_identity_values live
              WHERE live.material_id IS NOT NULL
            ) material
            ORDER BY material.value
          ) AS qianchuan_material_ids,
          ARRAY(
            SELECT DISTINCT video.value
            FROM (
              SELECT item.video_id AS value
              FROM source_values item
              WHERE item.video_id IS NOT NULL
              UNION
              SELECT key.video_id AS value
              FROM normalized_identity_keys key
              WHERE key.video_id IS NOT NULL
              UNION
              SELECT live.video_id AS value
              FROM live_identity_values live
              WHERE live.video_id IS NOT NULL
            ) video
            ORDER BY video.value
          ) AS video_ids
        "#,
    )
    .bind(asset_id)
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content asset short-video profile hint failed");
        AppError::Internal
    })?;

    let matched_row_count = row.try_get::<i64, _>("matched_row_count").unwrap_or(0);
    if matched_row_count == 0 {
        return Ok(None);
    }

    let creator_names = row
        .try_get::<Vec<String>, _>("creator_names")
        .unwrap_or_default();
    let creator_account_ids = row
        .try_get::<Vec<String>, _>("creator_account_ids")
        .unwrap_or_default();
    let product_names = row
        .try_get::<Vec<String>, _>("product_names")
        .unwrap_or_default();
    let video_types = row
        .try_get::<Vec<String>, _>("video_types")
        .unwrap_or_default();
    let content_scenes = row
        .try_get::<Vec<String>, _>("content_scenes")
        .unwrap_or_default();
    let content_scene_groups = row
        .try_get::<Vec<String>, _>("content_scene_groups")
        .unwrap_or_default();
    let content_scene_subtypes = row
        .try_get::<Vec<String>, _>("content_scene_subtypes")
        .unwrap_or_default();
    let qianchuan_material_ids = row
        .try_get::<Vec<String>, _>("qianchuan_material_ids")
        .unwrap_or_default();
    let video_ids = row
        .try_get::<Vec<String>, _>("video_ids")
        .unwrap_or_default();

    let has_scalar_conflict = [
        creator_names.len(),
        creator_account_ids.len(),
        video_types.len(),
        content_scenes.len(),
        content_scene_groups.len(),
        content_scene_subtypes.len(),
    ]
    .iter()
    .any(|count| *count > 1);

    Ok(Some(ContentAssetShortVideoProfileHint {
        match_status: if has_scalar_conflict {
            "ambiguous".to_string()
        } else {
            "unique".to_string()
        },
        source: "creator_short_video".to_string(),
        creator_name: unique_value(&creator_names),
        creator_account_id: unique_value(&creator_account_ids),
        product_names,
        video_type: unique_value(&video_types),
        content_scene: unique_value(&content_scenes),
        content_scene_group: unique_value(&content_scene_groups),
        content_scene_subtype: unique_value(&content_scene_subtypes),
        qianchuan_material_ids,
        video_ids,
        matched_row_count,
    }))
}

async fn query_sources(pool: &PgPool, asset_id: Uuid) -> AppResult<Vec<ContentAssetSource>> {
    let rows = sqlx::query(
        r#"
        SELECT
          source_id,
          source_kind,
          source_url,
          source_title,
          feishu_file_token,
          feishu_sheet_id,
          feishu_sheet_name,
          feishu_row_index,
          external_platform,
          external_status,
          metadata,
          created_at::TEXT AS created_at
        FROM ads.marketing_content_asset_sources
        WHERE asset_id = $1
        ORDER BY created_at DESC, source_id DESC
        "#,
    )
    .bind(asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content asset sources failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(source_from_row).collect())
}

async fn query_events(pool: &PgPool, asset_id: Uuid) -> AppResult<Vec<ContentAssetEvent>> {
    let rows = sqlx::query(
        r#"
        SELECT
          event_id,
          event_type,
          actor,
          message,
          payload,
          created_at::TEXT AS created_at
        FROM ads.marketing_content_asset_events
        WHERE asset_id = $1
        ORDER BY created_at DESC, event_id DESC
        LIMIT 50
        "#,
    )
    .bind(asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, %asset_id, "query marketing content asset events failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(event_from_row).collect())
}

fn unique_value(values: &[String]) -> Option<String> {
    if values.len() == 1 {
        Some(values[0].clone())
    } else {
        None
    }
}
