BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS ads.marketing_industry_article_sources (
  source_fakeid TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  head_img_url TEXT NOT NULL DEFAULT '',
  category_name TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  source_priority TEXT NOT NULL DEFAULT 'normal',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  upstream_article_count BIGINT NOT NULL DEFAULT 0,
  upstream_historical_count BIGINT NOT NULL DEFAULT 0,
  upstream_last_poll_at TIMESTAMP WITH TIME ZONE,
  upstream_created_at TIMESTAMP WITH TIME ZONE,
  upstream_rss_url TEXT,
  upstream_historical_rss_url TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_marketing_article_sources_fakeid_not_blank
    CHECK (BTRIM(source_fakeid) <> ''),
  CONSTRAINT chk_marketing_article_sources_priority
    CHECK (source_priority IN ('low', 'normal', 'high')),
  CONSTRAINT chk_marketing_article_sources_failures_non_negative
    CHECK (consecutive_failures >= 0)
);

COMMENT ON TABLE ads.marketing_industry_article_sources
IS '营销行业资讯公众号来源表。来源自动发现自 wechat-download-api 订阅列表，DataHub 用 enabled 控制是否进入正式资讯流。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.source_fakeid
IS '微信公众号 fakeid，来自 wechat-download-api /api/rss/subscriptions。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.enabled
IS 'DataHub 是否启用该来源进入行业资讯同步与展示。上游订阅存在不等于业务启用。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.last_error
IS '最近一次该来源同步失败原因，前端应可见展示，禁止静默吞错。';

CREATE TABLE IF NOT EXISTS ads.marketing_industry_articles (
  id BIGSERIAL PRIMARY KEY,
  source_fakeid TEXT NOT NULL REFERENCES ads.marketing_industry_article_sources(source_fakeid),
  source_nickname TEXT NOT NULL DEFAULT '',
  source_alias TEXT NOT NULL DEFAULT '',
  aid TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  digest TEXT NOT NULL DEFAULT '',
  article_url TEXT NOT NULL,
  cover_url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  publish_time TIMESTAMP WITH TIME ZONE,
  publish_date DATE,
  update_time TIMESTAMP WITH TIME ZONE,
  create_time TIMESTAMP WITH TIME ZONE,
  content_html TEXT NOT NULL DEFAULT '',
  plain_content TEXT NOT NULL DEFAULT '',
  images JSONB NOT NULL DEFAULT '[]'::JSONB,
  content_hash TEXT NOT NULL DEFAULT '',
  content_status TEXT NOT NULL DEFAULT 'list_only',
  content_fetch_error TEXT,
  fetch_source TEXT NOT NULL DEFAULT 'api_list',
  source_priority_snapshot TEXT NOT NULL DEFAULT 'normal',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_content_fetched_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_marketing_industry_articles_source_url UNIQUE (source_fakeid, article_url),
  CONSTRAINT chk_marketing_industry_articles_title_not_blank
    CHECK (BTRIM(title) <> ''),
  CONSTRAINT chk_marketing_industry_articles_url_not_blank
    CHECK (BTRIM(article_url) <> ''),
  CONSTRAINT chk_marketing_industry_articles_content_status
    CHECK (content_status IN ('list_only', 'content_fetched', 'content_failed')),
  CONSTRAINT chk_marketing_industry_articles_fetch_source
    CHECK (fetch_source IN ('api_list', 'api_article', 'rss_fallback')),
  CONSTRAINT chk_marketing_industry_articles_priority_snapshot
    CHECK (source_priority_snapshot IN ('low', 'normal', 'high')),
  CONSTRAINT chk_marketing_industry_articles_images_array
    CHECK (jsonb_typeof(images) = 'array')
);

COMMENT ON TABLE ads.marketing_industry_articles
IS '营销行业资讯文章事实表。DataHub 页面只读该表，不直连微信/RSS 上游。';
COMMENT ON COLUMN ads.marketing_industry_articles.content_html
IS '微信文章 HTML 原文缓存。v1 前端不直接渲染，避免样式污染和 XSS 风险。';
COMMENT ON COLUMN ads.marketing_industry_articles.plain_content
IS '文章纯文本正文，用于页面预览、搜索和后续 AI 摘要。';
COMMENT ON COLUMN ads.marketing_industry_articles.content_status
IS '正文抓取状态：list_only=仅列表元信息，content_fetched=已抓正文，content_failed=正文抓取失败。';

CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_publish_time
  ON ads.marketing_industry_articles (publish_time DESC NULLS LAST)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_source_publish_time
  ON ads.marketing_industry_articles (source_fakeid, publish_time DESC NULLS LAST)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_publish_date
  ON ads.marketing_industry_articles (publish_date)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_fetched_at
  ON ads.marketing_industry_articles (fetched_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_content_status
  ON ads.marketing_industry_articles (content_status)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_marketing_industry_sources_enabled_order
  ON ads.marketing_industry_article_sources (enabled, display_order, nickname);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_trgm'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_title_trgm
      ON ads.marketing_industry_articles USING GIN (title gin_trgm_ops)
      WHERE is_deleted = FALSE;
    CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_digest_trgm
      ON ads.marketing_industry_articles USING GIN (digest gin_trgm_ops)
      WHERE is_deleted = FALSE;
    CREATE INDEX IF NOT EXISTS idx_marketing_industry_articles_plain_trgm
      ON ads.marketing_industry_articles USING GIN (plain_content gin_trgm_ops)
      WHERE is_deleted = FALSE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS etl.marketing_industry_article_sync_state (
  source_fakeid TEXT PRIMARY KEY,
  last_seen_publish_time TIMESTAMP WITH TIME ZONE,
  last_seen_article_url TEXT,
  last_run_id TEXT,
  last_started_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_marketing_article_sync_state_fakeid_not_blank
    CHECK (BTRIM(source_fakeid) <> ''),
  CONSTRAINT chk_marketing_article_sync_state_failures_non_negative
    CHECK (consecutive_failures >= 0)
);

COMMENT ON TABLE etl.marketing_industry_article_sync_state
IS '营销行业资讯同步水位表。每个公众号来源独立记录水位、最近 run 和失败原因。';

CREATE TABLE IF NOT EXISTS etl.marketing_industry_article_upstream_status (
  status_key TEXT PRIMARY KEY DEFAULT 'wechat_download_api',
  api_base TEXT NOT NULL DEFAULT '',
  authenticated BOOLEAN NOT NULL DEFAULT FALSE,
  logged_in BOOLEAN NOT NULL DEFAULT FALSE,
  is_expired BOOLEAN NOT NULL DEFAULT FALSE,
  login_status TEXT NOT NULL DEFAULT 'unknown',
  login_expires_at TIMESTAMP WITH TIME ZONE,
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_error TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_marketing_article_upstream_status_key
    CHECK (status_key = 'wechat_download_api'),
  CONSTRAINT chk_marketing_article_upstream_login_status
    CHECK (login_status IN ('ok', 'expired', 'unavailable', 'unknown'))
);

COMMENT ON TABLE etl.marketing_industry_article_upstream_status
IS '营销行业资讯上游微信登录状态。用于前端显示登录是否过期，不存储 Cookie、Token 或其他凭据。';

COMMIT;
