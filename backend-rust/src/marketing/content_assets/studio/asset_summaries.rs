//! Read-only annotation summaries: per-asset counts for the 整片素材 cards and
//! the (product × label) pool for 片段素材. Visibility matches `list_segments`
//! (any signed-in content user).
use super::super::delivery::build_cover_url_for_key;
use super::domain;
use super::error::StudioResult;
use super::repository::db_error;
use super::types::{
    AssetSegmentSummary, AssetSegmentSummaryListResponse, AssetSegmentSummaryQuery,
    SegmentAssetCover, SegmentPoolCell, SegmentPoolQuery, SegmentPoolResponse,
};
use crate::config::Settings;
use crate::error::AppError;
use sqlx::{PgPool, Row};
use uuid::Uuid;

const MAX_ASSET_IDS: usize = 100;

pub(super) fn parse_asset_ids(query: &AssetSegmentSummaryQuery) -> Result<Vec<Uuid>, AppError> {
    let raw = query.asset_ids.as_deref().unwrap_or("").trim();
    if raw.is_empty() {
        return Err(AppError::bad_request("assetIds 不能为空"));
    }
    let mut ids: Vec<Uuid> = Vec::new();
    for part in raw.split(',') {
        let id = Uuid::parse_str(part.trim())
            .map_err(|_| AppError::bad_request("assetIds 含无效的素材 ID"))?;
        if !ids.contains(&id) {
            // Checked as ids arrive, so an oversized list is rejected before quadratic dedupe work.
            if ids.len() == MAX_ASSET_IDS {
                return Err(AppError::bad_request("assetIds 一次最多 100 个"));
            }
            ids.push(id);
        }
    }
    Ok(ids)
}

/// Counts for each requested original, in request order. Originals that are
/// deleted or outside the enterprise read as zero (no counts or job state leak).
pub(super) async fn list_asset_summaries(
    pool: &PgPool,
    asset_ids: Vec<Uuid>,
    preset_key: Option<String>,
    enterprise_tag: Option<&str>,
) -> StudioResult<AssetSegmentSummaryListResponse> {
    if let Some(key) = preset_key.as_deref() {
        domain::validate_key(key, "presetKey")?;
    }
    let rows = sqlx::query(
        "WITH scoped AS (SELECT a.asset_id FROM ads.marketing_content_assets a \
                         WHERE a.asset_id = ANY($1) AND a.is_deleted = FALSE \
                           AND ($3::TEXT IS NULL OR $3 = ANY(a.tags))) \
         SELECT requested.asset_id, requested.ordinal, \
                COUNT(s.segment_id) FILTER (WHERE s.status = 'suggested') AS suggested_count, \
                COUNT(s.segment_id) FILTER (WHERE s.status = 'confirmed') AS confirmed_count, \
                EXISTS (SELECT 1 FROM ads.content_segment_suggestion_jobs j \
                        WHERE j.asset_id = requested.asset_id \
                          AND j.status IN ('queued', 'running') \
                          AND ($2::TEXT IS NULL OR j.preset_key = $2) \
                          AND requested.asset_id IN (SELECT asset_id FROM scoped)) AS suggestion_active \
         FROM UNNEST($1::UUID[]) WITH ORDINALITY AS requested(asset_id, ordinal) \
         LEFT JOIN ads.content_segments s ON s.asset_id = requested.asset_id \
              AND ($2::TEXT IS NULL OR s.preset_key = $2) \
              AND requested.asset_id IN (SELECT asset_id FROM scoped) \
         GROUP BY requested.asset_id, requested.ordinal \
         ORDER BY requested.ordinal",
    )
    .bind(&asset_ids)
    .bind(preset_key)
    .bind(enterprise_tag)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    let items = rows
        .iter()
        .map(|row| AssetSegmentSummary {
            asset_id: row.get("asset_id"),
            suggested_count: row.get("suggested_count"),
            confirmed_count: row.get("confirmed_count"),
            suggestion_active: row.get("suggestion_active"),
        })
        .collect();
    Ok(AssetSegmentSummaryListResponse { items })
}

/// Cover URLs for the distinct source assets of a segment page, in first-seen order.
pub(super) async fn segment_asset_covers(
    pool: &PgPool,
    settings: &Settings,
    asset_ids: Vec<Uuid>,
) -> StudioResult<Vec<SegmentAssetCover>> {
    if asset_ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows = sqlx::query(
        "SELECT requested.asset_id, a.cover_object_key \
         FROM UNNEST($1::UUID[]) WITH ORDINALITY AS requested(asset_id, ordinal) \
         LEFT JOIN ads.marketing_content_assets a ON a.asset_id = requested.asset_id \
         ORDER BY requested.ordinal",
    )
    .bind(&asset_ids)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    Ok(rows
        .iter()
        .map(|row| SegmentAssetCover {
            asset_id: row.get("asset_id"),
            cover_url: row
                .get::<Option<String>, _>("cover_object_key")
                .and_then(|key| build_cover_url_for_key(settings, &key)),
        })
        .collect())
}

/// Signed/CDN URL of a segment's own cover frame recorded in its evidence.
pub(super) fn segment_cover_url(
    settings: &Settings,
    evidence: &serde_json::Value,
) -> Option<String> {
    evidence
        .get("coverKey")
        .and_then(serde_json::Value::as_str)
        .filter(|key| key.starts_with("segment-cover/"))
        .and_then(|key| build_cover_url_for_key(settings, key))
}

const DEFAULT_PRESET_KEY: &str = "framework";
const DEFAULT_PRESET_VERSION: i32 = 1;

pub(super) async fn segment_pool(
    pool: &PgPool,
    query: SegmentPoolQuery,
    enterprise_tag: Option<&str>,
) -> StudioResult<SegmentPoolResponse> {
    let preset_key = query
        .preset_key
        .unwrap_or_else(|| DEFAULT_PRESET_KEY.to_string());
    domain::validate_key(&preset_key, "presetKey")?;
    let preset_version = query.preset_version.unwrap_or(DEFAULT_PRESET_VERSION);
    if preset_version < 1 {
        return Err(AppError::bad_request("presetVersion 必须大于 0").into());
    }
    let rows = sqlx::query(
        "SELECT NULLIF(BTRIM(s.product_name), '') AS product_name, s.label_key, \
                COUNT(*) AS confirmed_count \
         FROM ads.content_segments s \
         JOIN ads.marketing_content_assets a ON a.asset_id = s.asset_id \
         WHERE s.status = 'confirmed' AND s.preset_key = $1 AND s.preset_version = $2 \
           AND a.is_deleted = FALSE \
           AND LOWER(TRIM(a.raw_sha256)) = s.source_content_hash \
           AND ($3::TEXT IS NULL OR $3 = ANY(a.tags)) \
         GROUP BY 1, 2 \
         ORDER BY 1 NULLS LAST, 2",
    )
    .bind(&preset_key)
    .bind(preset_version)
    .bind(enterprise_tag)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    let items = rows
        .iter()
        .map(|row| SegmentPoolCell {
            product_name: row.get("product_name"),
            label_key: row.get("label_key"),
            confirmed_count: row.get("confirmed_count"),
        })
        .collect();
    Ok(SegmentPoolResponse {
        preset_key,
        preset_version,
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(value: &str) -> AssetSegmentSummaryQuery {
        AssetSegmentSummaryQuery {
            asset_ids: Some(value.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn parses_and_dedupes_in_order() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let ids = parse_asset_ids(&query(&format!("{a}, {b},{a}"))).expect("valid ids");
        assert_eq!(ids, vec![a, b]);
    }

    #[test]
    fn rejects_empty_invalid_and_oversized() {
        assert!(parse_asset_ids(&AssetSegmentSummaryQuery::default()).is_err());
        assert!(parse_asset_ids(&query("not-a-uuid")).is_err());
        let many = (0..=MAX_ASSET_IDS)
            .map(|_| Uuid::new_v4().to_string())
            .collect::<Vec<_>>()
            .join(",");
        assert!(parse_asset_ids(&query(&many)).is_err());
    }
}
