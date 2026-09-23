BEGIN;

CREATE SCHEMA IF NOT EXISTS etl;

CREATE TABLE IF NOT EXISTS etl.taobao_alimama_goods_marketingscene_week_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_dwd_etl_time TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_alimama_goods_marketingscene_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.taobao_alimama_goods_marketingscene_week_refresh_state IS 'DWS周汇总增量刷新水位状态表。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_week_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_week_refresh_state.last_dwd_etl_time IS '最近一次已处理的DWD etl_time水位。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_week_refresh_state.last_refresh_at IS '最近一次刷新执行时间。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_week_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.taobao_alimama_goods_marketingscene_week_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';

INSERT INTO etl.taobao_alimama_goods_marketingscene_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_week_incremental(INTEGER, BOOLEAN);

CREATE PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_dwd_etl_time TIMESTAMP WITHOUT TIME ZONE;
  v_max_etl_time TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('dwd.taobao_alimama_goods_marketingscene') IS NULL THEN
    RAISE EXCEPTION 'source table dwd.taobao_alimama_goods_marketingscene does not exist';
  END IF;

  IF to_regclass('dws.taobao_alimama_goods_marketingscene_week') IS NULL THEN
    RAISE EXCEPTION 'target table dws.taobao_alimama_goods_marketingscene_week does not exist';
  END IF;

  INSERT INTO etl.taobao_alimama_goods_marketingscene_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_dwd_etl_time
  INTO v_last_dwd_etl_time
  FROM etl.taobao_alimama_goods_marketingscene_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(etl_time, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_max_etl_time
  FROM dwd.taobao_alimama_goods_marketingscene;

  IF p_init_watermark_only THEN
    IF v_max_etl_time IS NULL THEN
      RAISE NOTICE 'init watermark skipped, source table has no data';
      RETURN;
    END IF;

    UPDATE etl.taobao_alimama_goods_marketingscene_week_refresh_state
    SET
      last_dwd_etl_time = v_max_etl_time,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_dwd_etl_time %', v_max_etl_time;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date),
    MAX(COALESCE(etl_time, TIMESTAMP '1970-01-01 00:00:00'))
  INTO
    v_min_date,
    v_max_date,
    v_max_etl_time
  FROM dwd.taobao_alimama_goods_marketingscene
  WHERE COALESCE(etl_time, TIMESTAMP '1970-01-01 00:00:00') > v_last_dwd_etl_time;

  IF v_min_date IS NULL OR v_max_date IS NULL THEN
    RAISE NOTICE 'no DWD updates since %, skipped', v_last_dwd_etl_time;
    RETURN;
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);
  IF v_min_date > v_fallback_start_date THEN
    v_min_date := v_fallback_start_date;
  END IF;

  CALL dws.refresh_taobao_alimama_goods_marketingscene_week(v_min_date, v_max_date);

  UPDATE etl.taobao_alimama_goods_marketingscene_week_refresh_state
  SET
    last_dwd_etl_time = GREATEST(v_last_dwd_etl_time, COALESCE(v_max_etl_time, v_last_dwd_etl_time)),
    last_refresh_at = v_now,
    last_refresh_start_date = v_min_date,
    last_refresh_end_date = v_max_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], watermark %',
    v_min_date,
    v_max_date,
    COALESCE(v_max_etl_time, v_last_dwd_etl_time);
END;
$$;

COMMENT ON PROCEDURE dws.refresh_taobao_alimama_goods_marketingscene_week_incremental(INTEGER, BOOLEAN)
IS 'DWS周汇总增量刷新：依据DWD etl_time水位识别变更并刷新周汇总。';

COMMIT;
