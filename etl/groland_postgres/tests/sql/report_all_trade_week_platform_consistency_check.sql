DO $$
DECLARE
  v_ambiguous_columns INTEGER;
  v_week_meta_inconsistent_rows INTEGER;
  v_overview_mismatch_rows INTEGER;
  v_sync_sum_mismatch_rows INTEGER;
BEGIN
  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview not found';
  END IF;

  IF to_regclass('ads.report_all_trade_week') IS NULL THEN
    RAISE EXCEPTION 'view ads.report_all_trade_week not found';
  END IF;

  IF to_regclass('ads.report_all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'view ads.report_all_trade_week_platform not found';
  END IF;

  SELECT COUNT(*)
  INTO v_ambiguous_columns
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'report_all_trade_week_platform'
    AND column_name IN (
      'curr_refund_amount',
      'prev_refund_amount',
      'curr_refund_sync',
      'prev_refund_sync',
      'refund_amount_growth_rate'
    );

  IF v_ambiguous_columns > 0 THEN
    RAISE EXCEPTION 'ads.report_all_trade_week_platform contains ambiguous refund columns, count: %', v_ambiguous_columns;
  END IF;

  -- A. report_all_trade_week_platform 必须与 overview 按周+平台聚合一致。
  SELECT COUNT(*)
  INTO v_overview_mismatch_rows
  FROM (
    WITH expected AS (
      SELECT
        ads.report_week_period(ads.report_week_start("date")) AS week_period,
        platform,
        COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS curr_gmv,
        COALESCE(SUM(order_count), 0)::BIGINT AS curr_order_count,
        COALESCE(SUM(buyer_count), 0)::BIGINT AS curr_buyer_count,
        COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS curr_refund_amount_refund_time,
        COALESCE(SUM(COALESCE(refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS curr_refund_amount_pay_time
      FROM ads.all_trade_overview
      GROUP BY ads.report_week_start("date"), platform
    )
    SELECT
      COALESCE(p.week_period, e.week_period) AS week_period,
      COALESCE(p.platform, e.platform) AS platform
    FROM ads.report_all_trade_week_platform p
    FULL JOIN expected e
      ON e.week_period = p.week_period
     AND e.platform = p.platform
    WHERE p.week_period IS NULL
       OR e.week_period IS NULL
       OR p.platform IS NULL
       OR e.platform IS NULL
       OR ABS(COALESCE(p.curr_gmv, 0) - COALESCE(e.curr_gmv, 0)) > 0.01
       OR COALESCE(p.curr_order_count, 0) <> COALESCE(e.curr_order_count, 0)
       OR COALESCE(p.curr_buyer_count, 0) <> COALESCE(e.curr_buyer_count, 0)
       OR ABS(COALESCE(p.curr_refund_amount_refund_time, 0) - COALESCE(e.curr_refund_amount_refund_time, 0)) > 0.01
       OR ABS(COALESCE(p.curr_refund_amount_pay_time, 0) - COALESCE(e.curr_refund_amount_pay_time, 0)) > 0.01
  ) t;

  IF v_overview_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'report_all_trade_week_platform vs all_trade_overview consistency failed for % rows', v_overview_mismatch_rows;
  END IF;

  -- B. 同一 week_period 下 observed_days / as_of_date 必须一致，避免各平台同期窗口漂移。
  SELECT COUNT(*)
  INTO v_week_meta_inconsistent_rows
  FROM (
    SELECT
      p.week_period
    FROM ads.report_all_trade_week_platform p
    GROUP BY p.week_period
    HAVING MIN(p.observed_days) <> MAX(p.observed_days)
       OR COUNT(DISTINCT p.as_of_date) <> 1
  ) t;

  IF v_week_meta_inconsistent_rows > 0 THEN
    RAISE EXCEPTION 'week-level observed_days/as_of_date consistency failed for % periods', v_week_meta_inconsistent_rows;
  END IF;

  -- C. 平台同期汇总必须与 ads.report_all_trade_week 一致。
  SELECT COUNT(*)
  INTO v_sync_sum_mismatch_rows
  FROM (
    SELECT
      w.week_period
    FROM ads.report_all_trade_week w
    JOIN (
      SELECT
        p.week_period,
        SUM(p.curr_gmv_sync) AS sum_curr_gmv_sync,
        SUM(p.prev_gmv_sync) AS sum_prev_gmv_sync,
        SUM(p.curr_order_sync) AS sum_curr_order_sync,
        SUM(p.prev_order_sync) AS sum_prev_order_sync,
        SUM(p.curr_buyer_sync) AS sum_curr_buyer_sync,
        SUM(p.prev_buyer_sync) AS sum_prev_buyer_sync,
        SUM(p.curr_refund_amount_refund_time_sync) AS sum_curr_refund_amount_refund_time_sync,
        SUM(p.prev_refund_amount_refund_time_sync) AS sum_prev_refund_amount_refund_time_sync,
        SUM(p.curr_refund_amount_pay_time_sync) AS sum_curr_refund_amount_pay_time_sync,
        SUM(p.prev_refund_amount_pay_time_sync) AS sum_prev_refund_amount_pay_time_sync
      FROM ads.report_all_trade_week_platform p
      GROUP BY p.week_period
    ) ps
      ON ps.week_period = w.week_period
    WHERE
      ABS(COALESCE(w.curr_gmv_sync, 0) - COALESCE(ps.sum_curr_gmv_sync, 0)) > 0.01
      OR ABS(COALESCE(w.prev_gmv_sync, 0) - COALESCE(ps.sum_prev_gmv_sync, 0)) > 0.01
      OR COALESCE(w.curr_order_sync, 0) <> COALESCE(ps.sum_curr_order_sync, 0)
      OR COALESCE(w.prev_order_sync, 0) <> COALESCE(ps.sum_prev_order_sync, 0)
      OR COALESCE(w.curr_buyer_sync, 0) <> COALESCE(ps.sum_curr_buyer_sync, 0)
      OR COALESCE(w.prev_buyer_sync, 0) <> COALESCE(ps.sum_prev_buyer_sync, 0)
      OR ABS(COALESCE(w.curr_refund_amount_refund_time_sync, 0) - COALESCE(ps.sum_curr_refund_amount_refund_time_sync, 0)) > 0.01
      OR ABS(COALESCE(w.prev_refund_amount_refund_time_sync, 0) - COALESCE(ps.sum_prev_refund_amount_refund_time_sync, 0)) > 0.01
      OR ABS(COALESCE(w.curr_refund_amount_pay_time_sync, 0) - COALESCE(ps.sum_curr_refund_amount_pay_time_sync, 0)) > 0.01
      OR ABS(COALESCE(w.prev_refund_amount_pay_time_sync, 0) - COALESCE(ps.sum_prev_refund_amount_pay_time_sync, 0)) > 0.01
  ) t;

  IF v_sync_sum_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'platform sync aggregate reconciliation failed for % periods', v_sync_sum_mismatch_rows;
  END IF;

  RAISE NOTICE 'report_all_trade_week_platform consistency checks passed';
END;
$$;
