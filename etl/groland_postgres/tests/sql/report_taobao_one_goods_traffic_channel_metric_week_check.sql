DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.report_taobao_one_goods_traffic_channel_metric_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_taobao_one_goods_traffic_channel_metric_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE platform <> 'taobao';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'platform check failed, non-taobao rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE gmv_delta <> ROUND((curr_pay_amount - prev_pay_amount), 2);

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'gmv_delta consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE curr_impression_count > 0
    AND curr_ctr IS NOT NULL
    AND ABS(curr_ctr - ROUND((curr_click_count::NUMERIC / curr_impression_count), 6)) > 0.000002;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_ctr consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE curr_click_count > 0
    AND curr_click_to_cart_rate IS NOT NULL
    AND ABS(curr_click_to_cart_rate - ROUND((curr_cart_count::NUMERIC / curr_click_count), 6)) > 0.000002;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_click_to_cart_rate consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE curr_cart_count > 0
    AND curr_cart_to_pay_rate IS NOT NULL
    AND ABS(curr_cart_to_pay_rate - ROUND((curr_pay_buyer_count::NUMERIC / curr_cart_count), 6)) > 0.000002;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_cart_to_pay_rate consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE curr_pay_buyer_count > 0
    AND curr_avg_order_value IS NOT NULL
    AND ABS(curr_avg_order_value - ROUND((curr_pay_amount / curr_pay_buyer_count), 2)) > 0.01;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_avg_order_value consistency failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_taobao_one_goods_traffic_channel_metric_week
  WHERE curr_cost > 0
    AND curr_roi IS NOT NULL
    AND ABS(curr_roi - ROUND((curr_pay_amount / curr_cost), 6)) > 0.00001;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'curr_roi consistency failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'report_taobao_one_goods_traffic_channel_metric_week checks passed';
END;
$$;
