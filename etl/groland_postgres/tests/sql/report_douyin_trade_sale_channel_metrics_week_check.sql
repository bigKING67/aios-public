DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.report_douyin_trade_sale_channel_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'table ads.report_douyin_trade_sale_channel_metrics_week not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_channel_metrics_week
  WHERE channel_type NOT IN ('live', 'shortvideo', 'card');

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'channel_type check failed, invalid rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_channel_metrics_week
  WHERE curr_gmv < 0
     OR prev_gmv < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'gmv should not be negative, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.report_douyin_trade_sale_channel_metrics_week
  WHERE as_of_date IS NULL
     OR observed_days IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'sync scope fields missing (as_of_date/observed_days), rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'report_douyin_trade_sale_channel_metrics_week checks passed';
END;
$$;
