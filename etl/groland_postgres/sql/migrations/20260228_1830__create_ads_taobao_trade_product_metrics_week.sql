BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_taobao_trade_product_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_trade_product_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_taobao_trade_product_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.taobao_trade_product_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.taobao_trade_product_metrics_week;

CREATE TABLE ads.taobao_trade_product_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  product_name VARCHAR(500),
  as_of_date DATE,
  observed_days SMALLINT,
  curr_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gmv_delta NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_pay_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_pay_buyer_count BIGINT NOT NULL DEFAULT 0,
  curr_visitor_count BIGINT NOT NULL DEFAULT 0,
  prev_visitor_count BIGINT NOT NULL DEFAULT 0,
  curr_pay_conversion_rate NUMERIC(10, 4),
  prev_pay_conversion_rate NUMERIC(10, 4),
  curr_avg_order_value NUMERIC(18, 2),
  prev_avg_order_value NUMERIC(18, 2),
  gmv_delta_contribution_rate NUMERIC(10, 4),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_taobao_trade_product_metrics_week PRIMARY KEY (week_period, platform, product_id),
  CONSTRAINT chk_taobao_trade_product_metrics_week_platform CHECK (platform IN ('taobao')),
  CONSTRAINT chk_taobao_trade_product_metrics_week_observed_days_range CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.taobao_trade_product_metrics_week IS 'ADS-天猫商品周归因指标表（周六至周五）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.week_period IS '周时间段，格式: 2025/2/7～2025/2/13。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.platform IS '平台标识，当前固定 taobao。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.product_id IS '商品ID。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.product_name IS '商品名称（优先本周窗口）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.as_of_date IS '同期口径截止日期（与 ads.all_trade_week_platform 对齐）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.curr_gmv IS '本周同期窗口商品GMV。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.prev_gmv IS '上周同期窗口商品GMV（向前平移7天）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.gmv_delta IS '商品GMV增量（curr_gmv - prev_gmv）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.curr_pay_buyer_count IS '本周同期窗口成交人数（pay_buyer_count累计）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.prev_pay_buyer_count IS '上周同期窗口成交人数（pay_buyer_count累计）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.curr_visitor_count IS '本周同期窗口访客数（product_visitor_count累计）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.prev_visitor_count IS '上周同期窗口访客数（product_visitor_count累计）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.curr_pay_conversion_rate IS '本周同期窗口支付转化率（成交人数/访客）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.prev_pay_conversion_rate IS '上周同期窗口支付转化率（成交人数/访客）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.curr_avg_order_value IS '本周同期窗口客单价（GMV/成交人数）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.prev_avg_order_value IS '上周同期窗口客单价（GMV/成交人数）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.gmv_delta_contribution_rate IS '商品GMV增量贡献率（gmv_delta / 周总增量）。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.taobao_trade_product_metrics_week.updated_at IS '记录最后更新时间。';
COMMENT ON CONSTRAINT pk_taobao_trade_product_metrics_week ON ads.taobao_trade_product_metrics_week IS '主键：week_period + platform + product_id。';
COMMENT ON CONSTRAINT chk_taobao_trade_product_metrics_week_platform ON ads.taobao_trade_product_metrics_week IS '平台枚举约束：当前仅 taobao。';
COMMENT ON CONSTRAINT chk_taobao_trade_product_metrics_week_observed_days_range ON ads.taobao_trade_product_metrics_week IS 'observed_days 范围约束：1~7（允许NULL）。';

CREATE INDEX idx_taobao_trade_product_metrics_week_week_platform_delta
  ON ads.taobao_trade_product_metrics_week (week_period, platform, gmv_delta DESC);
COMMENT ON INDEX ads.idx_taobao_trade_product_metrics_week_week_platform_delta IS '按周按平台查看商品增量Top的排序索引。';

CREATE INDEX idx_taobao_trade_product_metrics_week_product
  ON ads.taobao_trade_product_metrics_week (product_id);
COMMENT ON INDEX ads.idx_taobao_trade_product_metrics_week_product IS '按商品ID检索加速索引。';

CREATE FUNCTION ads.fn_touch_taobao_trade_product_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ads.fn_touch_taobao_trade_product_metrics_week_updated_at() IS '更新前自动刷新 taobao_trade_product_metrics_week.updated_at 字段。';

CREATE TRIGGER trg_touch_taobao_trade_product_metrics_week_updated_at
BEFORE UPDATE ON ads.taobao_trade_product_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_taobao_trade_product_metrics_week_updated_at();
COMMENT ON TRIGGER trg_touch_taobao_trade_product_metrics_week_updated_at ON ads.taobao_trade_product_metrics_week IS '更新行时自动刷新 updated_at。';

CREATE PROCEDURE ads.refresh_taobao_trade_product_metrics_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_data_max_date DATE;
  v_effective_start DATE;
  v_effective_end DATE;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_goods_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_goods_raw does not exist';
  END IF;

  IF to_regclass('ads.taobao_trade_product_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.taobao_trade_product_metrics_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date)),
    MAX(stat_date)
  INTO v_start_date, v_end_date, v_data_max_date
  FROM ods.taobao_trade_sale_goods_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_trade_sale_goods_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  CREATE TEMP TABLE tmp_ads_taobao_trade_product_metrics_week_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_taobao_trade_product_metrics_week_new ON COMMIT DROP AS
  WITH taobao_scope AS (
    SELECT
      ws.week_period,
      ws.week_start,
      ws.week_end,
      'taobao'::VARCHAR(20) AS platform,
      COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date))::DATE AS as_of_date,
      COALESCE(
        p.observed_days,
        (COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date)) - ws.week_start + 1)::SMALLINT
      )::SMALLINT AS observed_days
    FROM tmp_ads_taobao_trade_product_metrics_week_scope ws
    JOIN ads.all_trade_week_platform p
      ON p.week_period = ws.week_period
    WHERE p.platform = 'taobao'
  ),
  product_agg AS (
    SELECT
      s.week_period,
      s.platform,
      s.as_of_date,
      s.observed_days,
      src.product_id,
      COALESCE(
        MAX(CASE
          WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date
            AND NULLIF(BTRIM(src.product_name), '') IS NOT NULL
            THEN src.product_name
        END),
        MAX(CASE
          WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7)
            AND NULLIF(BTRIM(src.product_name), '') IS NOT NULL
            THEN src.product_name
        END),
        '(未命名商品)'
      )::VARCHAR(500) AS product_name,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::NUMERIC(18, 2) AS curr_gmv,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.pay_amount, 0) ELSE 0 END)::NUMERIC(18, 2) AS prev_gmv,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.pay_buyer_count, 0) ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.pay_buyer_count, 0) ELSE 0 END)::BIGINT AS prev_pay_buyer_count,
      SUM(CASE WHEN src.stat_date BETWEEN s.week_start AND s.as_of_date THEN COALESCE(src.product_visitor_count, 0) ELSE 0 END)::BIGINT AS curr_visitor_count,
      SUM(CASE WHEN src.stat_date BETWEEN (s.week_start - 7) AND (s.as_of_date - 7) THEN COALESCE(src.product_visitor_count, 0) ELSE 0 END)::BIGINT AS prev_visitor_count
    FROM taobao_scope s
    JOIN ods.taobao_trade_sale_goods_raw src
      ON src.stat_date BETWEEN (s.week_start - 7) AND s.as_of_date
    GROUP BY
      s.week_period,
      s.platform,
      s.as_of_date,
      s.observed_days,
      src.product_id
  ),
  enriched AS (
    SELECT
      p.week_period,
      p.platform,
      p.product_id,
      p.product_name,
      p.as_of_date,
      p.observed_days,
      p.curr_gmv,
      p.prev_gmv,
      (p.curr_gmv - p.prev_gmv)::NUMERIC(18, 2) AS gmv_delta,
      p.curr_pay_buyer_count,
      p.prev_pay_buyer_count,
      p.curr_visitor_count,
      p.prev_visitor_count,
      CASE
        WHEN p.curr_visitor_count > 0 THEN ROUND((p.curr_pay_buyer_count::NUMERIC / p.curr_visitor_count), 4)
        ELSE NULL
      END AS curr_pay_conversion_rate,
      CASE
        WHEN p.prev_visitor_count > 0 THEN ROUND((p.prev_pay_buyer_count::NUMERIC / p.prev_visitor_count), 4)
        ELSE NULL
      END AS prev_pay_conversion_rate,
      CASE
        WHEN p.curr_pay_buyer_count > 0 THEN ROUND((p.curr_gmv / p.curr_pay_buyer_count), 2)
        ELSE NULL
      END AS curr_avg_order_value,
      CASE
        WHEN p.prev_pay_buyer_count > 0 THEN ROUND((p.prev_gmv / p.prev_pay_buyer_count), 2)
        ELSE NULL
      END AS prev_avg_order_value
    FROM product_agg p
    WHERE
      p.curr_gmv <> 0
      OR p.prev_gmv <> 0
      OR p.curr_pay_buyer_count <> 0
      OR p.prev_pay_buyer_count <> 0
      OR p.curr_visitor_count <> 0
      OR p.prev_visitor_count <> 0
  )
  SELECT
    e.week_period,
    e.platform,
    e.product_id,
    e.product_name,
    e.as_of_date,
    e.observed_days,
    e.curr_gmv,
    e.prev_gmv,
    e.gmv_delta,
    e.curr_pay_buyer_count,
    e.prev_pay_buyer_count,
    e.curr_visitor_count,
    e.prev_visitor_count,
    e.curr_pay_conversion_rate,
    e.prev_pay_conversion_rate,
    e.curr_avg_order_value,
    e.prev_avg_order_value,
    CASE
      WHEN SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform) <> 0
        THEN ROUND((e.gmv_delta / SUM(e.gmv_delta) OVER (PARTITION BY e.week_period, e.platform)), 4)
      ELSE NULL
    END AS gmv_delta_contribution_rate
  FROM enriched e;

  DELETE FROM ads.taobao_trade_product_metrics_week t
  USING tmp_ads_taobao_trade_product_metrics_week_scope ws
  WHERE t.week_period = ws.week_period
    AND t.platform = 'taobao';
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.taobao_trade_product_metrics_week (
    week_period,
    platform,
    product_id,
    product_name,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv,
    gmv_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    gmv_delta_contribution_rate
  )
  SELECT
    week_period,
    platform,
    product_id,
    product_name,
    as_of_date,
    observed_days,
    curr_gmv,
    prev_gmv,
    gmv_delta,
    curr_pay_buyer_count,
    prev_pay_buyer_count,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_avg_order_value,
    prev_avg_order_value,
    gmv_delta_contribution_rate
  FROM tmp_ads_taobao_trade_product_metrics_week_new;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_taobao_trade_product_metrics_week completed, inserted: %, deleted: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_effective_start,
    v_effective_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week(DATE, DATE)
IS '按周窗口刷新天猫商品周归因指标（GMV/成交人数/访客/转化率/客单价/增量贡献），并与 ads.all_trade_week_platform 同期口径对齐。';

CREATE TABLE etl.taobao_trade_product_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_taobao_trade_product_metrics_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.taobao_trade_product_metrics_week_refresh_state IS 'ADS 天猫商品周归因指标增量刷新水位状态表。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.last_source_updated_at IS '最近一次已处理的上游更新时间水位。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.last_refresh_at IS '最近一次 ADS 刷新执行时间。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.last_refresh_start_date IS '最近一次 ADS 刷新窗口起始日期。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.last_refresh_end_date IS '最近一次 ADS 刷新窗口结束日期。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.taobao_trade_product_metrics_week_refresh_state.updated_at IS '记录更新时间。';
COMMENT ON CONSTRAINT chk_taobao_trade_product_metrics_week_refresh_state_id ON etl.taobao_trade_product_metrics_week_refresh_state IS '固定单行约束（id=1）。';

INSERT INTO etl.taobao_trade_product_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_taobao_trade_product_metrics_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_goods_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_platform_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_goods_min_date DATE;
  v_goods_max_date DATE;
  v_platform_min_date DATE;
  v_platform_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.taobao_trade_product_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.taobao_trade_product_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_goods_max_updated_at
  FROM ods.taobao_trade_sale_goods_raw;

  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_platform_max_updated_at
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao';

  v_source_max_updated_at := GREATEST(
    COALESCE(v_goods_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );

  IF p_init_watermark_only THEN
    UPDATE etl.taobao_trade_product_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    UPDATE etl.taobao_trade_product_metrics_week_refresh_state
    SET
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'incremental refresh skipped, no upstream changes (last=%)', v_last_source_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date)
  INTO v_goods_min_date, v_goods_max_date
  FROM ods.taobao_trade_sale_goods_raw
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00')
    > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT
    MIN(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')) - 13),
    MAX(COALESCE(as_of_date, TO_DATE(SPLIT_PART(REPLACE(week_period, '～', '~'), '~', 2), 'YYYY/FMMM/FMDD')))
  INTO v_platform_min_date, v_platform_max_date
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao'
    AND COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00')
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(stat_date) INTO v_fallback_end_date FROM ods.taobao_trade_sale_goods_raw;
  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_goods_min_date, v_fallback_start_date),
    COALESCE(v_platform_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_goods_max_date, v_fallback_end_date),
    COALESCE(v_platform_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_taobao_trade_product_metrics_week(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.taobao_trade_product_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_trade_product_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按增量水位刷新 ADS 天猫商品周归因指标，支持仅初始化水位。';

COMMIT;
