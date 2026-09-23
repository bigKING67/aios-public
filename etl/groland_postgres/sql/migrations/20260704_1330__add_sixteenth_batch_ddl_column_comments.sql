COMMENT ON COLUMN ads.marketing_industry_articles.id IS
  '营销行业资讯文章记录主键。';
COMMENT ON COLUMN ads.marketing_industry_articles.source_fakeid IS
  '文章来源微信公众号 fakeid。';
COMMENT ON COLUMN ads.marketing_industry_articles.source_nickname IS
  '文章来源公众号名称快照。';
COMMENT ON COLUMN ads.marketing_industry_articles.source_alias IS
  '文章来源公众号别名快照。';
COMMENT ON COLUMN ads.marketing_industry_articles.aid IS
  '微信文章 aid 或上游文章标识。';
COMMENT ON COLUMN ads.marketing_industry_articles.title IS
  '文章标题。';
COMMENT ON COLUMN ads.marketing_industry_articles.digest IS
  '文章摘要或导语。';
COMMENT ON COLUMN ads.marketing_industry_articles.article_url IS
  '文章原文 URL。';
COMMENT ON COLUMN ads.marketing_industry_articles.cover_url IS
  '文章封面图片 URL。';
COMMENT ON COLUMN ads.marketing_industry_articles.author IS
  '文章作者。';
COMMENT ON COLUMN ads.marketing_industry_articles.publish_time IS
  '文章发布时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.publish_date IS
  '文章发布日期。';
COMMENT ON COLUMN ads.marketing_industry_articles.update_time IS
  '上游文章更新时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.create_time IS
  '上游文章创建时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.images IS
  '文章图片列表 JSON。';
COMMENT ON COLUMN ads.marketing_industry_articles.content_hash IS
  '文章正文内容哈希，用于判断正文是否变化。';
COMMENT ON COLUMN ads.marketing_industry_articles.content_fetch_error IS
  '正文抓取失败时记录的错误信息。';
COMMENT ON COLUMN ads.marketing_industry_articles.fetch_source IS
  '文章数据抓取来源：api_list、api_article 或 rss_fallback。';
COMMENT ON COLUMN ads.marketing_industry_articles.source_priority_snapshot IS
  '抓取时记录的来源优先级快照：low、normal 或 high。';
COMMENT ON COLUMN ads.marketing_industry_articles.fetched_at IS
  '文章列表或正文最近抓取时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.last_content_fetched_at IS
  '文章正文最近成功抓取时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.is_deleted IS
  '是否已软删除。';
COMMENT ON COLUMN ads.marketing_industry_articles.created_at IS
  '文章记录创建时间。';
COMMENT ON COLUMN ads.marketing_industry_articles.updated_at IS
  '文章记录最近更新时间。';
