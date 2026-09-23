-- ============================================================================
-- Rebuild report data model
-- ============================================================================
-- Goal:
--   1. Keep ads.all_trade_overview as the canonical transaction source.
--   2. Replace pure week/month transaction rollups with report_* views.
--   3. Rename weekly report-only physical tables and refresh states with report_.
--   4. Remove obsolete dwd/dws all_trade and old Alimama attribution chains.
--
-- Production execution note:
--   Run only after taking a schema/data backup and stopping obsolete Prefect
--   deployments. This migration intentionally does not create old-name
--   compatibility views.

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS dwd;
CREATE SCHEMA IF NOT EXISTS dws;
CREATE SCHEMA IF NOT EXISTS etl;

CREATE OR REPLACE FUNCTION ads.report_week_start(p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_date - ((EXTRACT(DOW FROM p_date)::INTEGER + 1) % 7))::DATE;
$$;

CREATE OR REPLACE FUNCTION ads.report_week_period(p_week_start DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(p_week_start, 'YYYY/FMMM/FMDD')
    || '～'
    || to_char((p_week_start + 6), 'YYYY/FMMM/FMDD');
$$;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('ads', 'all_trade_week_platform_metrics', 'report_all_trade_week_platform_metrics'),
        ('ads', 'douyin_trade_sale_metrics_week', 'report_douyin_trade_sale_metrics_week'),
        ('ads', 'douyin_trade_sale_channel_metrics_week', 'report_douyin_trade_sale_channel_metrics_week'),
        ('ads', 'douyin_trade_sale_live_metrics_week', 'report_douyin_trade_sale_live_metrics_week'),
        ('ads', 'douyin_trade_sale_shortvideo_metrics_week', 'report_douyin_trade_sale_shortvideo_metrics_week'),
        ('ads', 'douyin_trade_sale_card_metrics_week', 'report_douyin_trade_sale_card_metrics_week'),
        ('ads', 'taobao_trade_product_metrics_week', 'report_taobao_trade_product_metrics_week'),
        ('ads', 'taobao_goods_traffic_channel_metrics_week', 'report_taobao_goods_traffic_channel_metrics_week'),
        ('ads', 'taobao_one_goods_traffic_channel_metric_week', 'report_taobao_one_goods_traffic_channel_metric_week'),
        ('etl', 'all_trade_week_platform_metrics_refresh_state', 'report_all_trade_week_platform_metrics_refresh_state'),
        ('etl', 'douyin_trade_sale_metrics_week_refresh_state', 'report_douyin_trade_sale_metrics_week_refresh_state'),
        ('etl', 'douyin_trade_sale_channel_metrics_week_refresh_state', 'report_douyin_trade_sale_channel_metrics_week_refresh_state'),
        ('etl', 'douyin_trade_sale_live_metrics_week_refresh_state', 'report_douyin_trade_sale_live_metrics_week_refresh_state'),
        ('etl', 'douyin_trade_sale_shortvideo_metrics_week_refresh_state', 'report_douyin_trade_sale_shortvideo_metrics_week_refresh_state'),
        ('etl', 'douyin_trade_sale_card_metrics_week_refresh_state', 'report_douyin_trade_sale_card_metrics_week_refresh_state'),
        ('etl', 'taobao_trade_product_metrics_week_refresh_state', 'report_taobao_trade_product_metrics_week_refresh_state'),
        ('etl', 'taobao_goods_traffic_channel_metrics_week_refresh_state', 'report_taobao_goods_traffic_channel_metrics_week_refresh_state'),
        ('etl', 'taobao_one_goods_traffic_channel_metric_week_refresh_state', 'report_taobao_one_goods_traffic_channel_metric_week_refresh_state')
    ) AS t(schema_name, old_name, new_name)
  LOOP
    IF to_regclass(format('%I.%I', rec.schema_name, rec.old_name)) IS NULL THEN
      CONTINUE;
    END IF;

    IF to_regclass(format('%I.%I', rec.schema_name, rec.new_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'cannot rename %.% to %.% because target already exists',
        rec.schema_name, rec.old_name, rec.schema_name, rec.new_name;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I RENAME TO %I',
      rec.schema_name,
      rec.old_name,
      rec.new_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  rec RECORD;
  ddl TEXT;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('ads.refresh_all_trade_week_platform_metrics(date, date)', 'refresh_all_trade_week_platform_metrics', 'refresh_report_all_trade_week_platform_metrics'),
        ('ads.refresh_all_trade_week_platform_metrics_incremental(integer, boolean)', 'refresh_all_trade_week_platform_metrics_incremental', 'refresh_report_all_trade_week_platform_metrics_incremental'),
        ('ads.refresh_douyin_trade_sale_metrics_week(date, date)', 'refresh_douyin_trade_sale_metrics_week', 'refresh_report_douyin_trade_sale_metrics_week'),
        ('ads.refresh_douyin_trade_sale_metrics_week_incremental(integer, boolean)', 'refresh_douyin_trade_sale_metrics_week_incremental', 'refresh_report_douyin_trade_sale_metrics_week_incremental'),
        ('ads.refresh_douyin_trade_sale_channel_metrics_week(date, date)', 'refresh_douyin_trade_sale_channel_metrics_week', 'refresh_report_douyin_trade_sale_channel_metrics_week'),
        ('ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(integer, boolean)', 'refresh_douyin_trade_sale_channel_metrics_week_incremental', 'refresh_report_douyin_trade_sale_channel_metrics_week_incremental'),
        ('ads.refresh_douyin_trade_sale_live_metrics_week(date, date)', 'refresh_douyin_trade_sale_live_metrics_week', 'refresh_report_douyin_trade_sale_live_metrics_week'),
        ('ads.refresh_douyin_trade_sale_live_metrics_week_incremental(integer, boolean)', 'refresh_douyin_trade_sale_live_metrics_week_incremental', 'refresh_report_douyin_trade_sale_live_metrics_week_incremental'),
        ('ads.refresh_douyin_trade_sale_shortvideo_metrics_week(date, date)', 'refresh_douyin_trade_sale_shortvideo_metrics_week', 'refresh_report_douyin_trade_sale_shortvideo_metrics_week'),
        ('ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(integer, boolean)', 'refresh_douyin_trade_sale_shortvideo_metrics_week_incremental', 'refresh_report_douyin_trade_sale_shortvideo_metrics_week_incremental'),
        ('ads.refresh_douyin_trade_sale_card_metrics_week(date, date)', 'refresh_douyin_trade_sale_card_metrics_week', 'refresh_report_douyin_trade_sale_card_metrics_week'),
        ('ads.refresh_douyin_trade_sale_card_metrics_week_incremental(integer, boolean)', 'refresh_douyin_trade_sale_card_metrics_week_incremental', 'refresh_report_douyin_trade_sale_card_metrics_week_incremental'),
        ('ads.refresh_taobao_trade_product_metrics_week(date, date)', 'refresh_taobao_trade_product_metrics_week', 'refresh_report_taobao_trade_product_metrics_week'),
        ('ads.refresh_taobao_trade_product_metrics_week_incremental(integer, boolean)', 'refresh_taobao_trade_product_metrics_week_incremental', 'refresh_report_taobao_trade_product_metrics_week_incremental'),
        ('ads.refresh_taobao_goods_traffic_channel_metrics_week(date, date)', 'refresh_taobao_goods_traffic_channel_metrics_week', 'refresh_report_taobao_goods_traffic_channel_metrics_week'),
        ('ads.refresh_taobao_goods_traffic_channel_metrics_week_incremental(integer, boolean)', 'refresh_taobao_goods_traffic_channel_metrics_week_incremental', 'refresh_report_taobao_goods_traffic_channel_metrics_week_incremental'),
        ('ads.refresh_taobao_one_goods_traffic_channel_metric_week(date, date)', 'refresh_taobao_one_goods_traffic_channel_metric_week', 'refresh_report_taobao_one_goods_traffic_channel_metric_week'),
        ('ads.refresh_taobao_one_goods_traffic_channel_metric_week_incremental(integer, boolean)', 'refresh_taobao_one_goods_traffic_channel_metric_week_incremental', 'refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental')
    ) AS t(old_signature, old_name, new_name)
  LOOP
    IF to_regprocedure(rec.old_signature) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT pg_get_functiondef(to_regprocedure(rec.old_signature)) INTO ddl;

    ddl := replace(ddl, rec.old_name, rec.new_name);
    ddl := replace(ddl, 'ads.all_trade_week_platform_metrics', 'ads.report_all_trade_week_platform_metrics');
    ddl := replace(ddl, 'ads.douyin_trade_sale_metrics_week', 'ads.report_douyin_trade_sale_metrics_week');
    ddl := replace(ddl, 'ads.douyin_trade_sale_channel_metrics_week', 'ads.report_douyin_trade_sale_channel_metrics_week');
    ddl := replace(ddl, 'ads.douyin_trade_sale_live_metrics_week', 'ads.report_douyin_trade_sale_live_metrics_week');
    ddl := replace(ddl, 'ads.douyin_trade_sale_shortvideo_metrics_week', 'ads.report_douyin_trade_sale_shortvideo_metrics_week');
    ddl := replace(ddl, 'ads.douyin_trade_sale_card_metrics_week', 'ads.report_douyin_trade_sale_card_metrics_week');
    ddl := replace(ddl, 'ads.taobao_trade_product_metrics_week', 'ads.report_taobao_trade_product_metrics_week');
    ddl := replace(ddl, 'ads.taobao_goods_traffic_channel_metrics_week', 'ads.report_taobao_goods_traffic_channel_metrics_week');
    ddl := replace(ddl, 'ads.taobao_one_goods_traffic_channel_metric_week', 'ads.report_taobao_one_goods_traffic_channel_metric_week');
    ddl := replace(ddl, 'ads.all_trade_week_platform', 'ads.report_all_trade_week_platform');
    ddl := replace(ddl, 'ads.all_trade_week', 'ads.report_all_trade_week');
    ddl := replace(ddl, 'etl.all_trade_week_platform_metrics_refresh_state', 'etl.report_all_trade_week_platform_metrics_refresh_state');
    ddl := replace(ddl, 'etl.douyin_trade_sale_metrics_week_refresh_state', 'etl.report_douyin_trade_sale_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.douyin_trade_sale_channel_metrics_week_refresh_state', 'etl.report_douyin_trade_sale_channel_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.douyin_trade_sale_live_metrics_week_refresh_state', 'etl.report_douyin_trade_sale_live_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.douyin_trade_sale_shortvideo_metrics_week_refresh_state', 'etl.report_douyin_trade_sale_shortvideo_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.douyin_trade_sale_card_metrics_week_refresh_state', 'etl.report_douyin_trade_sale_card_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.taobao_trade_product_metrics_week_refresh_state', 'etl.report_taobao_trade_product_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.taobao_goods_traffic_channel_metrics_week_refresh_state', 'etl.report_taobao_goods_traffic_channel_metrics_week_refresh_state');
    ddl := replace(ddl, 'etl.taobao_one_goods_traffic_channel_metric_week_refresh_state', 'etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state');

    EXECUTE ddl;
  END LOOP;
END $$;

DROP VIEW IF EXISTS ads.report_all_trade_week;
CREATE VIEW ads.report_all_trade_week AS
WITH daily AS (
  SELECT
    ads.report_week_start("date") AS week_start,
    "date"::DATE AS stat_date,
    SUM(gmv)::NUMERIC(18, 2) AS gmv,
    SUM(order_count)::BIGINT AS order_count,
    SUM(buyer_count)::BIGINT AS buyer_count,
    SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at
  FROM ads.all_trade_overview
  GROUP BY ads.report_week_start("date"), "date"::DATE
),
weekly AS (
  SELECT
    week_start,
    ads.report_week_period(week_start) AS week_period,
    MAX(stat_date)::DATE AS as_of_date,
    LEAST(GREATEST((MAX(stat_date)::DATE - week_start + 1), 1), 7)::INTEGER AS observed_days,
    COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS curr_gmv,
    COALESCE(SUM(order_count), 0)::BIGINT AS curr_order_count,
    COALESCE(SUM(buyer_count), 0)::BIGINT AS curr_buyer_count,
    COALESCE(SUM(refund_amount), 0)::NUMERIC(18, 2) AS curr_refund_amount,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at
  FROM daily
  GROUP BY week_start
),
prev_sync AS (
  SELECT
    w.week_start,
    COALESCE(SUM(o.gmv), 0)::NUMERIC(18, 2) AS prev_gmv_sync,
    COALESCE(SUM(o.order_count), 0)::BIGINT AS prev_order_sync,
    COALESCE(SUM(o.buyer_count), 0)::BIGINT AS prev_buyer_sync,
    COALESCE(SUM(COALESCE(o.refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_sync
  FROM weekly w
  LEFT JOIN ads.all_trade_overview o
    ON o."date" >= (w.week_start - 7)
   AND o."date" < (w.week_start - 7 + w.observed_days)
  GROUP BY w.week_start
)
SELECT
  w.week_period,
  w.as_of_date,
  w.observed_days,
  w.curr_gmv,
  w.curr_order_count,
  w.curr_buyer_count,
  w.curr_refund_amount,
  COALESCE(p.curr_gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
  COALESCE(p.curr_order_count, 0)::BIGINT AS prev_order_count,
  COALESCE(p.curr_buyer_count, 0)::BIGINT AS prev_buyer_count,
  COALESCE(p.curr_refund_amount, 0)::NUMERIC(18, 2) AS prev_refund_amount,
  CASE WHEN COALESCE(p.curr_gmv, 0) > 0 THEN ROUND(((w.curr_gmv - p.curr_gmv) / p.curr_gmv), 4) END AS gmv_growth_rate,
  CASE WHEN COALESCE(p.curr_order_count, 0) > 0 THEN ROUND(((w.curr_order_count - p.curr_order_count)::NUMERIC / p.curr_order_count), 4) END AS order_count_growth_rate,
  CASE WHEN COALESCE(p.curr_buyer_count, 0) > 0 THEN ROUND(((w.curr_buyer_count - p.curr_buyer_count)::NUMERIC / p.curr_buyer_count), 4) END AS buyer_count_growth_rate,
  CASE WHEN COALESCE(p.curr_refund_amount, 0) > 0 THEN ROUND(((w.curr_refund_amount - p.curr_refund_amount) / p.curr_refund_amount), 4) END AS refund_amount_growth_rate,
  w.curr_gmv AS curr_gmv_sync,
  COALESCE(ps.prev_gmv_sync, 0)::NUMERIC(18, 2) AS prev_gmv_sync,
  w.curr_order_count AS curr_order_sync,
  COALESCE(ps.prev_order_sync, 0)::BIGINT AS prev_order_sync,
  w.curr_buyer_count AS curr_buyer_sync,
  COALESCE(ps.prev_buyer_sync, 0)::BIGINT AS prev_buyer_sync,
  w.curr_refund_amount AS curr_refund_sync,
  COALESCE(ps.prev_refund_sync, 0)::NUMERIC(18, 2) AS prev_refund_sync,
  w.created_at,
  w.updated_at
FROM weekly w
LEFT JOIN weekly p ON p.week_start = w.week_start - 7
LEFT JOIN prev_sync ps ON ps.week_start = w.week_start;

DROP VIEW IF EXISTS ads.report_all_trade_week_platform;
CREATE VIEW ads.report_all_trade_week_platform AS
WITH daily AS (
  SELECT
    ads.report_week_start("date") AS week_start,
    "date"::DATE AS stat_date,
    platform,
    SUM(gmv)::NUMERIC(18, 2) AS gmv,
    SUM(order_count)::BIGINT AS order_count,
    SUM(buyer_count)::BIGINT AS buyer_count,
    SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at
  FROM ads.all_trade_overview
  GROUP BY ads.report_week_start("date"), "date"::DATE, platform
),
week_scope AS (
  SELECT
    week_start,
    MAX(stat_date)::DATE AS as_of_date,
    LEAST(GREATEST((MAX(stat_date)::DATE - week_start + 1), 1), 7)::INTEGER AS observed_days
  FROM daily
  GROUP BY week_start
),
weekly AS (
  SELECT
    d.week_start,
    ads.report_week_period(d.week_start) AS week_period,
    d.platform,
    ws.as_of_date,
    ws.observed_days,
    COALESCE(SUM(d.gmv), 0)::NUMERIC(18, 2) AS curr_gmv,
    COALESCE(SUM(d.order_count), 0)::BIGINT AS curr_order_count,
    COALESCE(SUM(d.buyer_count), 0)::BIGINT AS curr_buyer_count,
    COALESCE(SUM(d.refund_amount), 0)::NUMERIC(18, 2) AS curr_refund_amount,
    MIN(d.created_at) AS created_at,
    MAX(d.updated_at) AS updated_at
  FROM daily d
  JOIN week_scope ws ON ws.week_start = d.week_start
  GROUP BY d.week_start, d.platform, ws.as_of_date, ws.observed_days
),
prev_sync AS (
  SELECT
    w.week_start,
    w.platform,
    COALESCE(SUM(o.gmv), 0)::NUMERIC(18, 2) AS prev_gmv_sync,
    COALESCE(SUM(o.order_count), 0)::BIGINT AS prev_order_sync,
    COALESCE(SUM(o.buyer_count), 0)::BIGINT AS prev_buyer_sync,
    COALESCE(SUM(COALESCE(o.refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_sync
  FROM weekly w
  LEFT JOIN ads.all_trade_overview o
    ON o.platform = w.platform
   AND o."date" >= (w.week_start - 7)
   AND o."date" < (w.week_start - 7 + w.observed_days)
  GROUP BY w.week_start, w.platform
)
SELECT
  w.week_period,
  w.platform,
  w.as_of_date,
  w.observed_days,
  w.curr_gmv,
  w.curr_order_count,
  w.curr_buyer_count,
  w.curr_refund_amount,
  COALESCE(p.curr_gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
  COALESCE(p.curr_order_count, 0)::BIGINT AS prev_order_count,
  COALESCE(p.curr_buyer_count, 0)::BIGINT AS prev_buyer_count,
  COALESCE(p.curr_refund_amount, 0)::NUMERIC(18, 2) AS prev_refund_amount,
  CASE WHEN COALESCE(p.curr_gmv, 0) > 0 THEN ROUND(((w.curr_gmv - p.curr_gmv) / p.curr_gmv), 4) END AS gmv_growth_rate,
  CASE WHEN COALESCE(p.curr_order_count, 0) > 0 THEN ROUND(((w.curr_order_count - p.curr_order_count)::NUMERIC / p.curr_order_count), 4) END AS order_count_growth_rate,
  CASE WHEN COALESCE(p.curr_buyer_count, 0) > 0 THEN ROUND(((w.curr_buyer_count - p.curr_buyer_count)::NUMERIC / p.curr_buyer_count), 4) END AS buyer_count_growth_rate,
  CASE WHEN COALESCE(p.curr_refund_amount, 0) > 0 THEN ROUND(((w.curr_refund_amount - p.curr_refund_amount) / p.curr_refund_amount), 4) END AS refund_amount_growth_rate,
  w.curr_gmv AS curr_gmv_sync,
  COALESCE(ps.prev_gmv_sync, 0)::NUMERIC(18, 2) AS prev_gmv_sync,
  w.curr_order_count AS curr_order_sync,
  COALESCE(ps.prev_order_sync, 0)::BIGINT AS prev_order_sync,
  w.curr_buyer_count AS curr_buyer_sync,
  COALESCE(ps.prev_buyer_sync, 0)::BIGINT AS prev_buyer_sync,
  w.curr_refund_amount AS curr_refund_sync,
  COALESCE(ps.prev_refund_sync, 0)::NUMERIC(18, 2) AS prev_refund_sync,
  w.created_at,
  w.updated_at
FROM weekly w
LEFT JOIN weekly p
  ON p.week_start = w.week_start - 7
 AND p.platform = w.platform
LEFT JOIN prev_sync ps
  ON ps.week_start = w.week_start
 AND ps.platform = w.platform;

DROP VIEW IF EXISTS ads.report_all_trade_month;
CREATE VIEW ads.report_all_trade_month AS
SELECT
  EXTRACT(YEAR FROM "date")::INTEGER AS year,
  EXTRACT(MONTH FROM "date")::INTEGER AS month,
  COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS gmv,
  COALESCE(SUM(order_count), 0)::BIGINT AS order_count,
  COALESCE(SUM(buyer_count), 0)::BIGINT AS buyer_count,
  COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount,
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM ads.all_trade_overview
GROUP BY EXTRACT(YEAR FROM "date")::INTEGER, EXTRACT(MONTH FROM "date")::INTEGER;

DROP VIEW IF EXISTS ads.report_all_trade_month_platform;
CREATE VIEW ads.report_all_trade_month_platform AS
SELECT
  EXTRACT(YEAR FROM "date")::INTEGER AS year,
  EXTRACT(MONTH FROM "date")::INTEGER AS month,
  platform,
  COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS gmv,
  COALESCE(SUM(order_count), 0)::BIGINT AS order_count,
  COALESCE(SUM(buyer_count), 0)::BIGINT AS buyer_count,
  COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount,
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM ads.all_trade_overview
GROUP BY EXTRACT(YEAR FROM "date")::INTEGER, EXTRACT(MONTH FROM "date")::INTEGER, platform;

COMMENT ON VIEW ads.report_all_trade_week IS 'Report view: weekly all-channel transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_week_platform IS 'Report view: weekly platform transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_month IS 'Report view: monthly all-channel transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_month_platform IS 'Report view: monthly platform transaction metrics derived from ads.all_trade_overview.';

DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.build_all_trade_month(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.build_all_trade_month_platform(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.build_all_trade_month_ads(TEXT);
DROP PROCEDURE IF EXISTS ads.build_all_trade_month_ads(VARCHAR);

DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform_metrics(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_week_platform_metrics_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_channel_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_channel_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_live_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_live_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_shortvideo_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_shortvideo_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_card_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_card_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_trade_product_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_trade_product_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_goods_traffic_channel_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_goods_traffic_channel_metrics_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_one_goods_traffic_channel_metric_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_one_goods_traffic_channel_metric_week_incremental(INTEGER, BOOLEAN);

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_platform(VARCHAR, DATE, DATE);
DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale(DATE, DATE);
DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS dws.refresh_all_trade_sale_daily(DATE, DATE);

DROP PROCEDURE IF EXISTS dwd.refresh_taobao_alimama_goods_marketingscene(DATE, DATE);
DROP PROCEDURE IF EXISTS dwd.refresh_taobao_alimama_goods_marketingscene_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_week(DATE, DATE);
DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_month(DATE, DATE);
DROP PROCEDURE IF EXISTS dws.refresh_taobao_alimama_goods_marketingscene_month_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_month(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attribution_month_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_taobao_alimama_goods_marketingscene_attr_month_incr(INTEGER, BOOLEAN);

DROP TABLE IF EXISTS ads.all_trade_week;
DROP TABLE IF EXISTS ads.all_trade_week_platform;
DROP TABLE IF EXISTS ads.all_trade_month;
DROP TABLE IF EXISTS ads.all_trade_month_platform;

DROP TABLE IF EXISTS ads.taobao_alimama_goods_marketingscene_attribution_week;
DROP TABLE IF EXISTS ads.taobao_alimama_goods_marketingscene_attribution_month;
DROP TABLE IF EXISTS dws.taobao_alimama_goods_marketingscene_week;
DROP TABLE IF EXISTS dws.taobao_alimama_goods_marketingscene_month;
DROP TABLE IF EXISTS dwd.taobao_alimama_goods_marketingscene;
DROP TABLE IF EXISTS dws.all_trade_sale_daily;
DROP TABLE IF EXISTS dwd.all_trade_sale;

DROP TABLE IF EXISTS etl.all_trade_sale_refresh_state;
DROP TABLE IF EXISTS etl.all_trade_week_refresh_state;
DROP TABLE IF EXISTS etl.all_trade_week_platform_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_week_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_month_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_goods_marketingscene_attribution_month_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_mksc_attr_week_refresh_state;
DROP TABLE IF EXISTS etl.taobao_alimama_marketingscene_attr_month_refresh_state;
