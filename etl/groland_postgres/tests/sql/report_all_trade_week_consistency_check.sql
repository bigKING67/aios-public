DO $$
DECLARE
  v_ambiguous_columns INTEGER;
  v_mismatch_rows INTEGER;
BEGIN
  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview not found';
  END IF;

  IF to_regclass('ads.report_all_trade_week') IS NULL THEN
    RAISE EXCEPTION 'view ads.report_all_trade_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_ambiguous_columns
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'report_all_trade_week'
    AND column_name IN (
      'curr_refund_amount',
      'prev_refund_amount',
      'curr_refund_sync',
      'prev_refund_sync',
      'refund_amount_growth_rate'
    );

  IF v_ambiguous_columns > 0 THEN
    RAISE EXCEPTION 'ads.report_all_trade_week contains ambiguous refund columns, count: %', v_ambiguous_columns;
  END IF;

  SELECT COUNT(*)
  INTO v_mismatch_rows
  FROM (
    WITH expected AS (
      SELECT
        ads.report_week_period(ads.report_week_start("date")) AS week_period,
        MAX("date")::DATE AS as_of_date,
        LEAST(
          GREATEST((MAX("date")::DATE - ads.report_week_start("date") + 1), 1),
          7
        )::INTEGER AS observed_days,
        COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS curr_gmv,
        COALESCE(SUM(order_count), 0)::BIGINT AS curr_order_count,
        COALESCE(SUM(buyer_count), 0)::BIGINT AS curr_buyer_count,
        COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS curr_refund_amount_refund_time,
        COALESCE(SUM(COALESCE(refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS curr_refund_amount_pay_time
      FROM ads.all_trade_overview
      GROUP BY ads.report_week_start("date")
    )
    SELECT COALESCE(r.week_period, e.week_period) AS week_period
    FROM ads.report_all_trade_week r
    FULL JOIN expected e ON e.week_period = r.week_period
    WHERE r.week_period IS NULL
       OR e.week_period IS NULL
       OR r.as_of_date IS DISTINCT FROM e.as_of_date
       OR r.observed_days IS DISTINCT FROM e.observed_days
       OR ABS(COALESCE(r.curr_gmv, 0) - COALESCE(e.curr_gmv, 0)) > 0.01
       OR COALESCE(r.curr_order_count, 0) <> COALESCE(e.curr_order_count, 0)
       OR COALESCE(r.curr_buyer_count, 0) <> COALESCE(e.curr_buyer_count, 0)
       OR ABS(COALESCE(r.curr_refund_amount_refund_time, 0) - COALESCE(e.curr_refund_amount_refund_time, 0)) > 0.01
       OR ABS(COALESCE(r.curr_refund_amount_pay_time, 0) - COALESCE(e.curr_refund_amount_pay_time, 0)) > 0.01
  ) t;

  IF v_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'report_all_trade_week vs all_trade_overview consistency failed, rows: %', v_mismatch_rows;
  END IF;

  RAISE NOTICE 'report_all_trade_week consistency checks passed';
END;
$$;
