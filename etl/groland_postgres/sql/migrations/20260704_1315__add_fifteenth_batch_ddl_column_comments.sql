COMMENT ON COLUMN ads.marketing_content_platform_videos.platform_video_id IS
  '内容资产平台视频绑定记录 ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.asset_id IS
  '关联的内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.platform IS
  '发布或投放平台编码，例如 douyin、xiaohongshu 或 qianchuan。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.account_id IS
  '平台账号 ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.account_name IS
  '平台账号名称。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.advertiser_id IS
  '广告主或投放主体 ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.external_video_id IS
  '外部平台视频 ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.external_item_id IS
  '外部平台内容 item ID。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.external_note_id IS
  '外部平台笔记 ID，主要用于小红书等图文笔记场景。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.external_url IS
  '外部平台内容访问 URL。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_title IS
  '外部平台发布标题。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_cover_url IS
  '外部平台发布封面 URL。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.publish_status IS
  '外部平台发布状态，未知时为 unknown。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.published_at IS
  '外部平台发布时间。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.relation_status IS
  '资产与平台内容的绑定关系状态：active、pending_confirm、rejected 或 archived。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.source IS
  '绑定来源：manual、api_upload、api_import、report_import 或 fuzzy_match_confirmed。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.confidence IS
  '资产与平台内容匹配置信度，数值越高表示匹配越可信。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.raw_payload IS
  '平台绑定的原始请求、导入或匹配证据 JSON。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.created_at IS
  '平台视频绑定记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_platform_videos.updated_at IS
  '平台视频绑定记录最近更新时间，由更新时间触发器维护。';

COMMENT ON COLUMN ads.marketing_industry_article_sources.nickname IS
  '微信公众号名称。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.alias IS
  '微信公众号别名或账号标识。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.head_img_url IS
  '微信公众号头像 URL。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.category_name IS
  '来源分类名称。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.display_order IS
  '行业资讯来源展示排序，数值越小越靠前。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.source_priority IS
  '来源优先级：low、normal 或 high。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_article_count IS
  '上游订阅列表返回的文章数量。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_historical_count IS
  '上游订阅列表返回的历史文章数量。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_last_poll_at IS
  '上游最近轮询该来源的时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_created_at IS
  '上游记录该来源的创建时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_rss_url IS
  '上游提供的 RSS 地址。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.upstream_historical_rss_url IS
  '上游提供的历史文章 RSS 地址。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.last_synced_at IS
  'DataHub 最近同步该来源基础信息的时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.last_success_at IS
  'DataHub 最近成功同步该来源文章的时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.last_error_at IS
  'DataHub 最近同步该来源失败的时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.consecutive_failures IS
  '该来源连续同步失败次数。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.next_retry_at IS
  '连续失败后下一次允许重试时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.created_at IS
  '行业资讯来源记录创建时间。';
COMMENT ON COLUMN ads.marketing_industry_article_sources.updated_at IS
  '行业资讯来源记录最近更新时间。';
