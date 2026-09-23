use sqlx::{PgPool, Row};
use tracing::{error, warn};

use crate::error::{AppError, AppResult};

use super::types::ContentAssetOwnerOption;

pub(super) async fn query_product_options(_pool: &PgPool) -> AppResult<Vec<String>> {
    Ok(vec![
        "焕活精华（绿瓶）".to_string(),
        "白金精华（白瓶60ml）".to_string(),
        "发际线精华（20ml）".to_string(),
        "洗发水（油头）".to_string(),
        "洗发水（干头）".to_string(),
    ])
}

pub(super) async fn query_array_text_options(
    pool: &PgPool,
    column: &str,
    limit: i64,
) -> AppResult<Vec<String>> {
    let sql = format!(
        "SELECT DISTINCT BTRIM(value) AS value \
         FROM ads.marketing_content_assets asset \
         CROSS JOIN LATERAL UNNEST(asset.{column}) AS option_value(value) \
         WHERE asset.is_deleted = FALSE AND NULLIF(BTRIM(value), '') IS NOT NULL \
         ORDER BY value ASC LIMIT $1"
    );
    let rows = sqlx::query(&sql)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(?error, %column, "query marketing content asset array options failed");
            AppError::Internal
        })?;
    Ok(rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("value").ok())
        .collect())
}

pub(super) async fn query_distinct_text(pool: &PgPool, column: &str) -> AppResult<Vec<String>> {
    let sql = format!(
        "SELECT DISTINCT {column} AS value FROM ads.marketing_content_assets \
         WHERE is_deleted = FALSE AND NULLIF(BTRIM({column}), '') IS NOT NULL ORDER BY {column} ASC LIMIT 200"
    );
    let rows = sqlx::query(&sql).fetch_all(pool).await.map_err(|error| {
        error!(?error, %column, "query marketing content asset distinct option failed");
        AppError::Internal
    })?;
    Ok(rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("value").ok())
        .collect())
}

pub(super) async fn query_platform_options(pool: &PgPool) -> AppResult<Vec<String>> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT value
        FROM (
          SELECT BTRIM(platform) AS value
          FROM ads.marketing_content_assets
          WHERE is_deleted = FALSE AND NULLIF(BTRIM(platform), '') IS NOT NULL
          UNION
          SELECT BTRIM(platform_name) AS value
          FROM ads.marketing_content_assets asset
          CROSS JOIN LATERAL UNNEST(asset.platform_names) AS platform_name
          WHERE asset.is_deleted = FALSE AND NULLIF(BTRIM(platform_name), '') IS NOT NULL
        ) platform_options
        ORDER BY value ASC
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            "query marketing content asset platform options failed"
        );
        AppError::Internal
    })?;
    Ok(rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("value").ok())
        .collect())
}

pub(super) async fn query_tags(pool: &PgPool) -> AppResult<Vec<String>> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT BTRIM(tag) AS value
        FROM ads.marketing_content_assets asset
        CROSS JOIN LATERAL UNNEST(asset.tags || asset.ai_suggested_tags) AS tag
        WHERE asset.is_deleted = FALSE AND NULLIF(BTRIM(tag), '') IS NOT NULL
        ORDER BY value ASC
        LIMIT 300
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing content asset tags failed");
        AppError::Internal
    })?;
    Ok(rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("value").ok())
        .collect())
}

pub(super) async fn query_content_asset_owner_user_exists(
    pool: &PgPool,
    owner_user_id: &str,
) -> AppResult<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM public.auth_users user_item
          JOIN public.auth_user_roles user_role ON user_role.user_id = user_item.id
          JOIN public.auth_roles role ON role.id = user_role.role_id
          WHERE CAST(user_item.id AS TEXT) = $1
            AND LOWER(role.name) IN (
              'content_ops',
              'content-ops',
              'contentops',
              'content_ops_manager',
              'content-ops-manager',
              'contentopsmanager',
              'admin',
              'super_admin',
              'super-admin',
              'superadmin'
            )
            AND COALESCE(user_item.is_active, TRUE) = TRUE
        )
        "#,
    )
    .bind(owner_user_id)
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            owner_user_id, "query content asset owner user failed"
        );
        AppError::Internal
    })?;
    Ok(exists)
}

pub(super) async fn query_content_asset_owner_options(
    pool: &PgPool,
) -> Vec<ContentAssetOwnerOption> {
    let rows = match sqlx::query(
        r#"
        SELECT
          CAST(user_item.id AS TEXT) AS user_id,
          user_item.username,
          COALESCE(NULLIF(BTRIM(user_item.display_name), ''), user_item.username) AS display_name,
          ARRAY_AGG(DISTINCT role.name ORDER BY role.name) AS roles
        FROM public.auth_users user_item
        JOIN public.auth_user_roles user_role ON user_role.user_id = user_item.id
        JOIN public.auth_roles role ON role.id = user_role.role_id
        WHERE LOWER(role.name) IN (
          'content_ops',
          'content-ops',
          'contentops',
          'content_ops_manager',
          'content-ops-manager',
          'contentopsmanager',
          'admin',
          'super_admin',
          'super-admin',
          'superadmin'
        )
          AND COALESCE(user_item.is_active, TRUE) = TRUE
        GROUP BY user_item.id, user_item.username, user_item.display_name
        ORDER BY display_name ASC, user_item.username ASC
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(error) => {
            warn!(
                ?error,
                "query content asset owner options failed; returning empty options"
            );
            return Vec::new();
        }
    };

    rows.iter()
        .map(|row| {
            let roles = row.try_get::<Vec<String>, _>("roles").unwrap_or_default();
            ContentAssetOwnerOption {
                user_id: row.try_get("user_id").unwrap_or_default(),
                username: row.try_get("username").unwrap_or_default(),
                display_name: row.try_get("display_name").unwrap_or_default(),
                is_manager: roles.iter().any(|role| {
                    role.eq_ignore_ascii_case("content_ops_manager")
                        || role.eq_ignore_ascii_case("content-ops-manager")
                        || role.eq_ignore_ascii_case("contentopsmanager")
                        || role.eq_ignore_ascii_case("admin")
                        || role.eq_ignore_ascii_case("super_admin")
                        || role.eq_ignore_ascii_case("super-admin")
                        || role.eq_ignore_ascii_case("superadmin")
                }),
                roles,
            }
        })
        .collect()
}
