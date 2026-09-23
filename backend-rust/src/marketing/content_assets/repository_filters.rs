use sqlx::{Postgres, QueryBuilder};

use super::types::{ContentAssetSort, NormalizedContentAssetQuery};

pub(super) fn push_filters(
    builder: &mut QueryBuilder<Postgres>,
    query: &NormalizedContentAssetQuery,
) {
    builder.push(" WHERE asset.is_deleted = FALSE");
    if let Some(keyword) = &query.keyword {
        let pattern = format!("%{keyword}%");
        builder.push(" AND (asset.title ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.notes ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.ai_suggested_title ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.product_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR EXISTS (SELECT 1 FROM UNNEST(asset.product_names || asset.sku_names) AS option_value(value) WHERE value ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(")");
        builder.push(" OR asset.creator_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.video_type ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.content_scene ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.content_scene_group ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.content_scene_subtype ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(
            " OR EXISTS ( \
            SELECT 1 \
            FROM ads.marketing_content_platform_videos video \
            WHERE video.asset_id = asset.asset_id \
              AND video.relation_status = 'active' \
              AND ( \
                video.external_video_id ILIKE ",
        );
        builder.push_bind(pattern.clone());
        builder.push(" OR video.external_item_id ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR video.external_note_id ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR video.external_url ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR video.publish_title ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(
            ") \
          )",
        );
        builder.push(
            " OR EXISTS ( \
            SELECT 1 \
            FROM ads.marketing_content_ad_materials material \
            WHERE material.asset_id = asset.asset_id \
              AND material.relation_status = 'active' \
              AND ( \
                material.external_material_id ILIKE ",
        );
        builder.push_bind(pattern.clone());
        builder.push(" OR material.external_video_id ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR material.material_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR material.material_title ILIKE ");
        builder.push_bind(pattern);
        builder.push(
            ") \
          )",
        );
        builder.push(")");
    }
    if let Some(platform) = &query.platform {
        builder.push(" AND (asset.platform = ");
        builder.push_bind(platform.clone());
        builder.push(" OR asset.platform_names && ");
        builder.push_bind(vec![platform.clone()]);
        builder.push("::TEXT[])");
    }
    if let Some(product_name) = &query.product_name {
        let product_values = product_filter_values(product_name);
        builder.push(" AND (asset.product_name = ANY(");
        builder.push_bind(product_values.clone());
        builder.push("::TEXT[]) OR asset.product_names && ");
        builder.push_bind(product_values);
        builder.push("::TEXT[])");
    }
    if let Some(creator_name) = &query.creator_name {
        builder.push(" AND asset.creator_name = ");
        builder.push_bind(creator_name.clone());
    }
    if let Some(owner_user_id) = &query.owner_user_id {
        builder.push(" AND asset.owner_user_id = ");
        builder.push_bind(owner_user_id.clone());
    }
    if let Some(video_type) = &query.video_type {
        builder.push(" AND asset.video_type = ");
        builder.push_bind(video_type.clone());
    }
    if let Some(content_scene) = &query.content_scene {
        builder.push(" AND asset.content_scene = ");
        builder.push_bind(content_scene.clone());
    }
    if let Some(content_scene_group) = &query.content_scene_group {
        builder.push(" AND asset.content_scene_group = ");
        builder.push_bind(content_scene_group.clone());
    }
    if let Some(content_scene_subtype) = &query.content_scene_subtype {
        builder.push(" AND asset.content_scene_subtype = ");
        builder.push_bind(content_scene_subtype.clone());
    }
    if !query.tags.is_empty() {
        builder.push(" AND (asset.tags && ");
        builder.push_bind(query.tags.clone());
        builder.push(
            "::TEXT[] OR (CARDINALITY(asset.ai_suggested_tags) > 0 AND asset.ai_suggested_tags && ",
        );
        builder.push_bind(query.tags.clone());
        builder.push("::TEXT[]))");
    }
    push_status_filters(builder, query);
    push_todo_filter(builder, query);
}

fn product_filter_values(product_name: &str) -> Vec<String> {
    match product_name {
        "焕活精华（绿瓶）" | "唤活精华（绿瓶）" => {
            vec!["焕活精华（绿瓶）", "唤活精华（绿瓶）", "小绿瓶"]
        }
        "白金精华（白瓶60ml）" => vec!["白金精华（白瓶60ml）", "白金发际线60ml"],
        "发际线精华（20ml）" => vec!["发际线精华（20ml）", "白金发际线20ml"],
        value => return vec![value.to_string()],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn push_status_filters(builder: &mut QueryBuilder<Postgres>, query: &NormalizedContentAssetQuery) {
    if let Some(asset_status) = &query.asset_status {
        builder.push(" AND asset.asset_status = ");
        builder.push_bind(asset_status.clone());
    }
    if let Some(lifecycle_status) = &query.lifecycle_status {
        builder.push(" AND asset.lifecycle_status = ");
        builder.push_bind(lifecycle_status.clone());
    }
    if let Some(external_only) = query.external_only {
        builder.push(" AND asset.external_only = ");
        builder.push_bind(external_only);
    }
}

fn push_todo_filter(builder: &mut QueryBuilder<Postgres>, query: &NormalizedContentAssetQuery) {
    let Some(todo) = &query.todo else {
        return;
    };
    match todo.as_str() {
        "missing_ai" => builder.push(
            " AND asset.external_only = FALSE \
              AND asset.raw_object_key IS NOT NULL \
              AND asset.ai_analyzed_at IS NULL \
              AND asset.analysis_object_key IS NULL",
        ),
        "missing_transcript" => builder.push(
            " AND asset.external_only = FALSE \
              AND asset.raw_object_key IS NOT NULL \
              AND asset.transcribed_at IS NULL \
              AND asset.transcript_object_key IS NULL \
              AND NULLIF(asset.script_excerpt, '') IS NULL",
        ),
        "missing_platform_video" => builder.push(
            " AND NOT EXISTS ( \
                SELECT 1 \
                FROM ads.marketing_content_platform_videos video \
                WHERE video.asset_id = asset.asset_id \
                  AND video.relation_status = 'active' \
              )",
        ),
        "missing_ad_material" => builder.push(
            " AND NOT EXISTS ( \
                SELECT 1 \
                FROM ads.marketing_content_ad_materials material \
                WHERE material.asset_id = asset.asset_id \
                  AND material.relation_status = 'active' \
              ) \
              AND NOT EXISTS ( \
                SELECT 1 \
                FROM ads.marketing_content_platform_videos video \
                WHERE video.asset_id = asset.asset_id \
                  AND video.relation_status = 'active' \
                  AND video.platform = 'douyin' \
                  AND NULLIF(BTRIM(video.external_item_id), '') IS NOT NULL \
              )",
        ),
        "authorization_unknown" => builder.push(
            " AND asset.authorization_status = 'unknown' \
              AND asset.commercial_use_allowed IS NULL \
              AND asset.authorization_expires_at IS NULL",
        ),
        "repurpose_unknown" => builder.push(" AND asset.repurpose_allowed IS NULL"),
        _ => builder,
    };
}

pub(super) fn push_sort(builder: &mut QueryBuilder<Postgres>, sort: ContentAssetSort) {
    match sort {
        ContentAssetSort::Recommended => builder.push(
            "CASE \
                WHEN asset.cover_object_key IS NOT NULL AND asset.preview_object_key IS NOT NULL THEN 0 \
                WHEN asset.preview_object_key IS NOT NULL THEN 1 \
                WHEN asset.raw_object_key IS NOT NULL THEN 2 \
                WHEN asset.external_only = TRUE THEN 3 \
                ELSE 4 \
             END ASC, asset.updated_at DESC, asset.created_at DESC",
        ),
        ContentAssetSort::UploadedDesc => {
            builder.push("asset.uploaded_at DESC NULLS LAST, asset.updated_at DESC")
        }
        ContentAssetSort::TitleAsc => builder.push("asset.title ASC, asset.updated_at DESC"),
        ContentAssetSort::RoiDesc => builder.push("asset.roi DESC NULLS LAST, asset.updated_at DESC"),
        ContentAssetSort::UpdatedDesc => builder.push("asset.updated_at DESC, asset.created_at DESC"),
    };
}
