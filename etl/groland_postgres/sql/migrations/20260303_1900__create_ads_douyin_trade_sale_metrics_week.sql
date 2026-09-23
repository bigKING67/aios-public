BEGIN;

DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_metrics_week(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_trade_sale_metrics_week_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_trade_sale_metrics_week_updated_at();
DROP TABLE IF EXISTS etl.douyin_trade_sale_metrics_week_refresh_state;
DROP TABLE IF EXISTS ads.douyin_trade_sale_metrics_week;

CREATE TABLE ads.douyin_trade_sale_metrics_week (
  week_period VARCHAR(50) NOT NULL,
  as_of_date DATE,
  observed_days SMALLINT,
  curr_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_smart_coupon_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_platform_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_order_count BIGINT NOT NULL DEFAULT 0,
  prev_order_count BIGINT NOT NULL DEFAULT 0,
  curr_buyer_count BIGINT NOT NULL DEFAULT 0,
  prev_buyer_count BIGINT NOT NULL DEFAULT 0,
  curr_avg_order_amount NUMERIC(18, 2),
  prev_avg_order_amount NUMERIC(18, 2),
  curr_pay_per_thousand_exposure NUMERIC(18, 2),
  prev_pay_per_thousand_exposure NUMERIC(18, 2),
  curr_refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_rate_pay_time NUMERIC(10, 4),
  prev_refund_rate_pay_time NUMERIC(10, 4),
  curr_refund_order_count_refund_time BIGINT NOT NULL DEFAULT 0,
  prev_refund_order_count_refund_time BIGINT NOT NULL DEFAULT 0,
  curr_refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  prev_exposure_user_count BIGINT NOT NULL DEFAULT 0,
  curr_click_user_count BIGINT NOT NULL DEFAULT 0,
  prev_click_user_count BIGINT NOT NULL DEFAULT 0,
  curr_exposure_count BIGINT NOT NULL DEFAULT 0,
  prev_exposure_count BIGINT NOT NULL DEFAULT 0,
  curr_click_count BIGINT NOT NULL DEFAULT 0,
  prev_click_count BIGINT NOT NULL DEFAULT 0,
  curr_click_rate NUMERIC(10, 4),
  prev_click_rate NUMERIC(10, 4),
  curr_click_to_pay_rate NUMERIC(10, 4),
  prev_click_to_pay_rate NUMERIC(10, 4),
  curr_presale_deposit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_presale_deposit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_influencer_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_influencer_subsidy_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_refund_order_count_pay_time BIGINT NOT NULL DEFAULT 0,
  prev_refund_order_count_pay_time BIGINT NOT NULL DEFAULT 0,
  curr_trade_refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_trade_refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_trade_refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_trade_refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_commission_exemption NUMERIC(18, 2) NOT NULL DEFAULT 0,
  prev_commission_exemption NUMERIC(18, 2) NOT NULL DEFAULT 0,
  curr_pay_conversion_rate NUMERIC(10, 4),
  prev_pay_conversion_rate NUMERIC(10, 4),
  curr_uv_value NUMERIC(18, 2),
  prev_uv_value NUMERIC(18, 2),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_metrics_week PRIMARY KEY (week_period),
  CONSTRAINT chk_douyin_trade_sale_metrics_week_observed_days CHECK (observed_days IS NULL OR observed_days BETWEEN 1 AND 7)
);

COMMENT ON TABLE ads.douyin_trade_sale_metrics_week IS 'ADS-抖音周经营指标表（来源 ods.douyin_trade_sale_raw，口径与 all_trade_week_platform 对齐）。';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.week_period IS '周时间段，格式: 2026/2/7～2026/2/13';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.as_of_date IS '同期口径截止日期（与 ads.all_trade_week_platform 对齐）';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.observed_days IS '同期对比已观察天数（as_of_date - 周起始 + 1）';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.curr_user_pay_amount IS '本周同期用户支付金额';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.prev_user_pay_amount IS '上周同期用户支付金额';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.curr_pay_conversion_rate IS '本周同期支付转化率（buyer_count / exposure_user_count）';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.prev_pay_conversion_rate IS '上周同期支付转化率（buyer_count / exposure_user_count）';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.curr_uv_value IS '本周同期UV价值（user_pay_amount / exposure_user_count）';
COMMENT ON COLUMN ads.douyin_trade_sale_metrics_week.prev_uv_value IS '上周同期UV价值（user_pay_amount / exposure_user_count）';

CREATE INDEX idx_douyin_trade_sale_metrics_week_as_of_date
  ON ads.douyin_trade_sale_metrics_week (as_of_date);

CREATE FUNCTION ads.fn_touch_douyin_trade_sale_metrics_week_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_trade_sale_metrics_week_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_metrics_week
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_metrics_week_updated_at();

CREATE PROCEDURE ads.refresh_douyin_trade_sale_metrics_week(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_affected_weeks INTEGER := 0;
  v_rebuilt_rows INTEGER := 0;
BEGIN
  IF to_regclass('ads.all_trade_week_platform') IS NULL THEN
    RAISE EXCEPTION 'source table ads.all_trade_week_platform does not exist';
  END IF;

  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_trade_sale_metrics_week') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_trade_sale_metrics_week does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(as_of_date)),
    COALESCE(p_end_date, MAX(as_of_date))
  INTO v_start_date, v_end_date
  FROM ads.all_trade_week_platform
  WHERE platform = 'douyin'
    AND as_of_date IS NOT NULL
    AND observed_days IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ads.all_trade_week_platform has no douyin sync rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  IF to_regclass('pg_temp.tmp_ads_douyin_trade_sale_metrics_week_scope') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_trade_sale_metrics_week_scope';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_douyin_trade_sale_metrics_week_daily') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_trade_sale_metrics_week_daily';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_douyin_trade_sale_metrics_week_new_raw') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_trade_sale_metrics_week_new_raw';
  END IF;
  IF to_regclass('pg_temp.tmp_ads_douyin_trade_sale_metrics_week_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_ads_douyin_trade_sale_metrics_week_new';
  END IF;

  CREATE TEMP TABLE tmp_ads_douyin_trade_sale_metrics_week_scope ON COMMIT DROP AS
  SELECT
    p.week_period,
    p.as_of_date,
    p.observed_days,
    (p.as_of_date - (p.observed_days - 1))::DATE AS week_start
  FROM ads.all_trade_week_platform p
  WHERE p.platform = 'douyin'
    AND p.as_of_date IS NOT NULL
    AND p.observed_days IS NOT NULL
    AND p.as_of_date BETWEEN v_start_date AND v_end_date;

  GET DIAGNOSTICS v_affected_weeks = ROW_COUNT;

  IF v_affected_weeks = 0 THEN
    RAISE NOTICE 'no douyin week scope rows in window [% - %], skipped', v_start_date, v_end_date;
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_ads_douyin_trade_sale_metrics_week_daily ON COMMIT DROP AS
  SELECT
    src.stat_date::DATE AS stat_date,
    SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
    SUM(COALESCE(src.smart_coupon_amount, 0))::NUMERIC(18, 2) AS smart_coupon_amount,
    SUM(COALESCE(src.platform_subsidy_amount, 0))::NUMERIC(18, 2) AS platform_subsidy_amount,
    SUM(COALESCE(src.refund_user_pay_amount, 0))::NUMERIC(18, 2) AS refund_user_pay_amount,
    SUM(COALESCE(src.refund_smart_coupon_amount, 0))::NUMERIC(18, 2) AS refund_smart_coupon_amount,
    SUM(COALESCE(src.refund_platform_subsidy_amount, 0))::NUMERIC(18, 2) AS refund_platform_subsidy_amount,
    SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
    SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
    SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
    SUM(COALESCE(src.refund_order_count_refund_time, 0))::BIGINT AS refund_order_count_refund_time,
    SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
    SUM(COALESCE(src.exposure_user_count, 0))::BIGINT AS exposure_user_count,
    SUM(COALESCE(src.click_user_count, 0))::BIGINT AS click_user_count,
    SUM(COALESCE(src.exposure_count, 0))::BIGINT AS exposure_count,
    SUM(COALESCE(src.click_count, 0))::BIGINT AS click_count,
    SUM(COALESCE(src.presale_deposit, 0))::NUMERIC(18, 2) AS presale_deposit,
    SUM(COALESCE(src.influencer_subsidy_amount, 0))::NUMERIC(18, 2) AS influencer_subsidy_amount,
    SUM(COALESCE(src.refund_order_count_pay_time, 0))::BIGINT AS refund_order_count_pay_time,
    SUM(COALESCE(src.trade_refund_amount_pay_time, 0))::NUMERIC(18, 2) AS trade_refund_amount_pay_time,
    SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS trade_refund_amount_refund_time,
    SUM(COALESCE(src.commission_exemption, 0))::NUMERIC(18, 2) AS commission_exemption
  FROM ods.douyin_trade_sale_raw src
  WHERE src.stat_date BETWEEN (v_start_date - 13) AND v_end_date
  GROUP BY src.stat_date::DATE;

  CREATE TEMP TABLE tmp_ads_douyin_trade_sale_metrics_week_new_raw ON COMMIT DROP AS
  SELECT
    ws.week_period,
    ws.as_of_date,
    ws.observed_days,
    COALESCE(SUM(d.user_pay_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_user_pay_amount,
    COALESCE(SUM(d.user_pay_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_user_pay_amount,
    COALESCE(SUM(d.smart_coupon_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_smart_coupon_amount,
    COALESCE(SUM(d.smart_coupon_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_smart_coupon_amount,
    COALESCE(SUM(d.platform_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_platform_subsidy_amount,
    COALESCE(SUM(d.platform_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_platform_subsidy_amount,
    COALESCE(SUM(d.refund_user_pay_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_user_pay_amount,
    COALESCE(SUM(d.refund_user_pay_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_user_pay_amount,
    COALESCE(SUM(d.refund_smart_coupon_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_smart_coupon_amount,
    COALESCE(SUM(d.refund_smart_coupon_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_smart_coupon_amount,
    COALESCE(SUM(d.refund_platform_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_platform_subsidy_amount,
    COALESCE(SUM(d.refund_platform_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_platform_subsidy_amount,
    COALESCE(SUM(d.order_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_order_count,
    COALESCE(SUM(d.order_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_order_count,
    COALESCE(SUM(d.buyer_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_buyer_count,
    COALESCE(SUM(d.buyer_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_buyer_count,
    COALESCE(SUM(d.refund_amount_pay_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_amount_pay_time,
    COALESCE(SUM(d.refund_amount_pay_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_amount_pay_time,
    COALESCE(SUM(d.refund_order_count_refund_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_refund_order_count_refund_time,
    COALESCE(SUM(d.refund_order_count_refund_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_refund_order_count_refund_time,
    COALESCE(SUM(d.refund_amount_refund_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_refund_amount_refund_time,
    COALESCE(SUM(d.refund_amount_refund_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_refund_amount_refund_time,
    COALESCE(SUM(d.exposure_user_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_exposure_user_count,
    COALESCE(SUM(d.exposure_user_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_exposure_user_count,
    COALESCE(SUM(d.click_user_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_click_user_count,
    COALESCE(SUM(d.click_user_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_click_user_count,
    COALESCE(SUM(d.exposure_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_exposure_count,
    COALESCE(SUM(d.exposure_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_exposure_count,
    COALESCE(SUM(d.click_count) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_click_count,
    COALESCE(SUM(d.click_count) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_click_count,
    COALESCE(SUM(d.presale_deposit) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_presale_deposit,
    COALESCE(SUM(d.presale_deposit) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_presale_deposit,
    COALESCE(SUM(d.influencer_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_influencer_subsidy_amount,
    COALESCE(SUM(d.influencer_subsidy_amount) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_influencer_subsidy_amount,
    COALESCE(SUM(d.refund_order_count_pay_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::BIGINT AS curr_refund_order_count_pay_time,
    COALESCE(SUM(d.refund_order_count_pay_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::BIGINT AS prev_refund_order_count_pay_time,
    COALESCE(SUM(d.trade_refund_amount_pay_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_trade_refund_amount_pay_time,
    COALESCE(SUM(d.trade_refund_amount_pay_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_trade_refund_amount_pay_time,
    COALESCE(SUM(d.trade_refund_amount_refund_time) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_trade_refund_amount_refund_time,
    COALESCE(SUM(d.trade_refund_amount_refund_time) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_trade_refund_amount_refund_time,
    COALESCE(SUM(d.commission_exemption) FILTER (WHERE d.stat_date BETWEEN ws.week_start AND ws.as_of_date), 0)::NUMERIC(18, 2) AS curr_commission_exemption,
    COALESCE(SUM(d.commission_exemption) FILTER (WHERE d.stat_date BETWEEN (ws.week_start - 7) AND (ws.as_of_date - 7)), 0)::NUMERIC(18, 2) AS prev_commission_exemption
  FROM tmp_ads_douyin_trade_sale_metrics_week_scope ws
  LEFT JOIN tmp_ads_douyin_trade_sale_metrics_week_daily d
    ON d.stat_date BETWEEN (ws.week_start - 7) AND ws.as_of_date
  GROUP BY ws.week_period, ws.as_of_date, ws.observed_days, ws.week_start;

  CREATE TEMP TABLE tmp_ads_douyin_trade_sale_metrics_week_new ON COMMIT DROP AS
  SELECT
    r.week_period,
    r.as_of_date,
    r.observed_days,
    r.curr_user_pay_amount,
    r.prev_user_pay_amount,
    r.curr_smart_coupon_amount,
    r.prev_smart_coupon_amount,
    r.curr_platform_subsidy_amount,
    r.prev_platform_subsidy_amount,
    r.curr_refund_user_pay_amount,
    r.prev_refund_user_pay_amount,
    r.curr_refund_smart_coupon_amount,
    r.prev_refund_smart_coupon_amount,
    r.curr_refund_platform_subsidy_amount,
    r.prev_refund_platform_subsidy_amount,
    r.curr_order_count,
    r.prev_order_count,
    r.curr_buyer_count,
    r.prev_buyer_count,
    CASE WHEN r.curr_order_count > 0 THEN ROUND((r.curr_user_pay_amount / r.curr_order_count::NUMERIC), 2) ELSE NULL END AS curr_avg_order_amount,
    CASE WHEN r.prev_order_count > 0 THEN ROUND((r.prev_user_pay_amount / r.prev_order_count::NUMERIC), 2) ELSE NULL END AS prev_avg_order_amount,
    CASE WHEN r.curr_exposure_count > 0 THEN ROUND((r.curr_user_pay_amount / r.curr_exposure_count::NUMERIC) * 1000, 2) ELSE NULL END AS curr_pay_per_thousand_exposure,
    CASE WHEN r.prev_exposure_count > 0 THEN ROUND((r.prev_user_pay_amount / r.prev_exposure_count::NUMERIC) * 1000, 2) ELSE NULL END AS prev_pay_per_thousand_exposure,
    r.curr_refund_amount_pay_time,
    r.prev_refund_amount_pay_time,
    CASE WHEN r.curr_user_pay_amount > 0 THEN ROUND((r.curr_refund_amount_pay_time / r.curr_user_pay_amount), 4) ELSE NULL END AS curr_refund_rate_pay_time,
    CASE WHEN r.prev_user_pay_amount > 0 THEN ROUND((r.prev_refund_amount_pay_time / r.prev_user_pay_amount), 4) ELSE NULL END AS prev_refund_rate_pay_time,
    r.curr_refund_order_count_refund_time,
    r.prev_refund_order_count_refund_time,
    r.curr_refund_amount_refund_time,
    r.prev_refund_amount_refund_time,
    r.curr_exposure_user_count,
    r.prev_exposure_user_count,
    r.curr_click_user_count,
    r.prev_click_user_count,
    r.curr_exposure_count,
    r.prev_exposure_count,
    r.curr_click_count,
    r.prev_click_count,
    CASE WHEN r.curr_exposure_count > 0 THEN ROUND((r.curr_click_count::NUMERIC / r.curr_exposure_count::NUMERIC), 4) ELSE NULL END AS curr_click_rate,
    CASE WHEN r.prev_exposure_count > 0 THEN ROUND((r.prev_click_count::NUMERIC / r.prev_exposure_count::NUMERIC), 4) ELSE NULL END AS prev_click_rate,
    CASE WHEN r.curr_click_count > 0 THEN ROUND((r.curr_order_count::NUMERIC / r.curr_click_count::NUMERIC), 4) ELSE NULL END AS curr_click_to_pay_rate,
    CASE WHEN r.prev_click_count > 0 THEN ROUND((r.prev_order_count::NUMERIC / r.prev_click_count::NUMERIC), 4) ELSE NULL END AS prev_click_to_pay_rate,
    r.curr_presale_deposit,
    r.prev_presale_deposit,
    r.curr_influencer_subsidy_amount,
    r.prev_influencer_subsidy_amount,
    r.curr_refund_order_count_pay_time,
    r.prev_refund_order_count_pay_time,
    r.curr_trade_refund_amount_pay_time,
    r.prev_trade_refund_amount_pay_time,
    r.curr_trade_refund_amount_refund_time,
    r.prev_trade_refund_amount_refund_time,
    r.curr_commission_exemption,
    r.prev_commission_exemption,
    CASE WHEN r.curr_exposure_user_count > 0 THEN ROUND((r.curr_buyer_count::NUMERIC / r.curr_exposure_user_count::NUMERIC), 4) ELSE NULL END AS curr_pay_conversion_rate,
    CASE WHEN r.prev_exposure_user_count > 0 THEN ROUND((r.prev_buyer_count::NUMERIC / r.prev_exposure_user_count::NUMERIC), 4) ELSE NULL END AS prev_pay_conversion_rate,
    CASE WHEN r.curr_exposure_user_count > 0 THEN ROUND((r.curr_user_pay_amount / r.curr_exposure_user_count::NUMERIC), 2) ELSE NULL END AS curr_uv_value,
    CASE WHEN r.prev_exposure_user_count > 0 THEN ROUND((r.prev_user_pay_amount / r.prev_exposure_user_count::NUMERIC), 2) ELSE NULL END AS prev_uv_value
  FROM tmp_ads_douyin_trade_sale_metrics_week_new_raw r;

  DELETE FROM ads.douyin_trade_sale_metrics_week tgt
  USING tmp_ads_douyin_trade_sale_metrics_week_scope scope
  WHERE tgt.week_period = scope.week_period;

  INSERT INTO ads.douyin_trade_sale_metrics_week (
    week_period,
    as_of_date,
    observed_days,
    curr_user_pay_amount,
    prev_user_pay_amount,
    curr_smart_coupon_amount,
    prev_smart_coupon_amount,
    curr_platform_subsidy_amount,
    prev_platform_subsidy_amount,
    curr_refund_user_pay_amount,
    prev_refund_user_pay_amount,
    curr_refund_smart_coupon_amount,
    prev_refund_smart_coupon_amount,
    curr_refund_platform_subsidy_amount,
    prev_refund_platform_subsidy_amount,
    curr_order_count,
    prev_order_count,
    curr_buyer_count,
    prev_buyer_count,
    curr_avg_order_amount,
    prev_avg_order_amount,
    curr_pay_per_thousand_exposure,
    prev_pay_per_thousand_exposure,
    curr_refund_amount_pay_time,
    prev_refund_amount_pay_time,
    curr_refund_rate_pay_time,
    prev_refund_rate_pay_time,
    curr_refund_order_count_refund_time,
    prev_refund_order_count_refund_time,
    curr_refund_amount_refund_time,
    prev_refund_amount_refund_time,
    curr_exposure_user_count,
    prev_exposure_user_count,
    curr_click_user_count,
    prev_click_user_count,
    curr_exposure_count,
    prev_exposure_count,
    curr_click_count,
    prev_click_count,
    curr_click_rate,
    prev_click_rate,
    curr_click_to_pay_rate,
    prev_click_to_pay_rate,
    curr_presale_deposit,
    prev_presale_deposit,
    curr_influencer_subsidy_amount,
    prev_influencer_subsidy_amount,
    curr_refund_order_count_pay_time,
    prev_refund_order_count_pay_time,
    curr_trade_refund_amount_pay_time,
    prev_trade_refund_amount_pay_time,
    curr_trade_refund_amount_refund_time,
    prev_trade_refund_amount_refund_time,
    curr_commission_exemption,
    prev_commission_exemption,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_uv_value,
    prev_uv_value
  )
  SELECT
    week_period,
    as_of_date,
    observed_days,
    curr_user_pay_amount,
    prev_user_pay_amount,
    curr_smart_coupon_amount,
    prev_smart_coupon_amount,
    curr_platform_subsidy_amount,
    prev_platform_subsidy_amount,
    curr_refund_user_pay_amount,
    prev_refund_user_pay_amount,
    curr_refund_smart_coupon_amount,
    prev_refund_smart_coupon_amount,
    curr_refund_platform_subsidy_amount,
    prev_refund_platform_subsidy_amount,
    curr_order_count,
    prev_order_count,
    curr_buyer_count,
    prev_buyer_count,
    curr_avg_order_amount,
    prev_avg_order_amount,
    curr_pay_per_thousand_exposure,
    prev_pay_per_thousand_exposure,
    curr_refund_amount_pay_time,
    prev_refund_amount_pay_time,
    curr_refund_rate_pay_time,
    prev_refund_rate_pay_time,
    curr_refund_order_count_refund_time,
    prev_refund_order_count_refund_time,
    curr_refund_amount_refund_time,
    prev_refund_amount_refund_time,
    curr_exposure_user_count,
    prev_exposure_user_count,
    curr_click_user_count,
    prev_click_user_count,
    curr_exposure_count,
    prev_exposure_count,
    curr_click_count,
    prev_click_count,
    curr_click_rate,
    prev_click_rate,
    curr_click_to_pay_rate,
    prev_click_to_pay_rate,
    curr_presale_deposit,
    prev_presale_deposit,
    curr_influencer_subsidy_amount,
    prev_influencer_subsidy_amount,
    curr_refund_order_count_pay_time,
    prev_refund_order_count_pay_time,
    curr_trade_refund_amount_pay_time,
    prev_trade_refund_amount_pay_time,
    curr_trade_refund_amount_refund_time,
    prev_trade_refund_amount_refund_time,
    curr_commission_exemption,
    prev_commission_exemption,
    curr_pay_conversion_rate,
    prev_pay_conversion_rate,
    curr_uv_value,
    prev_uv_value
  FROM tmp_ads_douyin_trade_sale_metrics_week_new;

  GET DIAGNOSTICS v_rebuilt_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_douyin_trade_sale_metrics_week completed, rebuilt_rows: %, affected_weeks: %, window: [% - %]',
    v_rebuilt_rows,
    v_affected_weeks,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_metrics_week(DATE, DATE)
IS '按周窗口刷新抖音经营指标（来源 ods.douyin_trade_sale_raw），与 ads.all_trade_week_platform 同步口径对齐。';

CREATE TABLE etl.douyin_trade_sale_metrics_week_refresh_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_trade_sale_metrics_week_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_trade_sale_metrics_week_refresh_state IS '抖音周经营指标增量刷新水位状态表。';

INSERT INTO etl.douyin_trade_sale_metrics_week_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE PROCEDURE ads.refresh_douyin_trade_sale_metrics_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fallback_window_days INTEGER := GREATEST(COALESCE(p_fallback_window_days, 14), 1);
  v_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_date DATE;
  v_refresh_start DATE;
  v_refresh_end DATE;
BEGIN
  IF to_regclass('etl.douyin_trade_sale_metrics_week_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'state table etl.douyin_trade_sale_metrics_week_refresh_state does not exist';
  END IF;

  INSERT INTO etl.douyin_trade_sale_metrics_week_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01'))
  INTO v_source_updated_at
  FROM ods.douyin_trade_sale_raw;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_trade_sale_metrics_week_refresh_state
  WHERE id = 1
  FOR UPDATE;

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_trade_sale_metrics_week_refresh_state
    SET
      last_source_updated_at = v_source_updated_at,
      last_refresh_at = NOW(),
      updated_at = NOW()
    WHERE id = 1;

    RAISE NOTICE 'refresh_douyin_trade_sale_metrics_week_incremental watermark initialized, source_updated_at: %',
      v_source_updated_at;
    RETURN;
  END IF;

  IF v_last_source_updated_at IS NOT NULL
     AND v_source_updated_at IS NOT NULL
     AND v_source_updated_at <= v_last_source_updated_at THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_metrics_week_incremental skipped, no source update (last: %, current: %)',
      v_last_source_updated_at,
      v_source_updated_at;
    RETURN;
  END IF;

  SELECT MAX(stat_date)
  INTO v_source_max_date
  FROM ods.douyin_trade_sale_raw;

  IF v_source_max_date IS NULL THEN
    RAISE NOTICE 'refresh_douyin_trade_sale_metrics_week_incremental skipped, no source data found';
    RETURN;
  END IF;

  v_refresh_end := v_source_max_date;
  v_refresh_start := v_source_max_date - (v_fallback_window_days - 1);

  CALL ads.refresh_douyin_trade_sale_metrics_week(v_refresh_start, v_refresh_end);

  UPDATE etl.douyin_trade_sale_metrics_week_refresh_state
  SET
    last_source_updated_at = v_source_updated_at,
    last_refresh_at = NOW(),
    last_refresh_start_date = v_refresh_start,
    last_refresh_end_date = v_refresh_end,
    updated_at = NOW()
  WHERE id = 1;

  RAISE NOTICE 'refresh_douyin_trade_sale_metrics_week_incremental completed, source_updated_at: %, window: [% - %]',
    v_source_updated_at,
    v_refresh_start,
    v_refresh_end;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_metrics_week_incremental(INTEGER, BOOLEAN)
IS '按水位增量刷新抖音周经营指标，默认回刷近 N 天窗口。';

CALL ads.refresh_douyin_trade_sale_metrics_week_incremental(14, TRUE);

COMMIT;
