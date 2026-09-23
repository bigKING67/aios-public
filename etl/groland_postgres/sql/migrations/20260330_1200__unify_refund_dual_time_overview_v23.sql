BEGIN;

ALTER TABLE ads.all_trade_overview
  DROP COLUMN IF EXISTS refund_amount;

COMMENT ON COLUMN ads.all_trade_overview.refund_amount_pay_time IS '退款金额（支付时间）。';
COMMENT ON COLUMN ads.all_trade_overview.refund_amount_refund_time IS '退款金额（退款时间）。';
COMMENT ON COLUMN ads.all_trade_overview.gsv IS 'GSV（支付时间口径），口径：GMV - refund_amount_pay_time。';
COMMENT ON COLUMN ads.all_trade_overview.refund_rate IS '退款率（支付时间口径），口径：refund_amount_pay_time / GMV。';
CREATE OR REPLACE PROCEDURE ads.refresh_all_trade_overview_platform(IN p_platform character varying, IN p_start_date date, IN p_end_date date)
 LANGUAGE plpgsql
AS $procedure$
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
    gsv NUMERIC(18, 2) NOT NULL,
    refund_rate NUMERIC(10, 6)
  ) ON COMMIT DROP;

  IF p_platform = 'douyin' THEN
    PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'douyin_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );

    INSERT INTO tmp_ads_all_trade_overview_platform_new
    WITH aggregated AS (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
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
      (a.gmv - a.refund_amount_pay_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_pay_time / a.gmv), 6)
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
      (a.gmv - a.refund_amount_pay_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_pay_time / a.gmv), 6)
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
      (a.gmv - a.refund_amount_pay_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_pay_time / a.gmv), 6)
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
      (a.gmv - a.refund_amount_pay_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_pay_time / a.gmv), 6)
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
      (a.gmv - a.refund_amount_pay_time)::NUMERIC(18, 2) AS gsv,
      CASE
        WHEN a.gmv > 0 THEN ROUND((a.refund_amount_pay_time / a.gmv), 6)
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
$procedure$

;

COMMIT;
