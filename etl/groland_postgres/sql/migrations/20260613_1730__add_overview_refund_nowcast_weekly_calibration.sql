BEGIN;

CREATE TABLE IF NOT EXISTS ads.all_trade_overview_refund_nowcast_calibration_weekly (
  id BIGSERIAL PRIMARY KEY,
  as_of_date DATE NOT NULL,
  platform VARCHAR(32) NOT NULL,
  eval_age_days INTEGER NOT NULL,
  eval_window_days INTEGER NOT NULL,
  source_model_version VARCHAR(64),
  sample_count INTEGER NOT NULL DEFAULT 0,
  actual_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  predicted_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  zero_miss_count INTEGER NOT NULL DEFAULT 0,
  wape_before NUMERIC(10, 6),
  bias_before NUMERIC(10, 6),
  candidate_adjustment_factor NUMERIC(10, 6),
  wape_after NUMERIC(10, 6),
  bias_after NUMERIC(10, 6),
  wape_delta NUMERIC(10, 6),
  bias_abs_delta NUMERIC(10, 6),
  quality_status VARCHAR(20) NOT NULL,
  recommendation_status VARCHAR(32) NOT NULL,
  recommendation_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_all_trade_overview_refund_nowcast_calibration_weekly
    UNIQUE (as_of_date, platform, eval_age_days, eval_window_days),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_platform
    CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_age
    CHECK (eval_age_days IN (1, 3, 7, 14)),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_window
    CHECK (eval_window_days BETWEEN 7 AND 180),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_factor
    CHECK (
      candidate_adjustment_factor IS NULL
      OR candidate_adjustment_factor BETWEEN 0.70 AND 1.30
    ),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_quality
    CHECK (quality_status IN ('pass', 'alert', 'insufficient')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_calibration_weekly_recommendation
    CHECK (recommendation_status IN ('tune_candidate', 'review_zero_miss', 'keep', 'insufficient'))
);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_calibration_weekly_asof
  ON ads.all_trade_overview_refund_nowcast_calibration_weekly (as_of_date DESC, platform, eval_age_days);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_calibration_weekly_status
  ON ads.all_trade_overview_refund_nowcast_calibration_weekly (recommendation_status, as_of_date DESC);

COMMENT ON TABLE ads.all_trade_overview_refund_nowcast_calibration_weekly IS
  '全渠道经营总览退款 nowcast 周度校准审计：记录各平台 age 档位的 WAPE/bias、候选调整系数和建议状态。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_calibration_weekly.candidate_adjustment_factor IS
  '基于最近窗口实际/预测偏差计算的候选调整系数，仅作为周度审计与告警，不直接改写 SQL 常量。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_calibration_weekly.wape_delta IS
  '候选调整后的 WAPE 与调整前 WAPE 的差值，负数表示改善。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_calibration_weekly.bias_abs_delta IS
  '候选调整后 abs(bias) 与调整前 abs(bias) 的差值，负数表示改善。';

CREATE OR REPLACE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_calibration_weekly_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_all_trade_overview_refund_nowcast_calibration_weekly_updated_at
ON ads.all_trade_overview_refund_nowcast_calibration_weekly;

CREATE TRIGGER trg_touch_all_trade_overview_refund_nowcast_calibration_weekly_updated_at
BEFORE UPDATE ON ads.all_trade_overview_refund_nowcast_calibration_weekly
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_calibration_weekly_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_calibration_weekly(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_eval_window_days INTEGER DEFAULT 42,
  IN p_min_sample_count INTEGER DEFAULT 10,
  IN p_threshold_wape NUMERIC DEFAULT 0.15
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_inserted_rows INTEGER := 0;
  v_tune_candidates INTEGER := 0;
  v_alert_rows INTEGER := 0;
BEGIN
  IF p_eval_window_days < 7 OR p_eval_window_days > 180 THEN
    RAISE EXCEPTION 'p_eval_window_days must be between 7 and 180';
  END IF;

  IF p_min_sample_count < 1 THEN
    RAISE EXCEPTION 'p_min_sample_count must be >= 1';
  END IF;

  IF p_threshold_wape <= 0 OR p_threshold_wape > 1 THEN
    RAISE EXCEPTION 'p_threshold_wape must be in (0, 1]';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview_refund_nowcast_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_calibration_weekly') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview_refund_nowcast_calibration_weekly does not exist';
  END IF;

  INSERT INTO ads.all_trade_overview_refund_nowcast_calibration_weekly (
    as_of_date,
    platform,
    eval_age_days,
    eval_window_days,
    source_model_version,
    sample_count,
    actual_total,
    predicted_total,
    zero_miss_count,
    wape_before,
    bias_before,
    candidate_adjustment_factor,
    wape_after,
    bias_after,
    wape_delta,
    bias_abs_delta,
    quality_status,
    recommendation_status,
    recommendation_reason
  )
  WITH eval_params AS (
    SELECT *
    FROM (
      VALUES
        (1),
        (3),
        (7),
        (14)
    ) AS t(eval_age_days)
  ),
  platform_dimension AS (
    SELECT *
    FROM (
      VALUES
        ('douyin'),
        ('jd'),
        ('taobao'),
        ('wx'),
        ('xhs')
    ) AS t(platform)
  ),
  prediction_base AS (
    SELECT
      e.eval_age_days,
      p."date",
      p.platform,
      COALESCE(p.refund_amount_pay_time_predicted, 0)::NUMERIC(18, 2) AS predicted_value,
      COALESCE(p.model_version, 'unknown')::VARCHAR(64) AS model_version
    FROM eval_params e
    JOIN ads.all_trade_overview_refund_nowcast_daily p
      ON p.as_of_date = (p."date" + e.eval_age_days)
     AND p."date" BETWEEN
        (v_as_of_date - e.eval_age_days - (p_eval_window_days - 1))
        AND (v_as_of_date - e.eval_age_days)
  ),
  actual_base AS (
    SELECT
      e.eval_age_days,
      a."date",
      a.platform,
      COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS actual_value
    FROM eval_params e
    JOIN ads.all_trade_overview_refund_nowcast_daily a
      ON a.as_of_date = v_as_of_date
     AND a."date" BETWEEN
        (v_as_of_date - e.eval_age_days - (p_eval_window_days - 1))
        AND (v_as_of_date - e.eval_age_days)
  ),
  paired AS (
    SELECT
      p.eval_age_days,
      p.platform,
      p."date",
      p.predicted_value,
      COALESCE(a.actual_value, 0)::NUMERIC(18, 2) AS actual_value,
      p.model_version
    FROM prediction_base p
    LEFT JOIN actual_base a
      ON a.platform = p.platform
     AND a."date" = p."date"
     AND a.eval_age_days = p.eval_age_days
  ),
  aggregated AS (
    SELECT
      e.eval_age_days,
      d.platform,
      COALESCE(COUNT(p."date"), 0)::INTEGER AS sample_count,
      COALESCE(SUM(p.actual_value), 0)::NUMERIC(18, 2) AS actual_total,
      COALESCE(SUM(p.predicted_value), 0)::NUMERIC(18, 2) AS predicted_total,
      COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)::NUMERIC(18, 2) AS absolute_error_total,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(p.predicted_value, 0) <= 0 AND COALESCE(p.actual_value, 0) > 0 THEN 1
            ELSE 0
          END
        ),
        0
      )::INTEGER AS zero_miss_count,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS wape_before,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          COALESCE(SUM(p.predicted_value - p.actual_value), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS bias_before,
      MAX(p.model_version)::VARCHAR(64) AS source_model_version
    FROM eval_params e
    CROSS JOIN platform_dimension d
    LEFT JOIN paired p
      ON p.platform = d.platform
     AND p.eval_age_days = e.eval_age_days
    GROUP BY e.eval_age_days, d.platform
  ),
  factor_calc AS (
    SELECT
      a.*,
      CASE
        WHEN a.sample_count < p_min_sample_count
          OR COALESCE(a.actual_total, 0) <= 0
          OR COALESCE(a.predicted_total, 0) <= 0
        THEN NULL::NUMERIC(10, 6)
        WHEN a.platform = 'douyin' THEN GREATEST(
          0.95::NUMERIC,
          LEAST(
            1.15::NUMERIC,
            1.0::NUMERIC + (
              GREATEST(
                0.70::NUMERIC,
                LEAST(1.30::NUMERIC, a.actual_total / NULLIF(a.predicted_total, 0))
              ) - 1.0::NUMERIC
            ) * 0.65::NUMERIC
          )
        )
        WHEN a.platform = 'xhs' THEN GREATEST(
          0.80::NUMERIC,
          LEAST(
            1.15::NUMERIC,
            1.0::NUMERIC + (
              GREATEST(
                0.70::NUMERIC,
                LEAST(1.30::NUMERIC, a.actual_total / NULLIF(a.predicted_total, 0))
              ) - 1.0::NUMERIC
            ) * 0.65::NUMERIC
          )
        )
        ELSE GREATEST(
          0.85::NUMERIC,
          LEAST(
            1.15::NUMERIC,
            1.0::NUMERIC + (
              GREATEST(
                0.70::NUMERIC,
                LEAST(1.30::NUMERIC, a.actual_total / NULLIF(a.predicted_total, 0))
              ) - 1.0::NUMERIC
            ) * 0.65::NUMERIC
          )
        )
      END::NUMERIC(10, 6) AS candidate_adjustment_factor
    FROM aggregated a
  ),
  scored AS (
    SELECT
      f.eval_age_days,
      f.platform,
      f.sample_count,
      f.actual_total,
      f.predicted_total,
      f.zero_miss_count,
      f.wape_before,
      f.bias_before,
      f.source_model_version,
      f.candidate_adjustment_factor,
      CASE
        WHEN f.candidate_adjustment_factor IS NOT NULL
          AND COALESCE(SUM(ABS(p.actual_value)), 0) > 0
        THEN ROUND(
          COALESCE(SUM(ABS((p.predicted_value * f.candidate_adjustment_factor) - p.actual_value)), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS wape_after,
      CASE
        WHEN f.candidate_adjustment_factor IS NOT NULL
          AND COALESCE(SUM(ABS(p.actual_value)), 0) > 0
        THEN ROUND(
          COALESCE(SUM((p.predicted_value * f.candidate_adjustment_factor) - p.actual_value), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS bias_after
    FROM factor_calc f
    LEFT JOIN paired p
      ON p.platform = f.platform
     AND p.eval_age_days = f.eval_age_days
    GROUP BY
      f.eval_age_days,
      f.platform,
      f.sample_count,
      f.actual_total,
      f.predicted_total,
      f.zero_miss_count,
      f.wape_before,
      f.bias_before,
      f.source_model_version,
      f.candidate_adjustment_factor
  ),
  classified AS (
    SELECT
      s.*,
      CASE
        WHEN s.wape_before IS NOT NULL AND s.wape_after IS NOT NULL
          THEN ROUND(s.wape_after - s.wape_before, 6)
        ELSE NULL::NUMERIC(10, 6)
      END AS wape_delta,
      CASE
        WHEN s.bias_before IS NOT NULL AND s.bias_after IS NOT NULL
          THEN ROUND(ABS(s.bias_after) - ABS(s.bias_before), 6)
        ELSE NULL::NUMERIC(10, 6)
      END AS bias_abs_delta,
      CASE
        WHEN s.sample_count < p_min_sample_count
          OR COALESCE(s.actual_total, 0) <= 0
          OR COALESCE(s.predicted_total, 0) <= 0
        THEN 'insufficient'
        WHEN COALESCE(s.zero_miss_count, 0) > 0 THEN 'alert'
        WHEN COALESCE(s.wape_before, 0) > p_threshold_wape THEN 'alert'
        ELSE 'pass'
      END::VARCHAR(20) AS quality_status
    FROM scored s
  )
  SELECT
    v_as_of_date AS as_of_date,
    c.platform,
    c.eval_age_days,
    p_eval_window_days AS eval_window_days,
    COALESCE(c.source_model_version, 'unknown') AS source_model_version,
    c.sample_count,
    c.actual_total,
    c.predicted_total,
    c.zero_miss_count,
    c.wape_before,
    c.bias_before,
    c.candidate_adjustment_factor,
    c.wape_after,
    c.bias_after,
    c.wape_delta,
    c.bias_abs_delta,
    c.quality_status,
    CASE
      WHEN c.quality_status = 'insufficient' THEN 'insufficient'
      WHEN COALESCE(c.zero_miss_count, 0) > 0 THEN 'review_zero_miss'
      WHEN c.candidate_adjustment_factor IS NULL THEN 'insufficient'
      WHEN ABS(c.candidate_adjustment_factor - 1.0::NUMERIC) < 0.02 THEN 'keep'
      WHEN COALESCE(c.wape_delta, 0) < -0.005
        AND COALESCE(c.bias_abs_delta, 0) <= 0.02
      THEN 'tune_candidate'
      ELSE 'keep'
    END::VARCHAR(32) AS recommendation_status,
    CASE
      WHEN c.quality_status = 'insufficient' THEN '样本不足或实际/预测金额为 0，跳过校准建议。'
      WHEN COALESCE(c.zero_miss_count, 0) > 0 THEN '存在预测为 0 但成熟实际退款大于 0 的样本，需要优先核查零转正逻辑。'
      WHEN c.candidate_adjustment_factor IS NULL THEN '无法计算候选调整系数。'
      WHEN ABS(c.candidate_adjustment_factor - 1.0::NUMERIC) < 0.02 THEN '偏差不足 2%，保持当前自动校准。'
      WHEN COALESCE(c.wape_delta, 0) < -0.005
        AND COALESCE(c.bias_abs_delta, 0) <= 0.02
      THEN '候选调整可降低 WAPE，建议观察后纳入模型参数。'
      ELSE '候选调整未带来稳定改善，保持当前自动校准。'
    END AS recommendation_reason
  FROM classified c
  ON CONFLICT (as_of_date, platform, eval_age_days, eval_window_days)
  DO UPDATE SET
    source_model_version = EXCLUDED.source_model_version,
    sample_count = EXCLUDED.sample_count,
    actual_total = EXCLUDED.actual_total,
    predicted_total = EXCLUDED.predicted_total,
    zero_miss_count = EXCLUDED.zero_miss_count,
    wape_before = EXCLUDED.wape_before,
    bias_before = EXCLUDED.bias_before,
    candidate_adjustment_factor = EXCLUDED.candidate_adjustment_factor,
    wape_after = EXCLUDED.wape_after,
    bias_after = EXCLUDED.bias_after,
    wape_delta = EXCLUDED.wape_delta,
    bias_abs_delta = EXCLUDED.bias_abs_delta,
    quality_status = EXCLUDED.quality_status,
    recommendation_status = EXCLUDED.recommendation_status,
    recommendation_reason = EXCLUDED.recommendation_reason,
    updated_at = NOW();

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  SELECT COUNT(*)
  INTO v_tune_candidates
  FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
  WHERE c.as_of_date = v_as_of_date
    AND c.eval_window_days = p_eval_window_days
    AND c.recommendation_status IN ('tune_candidate', 'review_zero_miss');

  SELECT COUNT(*)
  INTO v_alert_rows
  FROM ads.all_trade_overview_refund_nowcast_calibration_weekly c
  WHERE c.as_of_date = v_as_of_date
    AND c.eval_window_days = p_eval_window_days
    AND c.quality_status = 'alert';

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_calibration_weekly completed, as_of_date %, inserted_rows %, tune_candidates %, alert_rows %, eval_window_days %, threshold_wape %',
    v_as_of_date,
    v_inserted_rows,
    v_tune_candidates,
    v_alert_rows,
    p_eval_window_days,
    p_threshold_wape;
END;
$$;

COMMIT;
