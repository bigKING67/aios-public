use std::sync::Arc;

use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use tracing::error;
use uuid::Uuid;

use crate::{
    auth::CurrentUser,
    error::{AppError, AppResult},
    state::AppState,
};

use super::permissions::ensure_content_asset_read_permission;

#[derive(Debug, Deserialize, Default)]
pub(super) struct ContentAssetLookupQuery {
    pub(super) keyword: Option<String>,
    pub(super) limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetLookupResponse {
    pub(super) items: Vec<ContentAssetLookupItem>,
}

#[derive(Debug, Serialize)]
pub(super) struct ContentAssetLookupItem {
    #[serde(rename = "assetId")]
    pub(super) asset_id: Uuid,
    pub(super) title: String,
    pub(super) platform: Option<String>,
    #[serde(rename = "productName")]
    pub(super) product_name: Option<String>,
    #[serde(rename = "creatorName")]
    pub(super) creator_name: Option<String>,
    #[serde(rename = "assetStatus")]
    pub(super) asset_status: String,
    #[serde(rename = "lifecycleStatus")]
    pub(super) lifecycle_status: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

pub(super) async fn list_asset_lookup(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<ContentAssetLookupQuery>,
) -> AppResult<Json<ContentAssetLookupResponse>> {
    ensure_content_asset_read_permission(&current_user)?;
    Ok(Json(query_asset_lookup(&state.pool, query).await?))
}

pub(super) async fn query_asset_lookup(
    pool: &PgPool,
    query: ContentAssetLookupQuery,
) -> AppResult<ContentAssetLookupResponse> {
    let keyword = query
        .keyword
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.chars().count() > 120 {
                value.chars().take(120).collect()
            } else {
                value
            }
        });
    let limit = query.limit.unwrap_or(20).clamp(1, 50);
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
          asset.asset_id,
          asset.title,
          asset.platform,
          asset.product_name,
          asset.creator_name,
          asset.asset_status,
          asset.lifecycle_status,
          asset.updated_at::TEXT AS updated_at
        FROM ads.marketing_content_assets asset
        WHERE asset.is_deleted = FALSE
        "#,
    );
    if let Some(keyword) = keyword {
        let pattern = format!("%{keyword}%");
        builder.push(" AND (asset.asset_id::TEXT ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.title ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.product_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.creator_name ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR asset.notes ILIKE ");
        builder.push_bind(pattern);
        builder.push(")");
    }
    builder.push(
        " ORDER BY CASE \
            WHEN asset.preview_object_key IS NOT NULL AND asset.cover_object_key IS NOT NULL THEN 0 \
            WHEN asset.raw_object_key IS NOT NULL THEN 1 \
            WHEN asset.external_only = TRUE THEN 2 \
            ELSE 3 \
         END ASC, asset.updated_at DESC LIMIT ",
    );
    builder.push_bind(limit);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(?error, "query marketing content asset lookup failed");
        AppError::Internal
    })?;
    Ok(ContentAssetLookupResponse {
        items: rows.iter().map(lookup_item_from_row).collect(),
    })
}

fn lookup_item_from_row(row: &sqlx::postgres::PgRow) -> ContentAssetLookupItem {
    ContentAssetLookupItem {
        asset_id: row.get("asset_id"),
        title: row.try_get("title").unwrap_or_default(),
        platform: row.try_get("platform").ok(),
        product_name: row.try_get("product_name").ok(),
        creator_name: row.try_get("creator_name").ok(),
        asset_status: row.try_get("asset_status").unwrap_or_default(),
        lifecycle_status: row.try_get("lifecycle_status").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}
