use sqlx::{Postgres, QueryBuilder};

use super::super::types::{ArticleSort, NormalizedArticleQuery};

pub(super) fn push_article_filters(
    builder: &mut QueryBuilder<Postgres>,
    query: &NormalizedArticleQuery,
) {
    if let Some(keyword) = &query.keyword {
        let pattern = format!("%{}%", keyword);
        builder.push(" AND (article.title ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR article.digest ILIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" OR article.plain_content ILIKE ");
        builder.push_bind(pattern);
        builder.push(")");
    }
    if let Some(source_fakeid) = &query.source_fakeid {
        builder.push(" AND article.source_fakeid = ");
        builder.push_bind(source_fakeid.clone());
    }
    if let Some(date_from) = query.date_from {
        builder.push(" AND article.publish_date >= ");
        builder.push_bind(date_from);
    }
    if let Some(date_to) = query.date_to {
        builder.push(" AND article.publish_date <= ");
        builder.push_bind(date_to);
    }
    if let Some(content_status) = &query.content_status {
        builder.push(" AND article.content_status = ");
        builder.push_bind(content_status.clone());
    }
    if let Some(has_content) = query.has_content {
        if has_content {
            builder.push(" AND article.content_status = 'content_fetched'");
        } else {
            builder.push(" AND article.content_status <> 'content_fetched'");
        }
    }
}

pub(super) fn push_sort(builder: &mut QueryBuilder<Postgres>, query: &NormalizedArticleQuery) {
    match query.sort {
        ArticleSort::FetchedAtDesc => {
            builder.push(
                "article.fetched_at DESC, article.publish_time DESC NULLS LAST, article.id DESC",
            );
        }
        ArticleSort::SourceThenPublishTime => {
            builder.push("article.source_nickname ASC, article.publish_time DESC NULLS LAST, article.id DESC");
        }
        ArticleSort::Relevance if query.keyword.is_some() => {
            builder.push("CASE WHEN article.title ILIKE '%' || ");
            builder.push_bind(query.keyword.clone().unwrap_or_default());
            builder.push(" || '%' THEN 0 WHEN article.digest ILIKE '%' || ");
            builder.push_bind(query.keyword.clone().unwrap_or_default());
            builder.push(
                " || '%' THEN 1 ELSE 2 END, article.publish_time DESC NULLS LAST, article.id DESC",
            );
        }
        _ => {
            builder.push("article.publish_time DESC NULLS LAST, article.id DESC");
        }
    }
}
