use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{
    super::{row_mapping::source_from_row, types::IndustryArticleSource},
    MIN_READABLE_PLAIN_CONTENT_CHARS,
};

pub(in crate::marketing::industry_news) async fn query_sources(
    pool: &PgPool,
) -> AppResult<Vec<IndustryArticleSource>> {
    let rows = sqlx::query(
        r#"
        SELECT
          source.source_fakeid,
          source.nickname,
          source.alias,
          source.head_img_url,
          source.category_name,
          source.enabled,
          COALESCE(COUNT(article.id) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
          ), 0)::BIGINT AS article_count,
          COALESCE(COUNT(article.id) FILTER (
            WHERE article.is_deleted = FALSE
              AND (
                article.content_status = 'list_only'
                OR (
                  article.content_status = 'content_fetched'
                  AND CHAR_LENGTH(BTRIM(article.plain_content)) < $1
                )
              )
          ), 0)::BIGINT AS pending_content_count,
          COALESCE(COUNT(article.id) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_failed'
          ), 0)::BIGINT AS failed_content_count,
          MAX(article.publish_time) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
          )::TEXT AS latest_publish_time,
          content_error.content_fetch_error AS last_content_error,
          content_error.updated_at::TEXT AS last_content_error_at,
          source.last_synced_at::TEXT AS last_synced_at,
          source.last_success_at::TEXT AS last_success_at,
          source.last_error_at::TEXT AS last_error_at,
          source.last_error,
          source.consecutive_failures,
          source.upstream_article_count
        FROM ads.marketing_industry_article_sources source
        LEFT JOIN ads.marketing_industry_articles article
          ON article.source_fakeid = source.source_fakeid
        LEFT JOIN LATERAL (
          SELECT
            failed_article.content_fetch_error,
            failed_article.updated_at
          FROM ads.marketing_industry_articles failed_article
          WHERE failed_article.source_fakeid = source.source_fakeid
            AND failed_article.is_deleted = FALSE
            AND failed_article.content_status = 'content_failed'
            AND failed_article.content_fetch_error IS NOT NULL
          ORDER BY failed_article.updated_at DESC, failed_article.id DESC
          LIMIT 1
        ) content_error ON TRUE
        GROUP BY
          source.source_fakeid,
          source.nickname,
          source.alias,
          source.head_img_url,
          source.category_name,
          source.enabled,
          source.last_synced_at,
          source.last_success_at,
          source.last_error_at,
          source.last_error,
          source.consecutive_failures,
          source.upstream_article_count,
          content_error.content_fetch_error,
          content_error.updated_at,
          source.display_order
        ORDER BY source.display_order ASC, source.nickname ASC, source.source_fakeid ASC
        "#,
    )
    .bind(MIN_READABLE_PLAIN_CONTENT_CHARS)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing industry sources failed");
        AppError::Internal
    })?;

    Ok(rows.iter().map(source_from_row).collect())
}
