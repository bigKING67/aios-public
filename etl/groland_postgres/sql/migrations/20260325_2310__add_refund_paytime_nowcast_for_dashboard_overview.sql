BEGIN;

ALTER TABLE ads.all_trade_overview
  ADD COLUMN IF NOT EXISTS refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0;

UPDATE ads.all_trade_overview
SET
  refund_amount_refund_time = COALESCE(refund_amount_refund_time, refund_amount, 0),
  refund_amount_pay_time = COALESCE(refund_amount_pay_time, refund_amount_refund_time, refund_amount, 0),
  refund_amount = COALESCE(refund_amount_refund_time, refund_amount, 0),
  gsv = (COALESCE(gmv, 0) - COALESCE(refund_amount_refund_time, refund_amount, 0))::NUMERIC(18, 2),
  refund_rate = CASE
    WHEN COALESCE(gmv, 0) > 0 THEN ROUND(
      (COALESCE(refund_amount_refund_time, refund_amount, 0) / NULLIF(COALESCE(gmv, 0), 0)),
      6
    )
    ELSE NULL::NUMERIC(10, 6)
  END;

COMMENT ON COLUMN ads.all_trade_overview.refund_amount IS '退款金额（退款时间，兼容字段）。';
COMMENT ON COLUMN ads.all_trade_overview.refund_amount_refund_time IS '退款金额（退款时间）。';
COMMENT ON COLUMN ads.all_trade_overview.refund_amount_pay_time IS '退款金额（支付时间）。';
COMMENT ON COLUMN ads.all_trade_overview.gsv IS 'GSV（兼容字段，当前按退款时间口径计算）。';
COMMENT ON COLUMN ads.all_trade_overview.refund_rate IS '退款率（兼容字段，当前按退款时间口径计算）。';

CREATE TABLE IF NOT EXISTS ads.all_trade_overview_refund_nowcast_daily (
  "date" DATE NOT NULL,
  platform VARCHAR(20) NOT NULL,
  as_of_date DATE NOT NULL,
  refund_amount_pay_time_current NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount_pay_time_predicted NUMERIC(18, 2) NOT NULL DEFAULT 0,
  completeness_ratio NUMERIC(10, 6) NOT NULL DEFAULT 1,
  prediction_confidence VARCHAR(20) NOT NULL DEFAULT 'low',
  model_version VARCHAR(64) NOT NULL DEFAULT 'v1_curve_21d',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_overview_refund_nowcast_daily PRIMARY KEY ("date", platform, as_of_date),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_daily_platform
    CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_daily_confidence
    CHECK (prediction_confidence IN ('high', 'medium', 'low')),
  CONSTRAINT chk_all_trade_overview_refund_nowcast_daily_ratio
    CHECK (completeness_ratio > 0 AND completeness_ratio <= 1.2)
);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_daily_asof
  ON ads.all_trade_overview_refund_nowcast_daily (as_of_date, platform);

CREATE INDEX IF NOT EXISTS idx_all_trade_overview_refund_nowcast_daily_platform_date
  ON ads.all_trade_overview_refund_nowcast_daily (platform, "date");

COMMENT ON TABLE ads.all_trade_overview_refund_nowcast_daily IS '看板退款金额（支付时间）nowcast日快照表，保存当前观测值与预测终值。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_daily.refund_amount_pay_time_current IS '截至 as_of_date 的退款金额（支付时间）当前观测值。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_daily.refund_amount_pay_time_predicted IS '退款金额（支付时间）预测终值。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_daily.completeness_ratio IS '观测完备率：current / predicted。';
COMMENT ON COLUMN ads.all_trade_overview_refund_nowcast_daily.prediction_confidence IS '预测置信度：high/medium/low。';

CREATE OR REPLACE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_daily_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_all_trade_overview_refund_nowcast_daily_updated_at
ON ads.all_trade_overview_refund_nowcast_daily;

CREATE TRIGGER trg_touch_all_trade_overview_refund_nowcast_daily_updated_at
BEFORE UPDATE ON ads.all_trade_overview_refund_nowcast_daily
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_overview_refund_nowcast_daily_updated_at();

CREATE OR REPLACE FUNCTION ads.fn_assert_ods_columns_exist(
  p_schema TEXT,
  p_table TEXT,
  p_columns TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_missing_cols TEXT[];
BEGIN
  SELECT ARRAY_AGG(req.col ORDER BY req.col)
  INTO v_missing_cols
  FROM UNNEST(p_columns) AS req(col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = p_schema
      AND c.table_name = p_table
      AND c.column_name = req.col
  );

  IF v_missing_cols IS NOT NULL AND ARRAY_LENGTH(v_missing_cols, 1) > 0 THEN
    RAISE EXCEPTION
      'missing required ODS columns on %.%: %',
      p_schema,
      p_table,
      ARRAY_TO_STRING(v_missing_cols, ', ');
  END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_refund_nowcast_daily(
  IN p_as_of_date DATE DEFAULT NULL,
  IN p_maturity_days INTEGER DEFAULT 21,
  IN p_history_days INTEGER DEFAULT 120
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of_date DATE := COALESCE(p_as_of_date, CURRENT_DATE);
  v_model_version TEXT := format('v1_curve_%sd', p_maturity_days);
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
          p.refund_amount_pay_time_current / NULLIF(p.completeness_ratio, 0)
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

CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_platform(
  IN p_platform VARCHAR(20),
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_rows BIGINT := 0;
  v_inserted_rows BIGINT := 0;
BEGIN
  IF p_platform NOT IN ('douyin', 'jd', 'taobao', 'wx', 'xhs') THEN
    RAISE EXCEPTION 'unsupported platform: %', p_platform;
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date must both be provided';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) cannot be greater than p_end_date (%)', p_start_date, p_end_date;
  END IF;

  IF to_regclass('ads.all_trade_overview') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_overview does not exist';
  END IF;

  IF to_regclass('pg_temp.tmp_ads_all_trade_overview_platform_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_overview_platform_new';
  END IF;

  CREATE TEMP TABLE tmp_ads_all_trade_overview_platform_new (
    "date" DATE NOT NULL,
    platform VARCHAR(20) NOT NULL,
    gmv NUMERIC(18, 2) NOT NULL,
    cost NUMERIC(18, 2),
    gmv_from_cost NUMERIC(18, 2),
    roi NUMERIC(18, 4),
    roi_from_cost NUMERIC(18, 4),
    order_count BIGINT NOT NULL,
    buyer_count BIGINT NOT NULL,
    arpu NUMERIC(18, 4),
    refund_amount_pay_time NUMERIC(18, 2) NOT NULL,
    refund_amount_refund_time NUMERIC(18, 2) NOT NULL,
    refund_amount NUMERIC(18, 2) NOT NULL,
    gsv NUMERIC(18, 2) NOT NULL,
    refund_rate NUMERIC(10, 6)
  ) ON COMMIT DROP;

  IF p_platform = 'douyin' THEN
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'douyin_trade_sale_raw',
      ARRAY[
        'trade_refund_amount_pay_time',
        'trade_refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.trade_refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.douyin_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
      GROUP BY src.stat_date::DATE
    )
    SELECT
      a.trade_date AS "date",
      p_platform AS platform,
      a.gmv,
      NULL::NUMERIC(18, 2) AS cost,
      NULL::NUMERIC(18, 2) AS gmv_from_cost,
      NULL::NUMERIC(18, 4) AS roi,
      NULL::NUMERIC(18, 4) AS roi_from_cost,
      a.order_count,
      a.buyer_count,
      CASE
        WHEN a.buyer_count > 0 THEN ROUND((a.gmv / a.buyer_count::NUMERIC), 4)
        ELSE NULL
      END AS arpu,
      a.refund_amount_pay_time,
      a.refund_amount_refund_time,
      a.refund_amount_refund_time AS refund_amount,
      (a.gmv - a.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_refund_time / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'jd' THEN
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'jd_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.gmv, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.jd_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
      GROUP BY src.stat_date::DATE
    )
    SELECT
      a.trade_date AS "date",
      p_platform AS platform,
      a.gmv,
      NULL::NUMERIC(18, 2) AS cost,
      NULL::NUMERIC(18, 2) AS gmv_from_cost,
      NULL::NUMERIC(18, 4) AS roi,
      NULL::NUMERIC(18, 4) AS roi_from_cost,
      a.order_count,
      a.buyer_count,
      CASE
        WHEN a.buyer_count > 0 THEN ROUND((a.gmv / a.buyer_count::NUMERIC), 4)
        ELSE NULL
      END AS arpu,
      a.refund_amount_pay_time,
      a.refund_amount_refund_time,
      a.refund_amount_refund_time AS refund_amount,
      (a.gmv - a.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_refund_time / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'taobao' THEN
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'taobao_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_parent_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.taobao_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
      GROUP BY src.stat_date::DATE
    )
    SELECT
      a.trade_date AS "date",
      p_platform AS platform,
      a.gmv,
      NULL::NUMERIC(18, 2) AS cost,
      NULL::NUMERIC(18, 2) AS gmv_from_cost,
      NULL::NUMERIC(18, 4) AS roi,
      NULL::NUMERIC(18, 4) AS roi_from_cost,
      a.order_count,
      a.buyer_count,
      CASE
        WHEN a.buyer_count > 0 THEN ROUND((a.gmv / a.buyer_count::NUMERIC), 4)
        ELSE NULL
      END AS arpu,
      a.refund_amount_pay_time,
      a.refund_amount_refund_time,
      a.refund_amount_refund_time AS refund_amount,
      (a.gmv - a.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_refund_time / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'wx' THEN
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'wx_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.wx_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
      GROUP BY src.stat_date::DATE
    )
    SELECT
      a.trade_date AS "date",
      p_platform AS platform,
      a.gmv,
      NULL::NUMERIC(18, 2) AS cost,
      NULL::NUMERIC(18, 2) AS gmv_from_cost,
      NULL::NUMERIC(18, 4) AS roi,
      NULL::NUMERIC(18, 4) AS roi_from_cost,
      a.order_count,
      a.buyer_count,
      CASE
        WHEN a.buyer_count > 0 THEN ROUND((a.gmv / a.buyer_count::NUMERIC), 4)
        ELSE NULL
      END AS arpu,
      a.refund_amount_pay_time,
      a.refund_amount_refund_time,
      a.refund_amount_refund_time AS refund_amount,
      (a.gmv - a.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_refund_time / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSE
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'xhs_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.xhs_trade_sale_raw src
      WHERE src.stat_date BETWEEN p_start_date AND p_end_date
      GROUP BY src.stat_date::DATE
    )
    SELECT
      a.trade_date AS "date",
      p_platform AS platform,
      a.gmv,
      NULL::NUMERIC(18, 2) AS cost,
      NULL::NUMERIC(18, 2) AS gmv_from_cost,
      NULL::NUMERIC(18, 4) AS roi,
      NULL::NUMERIC(18, 4) AS roi_from_cost,
      a.order_count,
      a.buyer_count,
      CASE
        WHEN a.buyer_count > 0 THEN ROUND((a.gmv / a.buyer_count::NUMERIC), 4)
        ELSE NULL
      END AS arpu,
      a.refund_amount_pay_time,
      a.refund_amount_refund_time,
      a.refund_amount_refund_time AS refund_amount,
      (a.gmv - a.refund_amount_refund_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_refund_time / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  END IF;

  DELETE FROM ads.all_trade_overview
  WHERE platform = p_platform
    AND "date" BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.all_trade_overview (
    "date",
    platform,
    gmv,
    cost,
    gmv_from_cost,
    roi,
    roi_from_cost,
    order_count,
    buyer_count,
    arpu,
    refund_amount,
    refund_amount_refund_time,
    refund_amount_pay_time,
    gsv,
    refund_rate
  )
  SELECT
    n."date",
    n.platform,
    n.gmv,
    n.cost,
    n.gmv_from_cost,
    n.roi,
    n.roi_from_cost,
    n.order_count,
    n.buyer_count,
    n.arpu,
    n.refund_amount,
    n.refund_amount_refund_time,
    n.refund_amount_pay_time,
    n.gsv,
    n.refund_rate
  FROM tmp_ads_all_trade_overview_platform_new n;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_all_trade_overview_platform completed, platform: %, deleted: %, inserted: %, window: [% - %]',
    p_platform,
    v_deleted_rows,
    v_inserted_rows,
    p_start_date,
    p_end_date;
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
