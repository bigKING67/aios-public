COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.state_key IS
  '创建者直播看板刷新状态键。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.last_feishu_loaded_at IS
  '最近一次飞书数据加载完成时间。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.last_live_updated_at IS
  '最近一次直播源数据更新时间水位。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.last_refresh_at IS
  '最近一次看板刷新执行时间。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.last_refresh_start_date IS
  '最近一次刷新窗口开始日期。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.last_refresh_end_date IS
  '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.creator_live_dashboard_refresh_state.updated_at IS
  '刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.id IS
  '抖音短视频明细刷新状态记录主键。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_at IS
  '最近一次短视频明细刷新执行时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_start_date IS
  '最近一次短视频明细刷新窗口开始日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_end_date IS
  '最近一次短视频明细刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.created_at IS
  '短视频明细刷新状态记录创建时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.updated_at IS
  '短视频明细刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.id IS
  '抖音商品卡看板刷新状态记录主键。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.last_refresh_at IS
  '最近一次商品卡看板刷新执行时间。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.last_refresh_start_date IS
  '最近一次商品卡看板刷新窗口开始日期。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.last_refresh_end_date IS
  '最近一次商品卡看板刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.created_at IS
  '商品卡看板刷新状态记录创建时间。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.updated_at IS
  '商品卡看板刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.marketing_industry_article_sync_state.source_fakeid IS
  '行业文章来源公众号 fakeid。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_seen_publish_time IS
  '最近一次已同步文章发布时间水位。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_seen_article_url IS
  '最近一次已同步文章 URL 水位。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_run_id IS
  '最近一次行业文章同步运行 ID。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_started_at IS
  '最近一次行业文章同步开始时间。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_success_at IS
  '最近一次行业文章同步成功时间。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_error_at IS
  '最近一次行业文章同步失败时间。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.last_error IS
  '最近一次行业文章同步失败错误信息。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.consecutive_failures IS
  '行业文章同步连续失败次数。';
COMMENT ON COLUMN etl.marketing_industry_article_sync_state.updated_at IS
  '行业文章同步状态记录最近更新时间。';

COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.status_key IS
  '行业文章上游状态记录键。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.api_base IS
  '行业文章上游 API 基础地址。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.authenticated IS
  '上游接口认证是否有效。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.logged_in IS
  '上游账号是否处于登录状态。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.is_expired IS
  '上游登录态是否已过期。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.login_status IS
  '上游登录状态文本。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.login_expires_at IS
  '上游登录态预计过期时间。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.last_checked_at IS
  '最近一次上游状态检查时间。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.last_error IS
  '最近一次上游状态检查错误信息。';
COMMENT ON COLUMN etl.marketing_industry_article_upstream_status.updated_at IS
  '行业文章上游状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.id IS
  '抖音商品卡周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.last_source_updated_at IS
  '最近一次已处理的商品卡源数据更新时间水位。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.last_refresh_at IS
  '最近一次商品卡周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.last_refresh_start_date IS
  '最近一次商品卡周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.last_refresh_end_date IS
  '最近一次商品卡周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.created_at IS
  '商品卡周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_card_metrics_week_refresh_state.updated_at IS
  '商品卡周指标刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.id IS
  '抖音渠道周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.last_source_updated_at IS
  '最近一次已处理的渠道源数据更新时间水位。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.last_refresh_at IS
  '最近一次渠道周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.last_refresh_start_date IS
  '最近一次渠道周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.last_refresh_end_date IS
  '最近一次渠道周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.created_at IS
  '渠道周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_channel_metrics_week_refresh_state.updated_at IS
  '渠道周指标刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.id IS
  '抖音直播周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.last_source_updated_at IS
  '最近一次已处理的直播源数据更新时间水位。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.last_refresh_at IS
  '最近一次直播周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.last_refresh_start_date IS
  '最近一次直播周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.last_refresh_end_date IS
  '最近一次直播周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.created_at IS
  '直播周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_live_metrics_week_refresh_state.updated_at IS
  '直播周指标刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.id IS
  '抖音交易周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.last_source_updated_at IS
  '最近一次已处理的抖音交易源数据更新时间水位。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.last_refresh_at IS
  '最近一次抖音交易周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.last_refresh_start_date IS
  '最近一次抖音交易周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.last_refresh_end_date IS
  '最近一次抖音交易周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.created_at IS
  '抖音交易周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_metrics_week_refresh_state.updated_at IS
  '抖音交易周指标刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.id IS
  '抖音短视频周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.last_source_updated_at IS
  '最近一次已处理的短视频源数据更新时间水位。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.last_refresh_at IS
  '最近一次短视频周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.last_refresh_start_date IS
  '最近一次短视频周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.last_refresh_end_date IS
  '最近一次短视频周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.created_at IS
  '短视频周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state.updated_at IS
  '短视频周指标刷新状态记录最近更新时间。';

COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.id IS
  '淘宝单品流量渠道周指标刷新状态记录主键。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.last_source_updated_at IS
  '最近一次已处理的淘宝流量渠道源数据更新时间水位。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.last_refresh_at IS
  '最近一次淘宝单品流量渠道周指标刷新执行时间。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.last_refresh_start_date IS
  '最近一次淘宝单品流量渠道周指标刷新窗口开始日期。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.last_refresh_end_date IS
  '最近一次淘宝单品流量渠道周指标刷新窗口结束日期。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.created_at IS
  '淘宝单品流量渠道周指标刷新状态记录创建时间。';
COMMENT ON COLUMN etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_sta.updated_at IS
  '淘宝单品流量渠道周指标刷新状态记录最近更新时间。';
