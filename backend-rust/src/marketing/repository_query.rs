use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::repository_row_filters::{item_from_row, push_filters, push_sort_clause};
use super::super::repository_sql::{push_creator_select_columns, select_creator_by_id_sql};
use super::super::types::{CreatorLibraryItem, NormalizedQuery};

pub(crate) async fn count_creators(
    pool: &PgPool,
    query: &NormalizedQuery,
    actor_user_id: &str,
) -> AppResult<i64> {
    let mut builder = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::BIGINT AS total FROM ads.influencer_library WHERE is_deleted = FALSE",
    );
    push_filters(&mut builder, query, Some(actor_user_id));

    let row = builder.build().fetch_one(pool).await.map_err(|error| {
        error!(?error, "count influencer library failed");
        AppError::Internal
    })?;

    Ok(row.try_get::<i64, _>("total").unwrap_or(0))
}

pub(crate) async fn list_creators(
    pool: &PgPool,
    query: &NormalizedQuery,
    actor_user_id: &str,
    can_manage: bool,
) -> AppResult<Vec<CreatorLibraryItem>> {
    let mut builder = QueryBuilder::<Postgres>::new("SELECT ");
    push_creator_select_columns(&mut builder, actor_user_id, can_manage);
    builder.push(" FROM ads.influencer_library WHERE is_deleted = FALSE");
    push_filters(&mut builder, query, Some(actor_user_id));
    builder.push(" ORDER BY ");
    push_sort_clause(&mut builder, query.sort, actor_user_id);
    builder.push(" LIMIT ");
    builder.push_bind(query.page_size);
    builder.push(" OFFSET ");
    builder.push_bind((query.page - 1) * query.page_size);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(?error, "list influencer library failed");
        AppError::Internal
    })?;

    Ok(rows.iter().map(item_from_row).collect())
}

pub(crate) async fn fetch_creator_by_id(
    pool: &PgPool,
    id: i64,
    actor_user_id: &str,
    can_manage: bool,
) -> AppResult<Option<CreatorLibraryItem>> {
    let sql = select_creator_by_id_sql();
    let row = sqlx::query(&sql)
        .bind(id)
        .bind(actor_user_id)
        .bind(can_manage)
        .fetch_optional(pool)
        .await
        .map_err(|error| {
            error!(?error, id, "fetch influencer library item failed");
            AppError::Internal
        })?;

    Ok(row.as_ref().map(item_from_row))
}
