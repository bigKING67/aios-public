DO $$
DECLARE
  v_missing_object_count INTEGER := 0;
  v_invalid_metric_rows INTEGER := 0;
  v_invalid_active_rows INTEGER := 0;
  v_duplicate_active_rows INTEGER := 0;
  v_delta_mismatch_rows INTEGER := 0;
  v_recommendation_mismatch_rows INTEGER := 0;
  v_nowcast_missing_active_lookup INTEGER := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_missing_object_count
  FROM (
    SELECT to_regclass('ads.all_trade_overview_refund_nowcast_calibration_weekly') IS NULL AS missing
    UNION ALL
    SELECT NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'refresh_all_trade_overview_refund_nowcast_calibration_weekly'
        AND pg_get_function_identity_arguments(p.oid)
          = 'IN p_as_of_date date, IN p_eval_window_days integer, IN p_min_sample_count integer, IN p_threshold_wape numeric'
    )
    UNION ALL
    SELECT to_regclass('ads.all_trade_overview_refund_nowcast_active_calibration') IS NULL AS missing
    UNION ALL
    SELECT NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n
        ON n.oid = p.pronamespace
      WHERE n.nspname = 'ads'
        AND p.proname = 'activate_all_trade_overview_refund_nowcast_calibration'
        AND pg_get_function_identity_arguments(p.oid)
          = 'IN p_as_of_date date, IN p_eval_window_days integer, IN p_min_sample_count integer, IN p_max_factor_move numeric'
    )
  ) objects
  WHERE missing = TRUE;

  IF v_missing_object_count > 0 THEN
    RAISE EXCEPTION 'refund nowcast weekly calibration check failed: missing objects = %', v_missing_object_count;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_metric_rows
  FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
  WHERE c.sample_count < 0
     OR c.actual_total < 0
     OR c.predicted_total < 0
     OR c.zero_miss_count < 0
     OR (c.candidate_adjustment_factor IS NOT NULL AND c.candidate_adjustment_factor NOT BETWEEN 0.70 AND 1.30)
     OR (c.wape_before IS NOT NULL AND c.wape_before < 0)
     OR (c.wape_after IS NOT NULL AND c.wape_after < 0);

  IF v_invalid_metric_rows > 0 THEN
    RAISE EXCEPTION 'refund nowcast weekly calibration metric check failed, invalid rows: %', v_invalid_metric_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_active_rows
  FROM ads.all_trade_overview_refund_nowcast_active_calibration a
  WHERE a.sample_count < 0
     OR a.calibration_factor NOT BETWEEN 0.70 AND 1.30
     OR (a.previous_factor IS NOT NULL AND a.previous_factor NOT BETWEEN 0.70 AND 1.30)
     OR (a.effective_to IS NOT NULL AND a.effective_to < a.effective_from)
     OR (
       a.activation_status = 'active'
       AND a.effective_to IS NOT NULL
     );

  IF v_invalid_active_rows > 0 THEN
    RAISE EXCEPTION 'refund nowcast active calibration check failed, invalid rows: %', v_invalid_active_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_duplicate_active_rows
  FROM (
    SELECT a.platform, a.eval_age_days
    FROM ads.all_trade_overview_refund_nowcast_active_calibration a
    WHERE a.activation_status = 'active'
      AND a.effective_to IS NULL
    GROUP BY a.platform, a.eval_age_days
    HAVING COUNT(*) > 1
  ) duplicated;

  IF v_duplicate_active_rows > 0 THEN
    RAISE EXCEPTION 'refund nowcast active calibration duplicate active rows: %', v_duplicate_active_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_nowcast_missing_active_lookup
  FROM pg_proc p
  JOIN pg_namespace n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'ads'
    AND p.proname = 'refresh_all_trade_overview_refund_nowcast_daily'
    AND pg_get_functiondef(p.oid) NOT LIKE '%all_trade_overview_refund_nowcast_active_calibration%';

  IF v_nowcast_missing_active_lookup > 0 THEN
    RAISE EXCEPTION 'refund nowcast daily procedure does not read active calibration table';
  END IF;

  SELECT COUNT(*)
  INTO v_delta_mismatch_rows
  FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
  WHERE (
      c.wape_before IS NOT NULL
      AND c.wape_after IS NOT NULL
      AND ABS(c.wape_delta - ROUND(c.wape_after - c.wape_before, 6)) > 0.000001
    )
    OR (
      c.bias_before IS NOT NULL
      AND c.bias_after IS NOT NULL
      AND ABS(c.bias_abs_delta - ROUND(ABS(c.bias_after) - ABS(c.bias_before), 6)) > 0.000001
    );

  IF v_delta_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'refund nowcast weekly calibration delta check failed, mismatch rows: %', v_delta_mismatch_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_recommendation_mismatch_rows
  FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
  WHERE (c.quality_status = 'insufficient' AND c.recommendation_status <> 'insufficient')
     OR (c.zero_miss_count > 0 AND c.recommendation_status <> 'review_zero_miss')
     OR (
       c.recommendation_status = 'tune_candidate'
       AND NOT (c.wape_delta < -0.005 AND c.bias_abs_delta <= 0.02)
     );

  IF v_recommendation_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'refund nowcast weekly calibration recommendation check failed, mismatch rows: %', v_recommendation_mismatch_rows;
  END IF;

  RAISE NOTICE 'refund nowcast weekly calibration checks passed';
END;
$$;
