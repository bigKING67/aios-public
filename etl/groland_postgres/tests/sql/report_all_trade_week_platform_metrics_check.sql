DO $$
DECLARE
  v_missing_metric_rows INTEGER;
  v_meta_mismatch_rows INTEGER;
  v_formula_mismatch_rows INTEGER;
BEGIN
  IF to_regclass('ads.report_all_trade_week_platform_metrics') IS NULL THEN
    RAISE EXCEPTION 'target table ads.report_all_trade_week_platform_metrics does not exist';
  END IF;

  -- A. 所有天猫平台周汇总都必须有对应扩展指标行
  SELECT COUNT(*)
  INTO v_missing_metric_rows
  FROM ads.report_all_trade_week_platform p
  LEFT JOIN ads.report_all_trade_week_platform_metrics m
    ON m.week_period = p.week_period
   AND m.platform = p.platform
  WHERE p.platform = 'taobao'
    AND m.week_period IS NULL;

  IF v_missing_metric_rows > 0 THEN
    RAISE EXCEPTION 'missing metrics rows for taobao platform weeks: %', v_missing_metric_rows;
  END IF;

  -- B. as_of_date / observed_days 必须与基础平台周表对齐
  SELECT COUNT(*)
  INTO v_meta_mismatch_rows
  FROM ads.report_all_trade_week_platform_metrics m
  JOIN ads.report_all_trade_week_platform p
    ON p.week_period = m.week_period
   AND p.platform = m.platform
  WHERE m.platform = 'taobao'
    AND (
      COALESCE(m.as_of_date, DATE '1970-01-01') IS DISTINCT FROM COALESCE(p.as_of_date, DATE '1970-01-01')
      OR COALESCE(m.observed_days, -1) IS DISTINCT FROM COALESCE(p.observed_days, -1)
    );

  IF v_meta_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'as_of_date / observed_days mismatch rows: %', v_meta_mismatch_rows;
  END IF;

  -- C. 指标公式核对：支付转化率、UV价值、ROI
  SELECT COUNT(*)
  INTO v_formula_mismatch_rows
  FROM (
    SELECT
      m.week_period,
      m.curr_visitor_count,
      m.prev_visitor_count,
      m.curr_pay_conversion_rate,
      m.prev_pay_conversion_rate,
      m.curr_uv_value,
      m.prev_uv_value,
      m.curr_cost,
      m.prev_cost,
      m.curr_roi,
      m.prev_roi,
      CASE
        WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
          THEN p.curr_buyer_sync
        ELSE p.curr_buyer_count
      END::NUMERIC AS curr_buyer_used,
      CASE
        WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
          THEN p.prev_buyer_sync
        ELSE p.prev_buyer_count
      END::NUMERIC AS prev_buyer_used,
      CASE
        WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
          THEN p.curr_gmv_sync
        ELSE p.curr_gmv
      END::NUMERIC AS curr_gmv_used,
      CASE
        WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
          THEN p.prev_gmv_sync
        ELSE p.prev_gmv
      END::NUMERIC AS prev_gmv_used
    FROM ads.report_all_trade_week_platform_metrics m
    JOIN ads.report_all_trade_week_platform p
      ON p.week_period = m.week_period
     AND p.platform = m.platform
    WHERE m.platform = 'taobao'
  ) t
  WHERE
    (
      t.curr_visitor_count > 0
      AND ABS(
        COALESCE(t.curr_pay_conversion_rate, 0) - ROUND((t.curr_buyer_used / t.curr_visitor_count), 4)
      ) > 0.0001
    )
    OR
    (
      t.prev_visitor_count > 0
      AND ABS(
        COALESCE(t.prev_pay_conversion_rate, 0) - ROUND((t.prev_buyer_used / t.prev_visitor_count), 4)
      ) > 0.0001
    )
    OR
    (
      t.curr_visitor_count > 0
      AND ABS(
        COALESCE(t.curr_uv_value, 0) - ROUND((t.curr_gmv_used / t.curr_visitor_count), 2)
      ) > 0.01
    )
    OR
    (
      t.prev_visitor_count > 0
      AND ABS(
        COALESCE(t.prev_uv_value, 0) - ROUND((t.prev_gmv_used / t.prev_visitor_count), 2)
      ) > 0.01
    )
    OR
    (
      t.curr_cost > 0
      AND ABS(
        COALESCE(t.curr_roi, 0) - ROUND((t.curr_gmv_used / t.curr_cost), 4)
      ) > 0.0001
    )
    OR
    (
      t.prev_cost > 0
      AND ABS(
        COALESCE(t.prev_roi, 0) - ROUND((t.prev_gmv_used / t.prev_cost), 4)
      ) > 0.0001
    );

  IF v_formula_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'metric formula check failed for % rows', v_formula_mismatch_rows;
  END IF;

  RAISE NOTICE 'report_all_trade_week_platform_metrics checks passed';
END;
$$;
