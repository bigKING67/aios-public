BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;
CREATE SCHEMA IF NOT EXISTS etl;

DROP PROCEDURE IF EXISTS ads.refresh_all_trade_overview_platform(VARCHAR, DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_overview(DATE, DATE);
DROP PROCEDURE IF EXISTS ads.refresh_all_trade_overview_incremental(INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS ads.fn_touch_all_trade_overview_updated_at();
DROP TABLE IF EXISTS etl.all_trade_overview_refresh_state;
DROP TABLE IF EXISTS ads.all_trade_overview;

CREATE TABLE ads.all_trade_overview (
  "date" DATE NOT NULL,
  platform VARCHAR(20) NOT NULL,
  gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cost NUMERIC(18, 2),
  gmv_from_cost NUMERIC(18, 2),
  roi NUMERIC(18, 4),
  roi_from_cost NUMERIC(18, 4),
  order_count BIGINT NOT NULL DEFAULT 0,
  buyer_count BIGINT NOT NULL DEFAULT 0,
  arpu NUMERIC(18, 4),
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gsv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_rate NUMERIC(10, 6),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_overview PRIMARY KEY ("date", platform),
  CONSTRAINT chk_all_trade_overview_platform CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs'))
);

COMMENT ON TABLE ads.all_trade_overview IS 'ADS-全平台日汇总总览表：面向看板核心经营指标，按 date + platform 粒度沉淀。';
COMMENT ON COLUMN ads.all_trade_overview."date" IS '统计日期（日粒度）。';
COMMENT ON COLUMN ads.all_trade_overview.platform IS '平台编码：taobao(天猫)、douyin(抖音)、xhs(小红书)、jd(京东)、wx(微信小程序)。';
COMMENT ON COLUMN ads.all_trade_overview.gmv IS 'GMV，成交总额。';
COMMENT ON COLUMN ads.all_trade_overview.cost IS '消耗（当前阶段按需求留空，待统一广告成本口径后补齐）。';
COMMENT ON COLUMN ads.all_trade_overview.gmv_from_cost IS '付费GMV（当前阶段按需求留空，待统一付费归因口径后补齐）。';
COMMENT ON COLUMN ads.all_trade_overview.roi IS 'ROI = GMV / cost（当前阶段按需求留空）。';
COMMENT ON COLUMN ads.all_trade_overview.roi_from_cost IS '付费ROI = gmv_from_cost / cost（当前阶段按需求留空）。';
COMMENT ON COLUMN ads.all_trade_overview.order_count IS '订单量。';
COMMENT ON COLUMN ads.all_trade_overview.buyer_count IS '成交人数。';
COMMENT ON COLUMN ads.all_trade_overview.arpu IS '客单价，口径：GMV / buyer_count。';
COMMENT ON COLUMN ads.all_trade_overview.refund_amount IS '退款金额。';
COMMENT ON COLUMN ads.all_trade_overview.gsv IS 'GSV，口径：GMV - refund_amount。';
COMMENT ON COLUMN ads.all_trade_overview.refund_rate IS '退款率，口径：refund_amount / GMV。';
COMMENT ON COLUMN ads.all_trade_overview.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.all_trade_overview.updated_at IS '记录最后更新时间。';

COMMENT ON CONSTRAINT pk_all_trade_overview ON ads.all_trade_overview IS '主键：date + platform。';
COMMENT ON CONSTRAINT chk_all_trade_overview_platform ON ads.all_trade_overview IS '平台枚举约束：douyin/jd/taobao/wx/xhs。';

CREATE INDEX idx_all_trade_overview_platform_date
ON ads.all_trade_overview (platform, "date");

CREATE INDEX idx_all_trade_overview_date
ON ads.all_trade_overview ("date");

COMMENT ON INDEX ads.idx_all_trade_overview_platform_date IS '按平台+日期查询加速索引。';
COMMENT ON INDEX ads.idx_all_trade_overview_date IS '按日期查询加速索引。';

CREATE FUNCTION ads.fn_touch_all_trade_overview_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ads.fn_touch_all_trade_overview_updated_at() IS '更新前自动刷新 all_trade_overview.updated_at 字段。';

CREATE TRIGGER trg_touch_all_trade_overview_updated_at
BEFORE UPDATE ON ads.all_trade_overview
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_all_trade_overview_updated_at();

COMMENT ON TRIGGER trg_touch_all_trade_overview_updated_at ON ads.all_trade_overview IS '更新行时自动刷新 updated_at。';

CREATE PROCEDURE ads.refresh_all_trade_overview_platform(
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
    refund_amount NUMERIC(18, 2) NOT NULL,
    gsv NUMERIC(18, 2) NOT NULL,
    refund_rate NUMERIC(10, 6)
  ) ON COMMIT DROP;

  IF p_platform = 'douyin' THEN
    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount
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
      a.refund_amount,
      (a.gmv - a.refund_amount)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'jd' THEN
    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.gmv, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
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
      a.refund_amount,
      (a.gmv - a.refund_amount)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'taobao' THEN
    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_parent_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
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
      a.refund_amount,
      (a.gmv - a.refund_amount)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSIF p_platform = 'wx' THEN
    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
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
      a.refund_amount,
      (a.gmv - a.refund_amount)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount / a.gmv), 6)
        ELSE NULL
      END AS refund_rate
    FROM aggregated a;
  ELSE
    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount, 0))::NUMERIC(18, 2) AS refund_amount
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
      a.refund_amount,
      (a.gmv - a.refund_amount)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount / a.gmv), 6)
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
    n.gsv,
    n.refund_rate
  FROM tmp_ads_all_trade_overview_platform_new n;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_all_trade_overview_platform completed, platform: %, deleted: %, inserted: %, window: [% - %]',
    p_platform, v_deleted_rows, v_inserted_rows, p_start_date, p_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_overview_platform(VARCHAR, DATE, DATE)
IS '按平台+日期窗口刷新 ads.all_trade_overview，数据来源于对应 ods.*_trade_sale_raw。';

CREATE PROCEDURE ads.refresh_all_trade_overview(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_platform VARCHAR(20);
BEGIN
  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw does not exist';
  END IF;
  IF to_regclass('ods.jd_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.jd_trade_sale_raw does not exist';
  END IF;
  IF to_regclass('ods.taobao_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.taobao_trade_sale_raw does not exist';
  END IF;
  IF to_regclass('ods.wx_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.wx_trade_sale_raw does not exist';
  END IF;
  IF to_regclass('ods.xhs_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.xhs_trade_sale_raw does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(bounds.min_date)),
    COALESCE(p_end_date, MAX(bounds.max_date))
  INTO v_start_date, v_end_date
  FROM (
    SELECT MIN(stat_date) AS min_date, MAX(stat_date) AS max_date FROM ods.douyin_trade_sale_raw
    UNION ALL
    SELECT MIN(stat_date) AS min_date, MAX(stat_date) AS max_date FROM ods.jd_trade_sale_raw
    UNION ALL
    SELECT MIN(stat_date) AS min_date, MAX(stat_date) AS max_date FROM ods.taobao_trade_sale_raw
    UNION ALL
    SELECT MIN(stat_date) AS min_date, MAX(stat_date) AS max_date FROM ods.wx_trade_sale_raw
    UNION ALL
    SELECT MIN(stat_date) AS min_date, MAX(stat_date) AS max_date FROM ods.xhs_trade_sale_raw
  ) bounds;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'all ods trade raw tables have no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  FOR v_platform IN
    SELECT unnest(ARRAY['douyin', 'jd', 'taobao', 'wx', 'xhs']::VARCHAR[])
  LOOP
    CALL ads.refresh_all_trade_overview_platform(v_platform, v_start_date, v_end_date);
  END LOOP;

  RAISE NOTICE 'refresh_all_trade_overview completed, window: [% - %]', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_overview(DATE, DATE)
IS '按日期窗口全量刷新 ads.all_trade_overview，依次调用各平台刷新过程。';

CREATE TABLE etl.all_trade_overview_refresh_state (
  platform VARCHAR(20) NOT NULL,
  last_ods_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_all_trade_overview_refresh_state PRIMARY KEY (platform),
  CONSTRAINT chk_all_trade_overview_refresh_state_platform
    CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs'))
);

COMMENT ON TABLE etl.all_trade_overview_refresh_state IS 'ADS all_trade_overview 增量刷新水位状态表（按平台维护）。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.platform IS '平台编码：douyin/jd/taobao/wx/xhs。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.last_ods_updated_at IS '最近一次已处理的 ODS 更新时间水位。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.last_refresh_at IS '最近一次刷新执行时间。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.all_trade_overview_refresh_state.updated_at IS '状态记录更新时间。';

INSERT INTO etl.all_trade_overview_refresh_state (platform)
SELECT unnest(ARRAY['douyin', 'jd', 'taobao', 'wx', 'xhs']::VARCHAR[])
ON CONFLICT (platform) DO NOTHING;

CREATE PROCEDURE ads.refresh_all_trade_overview_incremental(
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
          v_platform, v_last_ods_updated_at, v_safe_watermark;
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
        v_platform, v_min_date, v_max_date,
        GREATEST(v_last_ods_updated_at, COALESCE(v_max_updated_at, v_last_ods_updated_at));
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(hashtext('ads.refresh_all_trade_overview_incremental'));
      RAISE;
  END;

  PERFORM pg_advisory_unlock(hashtext('ads.refresh_all_trade_overview_incremental'));
END;
$$;

COMMENT ON PROCEDURE ads.refresh_all_trade_overview_incremental(INTEGER, BOOLEAN)
IS 'ADS all_trade_overview 增量刷新：按平台水位驱动，支持安全回看窗口和仅初始化水位模式。';

CALL ads.refresh_all_trade_overview(NULL, NULL);
CALL ads.refresh_all_trade_overview_incremental(7, TRUE);

COMMIT;
