BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

-- 1) ADS 日粒度全字段表：复制 ODS 商品明细全部业务字段
CREATE TABLE IF NOT EXISTS ads.taobao_trade_sale_goods_daily (
  LIKE ods.taobao_trade_sale_goods_raw INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING COMMENTS
);

ALTER TABLE ads.taobao_trade_sale_goods_daily
  ADD COLUMN IF NOT EXISTS etl_loaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW();

COMMENT ON TABLE ads.taobao_trade_sale_goods_daily IS 'ADS-天猫商品日粒度全字段指标表（源自 ODS 商品成交明细，支撑看板日/周/月/年/自定义聚合查询）。';
COMMENT ON COLUMN ads.taobao_trade_sale_goods_daily.etl_loaded_at IS 'ETL 装载时间（当前行最近一次从 ODS 同步到 ADS 的时间）。';

CREATE INDEX IF NOT EXISTS idx_taobao_trade_sale_goods_daily_stat_date
  ON ads.taobao_trade_sale_goods_daily (stat_date);
COMMENT ON INDEX ads.idx_taobao_trade_sale_goods_daily_stat_date IS '按统计日期过滤的查询索引。';

CREATE INDEX IF NOT EXISTS idx_taobao_trade_sale_goods_daily_shop_date
  ON ads.taobao_trade_sale_goods_daily (shop_id, stat_date);
COMMENT ON INDEX ads.idx_taobao_trade_sale_goods_daily_shop_date IS '按店铺+日期窗口查询索引。';

CREATE INDEX IF NOT EXISTS idx_taobao_trade_sale_goods_daily_product_date
  ON ads.taobao_trade_sale_goods_daily (product_id, stat_date);
COMMENT ON INDEX ads.idx_taobao_trade_sale_goods_daily_product_date IS '按商品+日期窗口聚合与排序索引。';

CREATE INDEX IF NOT EXISTS idx_taobao_trade_sale_goods_daily_updated_at
  ON ads.taobao_trade_sale_goods_daily (updated_at);
COMMENT ON INDEX ads.idx_taobao_trade_sale_goods_daily_updated_at IS '按上游更新时间排查增量差异索引。';

-- 2) 全量/窗口刷新过程
CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(
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
  IF to_regclass('ods.taobao_trade_sale_goods_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_goods_raw does not exist';
  END IF;

  IF to_regclass('ads.taobao_trade_sale_goods_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_trade_sale_goods_daily does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date))
  INTO v_start_date, v_end_date
  FROM ods.taobao_trade_sale_goods_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_trade_sale_goods_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.taobao_trade_sale_goods_daily
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.taobao_trade_sale_goods_daily
  SELECT src.*, NOW() AS etl_loaded_at
  FROM ods.taobao_trade_sale_goods_raw src
  WHERE src.stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_taobao_trade_sale_goods_daily completed, inserted: %, deleted: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily(DATE, DATE)
IS '按日期窗口刷新 ADS 天猫商品日粒度全字段表。';

-- 3) 增量刷新水位状态表
CREATE TABLE IF NOT EXISTS etl.taobao_trade_sale_goods_daily_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_trade_sale_goods_daily_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.taobao_trade_sale_goods_daily_refresh_state IS 'ADS 天猫商品日粒度全字段表增量刷新水位状态表。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.last_source_updated_at IS '最近一次已处理的 ODS 更新时间水位。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.last_refresh_at IS '最近一次 ADS 刷新执行时间。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.last_refresh_start_date IS '最近一次 ADS 刷新窗口起始日期。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.last_refresh_end_date IS '最近一次 ADS 刷新窗口结束日期。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.taobao_trade_sale_goods_daily_refresh_state.updated_at IS '记录更新时间。';
COMMENT ON CONSTRAINT chk_taobao_trade_sale_goods_daily_refresh_state_id ON etl.taobao_trade_sale_goods_daily_refresh_state IS '固定单行约束（id=1）。';

INSERT INTO etl.taobao_trade_sale_goods_daily_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 4) 增量刷新过程
CREATE OR REPLACE PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_goods_min_date DATE;
  v_goods_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.taobao_trade_sale_goods_daily_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.taobao_trade_sale_goods_daily_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_source_max_updated_at
  FROM ods.taobao_trade_sale_goods_raw;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.taobao_trade_sale_goods_daily_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    UPDATE etl.taobao_trade_sale_goods_daily_refresh_state
    SET
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'incremental refresh skipped, no upstream changes (last=%)', v_last_source_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date)
  INTO v_goods_min_date, v_goods_max_date
  FROM ods.taobao_trade_sale_goods_raw
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
    > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(stat_date)
  INTO v_fallback_end_date
  FROM ods.taobao_trade_sale_goods_raw;

  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_goods_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_goods_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_taobao_trade_sale_goods_daily(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.taobao_trade_sale_goods_daily_refresh_state
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

COMMENT ON PROCEDURE ads.refresh_taobao_trade_sale_goods_daily_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间水位增量刷新 ADS 天猫商品日粒度全字段表，支持仅初始化水位。';

COMMIT;
