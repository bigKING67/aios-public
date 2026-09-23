-- Clarify report refund amount semantics.
--
-- ads.all_trade_overview exposes two distinct refund attribution dates:
--   refund_amount_refund_time: refund amount by refund date
--   refund_amount_pay_time: refund amount by original payment date
--
-- Report views must keep both names explicit.  Do not reintroduce ambiguous
-- refund_amount / curr_refund_amount / curr_refund_sync columns in these views.

DROP VIEW IF EXISTS ads.report_all_trade_week_platform;
DROP VIEW IF EXISTS ads.report_all_trade_week;
DROP VIEW IF EXISTS ads.report_all_trade_month_platform;
DROP VIEW IF EXISTS ads.report_all_trade_month;

CREATE VIEW ads.report_all_trade_week AS
WITH daily AS (
  SELECT
    ads.report_week_start("date") AS week_start,
    "date"::DATE AS stat_date,
    SUM(gmv)::NUMERIC(18, 2) AS gmv,
    SUM(order_count)::BIGINT AS order_count,
    SUM(buyer_count)::BIGINT AS buyer_count,
    SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
    SUM(COALESCE(refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
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
    COALESCE(SUM(refund_amount_refund_time), 0)::NUMERIC(18, 2) AS curr_refund_amount_refund_time,
    COALESCE(SUM(refund_amount_pay_time), 0)::NUMERIC(18, 2) AS curr_refund_amount_pay_time,
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
    COALESCE(SUM(COALESCE(o.refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time_sync,
    COALESCE(SUM(COALESCE(o.refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time_sync
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
  w.curr_refund_amount_refund_time,
  w.curr_refund_amount_pay_time,
  COALESCE(p.curr_gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
  COALESCE(p.curr_order_count, 0)::BIGINT AS prev_order_count,
  COALESCE(p.curr_buyer_count, 0)::BIGINT AS prev_buyer_count,
  COALESCE(p.curr_refund_amount_refund_time, 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time,
  COALESCE(p.curr_refund_amount_pay_time, 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time,
  CASE WHEN COALESCE(p.curr_gmv, 0) > 0 THEN ROUND(((w.curr_gmv - p.curr_gmv) / p.curr_gmv), 4) END AS gmv_growth_rate,
  CASE WHEN COALESCE(p.curr_order_count, 0) > 0 THEN ROUND(((w.curr_order_count - p.curr_order_count)::NUMERIC / p.curr_order_count), 4) END AS order_count_growth_rate,
  CASE WHEN COALESCE(p.curr_buyer_count, 0) > 0 THEN ROUND(((w.curr_buyer_count - p.curr_buyer_count)::NUMERIC / p.curr_buyer_count), 4) END AS buyer_count_growth_rate,
  CASE
    WHEN COALESCE(p.curr_refund_amount_refund_time, 0) > 0
      THEN ROUND(((w.curr_refund_amount_refund_time - p.curr_refund_amount_refund_time) / p.curr_refund_amount_refund_time), 4)
  END AS refund_amount_refund_time_growth_rate,
  CASE
    WHEN COALESCE(p.curr_refund_amount_pay_time, 0) > 0
      THEN ROUND(((w.curr_refund_amount_pay_time - p.curr_refund_amount_pay_time) / p.curr_refund_amount_pay_time), 4)
  END AS refund_amount_pay_time_growth_rate,
  w.curr_gmv AS curr_gmv_sync,
  COALESCE(ps.prev_gmv_sync, 0)::NUMERIC(18, 2) AS prev_gmv_sync,
  w.curr_order_count AS curr_order_sync,
  COALESCE(ps.prev_order_sync, 0)::BIGINT AS prev_order_sync,
  w.curr_buyer_count AS curr_buyer_sync,
  COALESCE(ps.prev_buyer_sync, 0)::BIGINT AS prev_buyer_sync,
  w.curr_refund_amount_refund_time AS curr_refund_amount_refund_time_sync,
  COALESCE(ps.prev_refund_amount_refund_time_sync, 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time_sync,
  w.curr_refund_amount_pay_time AS curr_refund_amount_pay_time_sync,
  COALESCE(ps.prev_refund_amount_pay_time_sync, 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time_sync,
  w.created_at,
  w.updated_at
FROM weekly w
LEFT JOIN weekly p ON p.week_start = w.week_start - 7
LEFT JOIN prev_sync ps ON ps.week_start = w.week_start;

CREATE VIEW ads.report_all_trade_week_platform AS
WITH daily AS (
  SELECT
    ads.report_week_start("date") AS week_start,
    "date"::DATE AS stat_date,
    platform,
    SUM(gmv)::NUMERIC(18, 2) AS gmv,
    SUM(order_count)::BIGINT AS order_count,
    SUM(buyer_count)::BIGINT AS buyer_count,
    SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
    SUM(COALESCE(refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
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
    COALESCE(SUM(d.refund_amount_refund_time), 0)::NUMERIC(18, 2) AS curr_refund_amount_refund_time,
    COALESCE(SUM(d.refund_amount_pay_time), 0)::NUMERIC(18, 2) AS curr_refund_amount_pay_time,
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
    COALESCE(SUM(COALESCE(o.refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time_sync,
    COALESCE(SUM(COALESCE(o.refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time_sync
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
  w.curr_refund_amount_refund_time,
  w.curr_refund_amount_pay_time,
  COALESCE(p.curr_gmv, 0)::NUMERIC(18, 2) AS prev_gmv,
  COALESCE(p.curr_order_count, 0)::BIGINT AS prev_order_count,
  COALESCE(p.curr_buyer_count, 0)::BIGINT AS prev_buyer_count,
  COALESCE(p.curr_refund_amount_refund_time, 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time,
  COALESCE(p.curr_refund_amount_pay_time, 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time,
  CASE WHEN COALESCE(p.curr_gmv, 0) > 0 THEN ROUND(((w.curr_gmv - p.curr_gmv) / p.curr_gmv), 4) END AS gmv_growth_rate,
  CASE WHEN COALESCE(p.curr_order_count, 0) > 0 THEN ROUND(((w.curr_order_count - p.curr_order_count)::NUMERIC / p.curr_order_count), 4) END AS order_count_growth_rate,
  CASE WHEN COALESCE(p.curr_buyer_count, 0) > 0 THEN ROUND(((w.curr_buyer_count - p.curr_buyer_count)::NUMERIC / p.curr_buyer_count), 4) END AS buyer_count_growth_rate,
  CASE
    WHEN COALESCE(p.curr_refund_amount_refund_time, 0) > 0
      THEN ROUND(((w.curr_refund_amount_refund_time - p.curr_refund_amount_refund_time) / p.curr_refund_amount_refund_time), 4)
  END AS refund_amount_refund_time_growth_rate,
  CASE
    WHEN COALESCE(p.curr_refund_amount_pay_time, 0) > 0
      THEN ROUND(((w.curr_refund_amount_pay_time - p.curr_refund_amount_pay_time) / p.curr_refund_amount_pay_time), 4)
  END AS refund_amount_pay_time_growth_rate,
  w.curr_gmv AS curr_gmv_sync,
  COALESCE(ps.prev_gmv_sync, 0)::NUMERIC(18, 2) AS prev_gmv_sync,
  w.curr_order_count AS curr_order_sync,
  COALESCE(ps.prev_order_sync, 0)::BIGINT AS prev_order_sync,
  w.curr_buyer_count AS curr_buyer_sync,
  COALESCE(ps.prev_buyer_sync, 0)::BIGINT AS prev_buyer_sync,
  w.curr_refund_amount_refund_time AS curr_refund_amount_refund_time_sync,
  COALESCE(ps.prev_refund_amount_refund_time_sync, 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time_sync,
  w.curr_refund_amount_pay_time AS curr_refund_amount_pay_time_sync,
  COALESCE(ps.prev_refund_amount_pay_time_sync, 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time_sync,
  w.created_at,
  w.updated_at
FROM weekly w
LEFT JOIN weekly p
  ON p.week_start = w.week_start - 7
 AND p.platform = w.platform
LEFT JOIN prev_sync ps
  ON ps.week_start = w.week_start
 AND ps.platform = w.platform;

CREATE VIEW ads.report_all_trade_month AS
SELECT
  EXTRACT(YEAR FROM "date")::INTEGER AS year,
  EXTRACT(MONTH FROM "date")::INTEGER AS month,
  COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS gmv,
  COALESCE(SUM(order_count), 0)::BIGINT AS order_count,
  COALESCE(SUM(buyer_count), 0)::BIGINT AS buyer_count,
  COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
  COALESCE(SUM(COALESCE(refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_pay_time,
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM ads.all_trade_overview
GROUP BY EXTRACT(YEAR FROM "date")::INTEGER, EXTRACT(MONTH FROM "date")::INTEGER;

CREATE VIEW ads.report_all_trade_month_platform AS
SELECT
  EXTRACT(YEAR FROM "date")::INTEGER AS year,
  EXTRACT(MONTH FROM "date")::INTEGER AS month,
  platform,
  COALESCE(SUM(gmv), 0)::NUMERIC(18, 2) AS gmv,
  COALESCE(SUM(order_count), 0)::BIGINT AS order_count,
  COALESCE(SUM(buyer_count), 0)::BIGINT AS buyer_count,
  COALESCE(SUM(COALESCE(refund_amount_refund_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
  COALESCE(SUM(COALESCE(refund_amount_pay_time, 0)), 0)::NUMERIC(18, 2) AS refund_amount_pay_time,
  MIN(created_at) AS created_at,
  MAX(updated_at) AS updated_at
FROM ads.all_trade_overview
GROUP BY EXTRACT(YEAR FROM "date")::INTEGER, EXTRACT(MONTH FROM "date")::INTEGER, platform;

COMMENT ON VIEW ads.report_all_trade_week IS 'Report view: weekly all-channel transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_week_platform IS 'Report view: weekly platform transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_month IS 'Report view: monthly all-channel transaction metrics derived from ads.all_trade_overview.';
COMMENT ON VIEW ads.report_all_trade_month_platform IS 'Report view: monthly platform transaction metrics derived from ads.all_trade_overview.';

COMMENT ON COLUMN ads.report_all_trade_week.curr_refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到本周统计周期。';
COMMENT ON COLUMN ads.report_all_trade_week.prev_refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到上周完整统计周期。';
COMMENT ON COLUMN ads.report_all_trade_week.curr_refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到本周统计周期，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week.prev_refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到上周完整统计周期，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week.curr_refund_amount_refund_time_sync IS '退款金额（退款时间）：按退款发生日期归属到本周同期窗口。';
COMMENT ON COLUMN ads.report_all_trade_week.prev_refund_amount_refund_time_sync IS '退款金额（退款时间）：按退款发生日期归属到上周同期窗口。';
COMMENT ON COLUMN ads.report_all_trade_week.curr_refund_amount_pay_time_sync IS '退款金额（支付时间）：按原订单支付日期归属到本周同期窗口，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week.prev_refund_amount_pay_time_sync IS '退款金额（支付时间）：按原订单支付日期归属到上周同期窗口，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week.refund_amount_refund_time_growth_rate IS '退款金额（退款时间）周环比增长率。';
COMMENT ON COLUMN ads.report_all_trade_week.refund_amount_pay_time_growth_rate IS '退款金额（支付时间）周环比增长率。';

COMMENT ON COLUMN ads.report_all_trade_week_platform.curr_refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到本周统计周期。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.prev_refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到上周完整统计周期。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.curr_refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到本周统计周期，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.prev_refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到上周完整统计周期，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.curr_refund_amount_refund_time_sync IS '退款金额（退款时间）：按退款发生日期归属到本周同期窗口。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.prev_refund_amount_refund_time_sync IS '退款金额（退款时间）：按退款发生日期归属到上周同期窗口。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.curr_refund_amount_pay_time_sync IS '退款金额（支付时间）：按原订单支付日期归属到本周同期窗口，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.prev_refund_amount_pay_time_sync IS '退款金额（支付时间）：按原订单支付日期归属到上周同期窗口，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.refund_amount_refund_time_growth_rate IS '退款金额（退款时间）周环比增长率。';
COMMENT ON COLUMN ads.report_all_trade_week_platform.refund_amount_pay_time_growth_rate IS '退款金额（支付时间）周环比增长率。';

COMMENT ON COLUMN ads.report_all_trade_month.refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到自然月。';
COMMENT ON COLUMN ads.report_all_trade_month.refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到自然月，GSV/退款率口径使用该字段。';
COMMENT ON COLUMN ads.report_all_trade_month_platform.refund_amount_refund_time IS '退款金额（退款时间）：按退款发生日期归属到自然月。';
COMMENT ON COLUMN ads.report_all_trade_month_platform.refund_amount_pay_time IS '退款金额（支付时间）：按原订单支付日期归属到自然月，GSV/退款率口径使用该字段。';
