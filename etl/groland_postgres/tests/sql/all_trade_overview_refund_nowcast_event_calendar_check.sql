DO $$
DECLARE
  v_invalid_range_rows INTEGER;
  v_invalid_multiplier_rows INTEGER;
  v_overlap_priority_rows INTEGER;
BEGIN
  IF to_regclass('ads.all_trade_overview_refund_nowcast_event_calendar') IS NULL THEN
    RAISE EXCEPTION
      'missing table: ads.all_trade_overview_refund_nowcast_event_calendar';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_range_rows
  FROM ads.all_trade_overview_refund_nowcast_event_calendar e
  WHERE e.start_date > e.end_date;

  IF v_invalid_range_rows > 0 THEN
    RAISE EXCEPTION
      'event calendar date range check failed, invalid rows: %',
      v_invalid_range_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_multiplier_rows
  FROM ads.all_trade_overview_refund_nowcast_event_calendar e
  WHERE e.prediction_multiplier <= 0
    OR e.prediction_multiplier > 3;

  IF v_invalid_multiplier_rows > 0 THEN
    RAISE EXCEPTION
      'event calendar multiplier check failed, invalid rows: %',
      v_invalid_multiplier_rows;
  END IF;

  -- 同平台 + 同优先级 + 时间区间重叠会造成规则判读不透明，提前拦截。
  SELECT COUNT(*)
  INTO v_overlap_priority_rows
  FROM ads.all_trade_overview_refund_nowcast_event_calendar a
  JOIN ads.all_trade_overview_refund_nowcast_event_calendar b
    ON a.id < b.id
   AND a.is_active = TRUE
   AND b.is_active = TRUE
   AND a.platform = b.platform
   AND a.priority = b.priority
   AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');

  IF v_overlap_priority_rows > 0 THEN
    RAISE EXCEPTION
      'event calendar overlap check failed, active overlapping same-priority pairs: %',
      v_overlap_priority_rows;
  END IF;

  RAISE NOTICE 'refund nowcast event calendar checks passed';
END;
$$;
