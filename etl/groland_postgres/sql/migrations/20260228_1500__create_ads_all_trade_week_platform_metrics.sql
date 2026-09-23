BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform_metrics(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform_metrics_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_all_trade_week_platform_metrics_updated_at();
DROP TABLE IF EXISTS etl.all_trade_week_platform_metrics_refresh_state;
DROP TABLE IF EXISTS ads.all_trade_week_platform_metrics;

CREATE TABLE ads.all_trade_week_platform_metrics (
  week_period VARCHAR(50) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  curr_visitor_count BIGINT NOT NULL DEFAULT 0,
  prev_visitor_count BIGINT NOT NULL DEFAULT 0,
  curr_pay_conversion_rate NUMERIC(10, 4),
  prev_pay_conversion_rate NUMERIC(10, 4),
  curr_uv_value NUMERIC(18, 2),
  prev_uv_value NUMERIC(18, 2),
  curr_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_roi NUMERIC(18, 4),
  prev_roi NUMERIC(18, 4),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_week_platform_metrics PRIMARY KEY (week_period, platform),
  CONSTRAINT chk_all_trade_week_platform_metrics_platform CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs')),
  CONSTRAINT chk_all_trade_week_platform_metrics_observed_days_range CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.all_trade_week_platform_metrics IS 'ADS-按平台周扩展指标表（当前主要补齐天猫核心指标，周六至周五）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.week_period IS '周时间段，格式: 2025/2/7～2025/2/13';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.platform IS '平台标识：douyin/jd/taobao/wx/xhs';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.as_of_date IS '同期口径截止日期（与ads.all_trade_week_platform对齐）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.curr_visitor_count IS '本周同期窗口访客数';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.prev_visitor_count IS '上周同期窗口访客数（向前平移7天）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.curr_pay_conversion_rate IS '本周同期窗口支付转化率';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.prev_pay_conversion_rate IS '上周同期窗口支付转化率';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.curr_uv_value IS '本周同期窗口UV价值';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.prev_uv_value IS '上周同期窗口UV价值';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.curr_cost IS '本周同期窗口营销消耗';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.prev_cost IS '上周同期窗口营销消耗（向前平移7天）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.curr_roi IS '本周同期窗口ROI（GMV/消耗）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.prev_roi IS '上周同期窗口ROI（GMV/消耗）';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.created_at IS '记录创建时间';
COMMENT ON COLUMN ads.all_trade_week_platform_metrics.updated_at IS '记录最后更新时间';
COMMENT ON CONSTRAINT pk_all_trade_week_platform_metrics ON ads.all_trade_week_platform_metrics IS '主键：week_period + platform';
COMMENT ON CONSTRAINT chk_all_trade_week_platform_metrics_platform ON ads.all_trade_week_platform_metrics IS '平台枚举约束：douyin/jd/taobao/wx/xhs';
COMMENT ON CONSTRAINT chk_all_trade_week_platform_metrics_observed_days_range ON ads.all_trade_week_platform_metrics IS 'observed_days 取值范围约束：1~7（允许NULL）';

CREATE INDEX idx_all_trade_week_platform_metrics_platform
  ON ads.all_trade_week_platform_metrics (platform);
COMMENT ON INDEX ads.idx_all_trade_week_platform_metrics_platform IS '按平台过滤加速索引。';

CREATE FUNCTION ads.fn_touch_all_trade_week_platform_metrics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ads.fn_touch_all_trade_week_platform_metrics_updated_at() IS '更新前自动刷新 all_trade_week_platform_metrics.updated_at 字段。';

CREATE TRIGGER trg_touch_all_trade_week_platform_metrics_updated_at
BEFORE UPDATE ON ads.all_trade_week_platform_metrics
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_week_platform_metrics_updated_at();
COMMENT ON TRIGGER trg_touch_all_trade_week_platform_metrics_updated_at ON ads.all_trade_week_platform_metrics IS '更新行时自动刷新 updated_at。';

CREATE PROCEDURE ads.refresh_all_trade_week_platform_metrics(
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
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_raw does not exist';
  END IF;

  IF to_regclass('ads.all_trade_week_platform_metrics') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_week_platform_metrics does not exist';
  END IF;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NULL
     AND to_regclass('ods.taobao_one_alimama_goods_marketingscenario') IS NULL THEN
    RAISE EXCEPTION 'cost source table missing: ods.taobao_one_alimama_marketingscenario / ods.taobao_one_alimama_goods_marketingscenario';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(stat_date)),
    COALESCE(p_end_date, MAX(stat_date)),
    MAX(stat_date)
  INTO v_start_date, v_end_date, v_data_max_date
  FROM ods.taobao_trade_sale_raw;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.taobao_trade_sale_raw has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  v_effective_start := v_start_date - ((EXTRACT(DOW FROM v_start_date)::INTEGER + 1) % 7);
  v_effective_end := (v_end_date - ((EXTRACT(DOW FROM v_end_date)::INTEGER + 1) % 7)) + 6;

  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_scope') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_scope';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_daily_traffic') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_daily_traffic';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_daily_cost') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_daily_cost';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_new';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_all_trade_week_platform_metrics_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_all_trade_week_platform_metrics_updated';
  END IF;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_scope ON COMMIT DROP AS
  SELECT
    gs::DATE AS week_start,
    (gs::DATE + 6) AS week_end,
    to_char(gs::DATE, 'YYYY/FMMM/FMDD') || '～' || to_char((gs::DATE + 6), 'YYYY/FMMM/FMDD') AS week_period
  FROM generate_series(v_effective_start, v_effective_end, INTERVAL '7 day') AS gs;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_daily_traffic ON COMMIT DROP AS
  SELECT
    src.stat_date::DATE AS stat_date,
    SUM(COALESCE(src.visitor_count, 0))::BIGINT AS visitor_count
  FROM ods.taobao_trade_sale_raw src
  WHERE src.stat_date BETWEEN (v_effective_start - 7) AND v_effective_end
  GROUP BY src.stat_date::DATE;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NOT NULL THEN
    CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_daily_cost ON COMMIT DROP AS
    SELECT
      src.stat_date::DATE AS stat_date,
      SUM(COALESCE(src.cost, 0))::NUMERIC(18, 2) AS cost
    FROM ods.taobao_one_alimama_marketingscenario src
    WHERE src.stat_date BETWEEN (v_effective_start - 7) AND v_effective_end
    GROUP BY src.stat_date::DATE;

    RAISE NOTICE 'cost source table: ods.taobao_one_alimama_marketingscenario';
  ELSE
    CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_daily_cost ON COMMIT DROP AS
    SELECT
      src.stat_date::DATE AS stat_date,
      SUM(COALESCE(src.cost, 0))::NUMERIC(18, 2) AS cost
    FROM ods.taobao_one_alimama_goods_marketingscenario src
    WHERE src.stat_date BETWEEN (v_effective_start - 7) AND v_effective_end
    GROUP BY src.stat_date::DATE;

    RAISE NOTICE 'cost source table fallback: ods.taobao_one_alimama_goods_marketingscenario';
  END IF;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_new ON COMMIT DROP AS
  WITH taobao_base AS (
    SELECT
      ws.week_period,
      ws.week_start,
      ws.week_end,
      'taobao'::VARCHAR(20) AS platform,
      COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date))::DATE AS as_of_date,
      COALESCE(
        p.observed_days,
        (COALESCE(p.as_of_date, LEAST(ws.week_end, v_data_max_date)) - ws.week_start + 1)::SMALLINT
      )::SMALLINT AS observed_days,
      CASE
        WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
          THEN p.curr_gmv_sync
        ELSE p.curr_gmv
      END::NUMERIC(18, 2) AS curr_gmv,
      CASE
        WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
          THEN p.prev_gmv_sync
        ELSE p.prev_gmv
      END::NUMERIC(18, 2) AS prev_gmv,
      CASE
        WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
          THEN p.curr_buyer_sync
        ELSE p.curr_buyer_count
      END::BIGINT AS curr_buyer_count,
      CASE
        WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
          THEN p.prev_buyer_sync
        ELSE p.prev_buyer_count
      END::BIGINT AS prev_buyer_count
    FROM tmp_ads_all_trade_week_platform_metrics_scope ws
    JOIN ads.all_trade_week_platform p
      ON p.week_period = ws.week_period
    WHERE p.platform = 'taobao'
  ),
  taobao_enriched AS (
    SELECT
      b.week_period,
      b.platform,
      b.as_of_date,
      b.observed_days,
      COALESCE((
        SELECT SUM(t.visitor_count)::BIGINT
        FROM tmp_ads_all_trade_week_platform_metrics_daily_traffic t
        WHERE t.stat_date BETWEEN b.week_start AND b.as_of_date
      ), 0)::BIGINT AS curr_visitor_count,
      COALESCE((
        SELECT SUM(t.visitor_count)::BIGINT
        FROM tmp_ads_all_trade_week_platform_metrics_daily_traffic t
        WHERE t.stat_date BETWEEN (b.week_start - 7) AND (b.as_of_date - 7)
      ), 0)::BIGINT AS prev_visitor_count,
      COALESCE((
        SELECT SUM(c.cost)::NUMERIC(18, 2)
        FROM tmp_ads_all_trade_week_platform_metrics_daily_cost c
        WHERE c.stat_date BETWEEN b.week_start AND b.as_of_date
      ), 0)::NUMERIC(18, 2) AS curr_cost,
      COALESCE((
        SELECT SUM(c.cost)::NUMERIC(18, 2)
        FROM tmp_ads_all_trade_week_platform_metrics_daily_cost c
        WHERE c.stat_date BETWEEN (b.week_start - 7) AND (b.as_of_date - 7)
      ), 0)::NUMERIC(18, 2) AS prev_cost,
      b.curr_gmv,
      b.prev_gmv,
      b.curr_buyer_count,
      b.prev_buyer_count
    FROM taobao_base b
  )
  SELECT
    e.week_period,
    e.platform,
    e.as_of_date,
    e.observed_days,
    e.curr_visitor_count,
    e.prev_visitor_count,
    CASE
      WHEN e.curr_visitor_count > 0 THEN ROUND((e.curr_buyer_count::NUMERIC / e.curr_visitor_count), 4)
      ELSE NULL
    END AS curr_pay_conversion_rate,
    CASE
      WHEN e.prev_visitor_count > 0 THEN ROUND((e.prev_buyer_count::NUMERIC / e.prev_visitor_count), 4)
      ELSE NULL
    END AS prev_pay_conversion_rate,
    CASE
      WHEN e.curr_visitor_count > 0 THEN ROUND((e.curr_gmv / e.curr_visitor_count), 2)
      ELSE NULL
    END AS curr_uv_value,
    CASE
      WHEN e.prev_visitor_count > 0 THEN ROUND((e.prev_gmv / e.prev_visitor_count), 2)
      ELSE NULL
    END AS prev_uv_value,
    e.curr_cost,
    e.prev_cost,
    CASE
      WHEN e.curr_cost > 0 THEN ROUND((e.curr_gmv / e.curr_cost), 4)
      ELSE NULL
    END AS curr_roi,
    CASE
      WHEN e.prev_cost > 0 THEN ROUND((e.prev_gmv / e.prev_cost), 4)
      ELSE NULL
    END AS prev_roi
  FROM taobao_enriched e;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_existing ON COMMIT DROP AS
  SELECT t.*
  FROM ads.all_trade_week_platform_metrics t
  JOIN tmp_ads_all_trade_week_platform_metrics_scope ws
    ON ws.week_period = t.week_period;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_ads_all_trade_week_platform_metrics_new n
  LEFT JOIN tmp_ads_all_trade_week_platform_metrics_existing e
    ON e.week_period = n.week_period
   AND e.platform = n.platform
  WHERE e.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_deleted ON COMMIT DROP AS
  SELECT e.week_period, e.platform
  FROM tmp_ads_all_trade_week_platform_metrics_existing e
  LEFT JOIN tmp_ads_all_trade_week_platform_metrics_new n
    ON n.week_period = e.week_period
   AND n.platform = e.platform
  WHERE n.week_period IS NULL;

  CREATE TEMP TABLE tmp_ads_all_trade_week_platform_metrics_updated ON COMMIT DROP AS
  SELECT
    n.week_period,
    n.platform,
    n.as_of_date,
    n.observed_days,
    n.curr_visitor_count,
    n.prev_visitor_count,
    n.curr_pay_conversion_rate,
    n.prev_pay_conversion_rate,
    n.curr_uv_value,
    n.prev_uv_value,
    n.curr_cost,
    n.prev_cost,
    n.curr_roi,
    n.prev_roi,
    e.curr_visitor_count AS old_curr_visitor_count,
    e.curr_roi AS old_curr_roi
  FROM tmp_ads_all_trade_week_platform_metrics_new n
  JOIN tmp_ads_all_trade_week_platform_metrics_existing e
    ON e.week_period = n.week_period
   AND e.platform = n.platform
  WHERE ROW(
    n.as_of_date,
    n.observed_days,
    n.curr_visitor_count,
    n.prev_visitor_count,
    n.curr_pay_conversion_rate,
    n.prev_pay_conversion_rate,
    n.curr_uv_value,
    n.prev_uv_value,
    n.curr_cost,
    n.prev_cost,
    n.curr_roi,
    n.prev_roi
  ) IS DISTINCT FROM ROW(
    e.as_of_date,
    e.observed_days,
    e.curr_visitor_count,
    e.prev_visitor_count,
    e.curr_pay_conversion_rate,
    e.prev_pay_conversion_rate,
    e.curr_uv_value,
    e.prev_uv_value,
    e.curr_cost,
    e.prev_cost,
    e.curr_roi,
    e.prev_roi
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_ads_all_trade_week_platform_metrics_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_ads_all_trade_week_platform_metrics_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_ads_all_trade_week_platform_metrics_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_ads_all_trade_week_platform_metrics_new n
  JOIN tmp_ads_all_trade_week_platform_metrics_existing e
    ON e.week_period = n.week_period
   AND e.platform = n.platform
  WHERE ROW(
    n.as_of_date,
    n.observed_days,
    n.curr_visitor_count,
    n.prev_visitor_count,
    n.curr_pay_conversion_rate,
    n.prev_pay_conversion_rate,
    n.curr_uv_value,
    n.prev_uv_value,
    n.curr_cost,
    n.prev_cost,
    n.curr_roi,
    n.prev_roi
  ) IS NOT DISTINCT FROM ROW(
    e.as_of_date,
    e.observed_days,
    e.curr_visitor_count,
    e.prev_visitor_count,
    e.curr_pay_conversion_rate,
    e.prev_pay_conversion_rate,
    e.curr_uv_value,
    e.prev_uv_value,
    e.curr_cost,
    e.prev_cost,
    e.curr_roi,
    e.prev_roi
  );

  DELETE FROM ads.all_trade_week_platform_metrics t
  USING tmp_ads_all_trade_week_platform_metrics_deleted d
  WHERE t.week_period = d.week_period
    AND t.platform = d.platform;

  UPDATE ads.all_trade_week_platform_metrics t
  SET
    as_of_date = u.as_of_date,
    observed_days = u.observed_days,
    curr_visitor_count = u.curr_visitor_count,
    prev_visitor_count = u.prev_visitor_count,
    curr_pay_conversion_rate = u.curr_pay_conversion_rate,
    prev_pay_conversion_rate = u.prev_pay_conversion_rate,
    curr_uv_value = u.curr_uv_value,
    prev_uv_value = u.prev_uv_value,
    curr_cost = u.curr_cost,
    prev_cost = u.prev_cost,
    curr_roi = u.curr_roi,
    prev_roi = u.prev_roi
  FROM tmp_ads_all_trade_week_platform_metrics_updated u
  WHERE t.week_period = u.week_period
    AND t.platform = u.platform;

  INSERT INTO ads.all_trade_week_platform_metrics (
    week_period,
    platform,
    as_of_date,
    observed_days,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_uv_value,
    prev_uv_value,
    curr_cost,
    prev_cost,
    curr_roi,
    prev_roi
  )
  SELECT
    week_period,
    platform,
    as_of_date,
    observed_days,
    curr_visitor_count,
    prev_visitor_count,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_uv_value,
    prev_uv_value,
    curr_cost,
    prev_cost,
    curr_roi,
    prev_roi
  FROM tmp_ads_all_trade_week_platform_metrics_inserted;

  RAISE NOTICE 'refresh_all_trade_week_platform_metrics completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows,
    v_updated_rows,
    v_deleted_rows,
    v_unchanged_rows,
    v_effective_start,
    v_effective_end;

  FOR v_insert_detail IN
    SELECT
      week_period,
      curr_visitor_count,
      curr_roi
    FROM tmp_ads_all_trade_week_platform_metrics_inserted
    ORDER BY week_period
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: week_period=%, platform=taobao, curr_visitor_count=%, curr_roi=%',
      v_insert_detail.week_period,
      v_insert_detail.curr_visitor_count,
      v_insert_detail.curr_roi;
  END LOOP;

  FOR v_update_detail IN
    SELECT
      week_period,
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_curr_visitor_count IS DISTINCT FROM curr_visitor_count THEN format('curr_visitor_count:%s->%s', COALESCE(old_curr_visitor_count::TEXT, 'NULL'), COALESCE(curr_visitor_count::TEXT, 'NULL')) END,
        CASE WHEN old_curr_roi IS DISTINCT FROM curr_roi THEN format('curr_roi:%s->%s', COALESCE(old_curr_roi::TEXT, 'NULL'), COALESCE(curr_roi::TEXT, 'NULL')) END
      ), '') AS change_summary
    FROM tmp_ads_all_trade_week_platform_metrics_updated
    ORDER BY week_period
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: week_period=%, platform=taobao, changes=%',
      v_update_detail.week_period,
      COALESCE(v_update_detail.change_summary, '无字段变化');
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_week_platform_metrics(DATE, DATE)
IS '按周窗口刷新 ADS 平台扩展指标（天猫访客/支付转化率/UV价值/ROI 等），与 ads.all_trade_week_platform 同期口径对齐。';

CREATE TABLE etl.all_trade_week_platform_metrics_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_all_trade_week_platform_metrics_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.all_trade_week_platform_metrics_refresh_state IS 'ADS 平台扩展指标增量刷新水位状态表。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.id IS '固定单行主键（恒为1）。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.last_source_updated_at IS '最近一次已处理的上游更新时间水位。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.last_refresh_at IS '最近一次 ADS 刷新执行时间。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.last_refresh_start_date IS '最近一次 ADS 刷新窗口起始日期。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.last_refresh_end_date IS '最近一次 ADS 刷新窗口结束日期。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.all_trade_week_platform_metrics_refresh_state.updated_at IS '记录更新时间。';

INSERT INTO etl.all_trade_week_platform_metrics_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_all_trade_week_platform_metrics_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_trade_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_cost_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_platform_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;

  v_trade_min_date DATE;
  v_trade_max_date DATE;
  v_cost_min_date DATE;
  v_cost_max_date DATE;
  v_platform_min_date DATE;
  v_platform_max_date DATE;

  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.taobao_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_raw does not exist';
  END IF;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NULL
     AND to_regclass('ods.taobao_one_alimama_goods_marketingscenario') IS NULL THEN
    RAISE EXCEPTION 'cost source table missing: ods.taobao_one_alimama_marketingscenario / ods.taobao_one_alimama_goods_marketingscenario';
  END IF;

  IF to_regclass('ads.all_trade_week_platform_metrics') IS NULL THEN
    RAISE EXCEPTION 'target table ads.all_trade_week_platform_metrics does not exist';
  END IF;

  INSERT INTO etl.all_trade_week_platform_metrics_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.all_trade_week_platform_metrics_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_trade_max_updated_at
  FROM ods.taobao_trade_sale_raw;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NOT NULL THEN
    SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
    INTO v_cost_max_updated_at
    FROM ods.taobao_one_alimama_marketingscenario;
  ELSE
    SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00'))
    INTO v_cost_max_updated_at
    FROM ods.taobao_one_alimama_goods_marketingscenario;
  END IF;

  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00'))
  INTO v_platform_max_updated_at
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao';

  v_source_max_updated_at := GREATEST(
    COALESCE(v_trade_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_cost_max_updated_at, TIMESTAMP '1970-01-01 00:00:00'),
    COALESCE(v_platform_max_updated_at, TIMESTAMP '1970-01-01 00:00:00')
  );

  IF p_init_watermark_only THEN
    UPDATE etl.all_trade_week_platform_metrics_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  IF v_source_max_updated_at <= COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00') THEN
    RAISE NOTICE 'no source updates since %, skipped', v_last_source_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(stat_date),
    MAX(stat_date)
  INTO v_trade_min_date, v_trade_max_date
  FROM ods.taobao_trade_sale_raw
  WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_source_updated_at;

  IF to_regclass('ods.taobao_one_alimama_marketingscenario') IS NOT NULL THEN
    SELECT
      MIN(stat_date),
      MAX(stat_date)
    INTO v_cost_min_date, v_cost_max_date
    FROM ods.taobao_one_alimama_marketingscenario
    WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_source_updated_at;
  ELSE
    SELECT
      MIN(stat_date),
      MAX(stat_date)
    INTO v_cost_min_date, v_cost_max_date
    FROM ods.taobao_one_alimama_goods_marketingscenario
    WHERE COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_source_updated_at;
  END IF;

  SELECT
    MIN(COALESCE(as_of_date, TO_DATE(split_part(week_period, '～', 1), 'YYYY/FMMM/FMDD'))),
    MAX(COALESCE(as_of_date, TO_DATE(split_part(week_period, '～', 2), 'YYYY/FMMM/FMDD')))
  INTO v_platform_min_date, v_platform_max_date
  FROM ads.all_trade_week_platform
  WHERE platform = 'taobao'
    AND COALESCE(updated_at, TIMESTAMP '1970-01-01 00:00:00') > v_last_source_updated_at;

  v_refresh_start_date := NULL;
  v_refresh_end_date := NULL;

  IF v_trade_min_date IS NOT NULL THEN
    v_refresh_start_date := v_trade_min_date;
    v_refresh_end_date := v_trade_max_date;
  END IF;

  IF v_cost_min_date IS NOT NULL THEN
    IF v_refresh_start_date IS NULL OR v_cost_min_date < v_refresh_start_date THEN
      v_refresh_start_date := v_cost_min_date;
    END IF;
    IF v_refresh_end_date IS NULL OR v_cost_max_date > v_refresh_end_date THEN
      v_refresh_end_date := v_cost_max_date;
    END IF;
  END IF;

  IF v_platform_min_date IS NOT NULL THEN
    IF v_refresh_start_date IS NULL OR v_platform_min_date < v_refresh_start_date THEN
      v_refresh_start_date := v_platform_min_date;
    END IF;
    IF v_refresh_end_date IS NULL OR v_platform_max_date > v_refresh_end_date THEN
      v_refresh_end_date := v_platform_max_date;
    END IF;
  END IF;

  IF v_refresh_start_date IS NULL OR v_refresh_end_date IS NULL THEN
    v_refresh_end_date := CURRENT_DATE;
    v_refresh_start_date := CURRENT_DATE;
  END IF;

  v_fallback_start_date := CURRENT_DATE - (p_fallback_window_days - 1);

  IF v_refresh_start_date > v_fallback_start_date THEN
    v_refresh_start_date := v_fallback_start_date;
  END IF;

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_refresh_end_date;
  END IF;

  CALL ads.refresh_all_trade_week_platform_metrics(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.all_trade_week_platform_metrics_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE 'incremental refresh completed, window [% - %], source_max_updated_at %',
    v_refresh_start_date,
    v_refresh_end_date,
    v_source_max_updated_at;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_week_platform_metrics_incremental(INTEGER, BOOLEAN)
IS 'ADS 平台扩展指标增量刷新：基于 ODS 与平台周汇总更新时间水位增量计算。';

CALL ads.refresh_all_trade_week_platform_metrics(NULL, NULL);
CALL ads.refresh_all_trade_week_platform_metrics_incremental(14, TRUE);

COMMIT;
