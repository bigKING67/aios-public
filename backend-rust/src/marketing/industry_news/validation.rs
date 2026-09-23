use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

use super::types::{ArticleSort, IndustryArticleQuery, NormalizedArticleQuery};

const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 20;
const MAX_PAGE_SIZE: i64 = 100;
const MAX_KEYWORD_LEN: usize = 100;

pub(super) fn normalize_query(query: IndustryArticleQuery) -> AppResult<NormalizedArticleQuery> {
    let keyword = normalize_optional_text(query.keyword, MAX_KEYWORD_LEN);
    let source_fakeid = normalize_optional_text(query.source_fakeid, 200);
    let date_from = parse_optional_date(query.date_from, "date_from")?;
    let date_to = parse_optional_date(query.date_to, "date_to")?;
    if let (Some(start), Some(end)) = (date_from, date_to) {
        if start > end {
            return Err(AppError::bad_request("date_from 不能晚于 date_to"));
        }
    }

    Ok(NormalizedArticleQuery {
        keyword,
        source_fakeid,
        date_from,
        date_to,
        content_status: normalize_content_status(query.content_status)?,
        has_content: normalize_bool(query.has_content, "has_content")?,
        page: normalize_page(query.page),
        page_size: normalize_page_size(query.page_size),
        sort: normalize_sort(query.sort),
    })
}

fn normalize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
        .map(|raw| raw.chars().take(max_len).collect())
}

fn parse_optional_date(value: Option<String>, label: &str) -> AppResult<Option<NaiveDate>> {
    let Some(value) = normalize_optional_text(value, 32) else {
        return Ok(None);
    };
    NaiveDate::parse_from_str(value.as_str(), "%Y-%m-%d")
        .map(Some)
        .map_err(|_| AppError::bad_request(format!("{label} 必须为 YYYY-MM-DD")))
}

fn normalize_content_status(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = normalize_optional_text(value, 32) else {
        return Ok(None);
    };
    match value.as_str() {
        "list_only" | "content_fetched" | "content_failed" => Ok(Some(value)),
        _ => Err(AppError::bad_request("content_status 参数不合法")),
    }
}

fn normalize_bool(value: Option<String>, label: &str) -> AppResult<Option<bool>> {
    let Some(value) = normalize_optional_text(value, 16) else {
        return Ok(None);
    };
    match value.to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" => Ok(Some(true)),
        "0" | "false" | "no" => Ok(Some(false)),
        _ => Err(AppError::bad_request(format!("{label} 参数不合法"))),
    }
}

fn normalize_page(value: Option<i64>) -> i64 {
    value.unwrap_or(DEFAULT_PAGE).clamp(1, 10_000)
}

fn normalize_page_size(value: Option<i64>) -> i64 {
    value.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE)
}

fn normalize_sort(value: Option<String>) -> ArticleSort {
    match normalize_optional_text(value, 64).as_deref() {
        Some("fetched_at_desc") => ArticleSort::FetchedAtDesc,
        Some("source_publish_time_desc") => ArticleSort::SourceThenPublishTime,
        Some("relevance") => ArticleSort::Relevance,
        _ => ArticleSort::PublishTimeDesc,
    }
}
