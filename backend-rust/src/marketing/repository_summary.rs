use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::repository_access::list_bd_users;
use super::super::repository_sql::{
    QUERY_FILTER_ANCHOR_LEVELS_SQL, QUERY_FILTER_ANCHOR_TAGS_SQL, QUERY_FILTER_CATEGORIES_SQL,
    QUERY_FILTER_COOPERATION_STATUSES_SQL, QUERY_FILTER_OWNERS_SQL, QUERY_FILTER_PLATFORMS_SQL,
    QUERY_FILTER_SOURCE_TYPES_SQL, QUERY_SUMMARY_SQL,
};
use super::super::types::{CreatorLibraryFilterOptions, CreatorLibrarySummary};

pub(crate) async fn query_summary(pool: &PgPool) -> AppResult<CreatorLibrarySummary> {
    let row = sqlx::query(QUERY_SUMMARY_SQL)
        .fetch_one(pool)
        .await
        .map_err(|error| {
            error!(?error, "query influencer library summary failed");
            AppError::Internal
        })?;

    Ok(CreatorLibrarySummary {
        total_creators: row.try_get("total_creators").unwrap_or(0),
        cooperable_creators: row.try_get("cooperable_creators").unwrap_or(0),
        negotiating_creators: row.try_get("negotiating_creators").unwrap_or(0),
        unfollowed_30d_creators: row.try_get("unfollowed_30d_creators").unwrap_or(0),
        s_level_creators: row.try_get("s_level_creators").unwrap_or(0),
    })
}

pub(crate) async fn query_filter_options(pool: &PgPool) -> AppResult<CreatorLibraryFilterOptions> {
    let (
        platforms,
        categories,
        anchor_tags,
        anchor_levels,
        cooperation_statuses,
        owners,
        bd_users,
        source_types,
    ) = tokio::try_join!(
        query_text_options(pool, QUERY_FILTER_PLATFORMS_SQL, "platforms"),
        query_text_options(pool, QUERY_FILTER_CATEGORIES_SQL, "categories"),
        query_text_options(pool, QUERY_FILTER_ANCHOR_TAGS_SQL, "anchor tags"),
        query_text_options(pool, QUERY_FILTER_ANCHOR_LEVELS_SQL, "anchor levels"),
        query_text_options(
            pool,
            QUERY_FILTER_COOPERATION_STATUSES_SQL,
            "cooperation statuses"
        ),
        query_text_options(pool, QUERY_FILTER_OWNERS_SQL, "owners"),
        list_bd_users(pool),
        query_text_options(pool, QUERY_FILTER_SOURCE_TYPES_SQL, "source types"),
    )?;

    Ok(CreatorLibraryFilterOptions {
        platforms,
        categories,
        anchor_tags,
        anchor_levels,
        cooperation_statuses,
        owners,
        bd_users,
        source_types,
    })
}

async fn query_text_options(
    pool: &PgPool,
    sql: &'static str,
    label: &'static str,
) -> AppResult<Vec<String>> {
    sqlx::query_scalar::<_, String>(sql)
        .fetch_all(pool)
        .await
        .map_err(|error| {
            error!(
                ?error,
                label, "query influencer library filter option values failed"
            );
            AppError::Internal
        })
}
