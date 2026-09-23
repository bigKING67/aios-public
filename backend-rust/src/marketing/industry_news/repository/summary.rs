use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{super::types::IndustryArticleSummary, MIN_READABLE_PLAIN_CONTENT_CHARS};

pub(in crate::marketing::industry_news) async fn query_summary(
    pool: &PgPool,
) -> AppResult<IndustryArticleSummary> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE article.is_deleted = FALSE)::BIGINT AS total_articles,
          COUNT(*) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
          )::BIGINT AS readable_articles,
          COUNT(*) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
              AND article.publish_date = CURRENT_DATE
          )::BIGINT AS today_articles,
          COUNT(*) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
          )::BIGINT AS content_fetched_articles,
          COUNT(*) FILTER (
            WHERE article.is_deleted = FALSE
              AND (
                article.content_status = 'list_only'
                OR (
                  article.content_status = 'content_fetched'
                  AND CHAR_LENGTH(BTRIM(article.plain_content)) < $1
                )
              )
          )::BIGINT AS list_only_articles,
          COUNT(*) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_failed'
          )::BIGINT AS failed_content_articles,
          (SELECT COUNT(*)::BIGINT FROM ads.marketing_industry_article_sources WHERE enabled = TRUE) AS source_count,
          (
            SELECT COUNT(*)::BIGINT
            FROM ads.marketing_industry_article_sources
            WHERE enabled = TRUE
              AND last_error IS NOT NULL
          ) AS failed_source_count,
          MAX(article.publish_time) FILTER (
            WHERE article.is_deleted = FALSE
              AND article.content_status = 'content_fetched'
              AND CHAR_LENGTH(BTRIM(article.plain_content)) >= $1
          )::TEXT AS latest_publish_time,
          COALESCE(
            MAX(article.fetched_at),
            (
              SELECT upstream.last_checked_at
              FROM etl.marketing_industry_article_upstream_status upstream
              WHERE upstream.status_key = 'wechat_download_api'
              LIMIT 1
            )
          )::TEXT AS latest_fetched_at,
          (
            SELECT upstream.login_expires_at::TEXT
            FROM etl.marketing_industry_article_upstream_status upstream
            WHERE upstream.status_key = 'wechat_download_api'
            LIMIT 1
          ) AS wechat_login_expires_at,
          (
            SELECT upstream.login_status
            FROM etl.marketing_industry_article_upstream_status upstream
            WHERE upstream.status_key = 'wechat_download_api'
            LIMIT 1
          ) AS wechat_login_status
        FROM ads.marketing_industry_articles article
        "#,
    )
    .bind(MIN_READABLE_PLAIN_CONTENT_CHARS)
    .fetch_one(pool)
    .await
    .map_err(|error| {
        error!(?error, "query marketing industry summary failed");
        AppError::Internal
    })?;

    Ok(IndustryArticleSummary {
        total_articles: row.try_get("readable_articles").unwrap_or(0),
        today_articles: row.try_get("today_articles").unwrap_or(0),
        content_fetched_articles: row.try_get("content_fetched_articles").unwrap_or(0),
        list_only_articles: row.try_get("list_only_articles").unwrap_or(0),
        failed_content_articles: row.try_get("failed_content_articles").unwrap_or(0),
        source_count: row.try_get("source_count").unwrap_or(0),
        failed_source_count: row.try_get("failed_source_count").unwrap_or(0),
        latest_publish_time: row.try_get("latest_publish_time").ok().flatten(),
        latest_fetched_at: row.try_get("latest_fetched_at").ok().flatten(),
        wechat_login_expires_at: row.try_get("wechat_login_expires_at").ok().flatten(),
        wechat_login_status: row.try_get("wechat_login_status").ok().flatten(),
    })
}
