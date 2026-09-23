use sqlx::Row;

use super::types::{IndustryArticleItem, IndustryArticleSource};

pub(super) fn article_from_row(row: &sqlx::postgres::PgRow) -> IndustryArticleItem {
    IndustryArticleItem {
        id: row.try_get("id").unwrap_or(0),
        source_fakeid: row.try_get("source_fakeid").unwrap_or_default(),
        source_nickname: row.try_get("source_nickname").unwrap_or_default(),
        source_alias: row.try_get("source_alias").unwrap_or_default(),
        aid: row.try_get("aid").unwrap_or_default(),
        title: row.try_get("title").unwrap_or_default(),
        digest: row.try_get("digest").unwrap_or_default(),
        article_url: row.try_get("article_url").unwrap_or_default(),
        cover_url: row.try_get("cover_url").unwrap_or_default(),
        author: row.try_get("author").unwrap_or_default(),
        publish_time: row.try_get("publish_time").ok().flatten(),
        publish_date: row.try_get("publish_date").ok().flatten(),
        plain_content: row.try_get("plain_content").unwrap_or_default(),
        content_status: row.try_get("content_status").unwrap_or_default(),
        content_fetch_error: row.try_get("content_fetch_error").ok().flatten(),
        fetch_source: row.try_get("fetch_source").unwrap_or_default(),
        image_count: row.try_get("image_count").unwrap_or(0),
        fetched_at: row.try_get("fetched_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}

pub(super) fn source_from_row(row: &sqlx::postgres::PgRow) -> IndustryArticleSource {
    IndustryArticleSource {
        source_fakeid: row.try_get("source_fakeid").unwrap_or_default(),
        nickname: row.try_get("nickname").unwrap_or_default(),
        alias: row.try_get("alias").unwrap_or_default(),
        head_img_url: row.try_get("head_img_url").unwrap_or_default(),
        category_name: row.try_get("category_name").ok().flatten(),
        enabled: row.try_get("enabled").unwrap_or(false),
        article_count: row.try_get("article_count").unwrap_or(0),
        latest_publish_time: row.try_get("latest_publish_time").ok().flatten(),
        last_synced_at: row.try_get("last_synced_at").ok().flatten(),
        last_success_at: row.try_get("last_success_at").ok().flatten(),
        last_error_at: row.try_get("last_error_at").ok().flatten(),
        last_error: row.try_get("last_error").ok().flatten(),
        consecutive_failures: row.try_get("consecutive_failures").unwrap_or(0),
        upstream_article_count: row.try_get("upstream_article_count").unwrap_or(0),
        pending_content_count: row.try_get("pending_content_count").unwrap_or(0),
        failed_content_count: row.try_get("failed_content_count").unwrap_or(0),
        last_content_error: row.try_get("last_content_error").ok().flatten(),
        last_content_error_at: row.try_get("last_content_error_at").ok().flatten(),
    }
}
