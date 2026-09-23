BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;

ALTER TABLE ads.douyin_live_dashboard_daily
  ADD COLUMN IF NOT EXISTS anchor_type VARCHAR(10) NOT NULL DEFAULT '未归类',
  ADD COLUMN IF NOT EXISTS anchor_avatar TEXT,
  ADD COLUMN IF NOT EXISTS live_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_exposure_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_watch_user_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_watch_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_online_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_online_count NUMERIC(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_watch_duration_minutes NUMERIC(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_live_group_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_follower_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unfollow_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS old_follower_watch_rate NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_product_exposure_user BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_product_click_user BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_product_exposure_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_product_click_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_sale_quantity BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_refund_user_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_click_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_click_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_to_pay_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_to_pay_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_to_pay_rate_count NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_to_pay_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presale_order_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS presale_full_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_cart_group_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_ad_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_order_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount_1h NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_order_count_1h BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_rate_1h NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_guided_payment_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_guided_payment_rate NUMERIC(18, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_usage_count NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_cost_shop_bound NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_cost_shop_targeted NUMERIC(18, 2) NOT NULL DEFAULT 0;

UPDATE ads.douyin_live_dashboard_daily
SET anchor_type = CASE live_identity_type
  WHEN 'self' THEN '自播'
  WHEN 'influencer' THEN '达播'
  ELSE '未归类'
END
WHERE anchor_type IS NULL
   OR BTRIM(anchor_type) = '';

ALTER TABLE ads.douyin_live_dashboard_daily
  ALTER COLUMN anchor_type SET DEFAULT '未归类',
  ALTER COLUMN anchor_type SET NOT NULL;

ALTER TABLE ads.douyin_live_dashboard_daily
  DROP CONSTRAINT IF EXISTS chk_douyin_live_dashboard_daily_anchor_type;

ALTER TABLE ads.douyin_live_dashboard_daily
  ADD CONSTRAINT chk_douyin_live_dashboard_daily_anchor_type
    CHECK (anchor_type IN ('自播', '达播', '未归类'));

ALTER TABLE ads.douyin_live_dashboard_daily
  DROP CONSTRAINT IF EXISTS chk_douyin_live_dashboard_daily_non_negative;

ALTER TABLE ads.douyin_live_dashboard_daily
  ADD CONSTRAINT chk_douyin_live_dashboard_daily_non_negative
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
    );

CREATE INDEX IF NOT EXISTS idx_douyin_live_dashboard_daily_anchor_type_date
  ON ads.douyin_live_dashboard_daily (anchor_type, stat_date);

COMMENT ON TABLE ads.douyin_live_dashboard_daily IS '抖音直播看板日事实表（按统计日期+主播聚合，保留 ODS 直播成交全量指标，并标注主播类型）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.stat_date IS '统计日期（按直播开始时间 live_start_time 取日期）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.anchor_douyin_id IS '主播抖音号（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.anchor_nickname IS '主播昵称。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.anchor_avatar IS '主播头像链接。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.shop_id IS '店铺ID。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.shop_name IS '店铺名称。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_identity_type IS '主播身份编码：self=自播，influencer=达播，unclassified=未归类。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.anchor_type IS '主播类型：自播/达播/未归类。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.is_self_live IS '是否自播（true=自播）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.is_influencer_live IS '是否达播（true=达播）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_session_count IS '直播场次数（按统计窗口内直播记录数汇总）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_duration_minutes IS '直播时长（分钟）汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_exposure_user_count IS '直播间曝光人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_exposure_count IS '直播间曝光次数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_watch_user_count IS '直播间观看人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.hourly_watch_user_count IS '单小时观看人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_watch_count IS '直播间观看次数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.max_online_count IS '最高在线人数（按窗口内最大值）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.avg_online_count IS '平均在线人数（按窗口内均值聚合）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.avg_watch_duration_minutes IS '人均观看时长（分钟，按窗口内均值聚合）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.comment_count IS '评论次数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.new_live_group_count IS '新加直播团人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.new_follower_count IS '新增粉丝数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.unfollow_count IS '取关粉丝数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.old_follower_watch_rate IS '观看老粉占比（按窗口内均值聚合）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.product_count IS '带货商品数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_product_exposure_user IS '直播间商品曝光人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_product_click_user IS '直播间商品点击人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_product_exposure_count IS '直播间商品曝光次数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_product_click_count IS '直播间商品点击次数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_order_count IS '直播间成交订单数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_gmv IS '直播间成交金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_user_pay_amount IS '直播间用户支付金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.hourly_user_pay_amount IS '单小时用户支付金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_sale_quantity IS '直播间成交件数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_buyer_count IS '直播间成交人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_refund_order_count IS '直播间退款订单数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_refund_amount IS '直播间退款金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_refund_user_count IS '直播间退款人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.estimated_commission IS '预估佣金支出汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.product_click_rate_count IS '商品曝光-点击率（次数，按汇总点击次数/汇总曝光次数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.product_click_rate_user IS '商品曝光-点击率（人数，按汇总点击人数/汇总曝光人数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.click_to_pay_rate_count IS '商品点击-成交率（次数，按汇总订单数/汇总点击次数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.click_to_pay_rate_user IS '商品点击-成交率（人数，按汇总成交人数/汇总点击人数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.watch_to_pay_rate_count IS '观看-成交率（次数，按汇总订单数/汇总观看次数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.watch_to_pay_rate_user IS '观看-成交率（人数，按汇总成交人数/汇总观看人数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.presale_order_count IS '预售订单数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.presale_full_amount IS '预售全款金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.new_cart_group_count IS '新加购物团人数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.live_ad_cost IS '直播间投放消耗汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.net_gmv IS '净成交金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.net_order_count IS '净成交订单数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.refund_amount_1h IS '1小时退款金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.refund_order_count_1h IS '1小时退款订单数汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.refund_rate_1h IS '1小时退款率（按汇总1小时退款订单数/汇总订单数重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.coupon_guided_payment_amount IS '消费券引导支付金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.coupon_guided_payment_rate IS '消费券引导支付占比（按汇总消费券引导支付金额/汇总支付金额重算）。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.coupon_subsidy_amount IS '消费券补贴金额汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.coupon_usage_count IS '消费券使用量汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.ad_cost_shop_bound IS '直播投放消耗（店铺绑定）汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.ad_cost_shop_targeted IS '直播投放消耗（店铺被投）汇总。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.source_max_updated_at IS '当前聚合行覆盖的最大 ODS 更新时间。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_live_dashboard_daily.updated_at IS '记录更新时间。';

COMMENT ON INDEX ads.idx_douyin_live_dashboard_daily_anchor_type_date IS '按主播类型+日期查询索引。';

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_dashboard_daily(
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

  IF to_regclass('ads.douyin_live_dashboard_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_live_dashboard_daily does not exist';
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

  DELETE FROM ads.douyin_live_dashboard_daily
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  CREATE TEMP TABLE tmp_douyin_live_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_live_self_anchor_map m
  WHERE m.is_active = TRUE
    AND NULLIF(BTRIM(m.anchor_douyin_id), '') IS NOT NULL;

  INSERT INTO ads.douyin_live_dashboard_daily (
    stat_date,
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
    source_max_updated_at
  )
  WITH source_base AS (
    SELECT
      DATE(src.live_start_time) AS stat_date,
      COALESCE(NULLIF(BTRIM(src.anchor_douyin_id), ''), '') AS anchor_douyin_id,
      NULLIF(BTRIM(src.anchor_nickname), '') AS anchor_nickname,
      NULLIF(BTRIM(src.anchor_avatar), '') AS anchor_avatar,
      NULLIF(BTRIM(src.shop_id), '') AS shop_id,
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
      COALESCE(src.updated_at, src.created_at, src.live_start_time) AS source_updated_at
    FROM ods.douyin_trade_sale_live_raw src
    WHERE src.live_start_time IS NOT NULL
      AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  )
  SELECT
    sb.stat_date,
    sb.anchor_douyin_id,
    CASE
      WHEN sb.anchor_douyin_id = '' THEN '(缺失主播ID)'
      ELSE COALESCE(MAX(sb.anchor_nickname), '(未命名主播)')
    END AS anchor_nickname,
    COALESCE(MAX(sb.anchor_avatar), '') AS anchor_avatar,
    COALESCE(MAX(sb.shop_id), '') AS shop_id,
    COALESCE(MAX(sb.shop_name), '(未命名店铺)') AS shop_name,
    CASE
      WHEN sb.anchor_douyin_id = '' THEN 'unclassified'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_live_self_anchor_map m
        WHERE m.anchor_douyin_id = sb.anchor_douyin_id
      ) THEN 'self'
      ELSE 'influencer'
    END AS live_identity_type,
    CASE
      WHEN sb.anchor_douyin_id = '' THEN '未归类'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_live_self_anchor_map m
        WHERE m.anchor_douyin_id = sb.anchor_douyin_id
      ) THEN '自播'
      ELSE '达播'
    END AS anchor_type,
    CASE
      WHEN sb.anchor_douyin_id <> ''
        AND EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sb.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_self_live,
    CASE
      WHEN sb.anchor_douyin_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tmp_douyin_live_self_anchor_map m
          WHERE m.anchor_douyin_id = sb.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_influencer_live,
    COUNT(*)::INTEGER AS live_session_count,
    SUM(sb.live_duration_minutes)::BIGINT AS live_duration_minutes,
    SUM(sb.live_exposure_user_count)::BIGINT AS live_exposure_user_count,
    SUM(sb.live_exposure_count)::BIGINT AS live_exposure_count,
    SUM(sb.live_watch_user_count)::BIGINT AS live_watch_user_count,
    SUM(sb.hourly_watch_user_count)::BIGINT AS hourly_watch_user_count,
    SUM(sb.live_watch_count)::BIGINT AS live_watch_count,
    MAX(sb.max_online_count)::BIGINT AS max_online_count,
    AVG(sb.avg_online_count)::NUMERIC(18, 4) AS avg_online_count,
    AVG(sb.avg_watch_duration_minutes)::NUMERIC(18, 4) AS avg_watch_duration_minutes,
    SUM(sb.comment_count)::BIGINT AS comment_count,
    SUM(sb.new_live_group_count)::BIGINT AS new_live_group_count,
    SUM(sb.new_follower_count)::BIGINT AS new_follower_count,
    SUM(sb.unfollow_count)::BIGINT AS unfollow_count,
    AVG(sb.old_follower_watch_rate)::NUMERIC(18, 6) AS old_follower_watch_rate,
    SUM(sb.product_count)::BIGINT AS product_count,
    SUM(sb.live_product_exposure_user)::BIGINT AS live_product_exposure_user,
    SUM(sb.live_product_click_user)::BIGINT AS live_product_click_user,
    SUM(sb.live_product_exposure_count)::BIGINT AS live_product_exposure_count,
    SUM(sb.live_product_click_count)::BIGINT AS live_product_click_count,
    SUM(sb.live_order_count)::BIGINT AS live_order_count,
    SUM(sb.live_gmv)::NUMERIC(18, 2) AS live_gmv,
    SUM(sb.live_user_pay_amount)::NUMERIC(18, 2) AS live_user_pay_amount,
    SUM(sb.hourly_user_pay_amount)::NUMERIC(18, 2) AS hourly_user_pay_amount,
    SUM(sb.live_sale_quantity)::BIGINT AS live_sale_quantity,
    SUM(sb.live_buyer_count)::BIGINT AS live_buyer_count,
    SUM(sb.live_refund_order_count)::BIGINT AS live_refund_order_count,
    SUM(sb.live_refund_amount)::NUMERIC(18, 2) AS live_refund_amount,
    SUM(sb.live_refund_user_count)::BIGINT AS live_refund_user_count,
    SUM(sb.estimated_commission)::NUMERIC(18, 2) AS estimated_commission,
    CASE
      WHEN SUM(sb.live_product_exposure_count) > 0
        THEN ROUND(SUM(sb.live_product_click_count)::NUMERIC / NULLIF(SUM(sb.live_product_exposure_count), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_click_rate_count,
    CASE
      WHEN SUM(sb.live_product_exposure_user) > 0
        THEN ROUND(SUM(sb.live_product_click_user)::NUMERIC / NULLIF(SUM(sb.live_product_exposure_user), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_click_rate_user,
    CASE
      WHEN SUM(sb.live_product_click_count) > 0
        THEN ROUND(SUM(sb.live_order_count)::NUMERIC / NULLIF(SUM(sb.live_product_click_count), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS click_to_pay_rate_count,
    CASE
      WHEN SUM(sb.live_product_click_user) > 0
        THEN ROUND(SUM(sb.live_buyer_count)::NUMERIC / NULLIF(SUM(sb.live_product_click_user), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS click_to_pay_rate_user,
    CASE
      WHEN SUM(sb.live_watch_count) > 0
        THEN ROUND(SUM(sb.live_order_count)::NUMERIC / NULLIF(SUM(sb.live_watch_count), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS watch_to_pay_rate_count,
    CASE
      WHEN SUM(sb.live_watch_user_count) > 0
        THEN ROUND(SUM(sb.live_buyer_count)::NUMERIC / NULLIF(SUM(sb.live_watch_user_count), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS watch_to_pay_rate_user,
    SUM(sb.presale_order_count)::BIGINT AS presale_order_count,
    SUM(sb.presale_full_amount)::NUMERIC(18, 2) AS presale_full_amount,
    SUM(sb.new_cart_group_count)::BIGINT AS new_cart_group_count,
    SUM(sb.live_ad_cost)::NUMERIC(18, 2) AS live_ad_cost,
    SUM(sb.net_gmv)::NUMERIC(18, 2) AS net_gmv,
    SUM(sb.net_order_count)::BIGINT AS net_order_count,
    SUM(sb.refund_amount_1h)::NUMERIC(18, 2) AS refund_amount_1h,
    SUM(sb.refund_order_count_1h)::BIGINT AS refund_order_count_1h,
    CASE
      WHEN SUM(sb.live_order_count) > 0
        THEN ROUND(SUM(sb.refund_order_count_1h)::NUMERIC / NULLIF(SUM(sb.live_order_count), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS refund_rate_1h,
    SUM(sb.coupon_guided_payment_amount)::NUMERIC(18, 2) AS coupon_guided_payment_amount,
    CASE
      WHEN SUM(sb.live_user_pay_amount) > 0
        THEN ROUND(SUM(sb.coupon_guided_payment_amount) / NULLIF(SUM(sb.live_user_pay_amount), 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS coupon_guided_payment_rate,
    SUM(sb.coupon_subsidy_amount)::NUMERIC(18, 2) AS coupon_subsidy_amount,
    SUM(sb.coupon_usage_count)::NUMERIC(18, 2) AS coupon_usage_count,
    SUM(sb.ad_cost_shop_bound)::NUMERIC(18, 2) AS ad_cost_shop_bound,
    SUM(sb.ad_cost_shop_targeted)::NUMERIC(18, 2) AS ad_cost_shop_targeted,
    MAX(sb.source_updated_at) AS source_max_updated_at
  FROM source_base sb
  GROUP BY sb.stat_date, sb.anchor_douyin_id;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_live_dashboard_daily completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_dashboard_daily(DATE, DATE)
IS '按日期窗口刷新抖音直播看板日事实表，沉淀 ODS 全量指标并打上主播类型标签（自播/达播/未归类）。';

COMMIT;
