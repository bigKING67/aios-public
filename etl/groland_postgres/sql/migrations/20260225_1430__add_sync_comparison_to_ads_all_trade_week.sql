BEGIN;

ALTER TABLE ads.all_trade_week
ADD COLUMN IF NOT EXISTS as_of_date DATE,
ADD COLUMN IF NOT EXISTS observed_days SMALLINT,
ADD COLUMN IF NOT EXISTS curr_gmv_sync NUMERIC(18, 2),
ADD COLUMN IF NOT EXISTS prev_gmv_sync NUMERIC(18, 2),
ADD COLUMN IF NOT EXISTS curr_order_sync BIGINT,
ADD COLUMN IF NOT EXISTS prev_order_sync BIGINT,
ADD COLUMN IF NOT EXISTS curr_buyer_sync BIGINT,
ADD COLUMN IF NOT EXISTS prev_buyer_sync BIGINT,
ADD COLUMN IF NOT EXISTS curr_refund_sync NUMERIC(18, 2),
ADD COLUMN IF NOT EXISTS prev_refund_sync NUMERIC(18, 2);

COMMENT ON COLUMN ads.all_trade_week.as_of_date IS '同期口径截止日期（当前周按数据水位对齐到该日期）';
COMMENT ON COLUMN ads.all_trade_week.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1，范围 1-7）';
COMMENT ON COLUMN ads.all_trade_week.curr_gmv_sync IS '本周同期窗口 GMV 累计值';
COMMENT ON COLUMN ads.all_trade_week.prev_gmv_sync IS '上周同期窗口 GMV 累计值（向前平移 7 天）';
COMMENT ON COLUMN ads.all_trade_week.curr_order_sync IS '本周同期窗口订单数累计值';
COMMENT ON COLUMN ads.all_trade_week.prev_order_sync IS '上周同期窗口订单数累计值（向前平移 7 天）';
COMMENT ON COLUMN ads.all_trade_week.curr_buyer_sync IS '本周同期窗口买家数累计值';
COMMENT ON COLUMN ads.all_trade_week.prev_buyer_sync IS '上周同期窗口买家数累计值（向前平移 7 天）';
COMMENT ON COLUMN ads.all_trade_week.curr_refund_sync IS '本周同期窗口退款金额累计值';
COMMENT ON COLUMN ads.all_trade_week.prev_refund_sync IS '上周同期窗口退款金额累计值（向前平移 7 天）';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ads.all_trade_week'::regclass
      AND conname = 'chk_observed_days_range'
  ) THEN
    ALTER TABLE ads.all_trade_week
    ADD CONSTRAINT chk_observed_days_range
    CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7);
  END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_data_max_date DATE;
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
    COALESCE(p_end_date, MAX("date")),
    MAX("date")
  INTO v_start_date, v_end_date, v_data_max_date
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
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_daily') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_daily';
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
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  -- 先按天聚合，后续周/同期指标都基于该临时表，减少重复扫描
  CREATE TEMP TABLE tmp_ads_all_trade_week_daily ON COMMIT DROP AS
  SELECT
    src."date"::DATE AS trade_date,
    SUM(COALESCE(src.gmv, 0))::NUMERIC(18, 2) AS gmv,
    SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
    SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
    SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
  FROM dws.all_trade_sale_daily src
  WHERE src."date" BETWEEN (v_effective_start - 7) AND v_effective_end
  GROUP BY src."date"::DATE;

  CREATE TEMP TABLE tmp_ads_all_trade_week_new ON COMMIT DROP AS
  WITH week_base AS (
    SELECT
      ws.week_period,
      ws.week_start,
      ws.week_end,
      LEAST(ws.week_end, v_data_max_date) AS as_of_date
    FROM tmp_ads_all_trade_week_scope ws
    WHERE EXISTS (
      SELECT 1
      FROM tmp_ads_all_trade_week_daily d
      WHERE d.trade_date BETWEEN ws.week_start AND ws.week_end
    )
  ),
  week_metrics AS (
    SELECT
      wb.week_period,
      wb.week_start,
      wb.week_end,
      wb.as_of_date,
      (wb.as_of_date - wb.week_start + 1)::SMALLINT AS observed_days,
      COALESCE(SUM(d.gmv) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.week_end), 0)::NUMERIC(18, 2) AS curr_gmv,
      COALESCE(SUM(d.order_count) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.week_end), 0)::INTEGER AS curr_order_count,
      COALESCE(SUM(d.buyer_count) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.week_end), 0)::INTEGER AS curr_buyer_count,
      COALESCE(SUM(d.refund_amount) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.week_end), 0)::NUMERIC(18, 2) AS curr_refund_amount,
      COALESCE(SUM(d.gmv) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.week_start - 1)), 0)::NUMERIC(18, 2) AS prev_gmv,
      COALESCE(SUM(d.order_count) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.week_start - 1)), 0)::INTEGER AS prev_order_count,
      COALESCE(SUM(d.buyer_count) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.week_start - 1)), 0)::INTEGER AS prev_buyer_count,
      COALESCE(SUM(d.refund_amount) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.week_start - 1)), 0)::NUMERIC(18, 2) AS prev_refund_amount,
      COALESCE(SUM(d.gmv) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.as_of_date), 0)::NUMERIC(18, 2) AS curr_gmv_sync,
      COALESCE(SUM(d.gmv) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_gmv_sync,
      COALESCE(SUM(d.order_count) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.as_of_date), 0)::BIGINT AS curr_order_sync,
      COALESCE(SUM(d.order_count) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.as_of_date - 7)), 0)::BIGINT AS prev_order_sync,
      COALESCE(SUM(d.buyer_count) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.as_of_date), 0)::BIGINT AS curr_buyer_sync,
      COALESCE(SUM(d.buyer_count) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.as_of_date - 7)), 0)::BIGINT AS prev_buyer_sync,
      COALESCE(SUM(d.refund_amount) FILTER (WHERE d.trade_date BETWEEN wb.week_start AND wb.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_sync,
      COALESCE(SUM(d.refund_amount) FILTER (WHERE d.trade_date BETWEEN (wb.week_start - 7) AND (wb.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_sync
    FROM week_base wb
    LEFT JOIN tmp_ads_all_trade_week_daily d
      ON d.trade_date BETWEEN (wb.week_start - 7) AND wb.week_end
    GROUP BY wb.week_period, wb.week_start, wb.week_end, wb.as_of_date
  )
  SELECT
    wm.week_period,
    wm.curr_gmv,
    wm.curr_order_count,
    wm.curr_buyer_count,
    wm.curr_refund_amount,
    wm.prev_gmv,
    wm.prev_order_count,
    wm.prev_buyer_count,
    wm.prev_refund_amount,
    CASE
      WHEN COALESCE(wm.prev_gmv, 0) > 0 THEN ROUND(((wm.curr_gmv - wm.prev_gmv) / wm.prev_gmv), 4)
      ELSE NULL
    END AS gmv_growth_rate,
    CASE
      WHEN COALESCE(wm.prev_order_count, 0) > 0 THEN ROUND(((wm.curr_order_count - wm.prev_order_count)::NUMERIC / wm.prev_order_count), 4)
      ELSE NULL
    END AS order_count_growth_rate,
    CASE
      WHEN COALESCE(wm.prev_buyer_count, 0) > 0 THEN ROUND(((wm.curr_buyer_count - wm.prev_buyer_count)::NUMERIC / wm.prev_buyer_count), 4)
      ELSE NULL
    END AS buyer_count_growth_rate,
    CASE
      WHEN COALESCE(wm.prev_refund_amount, 0) > 0 THEN ROUND(((wm.curr_refund_amount - wm.prev_refund_amount) / wm.prev_refund_amount), 4)
      ELSE NULL
    END AS refund_amount_growth_rate,
    wm.as_of_date,
    wm.observed_days,
    wm.curr_gmv_sync,
    wm.prev_gmv_sync,
    wm.curr_order_sync,
    wm.prev_order_sync,
    wm.curr_buyer_sync,
    wm.prev_buyer_sync,
    wm.curr_refund_sync,
    wm.prev_refund_sync
  FROM week_metrics wm;

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
    n.as_of_date,
    n.observed_days,
    n.curr_gmv_sync,
    n.prev_gmv_sync,
    n.curr_order_sync,
    n.prev_order_sync,
    n.curr_buyer_sync,
    n.prev_buyer_sync,
    n.curr_refund_sync,
    n.prev_refund_sync,
    e.curr_gmv AS old_curr_gmv,
    e.gmv_growth_rate AS old_gmv_growth_rate,
    e.as_of_date AS old_as_of_date,
    e.observed_days AS old_observed_days,
    e.curr_gmv_sync AS old_curr_gmv_sync,
    e.prev_gmv_sync AS old_prev_gmv_sync
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
    n.refund_amount_growth_rate,
    n.as_of_date,
    n.observed_days,
    n.curr_gmv_sync,
    n.prev_gmv_sync,
    n.curr_order_sync,
    n.prev_order_sync,
    n.curr_buyer_sync,
    n.prev_buyer_sync,
    n.curr_refund_sync,
    n.prev_refund_sync
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
    e.refund_amount_growth_rate,
    e.as_of_date,
    e.observed_days,
    e.curr_gmv_sync,
    e.prev_gmv_sync,
    e.curr_order_sync,
    e.prev_order_sync,
    e.curr_buyer_sync,
    e.prev_buyer_sync,
    e.curr_refund_sync,
    e.prev_refund_sync
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
    n.refund_amount_growth_rate,
    n.as_of_date,
    n.observed_days,
    n.curr_gmv_sync,
    n.prev_gmv_sync,
    n.curr_order_sync,
    n.prev_order_sync,
    n.curr_buyer_sync,
    n.prev_buyer_sync,
    n.curr_refund_sync,
    n.prev_refund_sync
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
    e.refund_amount_growth_rate,
    e.as_of_date,
    e.observed_days,
    e.curr_gmv_sync,
    e.prev_gmv_sync,
    e.curr_order_sync,
    e.prev_order_sync,
    e.curr_buyer_sync,
    e.prev_buyer_sync,
    e.curr_refund_sync,
    e.prev_refund_sync
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
    refund_amount_growth_rate = u.refund_amount_growth_rate,
    as_of_date = u.as_of_date,
    observed_days = u.observed_days,
    curr_gmv_sync = u.curr_gmv_sync,
    prev_gmv_sync = u.prev_gmv_sync,
    curr_order_sync = u.curr_order_sync,
    prev_order_sync = u.prev_order_sync,
    curr_buyer_sync = u.curr_buyer_sync,
    prev_buyer_sync = u.prev_buyer_sync,
    curr_refund_sync = u.curr_refund_sync,
    prev_refund_sync = u.prev_refund_sync
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
    refund_amount_growth_rate,
    as_of_date,
    observed_days,
    curr_gmv_sync,
    prev_gmv_sync,
    curr_order_sync,
    prev_order_sync,
    curr_buyer_sync,
    prev_buyer_sync,
    curr_refund_sync,
    prev_refund_sync
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
    refund_amount_growth_rate,
    as_of_date,
    observed_days,
    curr_gmv_sync,
    prev_gmv_sync,
    curr_order_sync,
    prev_order_sync,
    curr_buyer_sync,
    prev_buyer_sync,
    curr_refund_sync,
    prev_refund_sync
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
      curr_gmv_sync,
      as_of_date
    FROM tmp_ads_all_trade_week_inserted
    ORDER BY week_period
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: week_period=%, curr_gmv=%, curr_gmv_sync=%, as_of_date=%',
      v_insert_detail.week_period,
      v_insert_detail.curr_gmv,
      v_insert_detail.curr_gmv_sync,
      v_insert_detail.as_of_date;
  END LOOP;

  IF v_inserted_rows > v_detail_limit THEN
    RAISE NOTICE 'insert detail truncated, shown %, total %', v_detail_limit, v_inserted_rows;
  END IF;

  FOR v_update_detail IN
    SELECT
      week_period,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_curr_gmv IS DISTINCT FROM curr_gmv THEN format('curr_gmv:%s->%s', COALESCE(old_curr_gmv::TEXT, 'NULL'), COALESCE(curr_gmv::TEXT, 'NULL')) END,
        CASE WHEN old_gmv_growth_rate IS DISTINCT FROM gmv_growth_rate THEN format('gmv_growth_rate:%s->%s', COALESCE(old_gmv_growth_rate::TEXT, 'NULL'), COALESCE(gmv_growth_rate::TEXT, 'NULL')) END,
        CASE WHEN old_as_of_date IS DISTINCT FROM as_of_date THEN format('as_of_date:%s->%s', COALESCE(old_as_of_date::TEXT, 'NULL'), COALESCE(as_of_date::TEXT, 'NULL')) END,
        CASE WHEN old_observed_days IS DISTINCT FROM observed_days THEN format('observed_days:%s->%s', COALESCE(old_observed_days::TEXT, 'NULL'), COALESCE(observed_days::TEXT, 'NULL')) END,
        CASE WHEN old_curr_gmv_sync IS DISTINCT FROM curr_gmv_sync THEN format('curr_gmv_sync:%s->%s', COALESCE(old_curr_gmv_sync::TEXT, 'NULL'), COALESCE(curr_gmv_sync::TEXT, 'NULL')) END,
        CASE WHEN old_prev_gmv_sync IS DISTINCT FROM prev_gmv_sync THEN format('prev_gmv_sync:%s->%s', COALESCE(old_prev_gmv_sync::TEXT, 'NULL'), COALESCE(prev_gmv_sync::TEXT, 'NULL')) END
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
IS '按周窗口刷新 ADS 全渠道周汇总，包含同期窗口字段（as_of_date、observed_days、*_sync）。';

CALL ads.refresh_all_trade_week(NULL, NULL);

COMMIT;
