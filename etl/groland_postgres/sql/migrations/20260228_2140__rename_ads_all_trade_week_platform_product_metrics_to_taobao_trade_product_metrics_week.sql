BEGIN;

DO $$
BEGIN
  IF to_regclass('ads.all_trade_week_platform_product_metrics') IS NOT NULL
     AND to_regclass('ads.taobao_trade_product_metrics_week') IS NULL THEN
    EXECUTE 'ALTER TABLE ads.all_trade_week_platform_product_metrics RENAME TO taobao_trade_product_metrics_week';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('etl.all_trade_week_platform_product_metrics_refresh_state') IS NOT NULL
     AND to_regclass('etl.taobao_trade_product_metrics_week_refresh_state') IS NULL THEN
    EXECUTE 'ALTER TABLE etl.all_trade_week_platform_product_metrics_refresh_state RENAME TO taobao_trade_product_metrics_week_refresh_state';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('ads.fn_touch_all_trade_week_platform_product_metrics_updated_at()') IS NOT NULL
     AND to_regprocedure('ads.fn_touch_taobao_trade_product_metrics_week_updated_at()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION ads.fn_touch_all_trade_week_platform_product_metrics_updated_at() RENAME TO fn_touch_taobao_trade_product_metrics_week_updated_at';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('ads.refresh_all_trade_week_platform_product_metrics(date,date)') IS NOT NULL
     AND to_regprocedure('ads.refresh_taobao_trade_product_metrics_week(date,date)') IS NULL THEN
    EXECUTE 'ALTER PROCEDURE ads.refresh_all_trade_week_platform_product_metrics(date,date) RENAME TO refresh_taobao_trade_product_metrics_week';
  END IF;

  IF to_regprocedure('ads.refresh_all_trade_week_platform_product_metrics_incremental(integer,boolean)') IS NOT NULL
     AND to_regprocedure('ads.refresh_taobao_trade_product_metrics_week_incremental(integer,boolean)') IS NULL THEN
    EXECUTE 'ALTER PROCEDURE ads.refresh_all_trade_week_platform_product_metrics_incremental(integer,boolean) RENAME TO refresh_taobao_trade_product_metrics_week_incremental';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('ads.taobao_trade_product_metrics_week') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pk_all_trade_week_platform_product_metrics'
      AND conrelid = 'ads.taobao_trade_product_metrics_week'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE ads.taobao_trade_product_metrics_week RENAME CONSTRAINT pk_all_trade_week_platform_product_metrics TO pk_taobao_trade_product_metrics_week';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_all_trade_week_platform_product_metrics_platform'
      AND conrelid = 'ads.taobao_trade_product_metrics_week'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE ads.taobao_trade_product_metrics_week RENAME CONSTRAINT chk_all_trade_week_platform_product_metrics_platform TO chk_taobao_trade_product_metrics_week_platform';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_all_trade_week_platform_product_metrics_observed_days_range'
      AND conrelid = 'ads.taobao_trade_product_metrics_week'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE ads.taobao_trade_product_metrics_week RENAME CONSTRAINT chk_all_trade_week_platform_product_metrics_observed_days_range TO chk_taobao_trade_product_metrics_week_observed_days_range';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_touch_all_trade_week_platform_product_metrics_updated_at'
      AND tgrelid = 'ads.taobao_trade_product_metrics_week'::regclass
  ) THEN
    EXECUTE 'ALTER TRIGGER trg_touch_all_trade_week_platform_product_metrics_updated_at ON ads.taobao_trade_product_metrics_week RENAME TO trg_touch_taobao_trade_product_metrics_week_updated_at';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('ads.idx_all_trade_week_platform_product_metrics_week_platform_delta') IS NOT NULL
     AND to_regclass('ads.idx_taobao_trade_product_metrics_week_week_platform_delta') IS NULL THEN
    EXECUTE 'ALTER INDEX ads.idx_all_trade_week_platform_product_metrics_week_platform_delta RENAME TO idx_taobao_trade_product_metrics_week_week_platform_delta';
  END IF;

  IF to_regclass('ads.idx_all_trade_week_platform_product_metrics_product') IS NOT NULL
     AND to_regclass('ads.idx_taobao_trade_product_metrics_week_product') IS NULL THEN
    EXECUTE 'ALTER INDEX ads.idx_all_trade_week_platform_product_metrics_product RENAME TO idx_taobao_trade_product_metrics_week_product';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('etl.taobao_trade_product_metrics_week_refresh_state') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_all_trade_week_platform_product_metrics_refresh_state_id'
      AND conrelid = 'etl.taobao_trade_product_metrics_week_refresh_state'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE etl.taobao_trade_product_metrics_week_refresh_state RENAME CONSTRAINT chk_all_trade_week_platform_product_metrics_refresh_state_id TO chk_taobao_trade_product_metrics_week_refresh_state_id';
  END IF;
END $$;

COMMENT ON TABLE ads.taobao_trade_product_metrics_week IS 'ADS-天猫商品周归因指标表（周六至周五）。';
COMMENT ON TABLE etl.taobao_trade_product_metrics_week_refresh_state IS 'ADS 天猫商品周归因指标增量刷新水位状态表。';
COMMENT ON FUNCTION ads.fn_touch_taobao_trade_product_metrics_week_updated_at() IS '更新前自动刷新 taobao_trade_product_metrics_week.updated_at 字段。';
COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week(DATE, DATE) IS '按周窗口全量刷新 ADS 天猫商品周归因指标表，可按日期范围局部重算。';
COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week_incremental(INTEGER, BOOLEAN) IS '按 ODS 商品明细 updated_at 水位增量刷新 ADS 天猫商品周归因指标表。';
COMMENT ON INDEX ads.idx_taobao_trade_product_metrics_week_week_platform_delta IS '按周按平台查看商品增量Top的排序索引。';
COMMENT ON INDEX ads.idx_taobao_trade_product_metrics_week_product IS '按商品ID检索加速索引。';

COMMIT;
