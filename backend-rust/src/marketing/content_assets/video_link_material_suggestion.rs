use std::collections::BTreeSet;

use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::types::ContentAssetVideoLinkMaterialSuggestionResponse;

pub(super) async fn query_qianchuan_material_suggestion_for_video(
    pool: &PgPool,
    external_video_id: &str,
) -> AppResult<Option<ContentAssetVideoLinkMaterialSuggestionResponse>> {
    let external_video_id = external_video_id.trim();
    if external_video_id.is_empty() {
        return Ok(None);
    }

    let rows = sqlx::query(
        r#"
        WITH candidates AS (
          SELECT
            'active_identity' AS source,
            NULLIF(BTRIM(pv.external_item_id), '') AS material_id,
            NULL::TEXT AS match_status
          FROM ads.marketing_content_platform_videos pv
          WHERE pv.relation_status = 'active'
            AND pv.platform = 'douyin'
            AND NULLIF(BTRIM(pv.external_video_id), '') = $1
            AND NULLIF(BTRIM(pv.external_item_id), '') IS NOT NULL
          UNION ALL
          SELECT
            'active_identity' AS source,
            NULLIF(BTRIM(material.external_material_id), '') AS material_id,
            NULL::TEXT AS match_status
          FROM ads.marketing_content_ad_materials material
          WHERE material.relation_status = 'active'
            AND material.ad_platform IN ('qianchuan', '千川')
            AND NULLIF(BTRIM(material.external_video_id), '') = $1
            AND NULLIF(BTRIM(material.external_material_id), '') IS NOT NULL
          UNION ALL
          SELECT
            'creator_short_video' AS source,
            NULLIF(BTRIM(material.material_id), '') AS material_id,
            NULLIF(BTRIM(d.qianchuan_match_status), '') AS match_status
          FROM ads.douyin_shortvideo_detail d
          CROSS JOIN LATERAL unnest(
            COALESCE(d.qianchuan_material_ids, '{}'::TEXT[])
            || CASE
              WHEN NULLIF(BTRIM(d.qianchuan_material_key), '') IS NOT NULL
              THEN regexp_split_to_array(NULLIF(BTRIM(d.qianchuan_material_key), ''), '\s*,\s*')
              ELSE '{}'::TEXT[]
            END
          ) AS material(material_id)
          WHERE NULLIF(BTRIM(d.video_id), '') = $1
            AND NULLIF(BTRIM(material.material_id), '') IS NOT NULL
        )
        SELECT DISTINCT source, material_id, match_status
        FROM candidates
        WHERE material_id IS NOT NULL
        ORDER BY source, material_id, match_status
        "#,
    )
    .bind(external_video_id)
    .fetch_all(pool)
    .await
    .map_err(|err| {
        error!(
            ?err,
            external_video_id, "query qianchuan material suggestion for douyin video failed"
        );
        AppError::Internal
    })?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut active_material_ids = BTreeSet::new();
    let mut detail_material_ids = BTreeSet::new();
    let mut all_material_ids = BTreeSet::new();
    let mut match_statuses = BTreeSet::new();

    for row in rows {
        let source = row.get::<String, _>("source");
        let Some(material_id) = row.get::<Option<String>, _>("material_id") else {
            continue;
        };
        let material_id = material_id.trim().to_string();
        if material_id.is_empty() {
            continue;
        }
        if source == "active_identity" {
            active_material_ids.insert(material_id.clone());
        } else {
            detail_material_ids.insert(material_id.clone());
        }
        all_material_ids.insert(material_id);
        if let Some(match_status) = row.get::<Option<String>, _>("match_status") {
            let match_status = match_status.trim().to_string();
            if !match_status.is_empty() {
                match_statuses.insert(match_status);
            }
        }
    }

    if all_material_ids.is_empty() {
        return Ok(None);
    }

    let material_ids = all_material_ids.iter().cloned().collect::<Vec<_>>();
    let match_status = if match_statuses.len() == 1 {
        match_statuses.iter().next().cloned()
    } else if match_statuses.len() > 1 {
        Some("multiple".to_string())
    } else {
        None
    };

    let detail_conflicts_with_active = !active_material_ids.is_empty()
        && detail_material_ids
            .iter()
            .any(|material_id| !active_material_ids.contains(material_id));

    if active_material_ids.len() > 1 || detail_conflicts_with_active {
        return Ok(Some(ContentAssetVideoLinkMaterialSuggestionResponse {
            status: "conflict".to_string(),
            source: "active_identity".to_string(),
            external_video_id: external_video_id.to_string(),
            recommended_external_item_id: active_material_ids.iter().next().cloned(),
            material_ids,
            match_status,
            reason: "该抖音视频 ID 在内容中台已有绑定，且与系统回流的千川素材建议不完全一致；请业务核对后再修改素材 ID。".to_string(),
            requires_confirmation: true,
        }));
    }

    if active_material_ids.len() == 1 {
        return Ok(Some(ContentAssetVideoLinkMaterialSuggestionResponse {
            status: "unique".to_string(),
            source: "active_identity".to_string(),
            external_video_id: external_video_id.to_string(),
            recommended_external_item_id: active_material_ids.iter().next().cloned(),
            material_ids,
            match_status,
            reason: "该抖音视频 ID 已在内容中台绑定唯一千川素材 ID；请核对后提交。".to_string(),
            requires_confirmation: true,
        }));
    }

    if detail_material_ids.len() == 1 {
        return Ok(Some(ContentAssetVideoLinkMaterialSuggestionResponse {
            status: "unique".to_string(),
            source: "creator_short_video".to_string(),
            external_video_id: external_video_id.to_string(),
            recommended_external_item_id: detail_material_ids.iter().next().cloned(),
            material_ids,
            match_status,
            reason: "已根据抖音视频 ID 匹配到唯一千川素材 ID；请核对后提交，如不一致请手动修改。"
                .to_string(),
            requires_confirmation: true,
        }));
    }

    Ok(Some(ContentAssetVideoLinkMaterialSuggestionResponse {
        status: "ambiguous".to_string(),
        source: "creator_short_video".to_string(),
        external_video_id: external_video_id.to_string(),
        recommended_external_item_id: None,
        material_ids,
        match_status,
        reason: "该抖音视频 ID 命中多个千川素材 ID，系统不会自动回填；请业务核对后手动填写。"
            .to_string(),
        requires_confirmation: true,
    }))
}
