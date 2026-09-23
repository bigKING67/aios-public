DO $$
DECLARE
  v_invalid_pred_lt_current BIGINT := 0;
  v_invalid_ratio_mismatch BIGINT := 0;
  v_invalid_v3_zero_miss_risk_rows BIGINT := 0;
  v_invalid_v4_or_v5_xhs_zero_cap_rows BIGINT := 0;
BEGIN
  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION
      'missing table: ads.all_trade_overview_refund_nowcast_daily';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_pred_lt_current
  FROM ads.all_trade_overview_refund_nowcast_daily n
  WHERE n.refund_amount_pay_time_predicted < n.refund_amount_pay_time_current;

  IF v_invalid_pred_lt_current > 0 THEN
    RAISE EXCEPTION
      'refund nowcast daily check failed: predicted < current rows = %',
      v_invalid_pred_lt_current;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_ratio_mismatch
  FROM ads.all_trade_overview_refund_nowcast_daily n
  WHERE n.refund_amount_pay_time_predicted > 0
    AND n.completeness_ratio IS NOT NULL
    AND ABS(
      n.completeness_ratio
      - ROUND(
          n.refund_amount_pay_time_current / NULLIF(n.refund_amount_pay_time_predicted, 0),
          6
        )
    ) > 0.0005;

  IF v_invalid_ratio_mismatch > 0 THEN
    RAISE EXCEPTION
      'refund nowcast daily check failed: completeness_ratio mismatch rows = %',
      v_invalid_ratio_mismatch;
  END IF;

  WITH latest AS (
    SELECT MAX(n.as_of_date) AS as_of_date
    FROM ads.all_trade_overview_refund_nowcast_daily n
    WHERE n.model_version LIKE 'v3\_%' ESCAPE '\'
  ),
  mature_platforms AS (
    SELECT
      t.platform,
      COUNT(*) FILTER (
        WHERE COALESCE(t.gmv, 0) > 0
          AND COALESCE(t.refund_amount_pay_time, 0) > 0
      ) AS mature_refund_days
    FROM ads.all_trade_overview t
    CROSS JOIN latest l
    WHERE l.as_of_date IS NOT NULL
      AND t."date" BETWEEN (l.as_of_date - 180) AND (l.as_of_date - 21)
    GROUP BY t.platform
  )
  SELECT COUNT(*)
  INTO v_invalid_v3_zero_miss_risk_rows
  FROM ads.all_trade_overview_refund_nowcast_daily n
  JOIN latest l
    ON l.as_of_date = n.as_of_date
  JOIN ads.all_trade_overview t
    ON t."date" = n."date"
   AND t.platform = n.platform
  JOIN mature_platforms m
    ON m.platform = n.platform
  WHERE n.model_version LIKE 'v3\_%' ESCAPE '\'
    AND (n.as_of_date - n."date") BETWEEN 1 AND 20
    AND COALESCE(t.gmv, 0) > 0
    AND COALESCE(m.mature_refund_days, 0) >= 3
    AND COALESCE(n.refund_amount_pay_time_current, 0) <= 0
    AND COALESCE(n.refund_amount_pay_time_predicted, 0) <= 0;

  IF v_invalid_v3_zero_miss_risk_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast daily v3 zero-miss risk check failed, invalid rows: %',
      v_invalid_v3_zero_miss_risk_rows;
  END IF;

  WITH latest_v4_or_v5 AS (
    SELECT MAX(n.as_of_date) AS as_of_date
    FROM ads.all_trade_overview_refund_nowcast_daily n
    WHERE n.model_version LIKE 'v4\_trade\_amount\_realign\_%' ESCAPE '\'
       OR n.model_version LIKE 'v5\_active\_calibration\_%' ESCAPE '\'
  )
  SELECT COUNT(*)
  INTO v_invalid_v4_or_v5_xhs_zero_cap_rows
  FROM ads.all_trade_overview_refund_nowcast_daily n
  JOIN latest_v4_or_v5 l
    ON l.as_of_date = n.as_of_date
  JOIN ads.all_trade_overview t
    ON t."date" = n."date"
   AND t.platform = n.platform
  WHERE n.platform = 'xhs'
    AND (
      n.model_version LIKE 'v4\_trade\_amount\_realign\_%' ESCAPE '\'
      OR n.model_version LIKE 'v5\_active\_calibration\_%' ESCAPE '\'
    )
    AND (n.as_of_date - n."date") BETWEEN 0 AND 20
    AND COALESCE(n.refund_amount_pay_time_current, 0) <= 0
    AND COALESCE(t.gmv, 0) > 0
    AND COALESCE(n.refund_amount_pay_time_predicted, 0)
      > ROUND(COALESCE(t.gmv, 0)::NUMERIC * 0.12::NUMERIC, 2) + 0.01::NUMERIC;

  IF v_invalid_v4_or_v5_xhs_zero_cap_rows > 0 THEN
    RAISE EXCEPTION
      'refund nowcast daily v4/v5 xhs zero-current cap check failed, invalid rows: %',
      v_invalid_v4_or_v5_xhs_zero_cap_rows;
  END IF;

  RAISE NOTICE 'refund nowcast daily checks passed';
END;
$$;
