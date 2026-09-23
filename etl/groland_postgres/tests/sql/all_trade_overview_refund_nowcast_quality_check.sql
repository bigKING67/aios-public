DO $$
DECLARE
  v_negative_metric_rows INTEGER;
  v_wape_formula_mismatch_rows INTEGER;
  v_zero_miss_formula_mismatch_rows INTEGER;
  v_alert_rule_mismatch_rows INTEGER;
  v_pass_rule_mismatch_rows INTEGER;
  v_has_zero_miss_count BOOLEAN := FALSE;
BEGIN
  IF to_regclass('ads.all_trade_overview_refund_nowcast_quality_daily') IS NULL THEN
    RAISE EXCEPTION
      'missing table: ads.all_trade_overview_refund_nowcast_quality_daily';
  END IF;

  SELECT COUNT(*)
  INTO v_negative_metric_rows
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.sample_count < 0
     OR q.actual_total < 0
     OR q.predicted_total < 0
     OR q.absolute_error_total < 0;

  IF v_negative_metric_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast quality non-negative check failed, invalid rows: %',
      v_negative_metric_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_wape_formula_mismatch_rows
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE
    ABS(COALESCE(q.actual_total, 0)) > 0
    AND ABS(
      COALESCE(q.wape, 0)
      - ROUND(
        COALESCE(q.absolute_error_total, 0)
        / NULLIF(ABS(COALESCE(q.actual_total, 0)), 0),
        6
      )
    ) > 0.000001;

  IF v_wape_formula_mismatch_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast quality WAPE formula check failed, mismatch rows: %',
      v_wape_formula_mismatch_rows;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ads'
      AND c.table_name = 'all_trade_overview_refund_nowcast_quality_daily'
      AND c.column_name = 'zero_miss_count'
  )
  INTO v_has_zero_miss_count;

  IF v_has_zero_miss_count THEN
    EXECUTE $check$
      SELECT COUNT(*)
      FROM ads.all_trade_overview_refund_nowcast_quality_daily q
      WHERE q.zero_miss_count < 0
         OR (q.zero_miss_count > 0 AND q.quality_status <> 'alert')
    $check$
    INTO v_zero_miss_formula_mismatch_rows;

    IF v_zero_miss_formula_mismatch_rows > 0 THEN
      RAISE EXCEPTION
        'refund nowcast quality zero miss check failed, mismatch rows: %',
        v_zero_miss_formula_mismatch_rows;
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_alert_rule_mismatch_rows
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.quality_status = 'alert'
    AND (q.wape IS NULL OR q.wape <= q.threshold_wape);

  IF v_has_zero_miss_count THEN
    EXECUTE $check$
      SELECT COUNT(*)
      FROM ads.all_trade_overview_refund_nowcast_quality_daily q
      WHERE q.quality_status = 'alert'
        AND COALESCE(q.zero_miss_count, 0) <= 0
        AND (q.wape IS NULL OR q.wape <= q.threshold_wape)
    $check$
    INTO v_alert_rule_mismatch_rows;
  END IF;

  IF v_alert_rule_mismatch_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast quality alert rule check failed, mismatch rows: %',
      v_alert_rule_mismatch_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_pass_rule_mismatch_rows
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.quality_status = 'pass'
    AND (q.wape IS NULL OR q.wape > q.threshold_wape OR q.sample_count <= 0);

  IF v_pass_rule_mismatch_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast quality pass rule check failed, mismatch rows: %',
      v_pass_rule_mismatch_rows;
  END IF;

  RAISE NOTICE 'refund nowcast quality checks passed';
END;
$$;
