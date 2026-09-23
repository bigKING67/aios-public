CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS ads.douyin_trade_sale_card (
  id INTEGER NOT NULL,
  shop_name CHARACTER VARYING NOT NULL,
  shop_id CHARACTER VARYING NOT NULL,
  "date" DATE NOT NULL,
  product_title CHARACTER VARYING,
  product_id CHARACTER VARYING NOT NULL,
  product_url TEXT,
  card_exposure_user_count INTEGER,
  card_click_user_count INTEGER,
  card_click_rate_user NUMERIC,
  card_click_count INTEGER,
  card_avg_click_per_user NUMERIC,
  new_customer_click_count INTEGER,
  old_customer_click_count INTEGER,
  new_customer_click_rate NUMERIC,
  old_customer_click_rate NUMERIC,
  card_user_pay_amount NUMERIC,
  card_buyer_count INTEGER,
  card_avg_order_value NUMERIC,
  card_click_to_pay_rate_user NUMERIC,
  first_buy_user_count INTEGER,
  rebuy_user_count INTEGER,
  first_buy_new_rate NUMERIC,
  rebuy_old_rate NUMERIC,
  card_exposure_count INTEGER,
  card_exposure_to_pay_rate_user NUMERIC,
  card_exposure_to_pay_rate_count NUMERIC,
  card_gpm NUMERIC,
  card_click_rate_count NUMERIC,
  card_click_to_pay_rate_count NUMERIC,
  card_cart_user_count INTEGER,
  card_favorite_user_count INTEGER,
  card_order_count INTEGER,
  platform_support_exposure_count INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_douyin_trade_sale_card
    PRIMARY KEY (shop_name, shop_id, "date", product_id)
);

COMMENT ON TABLE ads.douyin_trade_sale_card IS 'ADS-抖音商品卡看板主表，字段镜像 ods.douyin_trade_sale_card_raw，用于商品卡维度指标、趋势与全字段列表。';

CREATE TABLE IF NOT EXISTS ads.douyin_trade_sale_card_detail (
  id INTEGER NOT NULL,
  shop_name CHARACTER VARYING NOT NULL,
  shop_id CHARACTER VARYING NOT NULL,
  stat_date DATE NOT NULL,
  product_title CHARACTER VARYING,
  product_id CHARACTER VARYING NOT NULL,
  product_url TEXT,
  source_level1 CHARACTER VARYING NOT NULL,
  card_exposure_user_count INTEGER,
  card_click_user_count INTEGER,
  card_buyer_count INTEGER,
  card_cart_user_count INTEGER,
  card_favorite_user_count INTEGER,
  card_bounce_user_count INTEGER,
  card_exposure_to_pay_rate_user NUMERIC,
  card_click_rate_user NUMERIC,
  card_click_to_pay_rate_user NUMERIC,
  card_user_pay_amount NUMERIC,
  card_order_count INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "售卖类型" TEXT,
  "投广时段" TEXT,
  "一级渠道" TEXT,
  "二级渠道" TEXT,
  CONSTRAINT pk_douyin_trade_sale_card_detail
    PRIMARY KEY (shop_id, stat_date, product_id, source_level1)
);

COMMENT ON TABLE ads.douyin_trade_sale_card_detail IS 'ADS-抖音商品卡流量来源明细表，字段镜像 ods.douyin_trade_sale_card_detail_raw，用于商品卡流量来源层级查询。';

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_date
  ON ads.douyin_trade_sale_card ("date");

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_product_date
  ON ads.douyin_trade_sale_card (product_id, "date");

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_shop_date
  ON ads.douyin_trade_sale_card (shop_id, "date");

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_updated_at
  ON ads.douyin_trade_sale_card (updated_at);

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_stat_date
  ON ads.douyin_trade_sale_card_detail (stat_date);

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_product_date
  ON ads.douyin_trade_sale_card_detail (product_id, stat_date);

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_shop_date
  ON ads.douyin_trade_sale_card_detail (shop_id, stat_date);

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_source_date
  ON ads.douyin_trade_sale_card_detail (product_id, source_level1, stat_date);

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_hierarchy_date
  ON ads.douyin_trade_sale_card_detail (
    product_id,
    "售卖类型",
    "投广时段",
    "一级渠道",
    "二级渠道",
    stat_date
  );

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_card_detail_updated_at
  ON ads.douyin_trade_sale_card_detail (updated_at);

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_trade_sale_card(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_deleted_rows BIGINT := 0;
  v_inserted_rows BIGINT := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_card_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_trade_sale_card') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_trade_sale_card does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src."date")),
    COALESCE(p_end_date, MAX(src."date"))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_card_raw src;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_card_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start date % cannot be greater than end date %', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_trade_sale_card dst
  WHERE dst."date" BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.douyin_trade_sale_card (
    id,
    shop_name,
    shop_id,
    "date",
    product_title,
    product_id,
    product_url,
    card_exposure_user_count,
    card_click_user_count,
    card_click_rate_user,
    card_click_count,
    card_avg_click_per_user,
    new_customer_click_count,
    old_customer_click_count,
    new_customer_click_rate,
    old_customer_click_rate,
    card_user_pay_amount,
    card_buyer_count,
    card_avg_order_value,
    card_click_to_pay_rate_user,
    first_buy_user_count,
    rebuy_user_count,
    first_buy_new_rate,
    rebuy_old_rate,
    card_exposure_count,
    card_exposure_to_pay_rate_user,
    card_exposure_to_pay_rate_count,
    card_gpm,
    card_click_rate_count,
    card_click_to_pay_rate_count,
    card_cart_user_count,
    card_favorite_user_count,
    card_order_count,
    platform_support_exposure_count,
    created_at,
    updated_at
  )
  SELECT
    src.id,
    src.shop_name,
    src.shop_id,
    src."date",
    src.product_title,
    src.product_id,
    src.product_url,
    src.card_exposure_user_count,
    src.card_click_user_count,
    src.card_click_rate_user,
    src.card_click_count,
    src.card_avg_click_per_user,
    src.new_customer_click_count,
    src.old_customer_click_count,
    src.new_customer_click_rate,
    src.old_customer_click_rate,
    src.card_user_pay_amount,
    src.card_buyer_count,
    src.card_avg_order_value,
    src.card_click_to_pay_rate_user,
    src.first_buy_user_count,
    src.rebuy_user_count,
    src.first_buy_new_rate,
    src.rebuy_old_rate,
    src.card_exposure_count,
    src.card_exposure_to_pay_rate_user,
    src.card_exposure_to_pay_rate_count,
    src.card_gpm,
    src.card_click_rate_count,
    src.card_click_to_pay_rate_count,
    src.card_cart_user_count,
    src.card_favorite_user_count,
    src.card_order_count,
    src.platform_support_exposure_count,
    src.created_at,
    src.updated_at
  FROM ods.douyin_trade_sale_card_raw src
  WHERE src."date" BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_trade_sale_card completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_card(DATE, DATE)
IS '按日期窗口从 ODS 镜像刷新 ADS 抖音商品卡看板主表。';

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_trade_sale_card_detail(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_deleted_rows BIGINT := 0;
  v_inserted_rows BIGINT := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_card_detail_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_detail_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_trade_sale_card_detail') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_trade_sale_card_detail does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src.stat_date)),
    COALESCE(p_end_date, MAX(src.stat_date))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_card_detail_raw src;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_card_detail_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start date % cannot be greater than end date %', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_trade_sale_card_detail dst
  WHERE dst.stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.douyin_trade_sale_card_detail (
    id,
    shop_name,
    shop_id,
    stat_date,
    product_title,
    product_id,
    product_url,
    source_level1,
    card_exposure_user_count,
    card_click_user_count,
    card_buyer_count,
    card_cart_user_count,
    card_favorite_user_count,
    card_bounce_user_count,
    card_exposure_to_pay_rate_user,
    card_click_rate_user,
    card_click_to_pay_rate_user,
    card_user_pay_amount,
    card_order_count,
    created_at,
    updated_at,
    "售卖类型",
    "投广时段",
    "一级渠道",
    "二级渠道"
  )
  SELECT
    src.id,
    src.shop_name,
    src.shop_id,
    src.stat_date,
    src.product_title,
    src.product_id,
    src.product_url,
    src.source_level1,
    src.card_exposure_user_count,
    src.card_click_user_count,
    src.card_buyer_count,
    src.card_cart_user_count,
    src.card_favorite_user_count,
    src.card_bounce_user_count,
    src.card_exposure_to_pay_rate_user,
    src.card_click_rate_user,
    src.card_click_to_pay_rate_user,
    src.card_user_pay_amount,
    src.card_order_count,
    src.created_at,
    src.updated_at,
    src."售卖类型",
    src."投广时段",
    src."一级渠道",
    src."二级渠道"
  FROM ods.douyin_trade_sale_card_detail_raw src
  WHERE src.stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_trade_sale_card_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_card_detail(DATE, DATE)
IS '按日期窗口从 ODS 镜像刷新 ADS 抖音商品卡流量来源明细表。';

CREATE TABLE IF NOT EXISTS etl.douyin_trade_sale_card_dashboard_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_card_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_detail_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_douyin_trade_sale_card_dashboard_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_trade_sale_card_dashboard_refresh_state IS '抖音商品卡看板 ADS 镜像表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.last_card_source_updated_at IS '已处理的商品卡主表 ODS updated_at 水位。';
COMMENT ON COLUMN etl.douyin_trade_sale_card_dashboard_refresh_state.last_detail_source_updated_at IS '已处理的商品卡流量来源 ODS updated_at 水位。';

INSERT INTO etl.douyin_trade_sale_card_dashboard_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_trade_sale_card_dashboard_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_card_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_detail_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_card_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_detail_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_changed_start_date DATE;
  v_changed_end_date DATE;
  v_fallback_end_date DATE;
  v_fallback_start_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_card_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_raw does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_card_detail_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_card_detail_raw does not exist';
  END IF;

  INSERT INTO etl.douyin_trade_sale_card_dashboard_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    last_card_source_updated_at,
    last_detail_source_updated_at
  INTO
    v_last_card_source_updated_at,
    v_last_detail_source_updated_at
  FROM etl.douyin_trade_sale_card_dashboard_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(src.updated_at)
  INTO v_card_source_max_updated_at
  FROM ods.douyin_trade_sale_card_raw src;

  SELECT MAX(src.updated_at)
  INTO v_detail_source_max_updated_at
  FROM ods.douyin_trade_sale_card_detail_raw src;

  v_card_source_max_updated_at := COALESCE(v_card_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');
  v_detail_source_max_updated_at := COALESCE(v_detail_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_card_dashboard_refresh_state
    SET
      last_card_source_updated_at = v_card_source_max_updated_at,
      last_detail_source_updated_at = v_detail_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE
      'init watermark completed, card_source_updated_at %, detail_source_updated_at %',
      v_card_source_max_updated_at,
      v_detail_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(changed_date),
    MAX(changed_date)
  INTO v_changed_start_date, v_changed_end_date
  FROM (
    SELECT src."date" AS changed_date
    FROM ods.douyin_trade_sale_card_raw src
    WHERE src.updated_at > COALESCE(v_last_card_source_updated_at, TIMESTAMP '1970-01-01 00:00:00')
    UNION ALL
    SELECT src.stat_date AS changed_date
    FROM ods.douyin_trade_sale_card_detail_raw src
    WHERE src.updated_at > COALESCE(v_last_detail_source_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  ) changed;

  SELECT MAX(max_date)
  INTO v_fallback_end_date
  FROM (
    SELECT MAX(src."date") AS max_date
    FROM ods.douyin_trade_sale_card_raw src
    UNION ALL
    SELECT MAX(src.stat_date) AS max_date
    FROM ods.douyin_trade_sale_card_detail_raw src
  ) bounds;

  IF v_fallback_end_date IS NULL THEN
    UPDATE etl.douyin_trade_sale_card_dashboard_refresh_state
    SET
      last_card_source_updated_at = v_card_source_max_updated_at,
      last_detail_source_updated_at = v_detail_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'refresh_douyin_trade_sale_card_dashboard_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);
  v_refresh_start_date := LEAST(
    COALESCE(v_changed_start_date, v_fallback_start_date),
    v_fallback_start_date
  );
  v_refresh_end_date := GREATEST(
    COALESCE(v_changed_end_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_douyin_trade_sale_card(v_refresh_start_date, v_refresh_end_date);
  CALL ads.refresh_douyin_trade_sale_card_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_trade_sale_card_dashboard_refresh_state
  SET
    last_card_source_updated_at = v_card_source_max_updated_at,
    last_detail_source_updated_at = v_detail_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, source watermark card %, detail %, refresh window [% - %]',
    v_card_source_max_updated_at,
    v_detail_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_card_dashboard_incremental(INTEGER, BOOLEAN)
IS '按 ODS updated_at 水位增量刷新抖音商品卡 ADS 主表与流量来源明细表，并固定回刷最近窗口，支持仅初始化水位。';
