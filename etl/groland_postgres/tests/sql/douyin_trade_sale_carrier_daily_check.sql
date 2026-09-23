DO $$
DECLARE
  v_missing_objects INTEGER;
  v_missing_columns INTEGER;
  v_invalid_carrier_rows INTEGER;
  v_ads_source_mismatch_rows INTEGER;
  v_ads_total_mismatch_rows INTEGER;
  v_source_date_count_mismatch_rows INTEGER;
  v_gsv_formula_mismatch_rows INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_missing_objects
  FROM (
    VALUES
      ('table ads.douyin_trade_sale_carrier_daily', to_regclass('ads.douyin_trade_sale_carrier_daily') IS NOT NULL),
      ('table ods.douyin_trade_sale_raw', to_regclass('ods.douyin_trade_sale_raw') IS NOT NULL),
      (
        'procedure ads.refresh_douyin_trade_sale_carrier_daily',
        to_regprocedure('ads.refresh_douyin_trade_sale_carrier_daily(date, date)') IS NOT NULL
      )
  ) objects(object_name, is_present)
  WHERE NOT is_present;

  IF v_missing_objects > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily required objects missing: %', v_missing_objects;
  END IF;

  SELECT COUNT(*)
  INTO v_missing_columns
  FROM (
    VALUES
      ('stat_date'),
      ('carrier_type'),
      ('promotion_period'),
      ('trade_amount'),
      ('user_pay_amount'),
      ('trade_refund_amount_pay_time'),
      ('trade_refund_amount_refund_time'),
      ('order_count'),
      ('buyer_count')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ods'
      AND c.table_name = 'douyin_trade_sale_raw'
      AND c.column_name = required.column_name
  );

  IF v_missing_columns > 0 THEN
    RAISE EXCEPTION 'ods.douyin_trade_sale_raw required carrier columns missing: %', v_missing_columns;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_carrier_rows
  FROM ads.douyin_trade_sale_carrier_daily t
  WHERE t.carrier_type NOT IN ('直播', '短视频', '商品卡', '图文', '其他');

  IF v_invalid_carrier_rows > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily carrier whitelist check failed, invalid rows: %', v_invalid_carrier_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_gsv_formula_mismatch_rows
  FROM ads.douyin_trade_sale_carrier_daily t
  WHERE ABS(COALESCE(t.gsv, 0) - (COALESCE(t.trade_amount, 0) - COALESCE(t.refund_amount_pay_time, 0))) > 0.01;

  IF v_gsv_formula_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily gsv formula check failed, mismatch rows: %', v_gsv_formula_mismatch_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_ads_source_mismatch_rows
  FROM (
    SELECT
      src.stat_date::DATE AS "date",
      src.carrier_type,
      SUM(COALESCE(src.trade_amount, 0))::NUMERIC(18, 2) AS trade_amount,
      SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
      (
        SUM(COALESCE(src.trade_amount, 0))
        - SUM(COALESCE(src.trade_refund_amount_pay_time, 0))
      )::NUMERIC(18, 2) AS gsv,
      SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
      SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
      SUM(COALESCE(src.trade_refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
      SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
    FROM ods.douyin_trade_sale_raw src
    WHERE src.promotion_period = '不限'
      AND src.carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他')
    GROUP BY src.stat_date::DATE, src.carrier_type
  ) src
  FULL OUTER JOIN ads.douyin_trade_sale_carrier_daily t
    ON t."date" = src."date"
   AND t.carrier_type = src.carrier_type
  WHERE src."date" IS NULL
     OR t."date" IS NULL
     OR ABS(COALESCE(t.trade_amount, 0) - COALESCE(src.trade_amount, 0)) > 0.01
     OR ABS(COALESCE(t.user_pay_amount, 0) - COALESCE(src.user_pay_amount, 0)) > 0.01
     OR ABS(COALESCE(t.gsv, 0) - COALESCE(src.gsv, 0)) > 0.01
     OR COALESCE(t.order_count, 0) <> COALESCE(src.order_count, 0)
     OR COALESCE(t.buyer_count, 0) <> COALESCE(src.buyer_count, 0)
     OR ABS(COALESCE(t.refund_amount_pay_time, 0) - COALESCE(src.refund_amount_pay_time, 0)) > 0.01
     OR ABS(COALESCE(t.refund_amount_refund_time, 0) - COALESCE(src.refund_amount_refund_time, 0)) > 0.01;

  IF v_ads_source_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily ODS carrier consistency check failed, mismatch rows: %', v_ads_source_mismatch_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_ads_total_mismatch_rows
  FROM (
    SELECT
      t."date",
      SUM(t.trade_amount)::NUMERIC(18, 2) AS trade_amount,
      SUM(t.user_pay_amount)::NUMERIC(18, 2) AS user_pay_amount,
      SUM(t.gsv)::NUMERIC(18, 2) AS gsv,
      SUM(t.order_count)::BIGINT AS order_count,
      SUM(t.buyer_count)::BIGINT AS buyer_count,
      SUM(t.refund_amount_pay_time)::NUMERIC(18, 2) AS refund_amount_pay_time,
      SUM(t.refund_amount_refund_time)::NUMERIC(18, 2) AS refund_amount_refund_time
    FROM ads.douyin_trade_sale_carrier_daily t
    GROUP BY t."date"
  ) ads_total
  FULL OUTER JOIN (
    SELECT
      src.stat_date::DATE AS "date",
      SUM(COALESCE(src.trade_amount, 0))::NUMERIC(18, 2) AS trade_amount,
      SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
      (
        SUM(COALESCE(src.trade_amount, 0))
        - SUM(COALESCE(src.trade_refund_amount_pay_time, 0))
      )::NUMERIC(18, 2) AS gsv,
      SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
      SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
      SUM(COALESCE(src.trade_refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
      SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
    FROM ods.douyin_trade_sale_raw src
    WHERE src.carrier_type = '全部'
      AND src.promotion_period = '不限'
    GROUP BY src.stat_date::DATE
  ) src_total
    ON src_total."date" = ads_total."date"
  WHERE src_total."date" IS NULL
     OR ads_total."date" IS NULL
     OR ABS(COALESCE(ads_total.trade_amount, 0) - COALESCE(src_total.trade_amount, 0)) > 0.01
     OR ABS(COALESCE(ads_total.user_pay_amount, 0) - COALESCE(src_total.user_pay_amount, 0)) > 0.01
     OR ABS(COALESCE(ads_total.gsv, 0) - COALESCE(src_total.gsv, 0)) > 0.01
     OR COALESCE(ads_total.order_count, 0) <> COALESCE(src_total.order_count, 0)
     -- 买家数在载体之间可能重叠，载体拆分行求和不应强制等于总计行去重买家数。
     OR COALESCE(ads_total.buyer_count, 0) < COALESCE(src_total.buyer_count, 0)
     OR ABS(COALESCE(ads_total.refund_amount_pay_time, 0) - COALESCE(src_total.refund_amount_pay_time, 0)) > 0.01
     OR ABS(COALESCE(ads_total.refund_amount_refund_time, 0) - COALESCE(src_total.refund_amount_refund_time, 0)) > 0.01;

  IF v_ads_total_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily total-row consistency check failed, mismatch rows: %', v_ads_total_mismatch_rows;
  END IF;

  SELECT COUNT(*)
  INTO v_source_date_count_mismatch_rows
  FROM (
    SELECT
      src.stat_date::DATE AS "date",
      COUNT(DISTINCT src.carrier_type) AS source_carrier_count
    FROM ods.douyin_trade_sale_raw src
    WHERE src.promotion_period = '不限'
      AND src.carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他')
    GROUP BY src.stat_date::DATE
  ) src_dates
  LEFT JOIN (
    SELECT
      t."date",
      COUNT(DISTINCT t.carrier_type) AS ads_carrier_count
    FROM ads.douyin_trade_sale_carrier_daily t
    GROUP BY t."date"
  ) ads_dates
    ON ads_dates."date" = src_dates."date"
  WHERE src_dates.source_carrier_count <> 5
     OR COALESCE(ads_dates.ads_carrier_count, 0) <> 5;

  IF v_source_date_count_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'douyin_trade_sale_carrier_daily expected 5 carriers per source date, mismatch dates: %', v_source_date_count_mismatch_rows;
  END IF;

  RAISE NOTICE 'douyin_trade_sale_carrier_daily checks passed';
END;
$$;
