BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DROP TRIGGER IF EXISTS trg_touch_douyin_live_dashboard_daily_updated_at ON ads.douyin_live_dashboard_daily;
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_live_dashboard_daily_updated_at();
DROP PROCEDURE IF EXISTS ads.refresh_douyin_live_dashboard_daily_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_live_dashboard_daily(DATE, DATE);
DROP TABLE IF EXISTS etl.douyin_live_dashboard_daily_refresh_state;
DROP TABLE IF EXISTS ads.douyin_live_dashboard_daily;

DROP TRIGGER IF EXISTS trg_touch_douyin_live_detail_updated_at ON ads.douyin_live_detail;
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_live_detail_updated_at();
DROP PROCEDURE IF EXISTS ads.refresh_douyin_live_detail_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_live_detail(DATE, DATE);
DROP TABLE IF EXISTS etl.douyin_live_detail_refresh_state;
DROP TABLE IF EXISTS ads.douyin_live_detail;

CREATE TABLE ads.douyin_live_detail (
  stat_date DATE NOT NULL,
  live_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  live_end_time TIMESTAMP WITHOUT TIME ZONE,
  anchor_douyin_id TEXT NOT NULL DEFAULT '',
  anchor_nickname TEXT NOT NULL DEFAULT '(未命名主播)',
  anchor_avatar TEXT,
  shop_id TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '(未命名店铺)',
  live_identity_type VARCHAR(20) NOT NULL,
  anchor_type VARCHAR(10) NOT NULL DEFAULT '未归类',
  is_self_live BOOLEAN NOT NULL DEFAULT FALSE,
  is_influencer_live BOOLEAN NOT NULL DEFAULT FALSE,
  live_session_count INTEGER NOT NULL DEFAULT 1,
  live_duration_minutes BIGINT NOT NULL DEFAULT 0,
  live_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  live_exposure_count BIGINT NOT NULL DEFAULT 0,
  live_watch_user_count BIGINT NOT NULL DEFAULT 0,
  hourly_watch_user_count BIGINT NOT NULL DEFAULT 0,
  live_watch_count BIGINT NOT NULL DEFAULT 0,
  max_online_count BIGINT NOT NULL DEFAULT 0,
  avg_online_count NUMERIC(18, 4) NOT NULL DEFAULT 0,
  avg_watch_duration_minutes NUMERIC(18, 4) NOT NULL DEFAULT 0,
  comment_count BIGINT NOT NULL DEFAULT 0,
  new_live_group_count BIGINT NOT NULL DEFAULT 0,
  new_follower_count BIGINT NOT NULL DEFAULT 0,
  unfollow_count BIGINT NOT NULL DEFAULT 0,
  old_follower_watch_rate NUMERIC(18, 6) NOT NULL DEFAULT 0,
  product_count BIGINT NOT NULL DEFAULT 0,
  live_product_exposure_user BIGINT NOT NULL DEFAULT 0,
  live_product_click_user BIGINT NOT NULL DEFAULT 0,
  live_product_exposure_count BIGINT NOT NULL DEFAULT 0,
  live_product_click_count BIGINT NOT NULL DEFAULT 0,
  live_order_count BIGINT NOT NULL DEFAULT 0,
  live_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  hourly_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_sale_quantity BIGINT NOT NULL DEFAULT 0,
  live_buyer_count BIGINT NOT NULL DEFAULT 0,
  live_refund_order_count BIGINT NOT NULL DEFAULT 0,
  live_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_refund_user_count BIGINT NOT NULL DEFAULT 0,
  estimated_commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
  product_click_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  product_click_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  click_to_pay_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  click_to_pay_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  watch_to_pay_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  watch_to_pay_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  presale_order_count BIGINT NOT NULL DEFAULT 0,
  presale_full_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  new_cart_group_count BIGINT NOT NULL DEFAULT 0,
  live_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_order_count BIGINT NOT NULL DEFAULT 0,
  refund_amount_1h NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_order_count_1h BIGINT NOT NULL DEFAULT 0,
  refund_rate_1h NUMERIC(18, 6) NOT NULL DEFAULT 0,
  coupon_guided_payment_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  coupon_guided_payment_rate NUMERIC(18, 6) NOT NULL DEFAULT 0,
  coupon_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  coupon_usage_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ad_cost_shop_bound NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ad_cost_shop_targeted NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_live_detail PRIMARY KEY (shop_id, anchor_douyin_id, live_start_time),
  CONSTRAINT chk_douyin_live_detail_identity_type
    CHECK (live_identity_type IN ('self', 'influencer', 'unclassified')),
  CONSTRAINT chk_douyin_live_detail_identity_consistency
    CHECK (
      (live_identity_type = 'self' AND is_self_live = TRUE AND is_influencer_live = FALSE)
      OR (live_identity_type = 'influencer' AND is_self_live = FALSE AND is_influencer_live = TRUE)
      OR (live_identity_type = 'unclassified' AND is_self_live = FALSE AND is_influencer_live = FALSE)
    ),
  CONSTRAINT chk_douyin_live_detail_anchor_type
    CHECK (anchor_type IN ('自播', '达播', '未归类')),
  CONSTRAINT chk_douyin_live_detail_non_negative
    CHECK (
      live_session_count >= 0
      AND live_duration_minutes >= 0
      AND live_exposure_user_count >= 0
      AND live_exposure_count >= 0
      AND live_watch_user_count >= 0
      AND hourly_watch_user_count >= 0
      AND live_watch_count >= 0
      AND max_online_count >= 0
      AND avg_online_count >= 0
      AND avg_watch_duration_minutes >= 0
      AND comment_count >= 0
      AND new_live_group_count >= 0
      AND new_follower_count >= 0
      AND unfollow_count >= 0
      AND old_follower_watch_rate >= 0
      AND product_count >= 0
      AND live_product_exposure_user >= 0
      AND live_product_click_user >= 0
      AND live_product_exposure_count >= 0
      AND live_product_click_count >= 0
      AND live_order_count >= 0
      AND live_gmv >= 0
      AND live_user_pay_amount >= 0
      AND hourly_user_pay_amount >= 0
      AND live_sale_quantity >= 0
      AND live_buyer_count >= 0
      AND live_refund_order_count >= 0
      AND live_refund_amount >= 0
      AND live_refund_user_count >= 0
      AND estimated_commission >= 0
      AND product_click_rate_count >= 0
      AND product_click_rate_user >= 0
      AND click_to_pay_rate_count >= 0
      AND click_to_pay_rate_user >= 0
      AND watch_to_pay_rate_count >= 0
      AND watch_to_pay_rate_user >= 0
      AND presale_order_count >= 0
      AND presale_full_amount >= 0
      AND new_cart_group_count >= 0
      AND live_ad_cost >= 0
      AND net_gmv >= 0
      AND net_order_count >= 0
      AND refund_amount_1h >= 0
      AND refund_order_count_1h >= 0
      AND refund_rate_1h >= 0
      AND coupon_guided_payment_amount >= 0
      AND coupon_guided_payment_rate >= 0
      AND coupon_subsidy_amount >= 0
      AND coupon_usage_count >= 0
      AND ad_cost_shop_bound >= 0
      AND ad_cost_shop_targeted >= 0
    )
);

COMMENT ON TABLE ads.douyin_live_detail IS '抖音直播明细事实表（场次级，保留直播开始/结束时间与全量 ODS 指标）。';
COMMENT ON COLUMN ads.douyin_live_detail.stat_date IS '统计日期（按直播开始时间 live_start_time 取 DATE）。';
COMMENT ON COLUMN ads.douyin_live_detail.live_start_time IS '直播开始时间（明细主时间字段）。';
COMMENT ON COLUMN ads.douyin_live_detail.live_end_time IS '直播结束时间。';
COMMENT ON COLUMN ads.douyin_live_detail.anchor_douyin_id IS '主播抖音号（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_live_detail.anchor_nickname IS '主播昵称。';
COMMENT ON COLUMN ads.douyin_live_detail.anchor_avatar IS '主播头像链接。';
COMMENT ON COLUMN ads.douyin_live_detail.shop_id IS '店铺ID（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_live_detail.shop_name IS '店铺名称。';
COMMENT ON COLUMN ads.douyin_live_detail.live_identity_type IS '主播身份编码：self=自播，influencer=达播，unclassified=未归类。';
COMMENT ON COLUMN ads.douyin_live_detail.anchor_type IS '主播类型：自播/达播/未归类。';
COMMENT ON COLUMN ads.douyin_live_detail.is_self_live IS '是否自播（true=自播）。';
COMMENT ON COLUMN ads.douyin_live_detail.is_influencer_live IS '是否达播（true=达播）。';
COMMENT ON COLUMN ads.douyin_live_detail.live_session_count IS '直播场次数（明细层默认 1）。';
COMMENT ON COLUMN ads.douyin_live_detail.live_duration_minutes IS '直播时长（分钟）。';
COMMENT ON COLUMN ads.douyin_live_detail.live_exposure_user_count IS '直播间曝光人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_exposure_count IS '直播间曝光次数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_watch_user_count IS '直播间观看人数。';
COMMENT ON COLUMN ads.douyin_live_detail.hourly_watch_user_count IS '单小时观看人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_watch_count IS '直播间观看次数。';
COMMENT ON COLUMN ads.douyin_live_detail.max_online_count IS '最高在线人数。';
COMMENT ON COLUMN ads.douyin_live_detail.avg_online_count IS '平均在线人数。';
COMMENT ON COLUMN ads.douyin_live_detail.avg_watch_duration_minutes IS '人均观看时长（分钟）。';
COMMENT ON COLUMN ads.douyin_live_detail.comment_count IS '评论次数。';
COMMENT ON COLUMN ads.douyin_live_detail.new_live_group_count IS '新加直播团人数。';
COMMENT ON COLUMN ads.douyin_live_detail.new_follower_count IS '新增粉丝数。';
COMMENT ON COLUMN ads.douyin_live_detail.unfollow_count IS '取关粉丝数。';
COMMENT ON COLUMN ads.douyin_live_detail.old_follower_watch_rate IS '观看老粉占比。';
COMMENT ON COLUMN ads.douyin_live_detail.product_count IS '带货商品数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_product_exposure_user IS '直播间商品曝光人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_product_click_user IS '直播间商品点击人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_product_exposure_count IS '直播间商品曝光次数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_product_click_count IS '直播间商品点击次数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_order_count IS '直播间成交订单数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_gmv IS '直播间成交金额。';
COMMENT ON COLUMN ads.douyin_live_detail.live_user_pay_amount IS '直播间用户支付金额。';
COMMENT ON COLUMN ads.douyin_live_detail.hourly_user_pay_amount IS '单小时用户支付金额。';
COMMENT ON COLUMN ads.douyin_live_detail.live_sale_quantity IS '直播间成交件数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_buyer_count IS '直播间成交人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_refund_order_count IS '直播间退款订单数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_refund_amount IS '直播间退款金额。';
COMMENT ON COLUMN ads.douyin_live_detail.live_refund_user_count IS '直播间退款人数。';
COMMENT ON COLUMN ads.douyin_live_detail.estimated_commission IS '预估佣金支出。';
COMMENT ON COLUMN ads.douyin_live_detail.product_click_rate_count IS '商品曝光-点击率（次数）。';
COMMENT ON COLUMN ads.douyin_live_detail.product_click_rate_user IS '商品曝光-点击率（人数）。';
COMMENT ON COLUMN ads.douyin_live_detail.click_to_pay_rate_count IS '商品点击-成交率（次数）。';
COMMENT ON COLUMN ads.douyin_live_detail.click_to_pay_rate_user IS '商品点击-成交率（人数）。';
COMMENT ON COLUMN ads.douyin_live_detail.watch_to_pay_rate_count IS '观看-成交率（次数）。';
COMMENT ON COLUMN ads.douyin_live_detail.watch_to_pay_rate_user IS '观看-成交率（人数）。';
COMMENT ON COLUMN ads.douyin_live_detail.presale_order_count IS '预售订单数。';
COMMENT ON COLUMN ads.douyin_live_detail.presale_full_amount IS '预售全款金额。';
COMMENT ON COLUMN ads.douyin_live_detail.new_cart_group_count IS '新加购物团人数。';
COMMENT ON COLUMN ads.douyin_live_detail.live_ad_cost IS '直播间投放消耗。';
COMMENT ON COLUMN ads.douyin_live_detail.net_gmv IS '净成交金额。';
COMMENT ON COLUMN ads.douyin_live_detail.net_order_count IS '净成交订单数。';
COMMENT ON COLUMN ads.douyin_live_detail.refund_amount_1h IS '1小时退款金额。';
COMMENT ON COLUMN ads.douyin_live_detail.refund_order_count_1h IS '1小时退款订单数。';
COMMENT ON COLUMN ads.douyin_live_detail.refund_rate_1h IS '1小时退款率。';
COMMENT ON COLUMN ads.douyin_live_detail.coupon_guided_payment_amount IS '消费券引导支付金额。';
COMMENT ON COLUMN ads.douyin_live_detail.coupon_guided_payment_rate IS '消费券引导支付占比。';
COMMENT ON COLUMN ads.douyin_live_detail.coupon_subsidy_amount IS '消费券补贴金额。';
COMMENT ON COLUMN ads.douyin_live_detail.coupon_usage_count IS '消费券使用量。';
COMMENT ON COLUMN ads.douyin_live_detail.ad_cost_shop_bound IS '直播投放消耗（店铺绑定）。';
COMMENT ON COLUMN ads.douyin_live_detail.ad_cost_shop_targeted IS '直播投放消耗（店铺被投）。';
COMMENT ON COLUMN ads.douyin_live_detail.source_updated_at IS '当前明细行对应的源表更新时间。';
COMMENT ON COLUMN ads.douyin_live_detail.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_live_detail.updated_at IS '记录更新时间。';

CREATE INDEX idx_douyin_live_detail_stat_date
  ON ads.douyin_live_detail (stat_date);
CREATE INDEX idx_douyin_live_detail_identity_stat_date
  ON ads.douyin_live_detail (live_identity_type, stat_date);
CREATE INDEX idx_douyin_live_detail_anchor_type_stat_date
  ON ads.douyin_live_detail (anchor_type, stat_date);
CREATE INDEX idx_douyin_live_detail_start_time_desc
  ON ads.douyin_live_detail (live_start_time DESC);
CREATE INDEX idx_douyin_live_detail_anchor_start_time
  ON ads.douyin_live_detail (anchor_douyin_id, live_start_time DESC);

COMMENT ON INDEX ads.idx_douyin_live_detail_stat_date IS '按日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_live_detail_identity_stat_date IS '按主播身份+日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_live_detail_anchor_type_stat_date IS '按主播类型+日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_live_detail_start_time_desc IS '按直播开始时间倒序索引。';
COMMENT ON INDEX ads.idx_douyin_live_detail_anchor_start_time IS '按主播+开始时间窗口查询索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_live_detail_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_live_detail_updated_at
BEFORE UPDATE ON ads.douyin_live_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_detail_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_detail(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_live_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_live_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_live_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_live_self_anchor_map does not exist';
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_live_detail does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(DATE(src.live_start_time))),
    COALESCE(p_end_date, MAX(DATE(src.live_start_time)))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_live_raw has no live_start_time rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_live_detail
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  CREATE TEMP TABLE tmp_douyin_live_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_live_self_anchor_map m
  WHERE m.is_active = TRUE
    AND NULLIF(BTRIM(m.anchor_douyin_id), '') IS NOT NULL;

  INSERT INTO ads.douyin_live_detail (
    stat_date,
    live_start_time,
    live_end_time,
    anchor_douyin_id,
    anchor_nickname,
    anchor_avatar,
    shop_id,
    shop_name,
    live_identity_type,
    anchor_type,
    is_self_live,
    is_influencer_live,
    live_session_count,
    live_duration_minutes,
    live_exposure_user_count,
    live_exposure_count,
    live_watch_user_count,
    hourly_watch_user_count,
    live_watch_count,
    max_online_count,
    avg_online_count,
    avg_watch_duration_minutes,
    comment_count,
    new_live_group_count,
    new_follower_count,
    unfollow_count,
    old_follower_watch_rate,
    product_count,
    live_product_exposure_user,
    live_product_click_user,
    live_product_exposure_count,
    live_product_click_count,
    live_order_count,
    live_gmv,
    live_user_pay_amount,
    hourly_user_pay_amount,
    live_sale_quantity,
    live_buyer_count,
    live_refund_order_count,
    live_refund_amount,
    live_refund_user_count,
    estimated_commission,
    product_click_rate_count,
    product_click_rate_user,
    click_to_pay_rate_count,
    click_to_pay_rate_user,
    watch_to_pay_rate_count,
    watch_to_pay_rate_user,
    presale_order_count,
    presale_full_amount,
    new_cart_group_count,
    live_ad_cost,
    net_gmv,
    net_order_count,
    refund_amount_1h,
    refund_order_count_1h,
    refund_rate_1h,
    coupon_guided_payment_amount,
    coupon_guided_payment_rate,
    coupon_subsidy_amount,
    coupon_usage_count,
    ad_cost_shop_bound,
    ad_cost_shop_targeted,
    source_updated_at
  )
  WITH source_ranked AS (
    SELECT
      DATE(src.live_start_time) AS stat_date,
      src.live_start_time AS live_start_time,
      src.live_end_time AS live_end_time,
      COALESCE(NULLIF(BTRIM(src.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      NULLIF(BTRIM(src.anchor_nickname), '') AS anchor_nickname,
      NULLIF(BTRIM(src.anchor_avatar), '') AS anchor_avatar,
      COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS shop_id,
      NULLIF(BTRIM(src.shop_name), '') AS shop_name,
      COALESCE(src.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
      COALESCE(src.live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
      COALESCE(src.live_exposure_count, 0)::BIGINT AS live_exposure_count,
      COALESCE(src.live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
      COALESCE(src.hourly_watch_user_count, 0)::BIGINT AS hourly_watch_user_count,
      COALESCE(src.live_watch_count, 0)::BIGINT AS live_watch_count,
      COALESCE(src.max_online_count, 0)::BIGINT AS max_online_count,
      COALESCE(src.avg_online_count, 0)::NUMERIC(18, 4) AS avg_online_count,
      COALESCE(src.avg_watch_duration_minutes, 0)::NUMERIC(18, 4) AS avg_watch_duration_minutes,
      COALESCE(src.comment_count, 0)::BIGINT AS comment_count,
      COALESCE(src.new_live_group_count, 0)::BIGINT AS new_live_group_count,
      COALESCE(src.new_follower_count, 0)::BIGINT AS new_follower_count,
      COALESCE(src.unfollow_count, 0)::BIGINT AS unfollow_count,
      COALESCE(src.old_follower_watch_rate, 0)::NUMERIC(18, 6) AS old_follower_watch_rate,
      COALESCE(src.product_count, 0)::BIGINT AS product_count,
      COALESCE(src.live_product_exposure_user, 0)::BIGINT AS live_product_exposure_user,
      COALESCE(src.live_product_click_user, 0)::BIGINT AS live_product_click_user,
      COALESCE(src.live_product_exposure_count, 0)::BIGINT AS live_product_exposure_count,
      COALESCE(src.live_product_click_count, 0)::BIGINT AS live_product_click_count,
      COALESCE(src.live_order_count, 0)::BIGINT AS live_order_count,
      COALESCE(src.live_gmv, 0)::NUMERIC(18, 2) AS live_gmv,
      COALESCE(src.live_user_pay_amount, 0)::NUMERIC(18, 2) AS live_user_pay_amount,
      COALESCE(src.hourly_user_pay_amount, 0)::NUMERIC(18, 2) AS hourly_user_pay_amount,
      COALESCE(src.live_sale_quantity, 0)::BIGINT AS live_sale_quantity,
      COALESCE(src.live_buyer_count, 0)::BIGINT AS live_buyer_count,
      COALESCE(src.live_refund_order_count, 0)::BIGINT AS live_refund_order_count,
      COALESCE(src.live_refund_amount, 0)::NUMERIC(18, 2) AS live_refund_amount,
      COALESCE(src.live_refund_user_count, 0)::BIGINT AS live_refund_user_count,
      COALESCE(src.estimated_commission, 0)::NUMERIC(18, 2) AS estimated_commission,
      COALESCE(src.product_click_rate_count, 0)::NUMERIC(18, 6) AS product_click_rate_count,
      COALESCE(src.product_click_rate_user, 0)::NUMERIC(18, 6) AS product_click_rate_user,
      COALESCE(src.click_to_pay_rate_count, 0)::NUMERIC(18, 6) AS click_to_pay_rate_count,
      COALESCE(src.click_to_pay_rate_user, 0)::NUMERIC(18, 6) AS click_to_pay_rate_user,
      COALESCE(src.watch_to_pay_rate_count, 0)::NUMERIC(18, 6) AS watch_to_pay_rate_count,
      COALESCE(src.watch_to_pay_rate_user, 0)::NUMERIC(18, 6) AS watch_to_pay_rate_user,
      COALESCE(src.presale_order_count, 0)::BIGINT AS presale_order_count,
      COALESCE(src.presale_full_amount, 0)::NUMERIC(18, 2) AS presale_full_amount,
      COALESCE(src.new_cart_group_count, 0)::BIGINT AS new_cart_group_count,
      COALESCE(src.live_ad_cost, 0)::NUMERIC(18, 2) AS live_ad_cost,
      COALESCE(src.net_gmv, 0)::NUMERIC(18, 2) AS net_gmv,
      COALESCE(src.net_order_count, 0)::BIGINT AS net_order_count,
      COALESCE(src.refund_amount_1h, 0)::NUMERIC(18, 2) AS refund_amount_1h,
      COALESCE(src.refund_order_count_1h, 0)::BIGINT AS refund_order_count_1h,
      COALESCE(src.refund_rate_1h, 0)::NUMERIC(18, 6) AS refund_rate_1h,
      COALESCE(src.coupon_guided_payment_amount, 0)::NUMERIC(18, 2) AS coupon_guided_payment_amount,
      COALESCE(src.coupon_guided_payment_rate, 0)::NUMERIC(18, 6) AS coupon_guided_payment_rate,
      COALESCE(src.coupon_subsidy_amount, 0)::NUMERIC(18, 2) AS coupon_subsidy_amount,
      COALESCE(src.coupon_usage_count, 0)::NUMERIC(18, 2) AS coupon_usage_count,
      COALESCE(src.ad_cost_shop_bound, 0)::NUMERIC(18, 2) AS ad_cost_shop_bound,
      COALESCE(src.ad_cost_shop_targeted, 0)::NUMERIC(18, 2) AS ad_cost_shop_targeted,
      COALESCE(src.updated_at, src.created_at, src.live_start_time) AS source_updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY
          COALESCE(NULLIF(BTRIM(src.shop_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.anchor_douyin_id), ''), ''),
          DATE(src.live_start_time),
          DATE_TRUNC('minute', src.live_start_time),
          COALESCE(src.live_end_time, TIMESTAMP '1970-01-01 00:00:00')
        ORDER BY
          COALESCE(src.updated_at, src.created_at, src.live_start_time) DESC,
          COALESCE(src.live_gmv, 0) DESC,
          src.created_at DESC NULLS LAST,
          src.live_start_time DESC,
          src.live_end_time DESC NULLS LAST
      ) AS rn
    FROM ods.douyin_trade_sale_live_raw src
    WHERE src.live_start_time IS NOT NULL
      AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  )
  SELECT
    sr.stat_date,
    sr.live_start_time,
    sr.live_end_time,
    sr.anchor_douyin_id,
    CASE
      WHEN sr.anchor_douyin_id = '' THEN '(缺失主播ID)'
      ELSE COALESCE(sr.anchor_nickname, '(未命名主播)')
    END AS anchor_nickname,
    COALESCE(sr.anchor_avatar, '') AS anchor_avatar,
    sr.shop_id,
    COALESCE(sr.shop_name, '(未命名店铺)') AS shop_name,
    CASE
      WHEN sr.anchor_douyin_id = '' THEN 'unclassified'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_live_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.anchor_douyin_id
      ) THEN 'self'
      ELSE 'influencer'
    END AS live_identity_type,
    CASE
      WHEN sr.anchor_douyin_id = '' THEN '未归类'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_live_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.anchor_douyin_id
      ) THEN '自播'
      ELSE '达播'
    END AS anchor_type,
    CASE
      WHEN sr.anchor_douyin_id <> ''
        AND EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sr.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_self_live,
    CASE
      WHEN sr.anchor_douyin_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sr.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_influencer_live,
    1 AS live_session_count,
    sr.live_duration_minutes,
    sr.live_exposure_user_count,
    sr.live_exposure_count,
    sr.live_watch_user_count,
    sr.hourly_watch_user_count,
    sr.live_watch_count,
    sr.max_online_count,
    sr.avg_online_count,
    sr.avg_watch_duration_minutes,
    sr.comment_count,
    sr.new_live_group_count,
    sr.new_follower_count,
    sr.unfollow_count,
    sr.old_follower_watch_rate,
    sr.product_count,
    sr.live_product_exposure_user,
    sr.live_product_click_user,
    sr.live_product_exposure_count,
    sr.live_product_click_count,
    sr.live_order_count,
    sr.live_gmv,
    sr.live_user_pay_amount,
    sr.hourly_user_pay_amount,
    sr.live_sale_quantity,
    sr.live_buyer_count,
    sr.live_refund_order_count,
    sr.live_refund_amount,
    sr.live_refund_user_count,
    sr.estimated_commission,
    sr.product_click_rate_count,
    sr.product_click_rate_user,
    sr.click_to_pay_rate_count,
    sr.click_to_pay_rate_user,
    sr.watch_to_pay_rate_count,
    sr.watch_to_pay_rate_user,
    sr.presale_order_count,
    sr.presale_full_amount,
    sr.new_cart_group_count,
    sr.live_ad_cost,
    sr.net_gmv,
    sr.net_order_count,
    sr.refund_amount_1h,
    sr.refund_order_count_1h,
    sr.refund_rate_1h,
    sr.coupon_guided_payment_amount,
    sr.coupon_guided_payment_rate,
    sr.coupon_subsidy_amount,
    sr.coupon_usage_count,
    sr.ad_cost_shop_bound,
    sr.ad_cost_shop_targeted,
    sr.source_updated_at
  FROM source_ranked sr
  WHERE sr.rn = 1;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_live_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_detail(DATE, DATE)
IS '按日期窗口刷新抖音直播明细事实表（场次级，同店铺+同主播+同日期+起播分钟+结束时间去重）。';

CREATE TABLE etl.douyin_live_detail_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_live_detail_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_live_detail_refresh_state IS '抖音直播明细事实表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.id IS '单行主键，固定值 1。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.last_source_updated_at IS '已处理的源表最大更新时间水位（来自 ODS updated_at/created_at/live_start_time）。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.last_refresh_at IS '最近一次增量刷新执行时间。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.douyin_live_detail_refresh_state.updated_at IS '记录更新时间。';

INSERT INTO etl.douyin_live_detail_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_detail_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.douyin_live_detail_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_live_detail_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.updated_at, src.created_at, src.live_start_time))
  INTO v_source_max_updated_at
  FROM ods.douyin_trade_sale_live_raw src;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_live_detail_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(DATE(src.live_start_time)),
    MAX(DATE(src.live_start_time))
  INTO v_min_date, v_max_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL
    AND COALESCE(src.updated_at, src.created_at, src.live_start_time)
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(DATE(src.live_start_time))
  INTO v_fallback_end_date
  FROM ods.douyin_trade_sale_live_raw src
  WHERE src.live_start_time IS NOT NULL;

  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_douyin_live_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_live_detail_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_detail_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间增量刷新抖音直播明细事实表，并固定回刷最近窗口，支持仅初始化水位。';

COMMIT;
