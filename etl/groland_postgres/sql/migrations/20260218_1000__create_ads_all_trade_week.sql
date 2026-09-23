BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_incremental(INTEGER, BOOLEAN);
DROP TABLE IF EXISTS etl.all_trade_week_refresh_state;
DROP TABLE IF EXISTS ads.all_trade_week;

CREATE TABLE ads.all_trade_week (
  week_period VARCHAR(50) NOT NULL,
  curr_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_order_count INTEGER NOT NULL DEFAULT 0,
  curr_buyer_count INTEGER NOT NULL DEFAULT 0,
  curr_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_order_count INTEGER NOT NULL DEFAULT 0,
  prev_buyer_count INTEGER NOT NULL DEFAULT 0,
  prev_refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gmv_growth_rate NUMERIC(10, 4),
  order_count_growth_rate NUMERIC(10, 4),
  buyer_count_growth_rate NUMERIC(10, 4),
  refund_amount_growth_rate NUMERIC(10, 4),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_week PRIMARY KEY (week_period)
);

COMMENT ON TABLE ads.all_trade_week IS 'ADS-全渠道周汇总分析表（周六至周五）';
COMMENT ON COLUMN ads.all_trade_week.week_period IS '周时间段，格式: 2025/2/7～2025/2/13';
COMMENT ON COLUMN ads.all_trade_week.curr_gmv IS '本周成交总额';
COMMENT ON COLUMN ads.all_trade_week.curr_order_count IS '本周订单数';
COMMENT ON COLUMN ads.all_trade_week.curr_buyer_count IS '本周买家数';
COMMENT ON COLUMN ads.all_trade_week.curr_refund_amount IS '本周退款金额';
COMMENT ON COLUMN ads.all_trade_week.prev_gmv IS '上周(环比周)成交总额';
COMMENT ON COLUMN ads.all_trade_week.prev_order_count IS '上周(环比周)订单数';
COMMENT ON COLUMN ads.all_trade_week.prev_buyer_count IS '上周(环比周)买家数';
COMMENT ON COLUMN ads.all_trade_week.prev_refund_amount IS '上周(环比周)退款金额';
COMMENT ON COLUMN ads.all_trade_week.gmv_growth_rate IS 'GMV环比增长率';
COMMENT ON COLUMN ads.all_trade_week.order_count_growth_rate IS '订单数环比增长率';
COMMENT ON COLUMN ads.all_trade_week.buyer_count_growth_rate IS '买家数环比增长率';
COMMENT ON COLUMN ads.all_trade_week.refund_amount_growth_rate IS '退款金额环比增长率';
COMMENT ON COLUMN ads.all_trade_week.created_at IS '记录创建时间';
COMMENT ON COLUMN ads.all_trade_week.updated_at IS '记录最后更新时间';

CREATE INDEX idx_all_trade_week_week_period
ON ads.all_trade_week (week_period);

CREATE FUNCTION ads.fn_touch_all_trade_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ads.fn_touch_all_trade_week_updated_at() IS '更新前自动刷新updated_at字段。';

CREATE TRIGGER trg_touch_all_trade_week_updated_at
BEFORE UPDATE ON ads.all_trade_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_week_updated_at();

CREATE PROCEDURE ads.refresh_all_trade_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_effective_start DATE;
  v_effective_end DATE;
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  IF to_regclass('dws.all_trade_sale_daily') IS NULL THEN
    RAISE EXCEPTION 'source table dws.all_trade_sale_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN("date")),
    COALESCE(p_end_date, MAX("date"))
  INTO v_start_date, v_end_date
  FROM dws.all_trade_sale_daily;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dws.all_trade_sale_daily has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  -- 周定义：周六到周五
  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  IF to_regclass('pg_temp.tmp_ads_all_trade_week_scope') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_scope';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_new';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_updated';
  END IF;

  CREATE TEMP TABLE tmp_ads_all_trade_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_all_trade_week_new ON COMMIT DROP AS
  WITH weekly AS (
    SELECT
      (src."date" - ((EXTRACT(DOW FROM src."date")::INTEGER + 1) % 7))::DATE AS week_start,
      SUM(COALESCE(src.gmv, 0))::NUMERIC(18, 2) AS gmv,
      SUM(COALESCE(src.order_count, 0))::INTEGER AS order_count,
      SUM(COALESCE(src.buyer_count, 0))::INTEGER AS buyer_count,
      SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
    FROM dws.all_trade_sale_daily src
    WHERE src."date" BETWEEN v_effective_start AND v_effective_end
    GROUP BY (src."date" - ((EXTRACT(DOW FROM src."date")::INTEGER + 1) % 7))::DATE
  )
  SELECT
    ws.week_period,
    COALESCE(curr.gmv, 0)::NUMERIC(18, 2) AS curr_gmv,
    COALESCE(curr.order_count, 0)::INTEGER AS curr_order_count,
    COALESCE(curr.buyer_count, 0)::INTEGER AS curr_buyer_count,
    COALESCE(curr.refund_amount, 0)::NUMERIC(18, 2) AS curr_refund_amount,
    COALESCE(prev.gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
    COALESCE(prev.order_count, 0)::INTEGER AS prev_order_count,
    COALESCE(prev.buyer_count, 0)::INTEGER AS prev_buyer_count,
    COALESCE(prev.refund_amount, 0)::NUMERIC(18, 2) AS prev_refund_amount,
    CASE
      WHEN COALESCE(prev.gmv, 0) > 0 THEN ROUND(((curr.gmv - prev.gmv) / prev.gmv), 4)
      ELSE NULL
    END AS gmv_growth_rate,
    CASE
      WHEN COALESCE(prev.order_count, 0) > 0 THEN ROUND(((curr.order_count - prev.order_count)::NUMERIC / prev.order_count), 4)
      ELSE NULL
    END AS order_count_growth_rate,
    CASE
      WHEN COALESCE(prev.buyer_count, 0) > 0 THEN ROUND(((curr.buyer_count - prev.buyer_count)::NUMERIC / prev.buyer_count), 4)
      ELSE NULL
    END AS buyer_count_growth_rate,
    CASE
      WHEN COALESCE(prev.refund_amount, 0) > 0 THEN ROUND(((curr.refund_amount - prev.refund_amount) / prev.refund_amount), 4)
      ELSE NULL
    END AS refund_amount_growth_rate
  FROM tmp_ads_all_trade_week_scope ws
  LEFT JOIN weekly curr ON curr.week_start = ws.week_start
  LEFT JOIN weekly prev ON prev.week_start = ws.week_start - 7
  WHERE curr.gmv IS NOT NULL;

  CREATE TEMP TABLE tmp_ads_all_trade_week_existing ON COMMIT DROP AS
  SELECT t.*
  FROM ads.all_trade_week t
  JOIN tmp_ads_all_trade_week_scope ws
    ON ws.week_period = t.week_period;

  CREATE TEMP TABLE tmp_ads_all_trade_week_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_ads_all_trade_week_new n
  LEFT JOIN tmp_ads_all_trade_week_existing e
    ON e.week_period = n.week_period
  WHERE e.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_all_trade_week_deleted ON COMMIT DROP AS
  SELECT e.week_period
  FROM tmp_ads_all_trade_week_existing e
  LEFT JOIN tmp_ads_all_trade_week_new n
    ON n.week_period = e.week_period
  WHERE n.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_all_trade_week_updated ON COMMIT DROP AS
  SELECT
    n.week_period,
    n.curr_gmv,
    n.curr_order_count,
    n.curr_buyer_count,
    n.curr_refund_amount,
    n.prev_gmv,
    n.prev_order_count,
    n.prev_buyer_count,
    n.prev_refund_amount,
    n.gmv_growth_rate,
    n.order_count_growth_rate,
    n.buyer_count_growth_rate,
    n.refund_amount_growth_rate,
    e.curr_gmv AS old_curr_gmv,
    e.curr_order_count AS old_curr_order_count,
    e.curr_buyer_count AS old_curr_buyer_count,
    e.curr_refund_amount AS old_curr_refund_amount,
    e.prev_gmv AS old_prev_gmv,
    e.prev_order_count AS old_prev_order_count,
    e.prev_buyer_count AS old_prev_buyer_count,
    e.prev_refund_amount AS old_prev_refund_amount,
    e.gmv_growth_rate AS old_gmv_growth_rate,
    e.order_count_growth_rate AS old_order_count_growth_rate,
    e.buyer_count_growth_rate AS old_buyer_count_growth_rate,
    e.refund_amount_growth_rate AS old_refund_amount_growth_rate
  FROM tmp_ads_all_trade_week_new n
  JOIN tmp_ads_all_trade_week_existing e
    ON e.week_period = n.week_period
  WHERE ROW(
    n.curr_gmv,
    n.curr_order_count,
    n.curr_buyer_count,
    n.curr_refund_amount,
    n.prev_gmv,
    n.prev_order_count,
    n.prev_buyer_count,
    n.prev_refund_amount,
    n.gmv_growth_rate,
    n.order_count_growth_rate,
    n.buyer_count_growth_rate,
    n.refund_amount_growth_rate
  ) IS DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_order_count,
    e.curr_buyer_count,
    e.curr_refund_amount,
    e.prev_gmv,
    e.prev_order_count,
    e.prev_buyer_count,
    e.prev_refund_amount,
    e.gmv_growth_rate,
    e.order_count_growth_rate,
    e.buyer_count_growth_rate,
    e.refund_amount_growth_rate
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_ads_all_trade_week_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_ads_all_trade_week_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_ads_all_trade_week_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_ads_all_trade_week_new n
  JOIN tmp_ads_all_trade_week_existing e
    ON e.week_period = n.week_period
  WHERE ROW(
    n.curr_gmv,
    n.curr_order_count,
    n.curr_buyer_count,
    n.curr_refund_amount,
    n.prev_gmv,
    n.prev_order_count,
    n.prev_buyer_count,
    n.prev_refund_amount,
    n.gmv_growth_rate,
    n.order_count_growth_rate,
    n.buyer_count_growth_rate,
    n.refund_amount_growth_rate
  ) IS NOT DISTINCT FROM ROW(
    e.curr_gmv,
    e.curr_order_count,
    e.curr_buyer_count,
    e.curr_refund_amount,
    e.prev_gmv,
    e.prev_order_count,
    e.prev_buyer_count,
    e.prev_refund_amount,
    e.gmv_growth_rate,
    e.order_count_growth_rate,
    e.buyer_count_growth_rate,
    e.refund_amount_growth_rate
  );

  DELETE FROM ads.all_trade_week t
  USING tmp_ads_all_trade_week_deleted d
  WHERE t.week_period = d.week_period;

  UPDATE ads.all_trade_week t
  SET
    curr_gmv = u.curr_gmv,
    curr_order_count = u.curr_order_count,
    curr_buyer_count = u.curr_buyer_count,
    curr_refund_amount = u.curr_refund_amount,
    prev_gmv = u.prev_gmv,
    prev_order_count = u.prev_order_count,
    prev_buyer_count = u.prev_buyer_count,
    prev_refund_amount = u.prev_refund_amount,
    gmv_growth_rate = u.gmv_growth_rate,
    order_count_growth_rate = u.order_count_growth_rate,
    buyer_count_growth_rate = u.buyer_count_growth_rate,
    refund_amount_growth_rate = u.refund_amount_growth_rate
  FROM tmp_ads_all_trade_week_updated u
  WHERE t.week_period = u.week_period;

  INSERT INTO ads.all_trade_week (
    week_period,
    curr_gmv,
    curr_order_count,
    curr_buyer_count,
    curr_refund_amount,
    prev_gmv,
    prev_order_count,
    prev_buyer_count,
    prev_refund_amount,
    gmv_growth_rate,
    order_count_growth_rate,
    buyer_count_growth_rate,
    refund_amount_growth_rate
  )
  SELECT
    week_period,
    curr_gmv,
    curr_order_count,
    curr_buyer_count,
    curr_refund_amount,
    prev_gmv,
    prev_order_count,
    prev_buyer_count,
    prev_refund_amount,
    gmv_growth_rate,
    order_count_growth_rate,
    buyer_count_growth_rate,
    refund_amount_growth_rate
  FROM tmp_ads_all_trade_week_inserted;

  RAISE NOTICE 'refresh_all_trade_week completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows,
    v_updated_rows,
    v_deleted_rows,
    v_unchanged_rows,
    v_effective_start,
    v_effective_end;

  FOR v_insert_detail IN
    SELECT
      week_period,
      curr_gmv,
      gmv_growth_rate
    FROM tmp_ads_all_trade_week_inserted
    ORDER BY week_period
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: week_period=%, curr_gmv=%, gmv_growth_rate=%',
      v_insert_detail.week_period,
      v_insert_detail.curr_gmv,
      v_insert_detail.gmv_growth_rate;
  END LOOP;

  IF v_inserted_rows > v_detail_limit THEN
    RAISE NOTICE 'insert detail truncated, shown %, total %', v_detail_limit, v_inserted_rows;
  END IF;

  FOR v_update_detail IN
    SELECT
      week_period,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_curr_gmv IS DISTINCT FROM curr_gmv THEN format('curr_gmv:%s->%s', COALESCE(old_curr_gmv::TEXT, 'NULL'), COALESCE(curr_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_gmv_growth_rate IS DISTINCT FROM gmv_growth_rate THEN format('gmv_growth_rate:%s->%s', COALESCE(old_gmv_growth_rate::TEXT, 'NULL'), COALESCE(gmv_growth_rate::TEXT, 'NULL')) END
      ), '') AS change_summary
    FROM tmp_ads_all_trade_week_updated
    ORDER BY week_period
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: week_period=%, changes=%',
      v_update_detail.week_period,
      COALESCE(v_update_detail.change_summary, '无字段变化');
  END LOOP;

  IF v_updated_rows > v_detail_limit THEN
    RAISE NOTICE 'update detail truncated, shown %, total %', v_detail_limit, v_updated_rows;
  END IF;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_week(DATE, DATE)
IS '按周窗口刷新ADS全渠道周汇总结果，仅对真实新增/更新/删除数据落表。';

CREATE TABLE etl.all_trade_week_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_dws_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_all_trade_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.all_trade_week_refresh_state IS 'ADS全渠道周汇总增量刷新水位状态表。';
COMMENT ON COLUMN etl.all_trade_week_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.all_trade_week_refresh_state.last_dws_updated_at IS '最近一次已处理的DWS日汇总更新时间水位。';
COMMENT ON COLUMN etl.all_trade_week_refresh_state.last_refresh_at IS '最近一次ADS刷新执行时间。';
COMMENT ON COLUMN etl.all_trade_week_refresh_state.last_refresh_start_date IS '最近一次ADS刷新窗口起始日期。';
COMMENT ON COLUMN etl.all_trade_week_refresh_state.last_refresh_end_date IS '最近一次ADS刷新窗口结束日期。';

INSERT INTO etl.all_trade_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_all_trade_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_dws_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_start_date DATE;
  v_source_end_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('dws.all_trade_sale_daily') IS NULL THEN
    RAISE EXCEPTION 'source table dws.all_trade_sale_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_week does not exist';
  END IF;

  INSERT INTO etl.all_trade_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_dws_updated_at
  INTO v_last_dws_updated_at
  FROM etl.all_trade_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_source_max_updated_at
  FROM dws.all_trade_sale_daily;

  IF p_init_watermark_only THEN
    IF v_source_max_updated_at IS NULL THEN
      RAISE NOTICE 'init watermark skipped, source table has no data';
      RETURN;
    END IF;

    UPDATE etl.all_trade_week_refresh_state
    SET
      last_dws_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_dws_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN("date"),
    MAX("date"),
    MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO
    v_source_start_date,
    v_source_end_date,
    v_source_max_updated_at
  FROM dws.all_trade_sale_daily
  WHERE COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_dws_updated_at;

  IF v_source_start_date IS NULL OR v_source_end_date IS NULL THEN
    RAISE NOTICE 'no DWS updates since %, skipped', v_last_dws_updated_at;
    RETURN;
  END IF;

  v_refresh_start_date := v_source_start_date;
  v_refresh_end_date := v_source_end_date;
  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

  IF v_refresh_start_date > v_fallback_start_date THEN
    v_refresh_start_date := v_fallback_start_date;
  END IF;

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_refresh_end_date;
  END IF;

  CALL ads.refresh_all_trade_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.all_trade_week_refresh_state
  SET
    last_dws_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], source_max_updated_at %',
    v_refresh_start_date,
    v_refresh_end_date,
    v_source_max_updated_at;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_week_incremental(INTEGER, BOOLEAN)
IS 'ADS全渠道周汇总增量刷新：基于DWS日汇总更新时间水位进行增量计算。';

CALL ads.refresh_all_trade_week(NULL, NULL);
CALL ads.refresh_all_trade_week_incremental(14, TRUE);

COMMIT;
