use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{
    super::{
        row_mapping::article_from_row,
        types::{IndustryArticleItem, NormalizedArticleQuery},
    },
    filters::{push_article_filters, push_sort},
    MIN_READABLE_PLAIN_CONTENT_CHARS,
};

pub(in crate::marketing::industry_news) async fn count_articles(
    pool: &PgPool,
    query: &NormalizedArticleQuery,
) -> AppResult<i64> {
    let mut builder = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::BIGINT AS total FROM ads.marketing_industry_articles article WHERE article.is_deleted = FALSE AND article.content_status = 'content_fetched' AND CHAR_LENGTH(BTRIM(article.plain_content)) >= ",
    );
    builder.push_bind(MIN_READABLE_PLAIN_CONTENT_CHARS);
    push_article_filters(&mut builder, query);
    let row = builder.build().fetch_one(pool).await.map_err(|error| {
        error!(?error, "count marketing industry articles failed");
        AppError::Internal
    })?;
    Ok(row.try_get::<i64, _>("total").unwrap_or(0))
}

pub(in crate::marketing::industry_news) async fn query_articles(
    pool: &PgPool,
    query: &NormalizedArticleQuery,
) -> AppResult<Vec<IndustryArticleItem>> {
    let mut builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT
          article.id,
          article.source_fakeid,
          article.source_nickname,
          article.source_alias,
          article.aid,
          article.title,
          article.digest,
          article.article_url,
          article.cover_url,
          article.author,
          article.publish_time::TEXT AS publish_time,
          article.publish_date::TEXT AS publish_date,
          COALESCE(LEFT(article.plain_content, 6000), '') AS plain_content,
          article.content_status,
          article.content_fetch_error,
          article.fetch_source,
          jsonb_array_length(article.images)::BIGINT AS image_count,
          article.fetched_at::TEXT AS fetched_at,
          article.updated_at::TEXT AS updated_at
        FROM ads.marketing_industry_articles article
        WHERE article.is_deleted = FALSE
          AND article.content_status = 'content_fetched'
          AND CHAR_LENGTH(BTRIM(article.plain_content)) >=
        "#,
    );
    builder.push_bind(MIN_READABLE_PLAIN_CONTENT_CHARS);
    push_article_filters(&mut builder, query);
    builder.push(" ORDER BY ");
    push_sort(&mut builder, query);
    builder.push(" LIMIT ");
    builder.push_bind(query.page_size);
    builder.push(" OFFSET ");
    builder.push_bind((query.page - 1) * query.page_size);

    let rows = builder.build().fetch_all(pool).await.map_err(|error| {
        error!(?error, "query marketing industry articles failed");
        AppError::Internal
    })?;
    Ok(rows.iter().map(article_from_row).collect())
}
