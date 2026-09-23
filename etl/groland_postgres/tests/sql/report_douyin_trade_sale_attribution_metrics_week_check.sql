DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.report_douyin_trade_sale_live_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_douyin_trade_sale_live_metrics_week not found';
  END IF;

  IF to_regclass('ads.report_douyin_trade_sale_shortvideo_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_douyin_trade_sale_shortvideo_metrics_week not found';
  END IF;

  IF to_regclass('ads.report_douyin_trade_sale_card_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_douyin_trade_sale_card_metrics_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_live_metrics_week
  WHERE as_of_date IS NULL
     OR observed_days IS NULL
     OR observed_days < 1
     OR observed_days > 7
     OR curr_live_gmv < 0
     OR prev_live_gmv < 0
     OR curr_live_exposure_user_count < 0
     OR curr_live_watch_user_count < 0
     OR curr_live_product_click_user < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'live weekly metrics check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_shortvideo_metrics_week
  WHERE as_of_date IS NULL
     OR observed_days IS NULL
     OR observed_days < 1
     OR observed_days > 7
     OR curr_user_pay_amount < 0
     OR prev_user_pay_amount < 0
     OR curr_video_view_count < 0
     OR prev_video_view_count < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'shortvideo weekly metrics check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_card_metrics_week
  WHERE as_of_date IS NULL
     OR observed_days IS NULL
     OR observed_days < 1
     OR observed_days > 7
     OR metric_scope NOT IN ('product', 'source')
     OR curr_card_user_pay_amount < 0
     OR prev_card_user_pay_amount < 0
     OR curr_card_exposure_user_count < 0
     OR curr_card_click_user_count < 0
     OR curr_card_buyer_count < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'card weekly metrics check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_card_metrics_week
  WHERE curr_card_click_rate IS DISTINCT FROM
        CASE
          WHEN curr_card_exposure_user_count > 0
            THEN ROUND(curr_card_click_user_count::NUMERIC / curr_card_exposure_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_card_click_rate IS DISTINCT FROM
        CASE
          WHEN prev_card_exposure_user_count > 0
            THEN ROUND(prev_card_click_user_count::NUMERIC / prev_card_exposure_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR curr_card_click_to_pay_rate IS DISTINCT FROM
        CASE
          WHEN curr_card_click_user_count > 0
            THEN ROUND(curr_card_buyer_count::NUMERIC / curr_card_click_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END
     OR prev_card_click_to_pay_rate IS DISTINCT FROM
        CASE
          WHEN prev_card_click_user_count > 0
            THEN ROUND(prev_card_buyer_count::NUMERIC / prev_card_click_user_count::NUMERIC, 4)
          ELSE NULL::NUMERIC(10, 4)
        END;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'card weekly ratio formula check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'report_douyin_trade_sale_attribution_metrics_week checks passed';
END;
$$;
