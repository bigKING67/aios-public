BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS ads.douyin_live_goods_detail (
  stat_date DATE NOT NULL,
  live_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  live_end_time TIMESTAMP WITHOUT TIME ZONE,
  anchor_douyin_id TEXT NOT NULL DEFAULT '',
  anchor_nickname TEXT NOT NULL DEFAULT '(未命名主播)',
  shop_id TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '(未命名店铺)',
  live_identity_type VARCHAR(20) NOT NULL,
  anchor_type VARCHAR(10) NOT NULL DEFAULT '未归类',
  live_duration_minutes BIGINT NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL DEFAULT '(未命名商品)',
  product_id TEXT NOT NULL DEFAULT '',
  sku_name TEXT NOT NULL DEFAULT '汇总',
  sku_row_type VARCHAR(20) NOT NULL DEFAULT 'sku',
  product_image_url TEXT,
  product_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  product_sales_volume BIGINT NOT NULL DEFAULT 0,
  product_buyer_count BIGINT NOT NULL DEFAULT 0,
  product_order_count BIGINT NOT NULL DEFAULT 0,
  presale_order_count BIGINT NOT NULL DEFAULT 0,
  presale_full_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  product_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  product_click_user_count BIGINT NOT NULL DEFAULT 0,
  product_exposure_to_click_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  product_click_to_pay_rate_user NUMERIC(18, 6) NOT NULL DEFAULT 0,
  refund_user_count BIGINT NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_order_count BIGINT NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_live_goods_detail
    PRIMARY KEY (shop_id, anchor_douyin_id, live_start_time, product_id, sku_name),
  CONSTRAINT chk_douyin_live_goods_detail_identity_type
    CHECK (live_identity_type IN ('self', 'influencer', 'unclassified')),
  CONSTRAINT chk_douyin_live_goods_detail_anchor_type
    CHECK (anchor_type IN ('自播', '达播', '未归类')),
  CONSTRAINT chk_douyin_live_goods_detail_sku_row_type
    CHECK (sku_row_type IN ('product_summary', 'sku')),
  CONSTRAINT chk_douyin_live_goods_detail_non_negative
    CHECK (
      live_duration_minutes >= 0
      AND product_user_pay_amount >= 0
      AND product_sales_volume >= 0
      AND product_buyer_count >= 0
      AND product_order_count >= 0
      AND presale_order_count >= 0
      AND presale_full_amount >= 0
      AND product_exposure_user_count >= 0
      AND product_click_user_count >= 0
      AND product_exposure_to_click_rate_user >= 0
      AND product_click_to_pay_rate_user >= 0
      AND refund_user_count >= 0
      AND refund_amount >= 0
      AND refund_order_count >= 0
    )
);

COMMENT ON TABLE ads.douyin_live_goods_detail IS '抖音直播商品明细事实表（场次+商品+SKU粒度，商品汇总行为父级，SKU行为子级）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.stat_date IS '统计日期（按直播开始时间 live_start_time 取 DATE）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.live_start_time IS '直播开始时间。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.live_end_time IS '直播结束时间（优先来自 ads.douyin_live_detail）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.anchor_douyin_id IS '主播抖音号（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.anchor_nickname IS '主播昵称。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.shop_id IS '店铺ID（空值统一按空字符串存储）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.shop_name IS '店铺名称。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.live_identity_type IS '主播身份编码：self=自播，influencer=达播，unclassified=未归类。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.anchor_type IS '主播类型：自播/达播/未归类。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.live_duration_minutes IS '直播时长（分钟，优先来自 ads.douyin_live_detail）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_name IS '商品名称。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_id IS '商品ID。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.sku_name IS 'SKU名称；商品汇总行固定为“汇总”。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.sku_row_type IS '行类型：product_summary=商品汇总行，sku=SKU明细行。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_image_url IS '商品图片URL或SKU图片URL。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_user_pay_amount IS '商品/SKU维度用户支付金额。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_sales_volume IS '商品/SKU维度成交件数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_buyer_count IS '商品/SKU维度成交人数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_order_count IS '商品/SKU维度成交订单数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.presale_order_count IS '商品/SKU维度预售订单数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.presale_full_amount IS '商品/SKU维度预售全款金额。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_exposure_user_count IS '商品曝光人数（仅商品汇总行通常有值）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_click_user_count IS '商品点击人数（仅商品汇总行通常有值）。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_exposure_to_click_rate_user IS '直播间商品曝光-点击率(人数)原始值。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.product_click_to_pay_rate_user IS '直播间商品点击-成交率(人数)原始值。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.refund_user_count IS '退款人数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.refund_amount IS '退款金额。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.refund_order_count IS '退款订单数。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.source_updated_at IS '当前明细行对应的源表更新时间。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_live_goods_detail.updated_at IS '记录更新时间。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_goods_detail_stat_date
  ON ads.douyin_live_goods_detail (stat_date);
COMMENT ON INDEX ads.idx_douyin_live_goods_detail_stat_date IS '按统计日期过滤索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_goods_detail_identity_stat_date
  ON ads.douyin_live_goods_detail (live_identity_type, stat_date);
COMMENT ON INDEX ads.idx_douyin_live_goods_detail_identity_stat_date IS '按主播身份+日期过滤索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_goods_detail_anchor_start_time
  ON ads.douyin_live_goods_detail (anchor_douyin_id, live_start_time DESC);
COMMENT ON INDEX ads.idx_douyin_live_goods_detail_anchor_start_time IS '按主播+直播开始时间查询索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_goods_detail_product_start_time
  ON ads.douyin_live_goods_detail (product_id, live_start_time DESC);
COMMENT ON INDEX ads.idx_douyin_live_goods_detail_product_start_time IS '按商品+直播开始时间查询索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_live_goods_detail_source_updated_at
  ON ads.douyin_live_goods_detail (source_updated_at);
COMMENT ON INDEX ads.idx_douyin_live_goods_detail_source_updated_at IS '按源表更新时间排查增量批次索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_live_goods_detail_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_douyin_live_goods_detail_updated_at ON ads.douyin_live_goods_detail;
CREATE TRIGGER trg_touch_douyin_live_goods_detail_updated_at
BEFORE UPDATE ON ads.douyin_live_goods_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_live_goods_detail_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_goods_detail(
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
  IF to_regclass('ods.douyin_livestream_goods') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_livestream_goods does not exist';
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_live_detail does not exist';
  END IF;

  IF to_regclass('ads.douyin_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'source table ads.douyin_self_anchor_map does not exist';
  END IF;

  IF to_regclass('ads.douyin_live_goods_detail') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_live_goods_detail does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(DATE(src.live_start_time))),
    COALESCE(p_end_date, MAX(DATE(src.live_start_time)))
  INTO v_start_date, v_end_date
  FROM ods.douyin_livestream_goods src
  WHERE src.live_start_time IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_livestream_goods has no live_start_time rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_live_goods_detail
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  CREATE TEMP TABLE tmp_douyin_self_anchor_map ON COMMIT DROP AS
  SELECT
    BTRIM(m.anchor_douyin_id) AS anchor_douyin_id
  FROM ads.douyin_self_anchor_map m
  WHERE m.is_active = TRUE
    AND NULLIF(BTRIM(m.anchor_douyin_id), '') IS NOT NULL;

  INSERT INTO ads.douyin_live_goods_detail (
    stat_date,
    live_start_time,
    live_end_time,
    anchor_douyin_id,
    anchor_nickname,
    shop_id,
    shop_name,
    live_identity_type,
    anchor_type,
    live_duration_minutes,
    product_name,
    product_id,
    sku_name,
    sku_row_type,
    product_image_url,
    product_user_pay_amount,
    product_sales_volume,
    product_buyer_count,
    product_order_count,
    presale_order_count,
    presale_full_amount,
    product_exposure_user_count,
    product_click_user_count,
    product_exposure_to_click_rate_user,
    product_click_to_pay_rate_user,
    refund_user_count,
    refund_amount,
    refund_order_count,
    source_updated_at
  )
  WITH source_ranked AS (
    SELECT
      DATE(src.live_start_time) AS stat_date,
      src.live_start_time AS live_start_time,
      src.live_end_time AS live_end_time,
      COALESCE(NULLIF(BTRIM(src.influencer_douyin_id), ''), '') AS anchor_douyin_id,
      COALESCE(NULLIF(BTRIM(src.influencer_nickname), ''), '(未命名主播)') AS anchor_nickname,
      COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') AS shop_id,
      COALESCE(NULLIF(BTRIM(src.shop_name), ''), '(未命名店铺)') AS shop_name,
      COALESCE(NULLIF(BTRIM(src.product_id), ''), 'UNKNOWN_PRODUCT') AS product_id,
      COALESCE(NULLIF(BTRIM(src.sku_name), ''), '汇总') AS sku_name,
      COALESCE(NULLIF(BTRIM(src.product_name), ''), '(未命名商品)') AS product_name,
      NULLIF(BTRIM(src.product_image_url), '') AS product_image_url,
      COALESCE(src.product_user_pay_amount, 0)::NUMERIC(18, 2) AS product_user_pay_amount,
      COALESCE(src.product_sales_volume, 0)::BIGINT AS product_sales_volume,
      COALESCE(src.product_buyer_count, 0)::BIGINT AS product_buyer_count,
      COALESCE(src.product_order_count, 0)::BIGINT AS product_order_count,
      COALESCE(src.presale_order_count, 0)::BIGINT AS presale_order_count,
      COALESCE(src.presale_full_amount, 0)::NUMERIC(18, 2) AS presale_full_amount,
      COALESCE(src.product_exposure_user_count, 0)::BIGINT AS product_exposure_user_count,
      COALESCE(src.product_click_user_count, 0)::BIGINT AS product_click_user_count,
      CASE
        WHEN NULLIF(REPLACE(REPLACE(BTRIM(src.product_exposure_to_click_rate_user), '%', ''), ',', ''), '') IS NULL THEN 0::NUMERIC(18, 6)
        WHEN POSITION('%' IN src.product_exposure_to_click_rate_user) > 0 THEN
          (REPLACE(REPLACE(BTRIM(src.product_exposure_to_click_rate_user), '%', ''), ',', '')::NUMERIC / 100)::NUMERIC(18, 6)
        ELSE REPLACE(REPLACE(BTRIM(src.product_exposure_to_click_rate_user), '%', ''), ',', '')::NUMERIC(18, 6)
      END AS product_exposure_to_click_rate_user,
      CASE
        WHEN NULLIF(REPLACE(REPLACE(BTRIM(src.product_click_to_pay_rate_user), '%', ''), ',', ''), '') IS NULL THEN 0::NUMERIC(18, 6)
        WHEN POSITION('%' IN src.product_click_to_pay_rate_user) > 0 THEN
          (REPLACE(REPLACE(BTRIM(src.product_click_to_pay_rate_user), '%', ''), ',', '')::NUMERIC / 100)::NUMERIC(18, 6)
        ELSE REPLACE(REPLACE(BTRIM(src.product_click_to_pay_rate_user), '%', ''), ',', '')::NUMERIC(18, 6)
      END AS product_click_to_pay_rate_user,
      COALESCE(src.refund_user_count, 0)::BIGINT AS refund_user_count,
      COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
      COALESCE(src.refund_order_count, 0)::BIGINT AS refund_order_count,
      COALESCE(src.source_file_mtime, src.ingest_time, src.live_start_time) AS source_updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY
          COALESCE(NULLIF(BTRIM(src.shop_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.influencer_douyin_id), ''), ''),
          src.live_start_time,
          COALESCE(NULLIF(BTRIM(src.product_id), ''), 'UNKNOWN_PRODUCT'),
          COALESCE(NULLIF(BTRIM(src.sku_name), ''), '汇总')
        ORDER BY
          COALESCE(src.source_file_mtime, src.ingest_time, src.live_start_time) DESC,
          src.ingest_time DESC,
          src.id DESC
      ) AS rn
    FROM ods.douyin_livestream_goods src
    WHERE src.live_start_time IS NOT NULL
      AND DATE(src.live_start_time) BETWEEN v_start_date AND v_end_date
  )
  SELECT
    COALESCE(ld.stat_date, sr.stat_date) AS stat_date,
    sr.live_start_time,
    COALESCE(ld.live_end_time, sr.live_end_time) AS live_end_time,
    sr.anchor_douyin_id,
    CASE
      WHEN sr.anchor_douyin_id = '' THEN '(缺失主播ID)'
      ELSE COALESCE(NULLIF(BTRIM(ld.anchor_nickname), ''), NULLIF(BTRIM(sr.anchor_nickname), ''), '(未命名主播)')
    END AS anchor_nickname,
    sr.shop_id,
    COALESCE(NULLIF(BTRIM(ld.shop_name), ''), NULLIF(BTRIM(sr.shop_name), ''), '(未命名店铺)') AS shop_name,
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
    COALESCE(ld.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
    sr.product_name,
    sr.product_id,
    sr.sku_name,
    CASE WHEN sr.sku_name = '汇总' THEN 'product_summary' ELSE 'sku' END AS sku_row_type,
    COALESCE(sr.product_image_url, '') AS product_image_url,
    sr.product_user_pay_amount,
    sr.product_sales_volume,
    sr.product_buyer_count,
    sr.product_order_count,
    sr.presale_order_count,
    sr.presale_full_amount,
    sr.product_exposure_user_count,
    sr.product_click_user_count,
    sr.product_exposure_to_click_rate_user,
    sr.product_click_to_pay_rate_user,
    sr.refund_user_count,
    sr.refund_amount,
    sr.refund_order_count,
    sr.source_updated_at
  FROM source_ranked sr
  LEFT JOIN ads.douyin_live_detail ld
    ON ld.shop_id = sr.shop_id
   AND ld.anchor_douyin_id = sr.anchor_douyin_id
   AND ld.live_start_time = sr.live_start_time
  WHERE sr.rn = 1;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_live_goods_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_live_goods_detail(DATE, DATE)
IS '按日期窗口刷新抖音直播商品明细事实表（场次+商品+SKU粒度，按稳定主键去重）。';

CREATE TABLE IF NOT EXISTS etl.douyin_live_goods_detail_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_live_goods_detail_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_live_goods_detail_refresh_state IS '抖音直播商品明细事实表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.id IS '单行主键，固定值 1。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.last_source_updated_at IS '已处理的源表最大更新时间水位（来自 ODS source_file_mtime/ingest_time/live_start_time）。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.last_refresh_at IS '最近一次增量刷新执行时间。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.douyin_live_goods_detail_refresh_state.updated_at IS '记录更新时间。';

INSERT INTO etl.douyin_live_goods_detail_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_live_goods_detail_incremental(
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

  INSERT INTO etl.douyin_live_goods_detail_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_live_goods_detail_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.source_file_mtime, src.ingest_time, src.live_start_time))
  INTO v_source_max_updated_at
  FROM ods.douyin_livestream_goods src;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_live_goods_detail_refresh_state
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
  FROM ods.douyin_livestream_goods src
  WHERE src.live_start_time IS NOT NULL
    AND COALESCE(src.source_file_mtime, src.ingest_time, src.live_start_time)
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(DATE(src.live_start_time))
  INTO v_fallback_end_date
  FROM ods.douyin_livestream_goods src
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

  CALL ads.refresh_douyin_live_goods_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_live_goods_detail_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_douyin_live_goods_detail_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间增量刷新抖音直播商品明细事实表，并固定回刷最近窗口，支持仅初始化水位。';

COMMIT;
