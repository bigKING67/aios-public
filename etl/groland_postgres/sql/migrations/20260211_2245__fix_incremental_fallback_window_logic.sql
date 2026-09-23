BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_incremental(INTEGER, BOOLEAN);

CREATE PROCEDURE dwd.refresh_all_trade_sale_incremental(
  IN p_fallback_window_days INTEGER DEFAULT 7,
  IN p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_platform VARCHAR(20);
  v_last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
  v_fallback_start_date DATE;
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'p_fallback_window_days must be greater than 0';
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

  FOR v_platform IN
    SELECT platform
    FROM etl.all_trade_sale_refresh_state
    ORDER BY platform
  LOOP
    SELECT last_ods_updated_at
    INTO v_last_ods_updated_at
    FROM etl.all_trade_sale_refresh_state
    WHERE platform = v_platform
    FOR UPDATE;

    v_min_date := NULL;
    v_max_date := NULL;
    v_max_updated_at := NULL;

    IF p_init_watermark_only THEN
      IF v_platform = 'douyin' THEN
        SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.douyin_trade_sale_raw;
      ELSIF v_platform = 'jd' THEN
        SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.jd_trade_sale_raw;
      ELSIF v_platform = 'taobao' THEN
        SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.taobao_trade_sale_raw;
      ELSIF v_platform = 'wx' THEN
        SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.wx_trade_sale_raw;
      ELSE
        SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_max_updated_at
        FROM ods.xhs_trade_sale_raw;
      END IF;

      IF v_max_updated_at IS NOT NULL THEN
        UPDATE etl.all_trade_sale_refresh_state
        SET
          last_ods_updated_at = v_max_updated_at,
          updated_at = v_now
        WHERE platform = v_platform;
      END IF;

      CONTINUE;
    END IF;

    IF v_platform = 'douyin' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO v_min_date, v_max_date, v_max_updated_at
      FROM ods.douyin_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    ELSIF v_platform = 'jd' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO v_min_date, v_max_date, v_max_updated_at
      FROM ods.jd_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    ELSIF v_platform = 'taobao' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO v_min_date, v_max_date, v_max_updated_at
      FROM ods.taobao_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    ELSIF v_platform = 'wx' THEN
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO v_min_date, v_max_date, v_max_updated_at
      FROM ods.wx_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    ELSE
      SELECT
        MIN(stat_date),
        MAX(stat_date),
        MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
      INTO v_min_date, v_max_date, v_max_updated_at
      FROM ods.xhs_trade_sale_raw
      WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_ods_updated_at;
    END IF;

    IF v_min_date IS NULL OR v_max_date IS NULL THEN
      RAISE NOTICE 'platform % has no ODS updates since %, skipped', v_platform, v_last_ods_updated_at;
      CONTINUE;
    END IF;

    IF v_min_date > v_fallback_start_date THEN
      v_min_date := v_fallback_start_date;
    END IF;

    CALL dwd.refresh_all_trade_sale_platform(v_platform, v_min_date, v_max_date);

    UPDATE etl.all_trade_sale_refresh_state
    SET
      last_ods_updated_at = GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at)),
      last_refresh_at = v_now,
      last_refresh_start_date = v_min_date,
      last_refresh_end_date = v_max_date,
      updated_at = v_now
    WHERE platform = v_platform;
  END LOOP;
END;
$$;

COMMIT;
