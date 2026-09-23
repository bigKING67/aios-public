DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.report_taobao_goods_traffic_channel_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_taobao_goods_traffic_channel_metrics_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_goods_traffic_channel_metrics_week
  WHERE platform <> 'taobao';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'platform check failed, non-taobao rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_goods_traffic_channel_metrics_week
  WHERE curr_pay_amount < 0
     OR prev_pay_amount < 0
     OR curr_pay_buyer_count < 0
     OR prev_pay_buyer_count < 0
     OR curr_visitor_count < 0
     OR prev_visitor_count < 0
     OR curr_cart_buyer_count < 0
     OR prev_cart_buyer_count < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'non-negative metric check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_goods_traffic_channel_metrics_week
  WHERE curr_visitor_count > 0
    AND curr_pay_conversion_rate IS NOT NULL
    AND ABS(curr_pay_conversion_rate - ROUND((curr_pay_buyer_count::NUMERIC / curr_visitor_count), 4)) > 0.0002;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_pay_conversion_rate consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_goods_traffic_channel_metrics_week
  WHERE curr_visitor_count > 0
    AND curr_cart_rate IS NOT NULL
    AND ABS(curr_cart_rate - ROUND((curr_cart_buyer_count::NUMERIC / curr_visitor_count), 4)) > 0.0002;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_cart_rate consistency failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'report_taobao_goods_traffic_channel_metrics_week checks passed';
END;
$$;
