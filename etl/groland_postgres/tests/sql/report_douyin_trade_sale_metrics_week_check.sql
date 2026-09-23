DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.report_douyin_trade_sale_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_douyin_trade_sale_metrics_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_metrics_week
  WHERE as_of_date IS NULL
     OR observed_days IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'sync scope fields missing (as_of_date/observed_days), rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_metrics_week
  WHERE curr_user_pay_amount < 0
     OR prev_user_pay_amount < 0
     OR curr_order_count < 0
     OR prev_order_count < 0
     OR curr_buyer_count < 0
     OR prev_buyer_count < 0
     OR curr_exposure_user_count < 0
     OR prev_exposure_user_count < 0
     OR curr_click_user_count < 0
     OR prev_click_user_count < 0
     OR curr_exposure_count < 0
     OR prev_exposure_count < 0
     OR curr_click_count < 0
     OR prev_click_count < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'negative value check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_metrics_week
  WHERE (curr_pay_conversion_rate IS NOT NULL AND curr_pay_conversion_rate < 0)
     OR (prev_pay_conversion_rate IS NOT NULL AND prev_pay_conversion_rate < 0)
     OR (curr_click_rate IS NOT NULL AND curr_click_rate < 0)
     OR (prev_click_rate IS NOT NULL AND prev_click_rate < 0)
     OR (curr_click_to_pay_rate IS NOT NULL AND curr_click_to_pay_rate < 0)
     OR (prev_click_to_pay_rate IS NOT NULL AND prev_click_to_pay_rate < 0)
     OR (curr_refund_rate_pay_time IS NOT NULL AND curr_refund_rate_pay_time < 0)
     OR (prev_refund_rate_pay_time IS NOT NULL AND prev_refund_rate_pay_time < 0)
     OR (curr_uv_value IS NOT NULL AND curr_uv_value < 0)
     OR (prev_uv_value IS NOT NULL AND prev_uv_value < 0);

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'rate/uv non-negative check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_metrics_week
  WHERE curr_refund_rate_pay_time IS DISTINCT FROM
        CASE
          WHEN curr_user_pay_amount > 0 THEN ROUND(curr_refund_amount_pay_time / curr_user_pay_amount, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_refund_rate_pay_time IS DISTINCT FROM
        CASE
          WHEN prev_user_pay_amount > 0 THEN ROUND(prev_refund_amount_pay_time / prev_user_pay_amount, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR curr_click_rate IS DISTINCT FROM
        CASE
          WHEN curr_exposure_count > 0 THEN ROUND(curr_click_count::NUMERIC / curr_exposure_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_click_rate IS DISTINCT FROM
        CASE
          WHEN prev_exposure_count > 0 THEN ROUND(prev_click_count::NUMERIC / prev_exposure_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR curr_click_to_pay_rate IS DISTINCT FROM
        CASE
          WHEN curr_click_count > 0 THEN ROUND(curr_order_count::NUMERIC / curr_click_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_click_to_pay_rate IS DISTINCT FROM
        CASE
          WHEN prev_click_count > 0 THEN ROUND(prev_order_count::NUMERIC / prev_click_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR curr_pay_conversion_rate IS DISTINCT FROM
        CASE
          WHEN curr_exposure_user_count > 0 THEN ROUND(curr_buyer_count::NUMERIC / curr_exposure_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_pay_conversion_rate IS DISTINCT FROM
        CASE
          WHEN prev_exposure_user_count > 0 THEN ROUND(prev_buyer_count::NUMERIC / prev_exposure_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR curr_uv_value IS DISTINCT FROM
        CASE
          WHEN curr_exposure_user_count > 0 THEN ROUND(curr_user_pay_amount / curr_exposure_user_count::NUMERIC, 2)
          ELSE NULL::NUMERIC(18, 2)
        END
     OR prev_uv_value IS DISTINCT FROM
        CASE
          WHEN prev_exposure_user_count > 0 THEN ROUND(prev_user_pay_amount / prev_exposure_user_count::NUMERIC, 2)
          ELSE NULL::NUMERIC(18, 2)
        END;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ratio/value formula check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'report_douyin_trade_sale_metrics_week checks passed';
END;
$$;
