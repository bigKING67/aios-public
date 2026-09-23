use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Default)]
pub(super) struct IndustryArticleQuery {
    pub(super) keyword: Option<String>,
    pub(super) source_fakeid: Option<String>,
    pub(super) date_from: Option<String>,
    pub(super) date_to: Option<String>,
    pub(super) content_status: Option<String>,
    pub(super) has_content: Option<String>,
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
    pub(super) sort: Option<String>,
}

#[derive(Debug)]
pub(super) struct NormalizedArticleQuery {
    pub(super) keyword: Option<String>,
    pub(super) source_fakeid: Option<String>,
    pub(super) date_from: Option<NaiveDate>,
    pub(super) date_to: Option<NaiveDate>,
    pub(super) content_status: Option<String>,
    pub(super) has_content: Option<bool>,
    pub(super) page: i64,
    pub(super) page_size: i64,
    pub(super) sort: ArticleSort,
}

#[derive(Debug, Clone, Copy)]
pub(super) enum ArticleSort {
    PublishTimeDesc,
    FetchedAtDesc,
    SourceThenPublishTime,
    Relevance,
}

#[derive(Debug, Serialize)]
pub(super) struct IndustryArticleListResponse {
    pub(super) items: Vec<IndustryArticleItem>,
    pub(super) total: i64,
    pub(super) page: i64,
    #[serde(rename = "pageSize")]
    pub(super) page_size: i64,
    pub(super) summary: IndustryArticleSummary,
    pub(super) sources: Vec<IndustryArticleSource>,
}

#[derive(Debug, Serialize)]
pub(super) struct IndustryArticleItem {
    pub(super) id: i64,
    #[serde(rename = "sourceFakeid")]
    pub(super) source_fakeid: String,
    #[serde(rename = "sourceNickname")]
    pub(super) source_nickname: String,
    #[serde(rename = "sourceAlias")]
    pub(super) source_alias: String,
    pub(super) aid: String,
    pub(super) title: String,
    pub(super) digest: String,
    #[serde(rename = "articleUrl")]
    pub(super) article_url: String,
    #[serde(rename = "coverUrl")]
    pub(super) cover_url: String,
    pub(super) author: String,
    #[serde(rename = "publishTime")]
    pub(super) publish_time: Option<String>,
    #[serde(rename = "publishDate")]
    pub(super) publish_date: Option<String>,
    #[serde(rename = "plainContent")]
    pub(super) plain_content: String,
    #[serde(rename = "contentStatus")]
    pub(super) content_status: String,
    #[serde(rename = "contentFetchError")]
    pub(super) content_fetch_error: Option<String>,
    #[serde(rename = "fetchSource")]
    pub(super) fetch_source: String,
    #[serde(rename = "imageCount")]
    pub(super) image_count: i64,
    #[serde(rename = "fetchedAt")]
    pub(super) fetched_at: String,
    #[serde(rename = "updatedAt")]
    pub(super) updated_at: String,
}

#[derive(Debug, Serialize, Default)]
pub(super) struct IndustryArticleSummary {
    #[serde(rename = "totalArticles")]
    pub(super) total_articles: i64,
    #[serde(rename = "todayArticles")]
    pub(super) today_articles: i64,
    #[serde(rename = "contentFetchedArticles")]
    pub(super) content_fetched_articles: i64,
    #[serde(rename = "listOnlyArticles")]
    pub(super) list_only_articles: i64,
    #[serde(rename = "failedContentArticles")]
    pub(super) failed_content_articles: i64,
    #[serde(rename = "sourceCount")]
    pub(super) source_count: i64,
    #[serde(rename = "failedSourceCount")]
    pub(super) failed_source_count: i64,
    #[serde(rename = "latestPublishTime")]
    pub(super) latest_publish_time: Option<String>,
    #[serde(rename = "latestFetchedAt")]
    pub(super) latest_fetched_at: Option<String>,
    #[serde(rename = "wechatLoginExpiresAt")]
    pub(super) wechat_login_expires_at: Option<String>,
    #[serde(rename = "wechatLoginStatus")]
    pub(super) wechat_login_status: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub(super) struct IndustryArticleSource {
    #[serde(rename = "sourceFakeid")]
    pub(super) source_fakeid: String,
    pub(super) nickname: String,
    pub(super) alias: String,
    #[serde(rename = "headImgUrl")]
    pub(super) head_img_url: String,
    #[serde(rename = "categoryName")]
    pub(super) category_name: Option<String>,
    pub(super) enabled: bool,
    #[serde(rename = "articleCount")]
    pub(super) article_count: i64,
    #[serde(rename = "latestPublishTime")]
    pub(super) latest_publish_time: Option<String>,
    #[serde(rename = "lastSyncedAt")]
    pub(super) last_synced_at: Option<String>,
    #[serde(rename = "lastSuccessAt")]
    pub(super) last_success_at: Option<String>,
    #[serde(rename = "lastErrorAt")]
    pub(super) last_error_at: Option<String>,
    #[serde(rename = "lastError")]
    pub(super) last_error: Option<String>,
    #[serde(rename = "consecutiveFailures")]
    pub(super) consecutive_failures: i32,
    #[serde(rename = "upstreamArticleCount")]
    pub(super) upstream_article_count: i64,
    #[serde(rename = "pendingContentCount")]
    pub(super) pending_content_count: i64,
    #[serde(rename = "failedContentCount")]
    pub(super) failed_content_count: i64,
    #[serde(rename = "lastContentError")]
    pub(super) last_content_error: Option<String>,
    #[serde(rename = "lastContentErrorAt")]
    pub(super) last_content_error_at: Option<String>,
}
