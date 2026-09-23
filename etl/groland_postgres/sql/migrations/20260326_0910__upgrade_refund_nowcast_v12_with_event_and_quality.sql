BEGIN;

CREATE TABLE IF NOT EXISTS ads.all_trade_overview_refund_nowcast_event_calendar (
  id BIGSERIAL PRIMARY KEY,
  event_key VARCHAR(64) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'all',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  prediction_multiplier NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  priority SMALLINT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_all_trade_overview_refund_nowcast_event_calendar
    UNIQUE (event_key, platform, start_date, end_date),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_event_calendar_platform
    CHECK (platform IN ('all', 'douyin', 'jd', 'taobao', 'wx', 'xhs')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_event_calendar_date_range
    CHECK (start_date <= end_date),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_event_calendar_multiplier
    CHECK (prediction_multiplier > 0 AND prediction_multiplier <= 3)
);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_event_calendar_active
  ON ads.all_trade_overview_refund_nowcast_event_calendar (is_active, platform, start_date, end_date, priority);

COMMENT ON TABLE ads.all_trade_overview_refund_nowcast_event_calendar IS '退款 nowcast 活动日修正表：用于大促/活动期的预测倍率修正。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_event_calendar.event_key IS '事件唯一标识（如 618_2026）。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_event_calendar.platform IS '适用平台：all 表示全平台，其他为单平台覆盖。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_event_calendar.prediction_multiplier IS '预测修正倍率（基线预测值 * multiplier）。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_event_calendar.priority IS '规则优先级，值越小优先级越高。';

CREATE OR REPLACE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_event_calendar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_all_trade_overview_refund_nowcast_event_calendar_updated_at
ON ads.all_trade_overview_refund_nowcast_event_calendar;

CREATE TRIGGER trg_touch_all_trade_overview_refund_nowcast_event_calendar_updated_at
BEFORE UPDATE ON ads.all_trade_overview_refund_nowcast_event_calendar
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_event_calendar_updated_at();

CREATE TABLE IF NOT EXISTS ads.all_trade_overview_refund_nowcast_quality_daily (
  as_of_date DATE NOT NULL,
  platform VARCHAR(20) NOT NULL,
  eval_age_days INTEGER NOT NULL DEFAULT 1,
  eval_window_days INTEGER NOT NULL DEFAULT 14,
  threshold_wape NUMERIC(10, 6) NOT NULL DEFAULT 0.15,
  sample_count INTEGER NOT NULL DEFAULT 0,
  actual_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  predicted_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  absolute_error_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  wape NUMERIC(10, 6),
  bias_rate NUMERIC(10, 6),
  quality_status VARCHAR(20) NOT NULL DEFAULT 'insufficient',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_overview_refund_nowcast_quality_daily
    PRIMARY KEY (as_of_date, platform, eval_age_days, eval_window_days),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_quality_daily_platform
    CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_quality_daily_age_days
    CHECK (eval_age_days >= 1),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_quality_daily_window_days
    CHECK (eval_window_days >= 1),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_quality_daily_threshold
    CHECK (threshold_wape > 0 AND threshold_wape <= 1),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_quality_daily_status
    CHECK (quality_status IN ('pass', 'alert', 'insufficient'))
);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_quality_daily_asof
  ON ads.all_trade_overview_refund_nowcast_quality_daily (as_of_date, platform);

COMMENT ON TABLE ads.all_trade_overview_refund_nowcast_quality_daily IS '退款 nowcast 质量评估快照：按 as_of_date + platform 记录回测质量。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.eval_age_days IS '评估年龄层（如 1 表示 age=1 的预测样本）。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.eval_window_days IS '回测窗口天数。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.wape IS '加权绝对百分比误差（sum(abs(err))/sum(abs(actual))）。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.bias_rate IS '偏差率（sum(pred-actual)/sum(abs(actual))）。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_quality_daily.quality_status IS '质量状态：pass/alert/insufficient。';

CREATE OR REPLACE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_quality_daily_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_all_trade_overview_refund_nowcast_quality_daily_updated_at
ON ads.all_trade_overview_refund_nowcast_quality_daily;

CREATE TRIGGER trg_touch_all_trade_overview_refund_nowcast_quality_daily_updated_at
BEFORE UPDATE ON ads.all_trade_overview_refund_nowcast_quality_daily
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_quality_daily_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_maturity_days INTEGER DEFAULT 21,
  IN p_history_days INTEGER DEFAULT 120
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_model_version TEXT := format('v1.2_curve_event_%sd', p_maturity_days);
  v_inserted_rows INTEGER := 0;
BEGIN
  IF p_maturity_days < 2 THEN
    RAISE EXCEPTION 'p_maturity_days must be >= 2';
  END IF;

  IF p_history_days < p_maturity_days THEN
    RAISE EXCEPTION 'p_history_days (%) must be >= p_maturity_days (%)', p_history_days, p_maturity_days;
  END IF;

  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview_refund_nowcast_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_event_calendar') IS NULL THEN
    RAISE EXCEPTION 'event calendar table ads.all_trade_overview_refund_nowcast_event_calendar does not exist';
  END IF;

  IF to_regclass('pg_temp.tmp_overview_nowcast_base') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_base';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_curve') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_curve';
  END IF;
  IF to_regclass('pg_temp.tmp_overview_nowcast_rows') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_overview_nowcast_rows';
  END IF;

  CREATE TEMP TABLE tmp_overview_nowcast_base ON COMMIT DROP AS
  SELECT
    t."date",
    t.platform,
    COALESCE(t.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS current_value
  FROM ads.all_trade_overview t
  WHERE t."date" BETWEEN (v_as_of_date - p_history_days) AND v_as_of_date;

  CREATE TEMP TABLE tmp_overview_nowcast_curve ON COMMIT DROP AS
  WITH matured_snapshot AS (
    SELECT
      n."date",
      n.platform,
      MAX(n.as_of_date) AS final_as_of_date
    FROM ads.all_trade_overview_refund_nowcast_daily n
    WHERE (n.as_of_date - n."date") >= p_maturity_days
    GROUP BY n."date", n.platform
  ),
  matured_final AS (
    SELECT
      m."date",
      m.platform,
      m.final_as_of_date,
      h.refund_amount_pay_time_current AS final_value
    FROM matured_snapshot m
    JOIN ads.all_trade_overview_refund_nowcast_daily h
      ON h."date" = m."date"
     AND h.platform = m.platform
     AND h.as_of_date = m.final_as_of_date
    WHERE h.refund_amount_pay_time_current > 0
  ),
  history_ratios AS (
    SELECT
      (h.as_of_date - h."date") AS age_days,
      LEAST(
        1.0::NUMERIC,
        GREATEST(
          0.0::NUMERIC,
          h.refund_amount_pay_time_current / NULLIF(f.final_value, 0)
        )
      ) AS ratio
    FROM ads.all_trade_overview_refund_nowcast_daily h
    JOIN matured_final f
      ON f."date" = h."date"
     AND f.platform = h.platform
    WHERE h.as_of_date <= f.final_as_of_date
      AND (h.as_of_date - h."date") BETWEEN 0 AND (p_maturity_days - 1)
  )
  SELECT
    r.age_days,
    AVG(r.ratio)::NUMERIC(10, 6) AS ratio_avg,
    COUNT(*)::INTEGER AS sample_count
  FROM history_ratios r
  GROUP BY r.age_days;

  CREATE TEMP TABLE tmp_overview_nowcast_rows ON COMMIT DROP AS
  WITH prepared AS (
    SELECT
      b."date",
      b.platform,
      v_as_of_date AS as_of_date,
      b.current_value AS refund_amount_pay_time_current,
      (v_as_of_date - b."date") AS age_days,
      COALESCE(c.sample_count, 0) AS sample_count,
      COALESCE(rule.prediction_multiplier, 1.0::NUMERIC(10, 6)) AS prediction_multiplier,
      CASE
        WHEN (v_as_of_date - b."date") >= p_maturity_days THEN 1.0::NUMERIC
        WHEN c.ratio_avg IS NOT NULL
          THEN LEAST(0.995::NUMERIC, GREATEST(0.05::NUMERIC, c.ratio_avg))
        ELSE LEAST(
          0.98::NUMERIC,
          GREATEST(
            0.08::NUMERIC,
            ((v_as_of_date - b."date" + 1)::NUMERIC / (p_maturity_days + 1)::NUMERIC)
          )
        )
      END AS completeness_ratio
    FROM tmp_overview_nowcast_base b
    LEFT JOIN tmp_overview_nowcast_curve c
      ON c.age_days = (v_as_of_date - b."date")
    LEFT JOIN LATERAL (
      SELECT
        e.prediction_multiplier
      FROM ads.all_trade_overview_refund_nowcast_event_calendar e
      WHERE e.is_active = TRUE
        AND b."date" BETWEEN e.start_date AND e.end_date
        AND e.platform IN ('all', b.platform)
      ORDER BY
        CASE WHEN e.platform = b.platform THEN 0 ELSE 1 END,
        e.priority ASC,
        e.id DESC
      LIMIT 1
    ) rule ON TRUE
    WHERE b."date" <= v_as_of_date
  )
  SELECT
    p."date",
    p.platform,
    p.as_of_date,
    p.refund_amount_pay_time_current,
    CASE
      WHEN p.refund_amount_pay_time_current <= 0 THEN 0::NUMERIC(18, 2)
      WHEN p.age_days >= p_maturity_days THEN p.refund_amount_pay_time_current
      ELSE ROUND(
        LEAST(
          (p.refund_amount_pay_time_current * 10)::NUMERIC,
          GREATEST(
            p.refund_amount_pay_time_current,
            (
              p.refund_amount_pay_time_current
              / NULLIF(p.completeness_ratio, 0)
              * p.prediction_multiplier
            )
          )
        ),
        2
      )::NUMERIC(18, 2)
    END AS refund_amount_pay_time_predicted,
    p.completeness_ratio,
    CASE
      WHEN p.age_days >= p_maturity_days THEN 'high'
      WHEN p.sample_count >= 60 THEN 'high'
      WHEN p.sample_count >= 20 THEN 'medium'
      ELSE 'low'
    END::VARCHAR(20) AS prediction_confidence,
    v_model_version::VARCHAR(64) AS model_version
  FROM prepared p;

  DELETE FROM ads.all_trade_overview_refund_nowcast_daily
  WHERE as_of_date = v_as_of_date;

  INSERT INTO ads.all_trade_overview_refund_nowcast_daily (
    "date",
    platform,
    as_of_date,
    refund_amount_pay_time_current,
    refund_amount_pay_time_predicted,
    completeness_ratio,
    prediction_confidence,
    model_version
  )
  SELECT
    r."date",
    r.platform,
    r.as_of_date,
    r.refund_amount_pay_time_current,
    r.refund_amount_pay_time_predicted,
    r.completeness_ratio,
    r.prediction_confidence,
    r.model_version
  FROM tmp_overview_nowcast_rows r;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_daily completed, as_of_date %, inserted_rows %, maturity_days %, history_days %',
    v_as_of_date,
    v_inserted_rows,
    p_maturity_days,
    p_history_days;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_quality_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_eval_age_days INTEGER DEFAULT 1,
  IN p_eval_window_days INTEGER DEFAULT 14,
  IN p_threshold_wape NUMERIC DEFAULT 0.15,
  IN p_min_sample_count INTEGER DEFAULT 10
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_inserted_rows INTEGER := 0;
  v_alert_platforms INTEGER := 0;
BEGIN
  IF p_eval_age_days < 1 THEN
    RAISE EXCEPTION 'p_eval_age_days must be >= 1';
  END IF;

  IF p_eval_window_days < 1 THEN
    RAISE EXCEPTION 'p_eval_window_days must be >= 1';
  END IF;

  IF p_threshold_wape <= 0 OR p_threshold_wape > 1 THEN
    RAISE EXCEPTION 'p_threshold_wape must be in (0, 1]';
  END IF;

  IF p_min_sample_count < 1 THEN
    RAISE EXCEPTION 'p_min_sample_count must be >= 1';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_daily') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_overview_refund_nowcast_daily does not exist';
  END IF;

  IF to_regclass('ads.all_trade_overview_refund_nowcast_quality_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview_refund_nowcast_quality_daily does not exist';
  END IF;

  DELETE FROM ads.all_trade_overview_refund_nowcast_quality_daily
  WHERE as_of_date = v_as_of_date
    AND eval_age_days = p_eval_age_days
    AND eval_window_days = p_eval_window_days;

  INSERT INTO ads.all_trade_overview_refund_nowcast_quality_daily (
    as_of_date,
    platform,
    eval_age_days,
    eval_window_days,
    threshold_wape,
    sample_count,
    actual_total,
    predicted_total,
    absolute_error_total,
    wape,
    bias_rate,
    quality_status
  )
  WITH platform_dimension AS (
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
      p."date",
      p.platform,
      COALESCE(p.refund_amount_pay_time_predicted, 0)::NUMERIC(18, 2) AS predicted_value
    FROM ads.all_trade_overview_refund_nowcast_daily p
    WHERE p.as_of_date = (p."date" + p_eval_age_days)
      AND p."date" BETWEEN
        (v_as_of_date - p_eval_age_days - (p_eval_window_days - 1))
        AND (v_as_of_date - p_eval_age_days)
  ),
  actual_base AS (
    SELECT
      a."date",
      a.platform,
      COALESCE(a.refund_amount_pay_time_current, 0)::NUMERIC(18, 2) AS actual_value
    FROM ads.all_trade_overview_refund_nowcast_daily a
    WHERE a.as_of_date = v_as_of_date
      AND a."date" BETWEEN
        (v_as_of_date - p_eval_age_days - (p_eval_window_days - 1))
        AND (v_as_of_date - p_eval_age_days)
  ),
  paired AS (
    SELECT
      p.platform,
      p."date",
      p.predicted_value,
      COALESCE(a.actual_value, 0)::NUMERIC(18, 2) AS actual_value
    FROM prediction_base p
    LEFT JOIN actual_base a
      ON a.platform = p.platform
     AND a."date" = p."date"
  ),
  aggregated AS (
    SELECT
      d.platform,
      COALESCE(COUNT(p."date"), 0)::INTEGER AS sample_count,
      COALESCE(SUM(p.actual_value), 0)::NUMERIC(18, 2) AS actual_total,
      COALESCE(SUM(p.predicted_value), 0)::NUMERIC(18, 2) AS predicted_total,
      COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)::NUMERIC(18, 2) AS absolute_error_total,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          COALESCE(SUM(ABS(p.predicted_value - p.actual_value)), 0)
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS wape,
      CASE
        WHEN COALESCE(SUM(ABS(p.actual_value)), 0) > 0 THEN ROUND(
          (COALESCE(SUM(p.predicted_value - p.actual_value), 0))
          / NULLIF(COALESCE(SUM(ABS(p.actual_value)), 0), 0),
          6
        )
        ELSE NULL::NUMERIC(10, 6)
      END AS bias_rate
    FROM platform_dimension d
    LEFT JOIN paired p ON p.platform = d.platform
    GROUP BY d.platform
  )
  SELECT
    v_as_of_date AS as_of_date,
    a.platform,
    p_eval_age_days AS eval_age_days,
    p_eval_window_days AS eval_window_days,
    p_threshold_wape::NUMERIC(10, 6) AS threshold_wape,
    a.sample_count,
    a.actual_total,
    a.predicted_total,
    a.absolute_error_total,
    a.wape,
    a.bias_rate,
    CASE
      WHEN a.sample_count < p_min_sample_count OR ABS(COALESCE(a.actual_total, 0)) <= 0 THEN 'insufficient'
      WHEN COALESCE(a.wape, 0) > p_threshold_wape THEN 'alert'
      ELSE 'pass'
    END::VARCHAR(20) AS quality_status
  FROM aggregated a;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  SELECT COUNT(*)
  INTO v_alert_platforms
  FROM ads.all_trade_overview_refund_nowcast_quality_daily q
  WHERE q.as_of_date = v_as_of_date
    AND q.eval_age_days = p_eval_age_days
    AND q.eval_window_days = p_eval_window_days
    AND q.quality_status = 'alert';

  RAISE NOTICE
    'refresh_all_trade_overview_refund_nowcast_quality_daily completed, as_of_date %, eval_age_days %, eval_window_days %, inserted_rows %, alert_platforms %',
    v_as_of_date,
    p_eval_age_days,
    p_eval_window_days,
    v_inserted_rows,
    v_alert_platforms;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_incremental(
  IN p_fallback_window_days INTEGER DEFAULT 7,
  IN p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_platform VARCHAR(20);
  v_last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
  v_fallback_start_date DATE;
  v_safe_lookback_interval INTERVAL := INTERVAL '5 minutes';
  v_safe_watermark TIMESTAMP WITHOUT TIME ZONE;
  v_lock_acquired BOOLEAN;
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'p_fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('etl.all_trade_overview_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.all_trade_overview_refresh_state does not exist';
  END IF;

  v_lock_acquired := pg_try_advisory_lock(hashtext('ads.refresh_all_trade_overview_incremental'));
  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'Another overview incremental refresh is running, skipping this execution';
    RETURN;
  END IF;

  BEGIN
    v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

    FOR v_platform IN
      SELECT platform
      FROM etl.all_trade_overview_refresh_state
      ORDER BY platform
    LOOP
      SELECT last_ods_updated_at
      INTO v_last_ods_updated_at
      FROM etl.all_trade_overview_refresh_state
      WHERE platform = v_platform
      FOR UPDATE;

      v_min_date := NULL;
      v_max_date := NULL;
      v_max_updated_at := NULL;
      v_safe_watermark := v_last_ods_updated_at - v_safe_lookback_interval;

      IF p_init_watermark_only THEN
        IF v_platform = 'douyin' THEN
          SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
          INTO v_max_updated_at
          FROM ods.douyin_trade_sale_raw;
        ELSIF v_platform = 'jd' THEN
          SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
          INTO v_max_updated_at
          FROM ods.jd_trade_sale_raw;
        ELSIF v_platform = 'taobao' THEN
          SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
          INTO v_max_updated_at
          FROM ods.taobao_trade_sale_raw;
        ELSIF v_platform = 'wx' THEN
          SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
          INTO v_max_updated_at
          FROM ods.wx_trade_sale_raw;
        ELSE
          SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
          INTO v_max_updated_at
          FROM ods.xhs_trade_sale_raw;
        END IF;

        IF v_max_updated_at IS NOT NULL THEN
          UPDATE etl.all_trade_overview_refresh_state
          SET
            last_ods_updated_at = v_max_updated_at,
            updated_at = v_now
          WHERE platform = v_platform;
        END IF;

        CONTINUE;
      END IF;

      IF v_platform = 'douyin' THEN
        SELECT
          MIN(stat_date),
          MAX(stat_date),
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_min_date, v_max_date, v_max_updated_at
        FROM ods.douyin_trade_sale_raw
        WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') >= v_safe_watermark;
      ELSIF v_platform = 'jd' THEN
        SELECT
          MIN(stat_date),
          MAX(stat_date),
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_min_date, v_max_date, v_max_updated_at
        FROM ods.jd_trade_sale_raw
        WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') >= v_safe_watermark;
      ELSIF v_platform = 'taobao' THEN
        SELECT
          MIN(stat_date),
          MAX(stat_date),
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_min_date, v_max_date, v_max_updated_at
        FROM ods.taobao_trade_sale_raw
        WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') >= v_safe_watermark;
      ELSIF v_platform = 'wx' THEN
        SELECT
          MIN(stat_date),
          MAX(stat_date),
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_min_date, v_max_date, v_max_updated_at
        FROM ods.wx_trade_sale_raw
        WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') >= v_safe_watermark;
      ELSE
        SELECT
          MIN(stat_date),
          MAX(stat_date),
          MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
        INTO v_min_date, v_max_date, v_max_updated_at
        FROM ods.xhs_trade_sale_raw
        WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') >= v_safe_watermark;
      END IF;

      IF v_min_date IS NULL OR v_max_date IS NULL THEN
        RAISE NOTICE 'platform % has no ODS updates since % (safe_watermark: %), skipped',
          v_platform,
          v_last_ods_updated_at,
          v_safe_watermark;
        CONTINUE;
      END IF;

      IF v_min_date > v_fallback_start_date THEN
        v_min_date := v_fallback_start_date;
      END IF;

      CALL ads.refresh_all_trade_overview_platform(v_platform, v_min_date, v_max_date);

      UPDATE etl.all_trade_overview_refresh_state
      SET
        last_ods_updated_at = GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at)),
        last_refresh_at = v_now,
        last_refresh_start_date = v_min_date,
        last_refresh_end_date = v_max_date,
        updated_at = v_now
      WHERE platform = v_platform;

      RAISE NOTICE 'platform %, window [% - %], watermark updated to %',
        v_platform,
        v_min_date,
        v_max_date,
        GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at));
    END LOOP;

    IF NOT p_init_watermark_only THEN
      CALL ads.refresh_all_trade_overview_refund_nowcast_daily(CURRENT_DATE, 21, 120);
      CALL ads.refresh_all_trade_overview_refund_nowcast_quality_daily(CURRENT_DATE, 1, 14, 0.15, 10);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('ads.refresh_all_trade_overview_incremental'));
      RAISE;
  END;

  PERFORM pg_advisory_unlock(hashtext('ads.refresh_all_trade_overview_incremental'));
END;
$$;

COMMIT;
