CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE IF NOT EXISTS ads.douyin_qianchuan_live_all_domain_material_daily (
  stat_date DATE NOT NULL,
  material_type TEXT NOT NULL,
  promotion_type VARCHAR(32) NOT NULL,
  douyin_account_display_id VARCHAR(128) NOT NULL,
  douyin_account_name TEXT,
  live_room_name TEXT,
  material_key TEXT NOT NULL,
  material_id VARCHAR(64),
  material_video_name TEXT,
  material_created_at TIMESTAMP WITHOUT TIME ZONE,
  global_material_video_type TEXT,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  source_file_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  source_ids BIGINT[] NOT NULL DEFAULT '{}'::BIGINT[],
  latest_ingest_time TIMESTAMP WITHOUT TIME ZONE,
  refresh_time TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  overall_impression_count BIGINT NOT NULL DEFAULT 0,
  overall_click_count BIGINT NOT NULL DEFAULT 0,
  overall_click_rate NUMERIC(18, 6),
  overall_conversion_rate NUMERIC(18, 6),
  overall_order_count BIGINT NOT NULL DEFAULT 0,
  overall_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_gmv_ratio NUMERIC(18, 6),
  overall_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_cost_ratio NUMERIC(18, 6),
  base_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_pay_roi NUMERIC(18, 6),
  overall_order_cost NUMERIC(18, 2),
  user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_cpm NUMERIC(18, 2),
  overall_cpc NUMERIC(18, 2),
  smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_presale_order_count BIGINT NOT NULL DEFAULT 0,
  overall_presale_order_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overall_unfinished_presale_estimated_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_gmv_roi NUMERIC(18, 6),
  net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_order_count BIGINT NOT NULL DEFAULT 0,
  net_order_cost NUMERIC(18, 2),
  net_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  smart_coupon_unrefund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  platform_subsidy_unrefund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_gmv_settlement_rate NUMERIC(18, 6),
  net_order_settlement_rate NUMERIC(18, 6),
  refund_order_count_1h BIGINT NOT NULL DEFAULT 0,
  refund_amount_1h NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_rate_1h NUMERIC(18, 6),
  settlement_roi_7d NUMERIC(18, 6),
  settlement_amount_7d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  settlement_order_count_7d BIGINT NOT NULL DEFAULT 0,
  settlement_order_cost_7d NUMERIC(18, 2),
  gmv_settlement_rate_7d NUMERIC(18, 6),
  order_settlement_rate_7d NUMERIC(18, 6),
  settlement_roi_14d NUMERIC(18, 6),
  settlement_amount_14d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  settlement_order_count_14d BIGINT NOT NULL DEFAULT 0,
  settlement_order_cost_14d NUMERIC(18, 2),
  gmv_settlement_rate_14d NUMERIC(18, 6),
  order_settlement_rate_14d NUMERIC(18, 6),
  settlement_roi_30d NUMERIC(18, 6),
  settlement_amount_30d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  settlement_order_count_30d BIGINT NOT NULL DEFAULT 0,
  settlement_order_cost_30d NUMERIC(18, 2),
  gmv_settlement_rate_30d NUMERIC(18, 6),
  order_settlement_rate_30d NUMERIC(18, 6),
  settlement_roi_90d NUMERIC(18, 6),
  settlement_amount_90d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  settlement_order_count_90d BIGINT NOT NULL DEFAULT 0,
  settlement_order_cost_90d NUMERIC(18, 2),
  gmv_settlement_rate_90d NUMERIC(18, 6),
  order_settlement_rate_90d NUMERIC(18, 6),
  new_fans_count BIGINT NOT NULL DEFAULT 0,
  live_comment_count BIGINT,
  live_like_count BIGINT,
  video_like_count BIGINT,
  avg_watch_duration NUMERIC(18, 6),
  video_play_count BIGINT,
  video_complete_play_count BIGINT,
  video_complete_play_rate NUMERIC(18, 6),
  video_comment_count BIGINT,
  play_rate_2s NUMERIC(18, 6),
  play_rate_3s NUMERIC(18, 6),
  play_rate_5s NUMERIC(18, 6),
  play_rate_10s NUMERIC(18, 6),
  legacy_boost_cost NUMERIC(18, 2),
  legacy_boost_order_count BIGINT,
  legacy_boost_gmv NUMERIC(18, 2),
  legacy_boost_roi NUMERIC(18, 6),
  boost_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_order_count BIGINT NOT NULL DEFAULT 0,
  boost_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_pay_roi NUMERIC(18, 6),
  boost_impression_count BIGINT NOT NULL DEFAULT 0,
  boost_click_rate NUMERIC(18, 6),
  boost_click_count BIGINT NOT NULL DEFAULT 0,
  boost_conversion_rate NUMERIC(18, 6),
  boost_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_unfinished_presale_estimated_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_order_cost NUMERIC(18, 2),
  boost_buyer_count BIGINT NOT NULL DEFAULT 0,
  boost_net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_net_gmv_roi NUMERIC(18, 6),
  boost_net_order_count BIGINT NOT NULL DEFAULT 0,
  boost_net_conversion_rate NUMERIC(18, 6),
  boost_net_order_cost NUMERIC(18, 2),
  boost_net_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_smart_coupon_unrefund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_platform_subsidy_unrefund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_net_gmv_settlement_rate NUMERIC(18, 6),
  boost_net_order_settlement_rate NUMERIC(18, 6),
  boost_refund_order_count_1h BIGINT NOT NULL DEFAULT 0,
  boost_refund_amount_1h NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_refund_rate_1h NUMERIC(18, 6),
  boost_settlement_roi_7d NUMERIC(18, 6),
  boost_settlement_amount_7d NUMERIC(18, 2) NOT NULL DEFAULT 0,
  boost_settlement_order_count_7d BIGINT NOT NULL DEFAULT 0,
  boost_settlement_order_cost_7d NUMERIC(18, 2),
  boost_gmv_settlement_rate_7d NUMERIC(18, 6),
  boost_order_settlement_rate_7d NUMERIC(18, 6),
  CONSTRAINT pk_douyin_qianchuan_live_all_domain_material_daily
    PRIMARY KEY (stat_date, material_type, promotion_type, douyin_account_display_id, material_key),
  CONSTRAINT chk_douyin_qianchuan_live_all_domain_material_type
    CHECK (material_type IN ('live_room_screen', 'live_video')),
  CONSTRAINT chk_douyin_qianchuan_live_all_domain_material_key
    CHECK (NULLIF(BTRIM(material_key), '') IS NOT NULL),
  CONSTRAINT chk_douyin_qianchuan_live_all_domain_non_negative_core
    CHECK (
      source_row_count >= 0
      AND overall_impression_count >= 0
      AND overall_click_count >= 0
      AND overall_order_count >= 0
      AND overall_gmv >= 0
      AND overall_cost >= 0
      AND base_cost >= 0
      AND user_pay_amount >= 0
      AND net_gmv >= 0
      AND net_order_count >= 0
      AND boost_cost >= 0
      AND boost_gmv >= 0
    )
);

COMMENT ON TABLE ads.douyin_qianchuan_live_all_domain_material_daily IS
  '抖音千川直播全域投放素材日明细ADS表：以 material_type 区分直播间画面与视频素材，承载公共指标和类型独有指标，供看板汇总、趋势和分榜使用。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.stat_date IS '统计日期，来自千川直播素材ODS日期。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.material_type IS '素材类型：live_room_screen=直播间画面，live_video=视频素材。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.promotion_type IS '推广场景：自播间推广/达人直播。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.douyin_account_display_id IS '抖音号展示ID；ODS为空时归为 unknown，避免看板主键为空。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.douyin_account_name IS '抖音号名称，仅直播间画面ODS提供。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.live_room_name IS '直播间名称，仅视频素材ODS提供时填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.material_key IS '统一素材键：视频素材使用千川 material_id，直播间画面使用 screen:推广场景:抖音号 的合成键。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.material_id IS '千川素材ID；直播间画面无素材ID时为空。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.material_video_name IS '素材视频名称，仅视频素材ODS提供。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.material_created_at IS '素材创建时间，仅视频素材ODS提供。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.global_material_video_type IS '全域素材视频类型，仅视频素材ODS提供。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.source_row_count IS '刷新汇总的ODS来源行数。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.source_file_names IS '参与汇总的源文件名列表，用于数据追溯。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.source_ids IS '参与汇总的ODS源表主键ID列表。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.latest_ingest_time IS '参与汇总的ODS最新入库时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.refresh_time IS 'ADS刷新时间。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_impression_count IS '整体展示/展现次数，公共指标，按素材类型分别汇总。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_click_count IS '整体点击次数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_click_rate IS '整体点击率，按整体点击次数/整体展示次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_conversion_rate IS '整体转化率，按整体成交订单数/整体点击次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_order_count IS '整体成交订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_gmv IS '整体成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_gmv_ratio IS '整体成交金额占比，按同日同素材类型成交金额占比重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_cost IS '整体消耗，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_cost_ratio IS '整体消耗占比，按同日同素材类型消耗占比重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.base_cost IS '基础消耗，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_pay_roi IS '整体支付ROI，按整体成交金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_order_cost IS '整体成交订单成本，按整体消耗/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.user_pay_amount IS '用户实际支付金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_cpm IS '整体千次展现费用，按整体消耗*1000/整体展示次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_cpc IS '整体点击单价，按整体消耗/整体点击次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.smart_coupon_amount IS '智能优惠券金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.platform_subsidy_amount IS '电商平台补贴金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_presale_order_count IS '整体预售订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_presale_order_amount IS '整体预售订单金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.overall_unfinished_presale_estimated_amount IS '整体未完结预售订单预估金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_gmv_roi IS '净成交ROI，按净成交金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_gmv IS '净成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_order_count IS '净成交订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_order_cost IS '净成交订单成本，按整体消耗/净成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_user_pay_amount IS '用户实际支付净成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.smart_coupon_unrefund_amount IS '智能优惠券未退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.platform_subsidy_unrefund_amount IS '电商平台补贴未退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_gmv_settlement_rate IS '净成交金额结算率，按净成交金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.net_order_settlement_rate IS '净成交订单结算率，按净成交订单数/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.refund_order_count_1h IS '1小时内退款订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.refund_amount_1h IS '1小时内退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.refund_rate_1h IS '1小时内退款率，按1小时内退款金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_roi_7d IS '7日结算ROI，按7日结算金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_amount_7d IS '7日结算金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_count_7d IS '7日结算订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_cost_7d IS '7日结算订单成本，按整体消耗/7日结算订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.gmv_settlement_rate_7d IS '7日GMV结算率，按7日结算金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.order_settlement_rate_7d IS '7日订单结算率，按7日结算订单数/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_roi_14d IS '14日结算ROI，按14日结算金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_amount_14d IS '14日结算金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_count_14d IS '14日结算订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_cost_14d IS '14日结算订单成本，按整体消耗/14日结算订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.gmv_settlement_rate_14d IS '14日GMV结算率，按14日结算金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.order_settlement_rate_14d IS '14日订单结算率，按14日结算订单数/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_roi_30d IS '30日结算ROI，按30日结算金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_amount_30d IS '30日结算金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_count_30d IS '30日结算订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_cost_30d IS '30日结算订单成本，按整体消耗/30日结算订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.gmv_settlement_rate_30d IS '30日GMV结算率，按30日结算金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.order_settlement_rate_30d IS '30日订单结算率，按30日结算订单数/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_roi_90d IS '90日结算ROI，按90日结算金额/整体消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_amount_90d IS '90日结算金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_count_90d IS '90日结算订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.settlement_order_cost_90d IS '90日结算订单成本，按整体消耗/90日结算订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.gmv_settlement_rate_90d IS '90日GMV结算率，按90日结算金额/整体成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.order_settlement_rate_90d IS '90日订单结算率，按90日结算订单数/整体成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.new_fans_count IS '新增粉丝数，直播间画面与视频素材公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.live_comment_count IS '直播间评论次数，仅直播间画面素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.live_like_count IS '直播间点赞次数，仅直播间画面素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.video_like_count IS '视频点赞数，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.avg_watch_duration IS '平均观看时长，仅视频素材类型填充；多行汇总时按播放数加权。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.video_play_count IS '视频播放数，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.video_complete_play_count IS '视频完播数，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.video_complete_play_rate IS '视频完播率，按视频完播数/视频播放数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.video_comment_count IS '视频评论数，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.play_rate_2s IS '2秒播放率，仅视频素材类型填充；多行汇总时按播放数加权。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.play_rate_3s IS '3秒播放率，仅视频素材类型填充；多行汇总时按播放数加权。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.play_rate_5s IS '5秒播放率，仅视频素材类型填充；多行汇总时按播放数加权。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.play_rate_10s IS '10秒播放率，仅视频素材类型填充；多行汇总时按播放数加权。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.legacy_boost_cost IS '旧版追投消耗，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.legacy_boost_order_count IS '旧版追投成交订单数，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.legacy_boost_gmv IS '旧版追投成交金额，仅视频素材类型填充。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.legacy_boost_roi IS '旧版追投ROI，仅视频素材类型填充；按旧版追投成交金额/旧版追投消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_cost IS '追投调控消耗，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_order_count IS '追投调控成交订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_gmv IS '追投调控成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_pay_roi IS '追投调控支付ROI，按追投成交金额/追投消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_impression_count IS '追投调控展示次数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_click_rate IS '追投调控点击率，按追投点击次数/追投展示次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_click_count IS '追投调控点击次数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_conversion_rate IS '追投调控转化率，按追投订单数/追投点击次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_user_pay_amount IS '追投调控用户实际支付金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_smart_coupon_amount IS '追投调控成交智能优惠券金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_platform_subsidy_amount IS '追投调控电商平台补贴金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_unfinished_presale_estimated_amount IS '追投调控未完结预售订单预估金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_order_cost IS '追投调控成交成本，按追投消耗/追投成交订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_buyer_count IS '追投调控成交人数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_gmv IS '追投调控净成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_gmv_roi IS '追投调控净成交ROI，按追投净成交金额/追投消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_order_count IS '追投调控净成交订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_conversion_rate IS '追投调控净成交转化率，按追投净订单数/追投点击次数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_order_cost IS '追投调控净成交订单成本，按追投消耗/追投净订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_user_pay_amount IS '追投调控用户实际支付净成交金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_smart_coupon_unrefund_amount IS '追投调控智能优惠券未退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_platform_subsidy_unrefund_amount IS '追投调控电商平台补贴未退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_gmv_settlement_rate IS '追投调控净成交金额结算率，按追投净成交金额/追投成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_net_order_settlement_rate IS '追投调控净成交订单结算率，按追投净订单数/追投订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_refund_order_count_1h IS '追投调控1小时内退款订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_refund_amount_1h IS '追投调控1小时内退款金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_refund_rate_1h IS '追投调控1小时内退款率，按追投1小时退款金额/追投成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_settlement_roi_7d IS '追投调控7日结算ROI，按追投7日结算金额/追投消耗重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_settlement_amount_7d IS '追投调控7日结算金额，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_settlement_order_count_7d IS '追投调控7日结算订单数，公共指标。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_settlement_order_cost_7d IS '追投调控7日结算订单成本，按追投消耗/追投7日结算订单数重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_gmv_settlement_rate_7d IS '追投调控7日GMV结算率，按追投7日结算金额/追投成交金额重算。';
COMMENT ON COLUMN ads.douyin_qianchuan_live_all_domain_material_daily.boost_order_settlement_rate_7d IS '追投调控7日订单结算率，按追投7日结算订单数/追投订单数重算。';

CREATE INDEX IF NOT EXISTS idx_qianchuan_live_all_domain_daily_date
  ON ads.douyin_qianchuan_live_all_domain_material_daily(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_live_all_domain_daily_type_date
  ON ads.douyin_qianchuan_live_all_domain_material_daily(material_type, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_live_all_domain_daily_account_date
  ON ads.douyin_qianchuan_live_all_domain_material_daily(douyin_account_display_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_qianchuan_live_all_domain_daily_material_id
  ON ads.douyin_qianchuan_live_all_domain_material_daily(material_id)
  WHERE material_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ads.refresh_douyin_qianchuan_live_all_domain_material_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(material_type TEXT, refreshed_rows BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date cannot be later than p_end_date: %, %', p_start_date, p_end_date;
  END IF;

  WITH source_dates AS (
    SELECT stat_date FROM ods.douyin_qianchuan_live_room_screen_raw
    UNION ALL
    SELECT stat_date FROM ods.douyin_qianchuan_live_video_raw
  )
  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM source_dates;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM ads.douyin_qianchuan_live_all_domain_material_daily target
  WHERE target.stat_date BETWEEN v_start_date AND v_end_date;

  RETURN QUERY
  WITH normalized AS (
    SELECT
      raw.id,
      'live_room_screen'::TEXT AS material_type,
      raw.promotion_type,
      COALESCE(NULLIF(BTRIM(raw.douyin_account_display_id), ''), 'unknown')::VARCHAR(128) AS douyin_account_display_id,
      NULLIF(BTRIM(raw.douyin_account_name), '') AS douyin_account_name,
      NULL::TEXT AS live_room_name,
      CONCAT_WS(':', 'screen', raw.promotion_type, COALESCE(NULLIF(BTRIM(raw.douyin_account_display_id), ''), 'unknown')) AS material_key,
      NULL::VARCHAR(64) AS material_id,
      NULL::TEXT AS material_video_name,
      NULL::TIMESTAMP WITHOUT TIME ZONE AS material_created_at,
      NULL::TEXT AS global_material_video_type,
      raw.stat_date,
      raw.source_file_name,
      raw.ingest_time,
      raw.overall_impression_count,
      raw.overall_click_count,
      raw.overall_order_count,
      raw.overall_gmv,
      raw.overall_cost,
      raw.base_cost,
      raw.user_pay_amount,
      raw.smart_coupon_amount,
      raw.platform_subsidy_amount,
      raw.overall_presale_order_count,
      raw.overall_presale_order_amount,
      raw.overall_unfinished_presale_estimated_amount,
      raw.net_gmv,
      raw.net_order_count,
      raw.net_user_pay_amount,
      raw.smart_coupon_unrefund_amount,
      raw.platform_subsidy_unrefund_amount,
      raw.refund_order_count_1h,
      raw.refund_amount_1h,
      raw.settlement_amount_7d,
      raw.settlement_order_count_7d,
      raw.settlement_amount_14d,
      raw.settlement_order_count_14d,
      raw.settlement_amount_30d,
      raw.settlement_order_count_30d,
      raw.settlement_amount_90d,
      raw.settlement_order_count_90d,
      raw.new_fans_count,
      raw.live_comment_count,
      raw.live_like_count,
      NULL::BIGINT AS video_like_count,
      NULL::NUMERIC AS avg_watch_duration,
      NULL::BIGINT AS video_play_count,
      NULL::BIGINT AS video_complete_play_count,
      NULL::BIGINT AS video_comment_count,
      NULL::NUMERIC AS play_rate_2s,
      NULL::NUMERIC AS play_rate_3s,
      NULL::NUMERIC AS play_rate_5s,
      NULL::NUMERIC AS play_rate_10s,
      NULL::NUMERIC AS legacy_boost_cost,
      NULL::INTEGER AS legacy_boost_order_count,
      NULL::NUMERIC AS legacy_boost_gmv,
      raw.boost_cost,
      raw.boost_order_count,
      raw.boost_gmv,
      raw.boost_impression_count,
      raw.boost_click_count,
      raw.boost_user_pay_amount,
      raw.boost_smart_coupon_amount,
      raw.boost_platform_subsidy_amount,
      raw.boost_unfinished_presale_estimated_amount,
      raw.boost_buyer_count,
      raw.boost_net_gmv,
      raw.boost_net_order_count,
      raw.boost_net_user_pay_amount,
      raw.boost_smart_coupon_unrefund_amount,
      raw.boost_platform_subsidy_unrefund_amount,
      raw.boost_refund_order_count_1h,
      raw.boost_refund_amount_1h,
      raw.boost_settlement_amount_7d,
      raw.boost_settlement_order_count_7d
    FROM ods.douyin_qianchuan_live_room_screen_raw raw
    WHERE raw.stat_date BETWEEN v_start_date AND v_end_date
    UNION ALL
    SELECT
      raw.id,
      'live_video'::TEXT AS material_type,
      raw.promotion_type,
      COALESCE(NULLIF(BTRIM(raw.douyin_account_display_id), ''), 'unknown')::VARCHAR(128) AS douyin_account_display_id,
      NULL::TEXT AS douyin_account_name,
      NULLIF(BTRIM(raw.live_room_name), '') AS live_room_name,
      NULLIF(BTRIM(raw.material_id), '')::TEXT AS material_key,
      NULLIF(BTRIM(raw.material_id), '')::VARCHAR(64) AS material_id,
      raw.material_video_name,
      raw.material_created_at,
      raw.global_material_video_type,
      raw.stat_date,
      raw.source_file_name,
      raw.ingest_time,
      raw.overall_impression_count,
      raw.overall_click_count,
      raw.overall_order_count,
      raw.overall_gmv,
      raw.overall_cost,
      raw.base_cost,
      raw.user_pay_amount,
      raw.smart_coupon_amount,
      raw.platform_subsidy_amount,
      raw.overall_presale_order_count,
      raw.overall_presale_order_amount,
      raw.overall_unfinished_presale_estimated_amount,
      raw.net_gmv,
      raw.net_order_count,
      raw.net_user_pay_amount,
      raw.smart_coupon_unrefund_amount,
      raw.platform_subsidy_unrefund_amount,
      raw.refund_order_count_1h,
      raw.refund_amount_1h,
      raw.settlement_amount_7d,
      raw.settlement_order_count_7d,
      raw.settlement_amount_14d,
      raw.settlement_order_count_14d,
      raw.settlement_amount_30d,
      raw.settlement_order_count_30d,
      raw.settlement_amount_90d,
      raw.settlement_order_count_90d,
      raw.new_fans_count,
      NULL::BIGINT AS live_comment_count,
      NULL::BIGINT AS live_like_count,
      raw.video_like_count,
      raw.avg_watch_duration,
      raw.video_play_count,
      raw.video_complete_play_count,
      raw.video_comment_count,
      raw.play_rate_2s,
      raw.play_rate_3s,
      raw.play_rate_5s,
      raw.play_rate_10s,
      raw.legacy_boost_cost,
      raw.legacy_boost_order_count,
      raw.legacy_boost_gmv,
      raw.boost_cost,
      raw.boost_order_count,
      raw.boost_gmv,
      raw.boost_impression_count,
      raw.boost_click_count,
      raw.boost_user_pay_amount,
      raw.boost_smart_coupon_amount,
      raw.boost_platform_subsidy_amount,
      raw.boost_unfinished_presale_estimated_amount,
      raw.boost_buyer_count,
      raw.boost_net_gmv,
      raw.boost_net_order_count,
      raw.boost_net_user_pay_amount,
      raw.boost_smart_coupon_unrefund_amount,
      raw.boost_platform_subsidy_unrefund_amount,
      raw.boost_refund_order_count_1h,
      raw.boost_refund_amount_1h,
      raw.boost_settlement_amount_7d,
      raw.boost_settlement_order_count_7d
    FROM ods.douyin_qianchuan_live_video_raw raw
    WHERE raw.stat_date BETWEEN v_start_date AND v_end_date
      AND NULLIF(BTRIM(raw.material_id), '') IS NOT NULL
  ),
  aggregated AS (
    SELECT
      n.stat_date,
      n.material_type,
      n.promotion_type,
      n.douyin_account_display_id,
      MAX(n.douyin_account_name) AS douyin_account_name,
      MAX(n.live_room_name) AS live_room_name,
      n.material_key,
      MAX(n.material_id) AS material_id,
      MAX(n.material_video_name) AS material_video_name,
      MIN(n.material_created_at) AS material_created_at,
      MAX(n.global_material_video_type) AS global_material_video_type,
      COUNT(*)::INTEGER AS source_row_count,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT n.source_file_name), NULL)::TEXT[] AS source_file_names,
      ARRAY_AGG(n.id ORDER BY n.id)::BIGINT[] AS source_ids,
      MAX(n.ingest_time) AS latest_ingest_time,
      SUM(COALESCE(n.overall_impression_count, 0))::BIGINT AS overall_impression_count,
      SUM(COALESCE(n.overall_click_count, 0))::BIGINT AS overall_click_count,
      SUM(COALESCE(n.overall_order_count, 0))::BIGINT AS overall_order_count,
      SUM(COALESCE(n.overall_gmv, 0))::NUMERIC(18, 2) AS overall_gmv,
      SUM(COALESCE(n.overall_cost, 0))::NUMERIC(18, 2) AS overall_cost,
      SUM(COALESCE(n.base_cost, 0))::NUMERIC(18, 2) AS base_cost,
      SUM(COALESCE(n.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
      SUM(COALESCE(n.smart_coupon_amount, 0))::NUMERIC(18, 2) AS smart_coupon_amount,
      SUM(COALESCE(n.platform_subsidy_amount, 0))::NUMERIC(18, 2) AS platform_subsidy_amount,
      SUM(COALESCE(n.overall_presale_order_count, 0))::BIGINT AS overall_presale_order_count,
      SUM(COALESCE(n.overall_presale_order_amount, 0))::NUMERIC(18, 2) AS overall_presale_order_amount,
      SUM(COALESCE(n.overall_unfinished_presale_estimated_amount, 0))::NUMERIC(18, 2) AS overall_unfinished_presale_estimated_amount,
      SUM(COALESCE(n.net_gmv, 0))::NUMERIC(18, 2) AS net_gmv,
      SUM(COALESCE(n.net_order_count, 0))::BIGINT AS net_order_count,
      SUM(COALESCE(n.net_user_pay_amount, 0))::NUMERIC(18, 2) AS net_user_pay_amount,
      SUM(COALESCE(n.smart_coupon_unrefund_amount, 0))::NUMERIC(18, 2) AS smart_coupon_unrefund_amount,
      SUM(COALESCE(n.platform_subsidy_unrefund_amount, 0))::NUMERIC(18, 2) AS platform_subsidy_unrefund_amount,
      SUM(COALESCE(n.refund_order_count_1h, 0))::BIGINT AS refund_order_count_1h,
      SUM(COALESCE(n.refund_amount_1h, 0))::NUMERIC(18, 2) AS refund_amount_1h,
      SUM(COALESCE(n.settlement_amount_7d, 0))::NUMERIC(18, 2) AS settlement_amount_7d,
      SUM(COALESCE(n.settlement_order_count_7d, 0))::BIGINT AS settlement_order_count_7d,
      SUM(COALESCE(n.settlement_amount_14d, 0))::NUMERIC(18, 2) AS settlement_amount_14d,
      SUM(COALESCE(n.settlement_order_count_14d, 0))::BIGINT AS settlement_order_count_14d,
      SUM(COALESCE(n.settlement_amount_30d, 0))::NUMERIC(18, 2) AS settlement_amount_30d,
      SUM(COALESCE(n.settlement_order_count_30d, 0))::BIGINT AS settlement_order_count_30d,
      SUM(COALESCE(n.settlement_amount_90d, 0))::NUMERIC(18, 2) AS settlement_amount_90d,
      SUM(COALESCE(n.settlement_order_count_90d, 0))::BIGINT AS settlement_order_count_90d,
      SUM(COALESCE(n.new_fans_count, 0))::BIGINT AS new_fans_count,
      SUM(n.live_comment_count)::BIGINT AS live_comment_count,
      SUM(n.live_like_count)::BIGINT AS live_like_count,
      SUM(n.video_like_count)::BIGINT AS video_like_count,
      CASE
        WHEN SUM(CASE WHEN n.avg_watch_duration IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END) > 0
          THEN ROUND(
            SUM(COALESCE(n.avg_watch_duration, 0) * COALESCE(n.video_play_count, 0))
            / SUM(CASE WHEN n.avg_watch_duration IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END),
            6
          )
      END::NUMERIC(18, 6) AS avg_watch_duration,
      SUM(n.video_play_count)::BIGINT AS video_play_count,
      SUM(n.video_complete_play_count)::BIGINT AS video_complete_play_count,
      SUM(n.video_comment_count)::BIGINT AS video_comment_count,
      CASE
        WHEN SUM(CASE WHEN n.play_rate_2s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END) > 0
          THEN ROUND(
            SUM(COALESCE(n.play_rate_2s, 0) * COALESCE(n.video_play_count, 0))
            / SUM(CASE WHEN n.play_rate_2s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END),
            6
          )
      END::NUMERIC(18, 6) AS play_rate_2s,
      CASE
        WHEN SUM(CASE WHEN n.play_rate_3s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END) > 0
          THEN ROUND(
            SUM(COALESCE(n.play_rate_3s, 0) * COALESCE(n.video_play_count, 0))
            / SUM(CASE WHEN n.play_rate_3s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END),
            6
          )
      END::NUMERIC(18, 6) AS play_rate_3s,
      CASE
        WHEN SUM(CASE WHEN n.play_rate_5s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END) > 0
          THEN ROUND(
            SUM(COALESCE(n.play_rate_5s, 0) * COALESCE(n.video_play_count, 0))
            / SUM(CASE WHEN n.play_rate_5s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END),
            6
          )
      END::NUMERIC(18, 6) AS play_rate_5s,
      CASE
        WHEN SUM(CASE WHEN n.play_rate_10s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END) > 0
          THEN ROUND(
            SUM(COALESCE(n.play_rate_10s, 0) * COALESCE(n.video_play_count, 0))
            / SUM(CASE WHEN n.play_rate_10s IS NOT NULL THEN COALESCE(n.video_play_count, 0) ELSE 0 END),
            6
          )
      END::NUMERIC(18, 6) AS play_rate_10s,
      SUM(n.legacy_boost_cost)::NUMERIC(18, 2) AS legacy_boost_cost,
      SUM(n.legacy_boost_order_count)::BIGINT AS legacy_boost_order_count,
      SUM(n.legacy_boost_gmv)::NUMERIC(18, 2) AS legacy_boost_gmv,
      SUM(COALESCE(n.boost_cost, 0))::NUMERIC(18, 2) AS boost_cost,
      SUM(COALESCE(n.boost_order_count, 0))::BIGINT AS boost_order_count,
      SUM(COALESCE(n.boost_gmv, 0))::NUMERIC(18, 2) AS boost_gmv,
      SUM(COALESCE(n.boost_impression_count, 0))::BIGINT AS boost_impression_count,
      SUM(COALESCE(n.boost_click_count, 0))::BIGINT AS boost_click_count,
      SUM(COALESCE(n.boost_user_pay_amount, 0))::NUMERIC(18, 2) AS boost_user_pay_amount,
      SUM(COALESCE(n.boost_smart_coupon_amount, 0))::NUMERIC(18, 2) AS boost_smart_coupon_amount,
      SUM(COALESCE(n.boost_platform_subsidy_amount, 0))::NUMERIC(18, 2) AS boost_platform_subsidy_amount,
      SUM(COALESCE(n.boost_unfinished_presale_estimated_amount, 0))::NUMERIC(18, 2) AS boost_unfinished_presale_estimated_amount,
      SUM(COALESCE(n.boost_buyer_count, 0))::BIGINT AS boost_buyer_count,
      SUM(COALESCE(n.boost_net_gmv, 0))::NUMERIC(18, 2) AS boost_net_gmv,
      SUM(COALESCE(n.boost_net_order_count, 0))::BIGINT AS boost_net_order_count,
      SUM(COALESCE(n.boost_net_user_pay_amount, 0))::NUMERIC(18, 2) AS boost_net_user_pay_amount,
      SUM(COALESCE(n.boost_smart_coupon_unrefund_amount, 0))::NUMERIC(18, 2) AS boost_smart_coupon_unrefund_amount,
      SUM(COALESCE(n.boost_platform_subsidy_unrefund_amount, 0))::NUMERIC(18, 2) AS boost_platform_subsidy_unrefund_amount,
      SUM(COALESCE(n.boost_refund_order_count_1h, 0))::BIGINT AS boost_refund_order_count_1h,
      SUM(COALESCE(n.boost_refund_amount_1h, 0))::NUMERIC(18, 2) AS boost_refund_amount_1h,
      SUM(COALESCE(n.boost_settlement_amount_7d, 0))::NUMERIC(18, 2) AS boost_settlement_amount_7d,
      SUM(COALESCE(n.boost_settlement_order_count_7d, 0))::BIGINT AS boost_settlement_order_count_7d
    FROM normalized n
    GROUP BY
      n.stat_date,
      n.material_type,
      n.promotion_type,
      n.douyin_account_display_id,
      n.material_key
  ),
  calculated AS (
    SELECT
      a.*,
      CASE WHEN a.overall_impression_count > 0 THEN ROUND(a.overall_click_count::NUMERIC / a.overall_impression_count::NUMERIC, 6) END::NUMERIC(18, 6) AS overall_click_rate,
      CASE WHEN a.overall_click_count > 0 THEN ROUND(a.overall_order_count::NUMERIC / a.overall_click_count::NUMERIC, 6) END::NUMERIC(18, 6) AS overall_conversion_rate,
      CASE WHEN SUM(a.overall_gmv) OVER (PARTITION BY a.stat_date, a.material_type) > 0 THEN ROUND(a.overall_gmv / SUM(a.overall_gmv) OVER (PARTITION BY a.stat_date, a.material_type), 6) END::NUMERIC(18, 6) AS overall_gmv_ratio,
      CASE WHEN SUM(a.overall_cost) OVER (PARTITION BY a.stat_date, a.material_type) > 0 THEN ROUND(a.overall_cost / SUM(a.overall_cost) OVER (PARTITION BY a.stat_date, a.material_type), 6) END::NUMERIC(18, 6) AS overall_cost_ratio,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.overall_gmv / a.overall_cost, 6) END::NUMERIC(18, 6) AS overall_pay_roi,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.overall_cost / a.overall_order_count::NUMERIC, 2) END::NUMERIC(18, 2) AS overall_order_cost,
      CASE WHEN a.overall_impression_count > 0 THEN ROUND(a.overall_cost * 1000 / a.overall_impression_count::NUMERIC, 2) END::NUMERIC(18, 2) AS overall_cpm,
      CASE WHEN a.overall_click_count > 0 THEN ROUND(a.overall_cost / a.overall_click_count::NUMERIC, 2) END::NUMERIC(18, 2) AS overall_cpc,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.net_gmv / a.overall_cost, 6) END::NUMERIC(18, 6) AS net_gmv_roi,
      CASE WHEN a.net_order_count > 0 THEN ROUND(a.overall_cost / a.net_order_count::NUMERIC, 2) END::NUMERIC(18, 2) AS net_order_cost,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.net_gmv / a.overall_gmv, 6) END::NUMERIC(18, 6) AS net_gmv_settlement_rate,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.net_order_count::NUMERIC / a.overall_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS net_order_settlement_rate,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.refund_amount_1h / a.overall_gmv, 6) END::NUMERIC(18, 6) AS refund_rate_1h,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.settlement_amount_7d / a.overall_cost, 6) END::NUMERIC(18, 6) AS settlement_roi_7d,
      CASE WHEN a.settlement_order_count_7d > 0 THEN ROUND(a.overall_cost / a.settlement_order_count_7d::NUMERIC, 2) END::NUMERIC(18, 2) AS settlement_order_cost_7d,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.settlement_amount_7d / a.overall_gmv, 6) END::NUMERIC(18, 6) AS gmv_settlement_rate_7d,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.settlement_order_count_7d::NUMERIC / a.overall_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS order_settlement_rate_7d,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.settlement_amount_14d / a.overall_cost, 6) END::NUMERIC(18, 6) AS settlement_roi_14d,
      CASE WHEN a.settlement_order_count_14d > 0 THEN ROUND(a.overall_cost / a.settlement_order_count_14d::NUMERIC, 2) END::NUMERIC(18, 2) AS settlement_order_cost_14d,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.settlement_amount_14d / a.overall_gmv, 6) END::NUMERIC(18, 6) AS gmv_settlement_rate_14d,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.settlement_order_count_14d::NUMERIC / a.overall_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS order_settlement_rate_14d,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.settlement_amount_30d / a.overall_cost, 6) END::NUMERIC(18, 6) AS settlement_roi_30d,
      CASE WHEN a.settlement_order_count_30d > 0 THEN ROUND(a.overall_cost / a.settlement_order_count_30d::NUMERIC, 2) END::NUMERIC(18, 2) AS settlement_order_cost_30d,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.settlement_amount_30d / a.overall_gmv, 6) END::NUMERIC(18, 6) AS gmv_settlement_rate_30d,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.settlement_order_count_30d::NUMERIC / a.overall_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS order_settlement_rate_30d,
      CASE WHEN a.overall_cost > 0 THEN ROUND(a.settlement_amount_90d / a.overall_cost, 6) END::NUMERIC(18, 6) AS settlement_roi_90d,
      CASE WHEN a.settlement_order_count_90d > 0 THEN ROUND(a.overall_cost / a.settlement_order_count_90d::NUMERIC, 2) END::NUMERIC(18, 2) AS settlement_order_cost_90d,
      CASE WHEN a.overall_gmv > 0 THEN ROUND(a.settlement_amount_90d / a.overall_gmv, 6) END::NUMERIC(18, 6) AS gmv_settlement_rate_90d,
      CASE WHEN a.overall_order_count > 0 THEN ROUND(a.settlement_order_count_90d::NUMERIC / a.overall_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS order_settlement_rate_90d,
      CASE WHEN a.video_play_count > 0 THEN ROUND(a.video_complete_play_count::NUMERIC / a.video_play_count::NUMERIC, 6) END::NUMERIC(18, 6) AS video_complete_play_rate,
      CASE WHEN a.legacy_boost_cost > 0 THEN ROUND(a.legacy_boost_gmv / a.legacy_boost_cost, 6) END::NUMERIC(18, 6) AS legacy_boost_roi,
      CASE WHEN a.boost_cost > 0 THEN ROUND(a.boost_gmv / a.boost_cost, 6) END::NUMERIC(18, 6) AS boost_pay_roi,
      CASE WHEN a.boost_impression_count > 0 THEN ROUND(a.boost_click_count::NUMERIC / a.boost_impression_count::NUMERIC, 6) END::NUMERIC(18, 6) AS boost_click_rate,
      CASE WHEN a.boost_click_count > 0 THEN ROUND(a.boost_order_count::NUMERIC / a.boost_click_count::NUMERIC, 6) END::NUMERIC(18, 6) AS boost_conversion_rate,
      CASE WHEN a.boost_order_count > 0 THEN ROUND(a.boost_cost / a.boost_order_count::NUMERIC, 2) END::NUMERIC(18, 2) AS boost_order_cost,
      CASE WHEN a.boost_cost > 0 THEN ROUND(a.boost_net_gmv / a.boost_cost, 6) END::NUMERIC(18, 6) AS boost_net_gmv_roi,
      CASE WHEN a.boost_click_count > 0 THEN ROUND(a.boost_net_order_count::NUMERIC / a.boost_click_count::NUMERIC, 6) END::NUMERIC(18, 6) AS boost_net_conversion_rate,
      CASE WHEN a.boost_net_order_count > 0 THEN ROUND(a.boost_cost / a.boost_net_order_count::NUMERIC, 2) END::NUMERIC(18, 2) AS boost_net_order_cost,
      CASE WHEN a.boost_gmv > 0 THEN ROUND(a.boost_net_gmv / a.boost_gmv, 6) END::NUMERIC(18, 6) AS boost_net_gmv_settlement_rate,
      CASE WHEN a.boost_order_count > 0 THEN ROUND(a.boost_net_order_count::NUMERIC / a.boost_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS boost_net_order_settlement_rate,
      CASE WHEN a.boost_gmv > 0 THEN ROUND(a.boost_refund_amount_1h / a.boost_gmv, 6) END::NUMERIC(18, 6) AS boost_refund_rate_1h,
      CASE WHEN a.boost_cost > 0 THEN ROUND(a.boost_settlement_amount_7d / a.boost_cost, 6) END::NUMERIC(18, 6) AS boost_settlement_roi_7d,
      CASE WHEN a.boost_settlement_order_count_7d > 0 THEN ROUND(a.boost_cost / a.boost_settlement_order_count_7d::NUMERIC, 2) END::NUMERIC(18, 2) AS boost_settlement_order_cost_7d,
      CASE WHEN a.boost_gmv > 0 THEN ROUND(a.boost_settlement_amount_7d / a.boost_gmv, 6) END::NUMERIC(18, 6) AS boost_gmv_settlement_rate_7d,
      CASE WHEN a.boost_order_count > 0 THEN ROUND(a.boost_settlement_order_count_7d::NUMERIC / a.boost_order_count::NUMERIC, 6) END::NUMERIC(18, 6) AS boost_order_settlement_rate_7d
    FROM aggregated a
  ),
  inserted AS (
    INSERT INTO ads.douyin_qianchuan_live_all_domain_material_daily (
      stat_date, material_type, promotion_type, douyin_account_display_id, douyin_account_name,
      live_room_name, material_key, material_id, material_video_name, material_created_at,
      global_material_video_type, source_row_count, source_file_names, source_ids, latest_ingest_time,
      overall_impression_count, overall_click_count, overall_click_rate, overall_conversion_rate,
      overall_order_count, overall_gmv, overall_gmv_ratio, overall_cost, overall_cost_ratio,
      base_cost, overall_pay_roi, overall_order_cost, user_pay_amount, overall_cpm, overall_cpc,
      smart_coupon_amount, platform_subsidy_amount, overall_presale_order_count,
      overall_presale_order_amount, overall_unfinished_presale_estimated_amount,
      net_gmv_roi, net_gmv, net_order_count, net_order_cost, net_user_pay_amount,
      smart_coupon_unrefund_amount, platform_subsidy_unrefund_amount, net_gmv_settlement_rate,
      net_order_settlement_rate, refund_order_count_1h, refund_amount_1h, refund_rate_1h,
      settlement_roi_7d, settlement_amount_7d, settlement_order_count_7d, settlement_order_cost_7d,
      gmv_settlement_rate_7d, order_settlement_rate_7d, settlement_roi_14d, settlement_amount_14d,
      settlement_order_count_14d, settlement_order_cost_14d, gmv_settlement_rate_14d,
      order_settlement_rate_14d, settlement_roi_30d, settlement_amount_30d,
      settlement_order_count_30d, settlement_order_cost_30d, gmv_settlement_rate_30d,
      order_settlement_rate_30d, settlement_roi_90d, settlement_amount_90d,
      settlement_order_count_90d, settlement_order_cost_90d, gmv_settlement_rate_90d,
      order_settlement_rate_90d, new_fans_count, live_comment_count, live_like_count,
      video_like_count, avg_watch_duration, video_play_count, video_complete_play_count,
      video_complete_play_rate, video_comment_count, play_rate_2s, play_rate_3s,
      play_rate_5s, play_rate_10s, legacy_boost_cost, legacy_boost_order_count,
      legacy_boost_gmv, legacy_boost_roi, boost_cost, boost_order_count, boost_gmv,
      boost_pay_roi, boost_impression_count, boost_click_rate, boost_click_count,
      boost_conversion_rate, boost_user_pay_amount, boost_smart_coupon_amount,
      boost_platform_subsidy_amount, boost_unfinished_presale_estimated_amount,
      boost_order_cost, boost_buyer_count, boost_net_gmv, boost_net_gmv_roi,
      boost_net_order_count, boost_net_conversion_rate, boost_net_order_cost,
      boost_net_user_pay_amount, boost_smart_coupon_unrefund_amount,
      boost_platform_subsidy_unrefund_amount, boost_net_gmv_settlement_rate,
      boost_net_order_settlement_rate, boost_refund_order_count_1h, boost_refund_amount_1h,
      boost_refund_rate_1h, boost_settlement_roi_7d, boost_settlement_amount_7d,
      boost_settlement_order_count_7d, boost_settlement_order_cost_7d,
      boost_gmv_settlement_rate_7d, boost_order_settlement_rate_7d
    )
    SELECT
      c.stat_date, c.material_type, c.promotion_type, c.douyin_account_display_id, c.douyin_account_name,
      c.live_room_name, c.material_key, c.material_id, c.material_video_name, c.material_created_at,
      c.global_material_video_type, c.source_row_count, c.source_file_names, c.source_ids, c.latest_ingest_time,
      c.overall_impression_count, c.overall_click_count, c.overall_click_rate, c.overall_conversion_rate,
      c.overall_order_count, c.overall_gmv, c.overall_gmv_ratio, c.overall_cost, c.overall_cost_ratio,
      c.base_cost, c.overall_pay_roi, c.overall_order_cost, c.user_pay_amount, c.overall_cpm, c.overall_cpc,
      c.smart_coupon_amount, c.platform_subsidy_amount, c.overall_presale_order_count,
      c.overall_presale_order_amount, c.overall_unfinished_presale_estimated_amount,
      c.net_gmv_roi, c.net_gmv, c.net_order_count, c.net_order_cost, c.net_user_pay_amount,
      c.smart_coupon_unrefund_amount, c.platform_subsidy_unrefund_amount, c.net_gmv_settlement_rate,
      c.net_order_settlement_rate, c.refund_order_count_1h, c.refund_amount_1h, c.refund_rate_1h,
      c.settlement_roi_7d, c.settlement_amount_7d, c.settlement_order_count_7d, c.settlement_order_cost_7d,
      c.gmv_settlement_rate_7d, c.order_settlement_rate_7d, c.settlement_roi_14d, c.settlement_amount_14d,
      c.settlement_order_count_14d, c.settlement_order_cost_14d, c.gmv_settlement_rate_14d,
      c.order_settlement_rate_14d, c.settlement_roi_30d, c.settlement_amount_30d,
      c.settlement_order_count_30d, c.settlement_order_cost_30d, c.gmv_settlement_rate_30d,
      c.order_settlement_rate_30d, c.settlement_roi_90d, c.settlement_amount_90d,
      c.settlement_order_count_90d, c.settlement_order_cost_90d, c.gmv_settlement_rate_90d,
      c.order_settlement_rate_90d, c.new_fans_count, c.live_comment_count, c.live_like_count,
      c.video_like_count, c.avg_watch_duration, c.video_play_count, c.video_complete_play_count,
      c.video_complete_play_rate, c.video_comment_count, c.play_rate_2s, c.play_rate_3s,
      c.play_rate_5s, c.play_rate_10s, c.legacy_boost_cost, c.legacy_boost_order_count,
      c.legacy_boost_gmv, c.legacy_boost_roi, c.boost_cost, c.boost_order_count, c.boost_gmv,
      c.boost_pay_roi, c.boost_impression_count, c.boost_click_rate, c.boost_click_count,
      c.boost_conversion_rate, c.boost_user_pay_amount, c.boost_smart_coupon_amount,
      c.boost_platform_subsidy_amount, c.boost_unfinished_presale_estimated_amount,
      c.boost_order_cost, c.boost_buyer_count, c.boost_net_gmv, c.boost_net_gmv_roi,
      c.boost_net_order_count, c.boost_net_conversion_rate, c.boost_net_order_cost,
      c.boost_net_user_pay_amount, c.boost_smart_coupon_unrefund_amount,
      c.boost_platform_subsidy_unrefund_amount, c.boost_net_gmv_settlement_rate,
      c.boost_net_order_settlement_rate, c.boost_refund_order_count_1h, c.boost_refund_amount_1h,
      c.boost_refund_rate_1h, c.boost_settlement_roi_7d, c.boost_settlement_amount_7d,
      c.boost_settlement_order_count_7d, c.boost_settlement_order_cost_7d,
      c.boost_gmv_settlement_rate_7d, c.boost_order_settlement_rate_7d
    FROM calculated c
    RETURNING ads.douyin_qianchuan_live_all_domain_material_daily.material_type
  )
  SELECT inserted.material_type, COUNT(*)::BIGINT AS refreshed_rows
  FROM inserted
  GROUP BY inserted.material_type
  ORDER BY inserted.material_type;
END;
$$;

COMMENT ON FUNCTION ads.refresh_douyin_qianchuan_live_all_domain_material_daily(DATE, DATE) IS
  '按日期窗口刷新抖音千川直播全域素材日明细ADS表；参数为空时按ODS最小/最大日期执行全量刷新。';

CREATE OR REPLACE FUNCTION ads.refresh_qianchuan_live_all_domain_material_daily_incremental(
  p_rebuild_days INTEGER DEFAULT 35
)
RETURNS TABLE(material_type TEXT, refreshed_rows BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_end_date DATE;
  v_start_date DATE;
BEGIN
  IF p_rebuild_days IS NULL OR p_rebuild_days < 1 THEN
    RAISE EXCEPTION 'p_rebuild_days must be >= 1, got %', p_rebuild_days;
  END IF;

  WITH source_dates AS (
    SELECT stat_date FROM ods.douyin_qianchuan_live_room_screen_raw
    UNION ALL
    SELECT stat_date FROM ods.douyin_qianchuan_live_video_raw
  )
  SELECT MAX(stat_date)
  INTO v_end_date
  FROM source_dates;

  IF v_end_date IS NULL THEN
    RETURN;
  END IF;

  v_start_date := v_end_date - (p_rebuild_days - 1);

  RETURN QUERY
  SELECT *
  FROM ads.refresh_douyin_qianchuan_live_all_domain_material_daily(v_start_date, v_end_date);
END;
$$;

COMMENT ON FUNCTION ads.refresh_qianchuan_live_all_domain_material_daily_incremental(INTEGER) IS
  '按ODS最新日期向前回刷指定天数的抖音千川直播全域素材日明细ADS表，默认回刷35天。';
