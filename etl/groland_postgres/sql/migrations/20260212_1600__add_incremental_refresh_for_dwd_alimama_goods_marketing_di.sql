BEGIN;

CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS etl.alimama_goods_marketing_di_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_alimama_goods_marketing_di_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.alimama_goods_marketing_di_refresh_state IS '阿里妈妈商品营销明细增量刷新水位状态表。';
COMMENT ON COLUMN etl.alimama_goods_marketing_di_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.alimama_goods_marketing_di_refresh_state.last_ods_updated_at IS '最近一次已处理的ODS更新时间水位。';
COMMENT ON COLUMN etl.alimama_goods_marketing_di_refresh_state.last_refresh_at IS '最近一次刷新执行时间。';
COMMENT ON COLUMN etl.alimama_goods_marketing_di_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.alimama_goods_marketing_di_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';

INSERT INTO etl.alimama_goods_marketing_di_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP PROCEDURE IF EXISTS dwd.refresh_dwd_alimama_goods_marketing_di_incremental(INTEGER, BOOLEAN);

CREATE PROCEDURE dwd.refresh_dwd_alimama_goods_marketing_di_incremental(
  p_fallback_window_days INTEGER DEFAULT 7,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.alimama_goods_marketing_di_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_ods_updated_at
  INTO v_last_ods_updated_at
  FROM etl.alimama_goods_marketing_di_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario;

  IF p_init_watermark_only THEN
    IF v_max_updated_at IS NULL THEN
      RAISE NOTICE 'init watermark skipped, source table has no data';
      RETURN;
    END IF;

    UPDATE etl.alimama_goods_marketing_di_refresh_state
    SET
      last_ods_updated_at = v_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_ods_updated_at %', v_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date),
    MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO
    v_min_date,
    v_max_date,
    v_max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;

  IF v_min_date IS NULL OR v_max_date IS NULL THEN
    RAISE NOTICE 'no ODS updates since %, skipped', v_last_ods_updated_at;
    RETURN;
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);
  IF v_min_date > v_fallback_start_date THEN
    v_min_date := v_fallback_start_date;
  END IF;

  CALL dwd.refresh_dwd_alimama_goods_marketing_di(v_min_date, v_max_date);

  UPDATE etl.alimama_goods_marketing_di_refresh_state
  SET
    last_ods_updated_at = GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at)),
    last_refresh_at = v_now,
    last_refresh_start_date = v_min_date,
    last_refresh_end_date = v_max_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], watermark %',
    v_min_date,
    v_max_date,
    COALESCE(v_max_updated_at, v_last_ods_updated_at);
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_dwd_alimama_goods_marketing_di_incremental(INTEGER, BOOLEAN)
IS '阿里妈妈商品营销明细增量刷新：依据ODS更新时间水位识别变更并刷新DWD。';

COMMIT;
