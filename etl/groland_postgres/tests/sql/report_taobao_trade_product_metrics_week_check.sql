DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  IF to_regclass('ads.report_taobao_trade_product_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_taobao_trade_product_metrics_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM ads.report_taobao_trade_product_metrics_week
  WHERE platform <> 'taobao';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'platform check failed, non-taobao rows: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM ads.report_taobao_trade_product_metrics_week
  WHERE curr_visitor_count > 0
    AND curr_pay_conversion_rate IS NOT NULL
    AND ABS(curr_pay_conversion_rate - ROUND((curr_pay_buyer_count::NUMERIC / curr_visitor_count), 4)) > 0.0002;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'curr_pay_conversion_rate consistency failed, rows: %', v_missing;
  END IF;

  SELECT COUNT(*)
  INTO v_missing
  FROM ads.report_taobao_trade_product_metrics_week
  WHERE curr_pay_buyer_count > 0
    AND curr_avg_order_value IS NOT NULL
    AND ABS(curr_avg_order_value - ROUND((curr_gmv / curr_pay_buyer_count), 2)) > 0.01;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'curr_avg_order_value consistency failed, rows: %', v_missing;
  END IF;

  RAISE NOTICE 'report_taobao_trade_product_metrics_week checks passed';
END;
$$;
