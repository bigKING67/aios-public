DO $$
DECLARE
  v_ambiguous_columns INTEGER;
  v_mismatch_rows INTEGER;
BEGIN
  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview not found';
  END IF;

  IF to_regclass('ads.report_all_trade_month') IS NULL THEN
    RAISE EXCEPTION 'view ads.report_all_trade_month not found';
  END IF;

  SELECT COUNT(*)
  INTO v_ambiguous_columns
  FROM information_schema.columns
  WHERE table_schema = 'ads'
    AND table_name = 'report_all_trade_month'
    AND column_name = 'refund_amount';

  IF v_ambiguous_columns > 0 THEN
    RAISE EXCEPTION 'ads.report_all_trade_month contains ambiguous refund columns, count: %', v_ambiguous_columns;
  END IF;

  SELECT COUNT(*)
  INTO v_mismatch_rows
  FROM (
    WITH expected AS (
      SELECT
        EXTRACT(YEAR FROM "date")::INTEGER AS year,
        EXTRACT(MONTH FROM "date")::INTEGER AS month,
        COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS gmv,
        COALESCE(SUM(order_count), 0)::BIGINT AS order_count,
        COALESCE(SUM(buyer_count), 0)::BIGINT AS buyer_count,
        COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
        COALESCE(SUM(COALESCE(refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_pay_time
      FROM ads.all_trade_overview
      GROUP BY EXTRACT(YEAR FROM "date")::INTEGER, EXTRACT(MONTH FROM "date")::INTEGER
    )
    SELECT
      COALESCE(r.year, e.year) AS year,
      COALESCE(r.month, e.month) AS month
    FROM ads.report_all_trade_month r
    FULL JOIN expected e
      ON e.year = r.year
     AND e.month = r.month
    WHERE r.year IS NULL
       OR e.year IS NULL
       OR ABS(COALESCE(r.gmv, 0) - COALESCE(e.gmv, 0)) > 0.01
       OR COALESCE(r.order_count, 0) <> COALESCE(e.order_count, 0)
       OR COALESCE(r.buyer_count, 0) <> COALESCE(e.buyer_count, 0)
       OR ABS(COALESCE(r.refund_amount_refund_time, 0) - COALESCE(e.refund_amount_refund_time, 0)) > 0.01
       OR ABS(COALESCE(r.refund_amount_pay_time, 0) - COALESCE(e.refund_amount_pay_time, 0)) > 0.01
  ) t;

  IF v_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'report_all_trade_month vs all_trade_overview consistency failed, rows: %', v_mismatch_rows;
  END IF;

  RAISE NOTICE 'report_all_trade_month consistency checks passed';
END;
$$;
