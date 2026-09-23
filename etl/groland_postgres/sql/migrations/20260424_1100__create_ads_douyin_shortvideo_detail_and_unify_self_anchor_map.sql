BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DO $$
BEGIN
  IF to_regclass('ads.douyin_self_anchor_map') IS NULL
     AND to_regclass('ads.douyin_live_self_anchor_map') IS NOT NULL THEN
    ALTER TABLE ads.douyin_live_self_anchor_map RENAME TO douyin_self_anchor_map;
  END IF;

  IF to_regclass('ads.douyin_self_anchor_map') IS NOT NULL
     AND to_regclass('ads.douyin_live_self_anchor_map') IS NOT NULL THEN
    INSERT INTO ads.douyin_self_anchor_map (
      anchor_douyin_id,
      anchor_nickname,
      is_active,
      note,
      created_at,
      updated_at
    )
    SELECT
      m.anchor_douyin_id,
      m.anchor_nickname,
      m.is_active,
      m.note,
      m.created_at,
      m.updated_at
    FROM ads.douyin_live_self_anchor_map m
    ON CONFLICT (anchor_douyin_id) DO UPDATE
    SET
      anchor_nickname = EXCLUDED.anchor_nickname,
      is_active = EXCLUDED.is_active,
      note = EXCLUDED.note,
      updated_at = NOW();

    DROP TABLE ads.douyin_live_self_anchor_map;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ads.douyin_self_anchor_map (
  anchor_douyin_id TEXT PRIMARY KEY,
  anchor_nickname TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ads.douyin_self_anchor_map IS '抖音自营主播映射表（用于直播/短视频自营与合作口径划分）。';
COMMENT ON COLUMN ads.douyin_self_anchor_map.anchor_douyin_id IS '主播抖音ID（唯一键）。';
COMMENT ON COLUMN ads.douyin_self_anchor_map.anchor_nickname IS '主播名称（用于看板展示与核对）。';
COMMENT ON COLUMN ads.douyin_self_anchor_map.is_active IS '是否启用（false 时不参与自营匹配）。';
COMMENT ON COLUMN ads.douyin_self_anchor_map.note IS '备注信息（维护人、来源说明等）。';

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

  IF to_regclass('ads.douyin_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_self_anchor_map does not exist';
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

  CREATE TEMP TABLE tmp_douyin_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_self_anchor_map m
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
        FROM tmp_douyin_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.anchor_douyin_id
      ) THEN 'self'
      ELSE 'influencer'
    END AS live_identity_type,
    CASE
      WHEN sr.anchor_douyin_id = '' THEN '未归类'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.anchor_douyin_id
      ) THEN '自播'
      ELSE '达播'
    END AS anchor_type,
    CASE
      WHEN sr.anchor_douyin_id <> ''
        AND EXISTS (
          SELECT 1
          FROM tmp_douyin_self_anchor_map m
          WHERE m.anchor_douyin_id = sr.anchor_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_self_live,
    CASE
      WHEN sr.anchor_douyin_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tmp_douyin_self_anchor_map m
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

DROP TRIGGER IF EXISTS trg_touch_douyin_shortvideo_detail_updated_at ON ads.douyin_shortvideo_detail;
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_shortvideo_detail_updated_at();
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail(DATE, DATE);
DROP TABLE IF EXISTS etl.douyin_shortvideo_detail_refresh_state;
DROP TABLE IF EXISTS ads.douyin_shortvideo_detail;

CREATE TABLE ads.douyin_shortvideo_detail (
  stat_date DATE NOT NULL,
  publish_time TIMESTAMP WITHOUT TIME ZONE,
  video_id TEXT NOT NULL DEFAULT '',
  author_douyin_id TEXT NOT NULL DEFAULT '',
  author_nickname TEXT NOT NULL DEFAULT '(未命名作者)',
  shop_id TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '(未命名店铺)',
  shortvideo_identity_type VARCHAR(20) NOT NULL,
  author_type VARCHAR(10) NOT NULL DEFAULT '未归类',
  is_self_operated BOOLEAN NOT NULL DEFAULT FALSE,
  is_cooperation BOOLEAN NOT NULL DEFAULT FALSE,
  shortvideo_count INTEGER NOT NULL DEFAULT 1,
  video_view_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_order_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_refund_order_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_buyer_count BIGINT NOT NULL DEFAULT 0,
  shortvideo_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shortvideo_play_to_pay_rate NUMERIC(18, 6),
  shortvideo_refund_rate NUMERIC(18, 6),
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_shortvideo_detail
    PRIMARY KEY (stat_date, video_id, author_douyin_id, shop_id),
  CONSTRAINT chk_douyin_shortvideo_detail_identity_type
    CHECK (shortvideo_identity_type IN ('self', 'cooperation', 'unclassified')),
  CONSTRAINT chk_douyin_shortvideo_detail_identity_consistency
    CHECK (
      (shortvideo_identity_type = 'self' AND is_self_operated = TRUE AND is_cooperation = FALSE)
      OR (shortvideo_identity_type = 'cooperation' AND is_self_operated = FALSE AND is_cooperation = TRUE)
      OR (shortvideo_identity_type = 'unclassified' AND is_self_operated = FALSE AND is_cooperation = FALSE)
    ),
  CONSTRAINT chk_douyin_shortvideo_detail_author_type
    CHECK (author_type IN ('自营', '合作', '未归类')),
  CONSTRAINT chk_douyin_shortvideo_detail_non_negative
    CHECK (
      shortvideo_count >= 0
      AND video_view_count >= 0
      AND shortvideo_order_count >= 0
      AND shortvideo_refund_order_count >= 0
      AND shortvideo_buyer_count >= 0
      AND shortvideo_gmv >= 0
      AND shortvideo_user_pay_amount >= 0
      AND shortvideo_refund_amount >= 0
      AND shortvideo_live_room_pay_amount >= 0
      AND shortvideo_search_after_view_pay_amount >= 0
      AND shortvideo_shop_page_pay_amount >= 0
      AND (shortvideo_play_to_pay_rate IS NULL OR shortvideo_play_to_pay_rate >= 0)
      AND (shortvideo_refund_rate IS NULL OR shortvideo_refund_rate >= 0)
    )
);

COMMENT ON TABLE ads.douyin_shortvideo_detail IS '抖音短视频明细事实表（视频级，按自营/合作/未归类划分）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.stat_date IS '统计日期（来自 ODS.stat_date）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.publish_time IS '视频发布时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.video_id IS '短视频ID（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.author_douyin_id IS '作者抖音ID（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.author_nickname IS '作者昵称。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shop_id IS '店铺ID（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shop_name IS '店铺名称。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_identity_type IS '作者身份编码：self=自营，cooperation=合作，unclassified=未归类。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.author_type IS '作者类型：自营/合作/未归类。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.is_self_operated IS '是否自营作者（true=自营）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.is_cooperation IS '是否合作作者（true=合作）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_count IS '短视频条数（明细层默认 1）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.video_view_count IS '短视频播放次数。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_order_count IS '短视频成交订单数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_refund_order_count IS '短视频退款订单数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_buyer_count IS '短视频成交人数（当前源未提供，默认 0）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_gmv IS '短视频成交金额（当前使用 user_pay_amount 汇总）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_user_pay_amount IS '短视频支付金额。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_refund_amount IS '短视频退款金额。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_live_room_pay_amount IS '短视频引导直播间成交金额。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_search_after_view_pay_amount IS '短视频看后搜成交金额。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_shop_page_pay_amount IS '短视频商品详情页成交金额。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_play_to_pay_rate IS '播放转支付效率（shortvideo_user_pay_amount / video_view_count）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shortvideo_refund_rate IS '退款率（shortvideo_refund_amount / shortvideo_user_pay_amount）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.source_updated_at IS '当前明细行对应的源表更新时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.updated_at IS '记录更新时间。';

CREATE INDEX idx_douyin_shortvideo_detail_stat_date
  ON ads.douyin_shortvideo_detail (stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_identity_stat_date
  ON ads.douyin_shortvideo_detail (shortvideo_identity_type, stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_author_type_stat_date
  ON ads.douyin_shortvideo_detail (author_type, stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_author_stat_date
  ON ads.douyin_shortvideo_detail (author_douyin_id, stat_date DESC);
CREATE INDEX idx_douyin_shortvideo_detail_publish_time_desc
  ON ads.douyin_shortvideo_detail (publish_time DESC);

COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_stat_date IS '按日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_identity_stat_date IS '按作者身份+日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_author_type_stat_date IS '按作者类型+日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_author_stat_date IS '按作者+日期窗口查询索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_publish_time_desc IS '按发布时间倒序索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_shortvideo_detail_updated_at
BEFORE UPDATE ON ads.douyin_shortvideo_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail(
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
  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_self_anchor_map does not exist';
  END IF;

  IF to_regclass('ads.douyin_shortvideo_detail') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_shortvideo_detail does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src.stat_date)),
    COALESCE(p_end_date, MAX(src.stat_date))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_shortvideo_raw has no stat_date rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_shortvideo_detail
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  CREATE TEMP TABLE tmp_douyin_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_self_anchor_map m
  WHERE m.is_active = TRUE
    AND NULLIF(BTRIM(m.anchor_douyin_id), '') IS NOT NULL;

  INSERT INTO ads.douyin_shortvideo_detail (
    stat_date,
    publish_time,
    video_id,
    author_douyin_id,
    author_nickname,
    shop_id,
    shop_name,
    shortvideo_identity_type,
    author_type,
    is_self_operated,
    is_cooperation,
    shortvideo_count,
    video_view_count,
    shortvideo_order_count,
    shortvideo_refund_order_count,
    shortvideo_buyer_count,
    shortvideo_gmv,
    shortvideo_user_pay_amount,
    shortvideo_refund_amount,
    shortvideo_live_room_pay_amount,
    shortvideo_search_after_view_pay_amount,
    shortvideo_shop_page_pay_amount,
    shortvideo_play_to_pay_rate,
    shortvideo_refund_rate,
    source_updated_at
  )
  WITH source_ranked AS (
    SELECT
      src.stat_date::DATE AS stat_date,
      src.publish_time AS publish_time,
      COALESCE(NULLIF(BTRIM(src.video_id), ''), '') AS video_id,
      COALESCE(NULLIF(BTRIM(src.author_douyin_id), ''), '') AS author_douyin_id,
      NULLIF(BTRIM(src.author_nickname), '') AS author_nickname,
      COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS shop_id,
      NULLIF(BTRIM(src.shop_name), '') AS shop_name,
      COALESCE(src.video_view_count, 0)::BIGINT AS video_view_count,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_user_pay_amount,
      COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS shortvideo_refund_amount,
      COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_live_room_pay_amount,
      COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_search_after_view_pay_amount,
      COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shortvideo_shop_page_pay_amount,
      COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY
          src.stat_date,
          COALESCE(NULLIF(BTRIM(src.video_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.author_douyin_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.shop_id), ''), '')
        ORDER BY
          COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP) DESC,
          src.publish_time DESC NULLS LAST
      ) AS rn
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  )
  SELECT
    sr.stat_date,
    sr.publish_time,
    sr.video_id,
    sr.author_douyin_id,
    CASE
      WHEN sr.author_douyin_id = '' THEN '(缺失作者ID)'
      ELSE COALESCE(sr.author_nickname, '(未命名作者)')
    END AS author_nickname,
    sr.shop_id,
    COALESCE(sr.shop_name, '(未命名店铺)') AS shop_name,
    CASE
      WHEN sr.author_douyin_id = '' THEN 'unclassified'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.author_douyin_id
      ) THEN 'self'
      ELSE 'cooperation'
    END AS shortvideo_identity_type,
    CASE
      WHEN sr.author_douyin_id = '' THEN '未归类'
      WHEN EXISTS (
        SELECT 1
        FROM tmp_douyin_self_anchor_map m
        WHERE m.anchor_douyin_id = sr.author_douyin_id
      ) THEN '自营'
      ELSE '合作'
    END AS author_type,
    CASE
      WHEN sr.author_douyin_id <> ''
        AND EXISTS (
          SELECT 1
          FROM tmp_douyin_self_anchor_map m
          WHERE m.anchor_douyin_id = sr.author_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_self_operated,
    CASE
      WHEN sr.author_douyin_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tmp_douyin_self_anchor_map m
          WHERE m.anchor_douyin_id = sr.author_douyin_id
        ) THEN TRUE
      ELSE FALSE
    END AS is_cooperation,
    1 AS shortvideo_count,
    sr.video_view_count,
    0::BIGINT AS shortvideo_order_count,
    0::BIGINT AS shortvideo_refund_order_count,
    0::BIGINT AS shortvideo_buyer_count,
    sr.shortvideo_user_pay_amount AS shortvideo_gmv,
    sr.shortvideo_user_pay_amount,
    sr.shortvideo_refund_amount,
    sr.shortvideo_live_room_pay_amount,
    sr.shortvideo_search_after_view_pay_amount,
    sr.shortvideo_shop_page_pay_amount,
    CASE
      WHEN sr.video_view_count > 0 THEN ROUND(
        sr.shortvideo_user_pay_amount / sr.video_view_count::NUMERIC,
        6
      )
      ELSE NULL::NUMERIC(18, 6)
    END AS shortvideo_play_to_pay_rate,
    CASE
      WHEN sr.shortvideo_user_pay_amount > 0 THEN ROUND(
        sr.shortvideo_refund_amount / sr.shortvideo_user_pay_amount,
        6
      )
      ELSE NULL::NUMERIC(18, 6)
    END AS shortvideo_refund_rate,
    sr.source_updated_at
  FROM source_ranked sr
  WHERE sr.rn = 1;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_shortvideo_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail(DATE, DATE)
IS '按日期窗口刷新抖音短视频明细事实表（视频级，按作者身份分层）。';

CREATE TABLE etl.douyin_shortvideo_detail_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_shortvideo_detail_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_shortvideo_detail_refresh_state IS '抖音短视频明细事实表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.id IS '单行主键，固定值 1。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_source_updated_at IS '已处理的源表最大更新时间水位（来自 ODS updated_at/publish_time/stat_date）。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_at IS '最近一次增量刷新执行时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.updated_at IS '记录更新时间。';

INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(
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

  INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_shortvideo_detail_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP))
  INTO v_source_max_updated_at
  FROM ods.douyin_trade_sale_shortvideo_raw src;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_shortvideo_detail_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(src.stat_date),
    MAX(src.stat_date)
  INTO v_min_date, v_max_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL
    AND COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP)
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(src.stat_date)
  INTO v_fallback_end_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL;

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

  CALL ads.refresh_douyin_shortvideo_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_shortvideo_detail_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间增量刷新抖音短视频明细事实表，并固定回刷最近窗口，支持仅初始化水位。';

CALL ads.refresh_douyin_shortvideo_detail_incremental(14, TRUE);

COMMIT;
