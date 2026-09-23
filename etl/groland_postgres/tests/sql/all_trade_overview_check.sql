DO $$
DECLARE
  v_duplicate_rows INTEGER;
  v_gsv_mismatch_rows INTEGER;
  v_refund_rate_mismatch_rows INTEGER;
  v_arpu_mismatch_rows INTEGER;
  v_user_pay_amount_invalid_rows INTEGER;
  v_douyin_total_scope_missing_columns INTEGER;
  v_douyin_total_scope_mismatch_rows INTEGER;
  v_wx_total_deal_amount_missing_columns INTEGER;
  v_wx_total_deal_amount_mismatch_rows INTEGER;
  v_xhs_user_pay_amount_mismatch_rows INTEGER;
  v_cost_not_null_rows INTEGER;
BEGIN
  -- A. 主键唯一性（date + platform）
  SELECT COUNT(*)
  INTO v_duplicate_rows
  FROM (
    SELECT "date", platform
    FROM ads.all_trade_overview
    GROUP BY "date", platform
    HAVING COUNT(*) > 1
  ) t;

  IF v_duplicate_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview primary key uniqueness failed, duplicate groups: %', v_duplicate_rows;
  END IF;

  -- B. GSV 公式校验：gsv = gmv - refund_amount_pay_time
  SELECT COUNT(*)
  INTO v_gsv_mismatch_rows
  FROM ads.all_trade_overview t
  WHERE ABS(COALESCE(t.gsv, 0) - (COALESCE(t.gmv, 0) - COALESCE(t.refund_amount_pay_time, 0))) > 0.01;

  IF v_gsv_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview gsv formula check failed, mismatch rows: %', v_gsv_mismatch_rows;
  END IF;

  -- C. 退款率公式校验：refund_rate = refund_amount_pay_time / gmv（gmv=0 时应为 NULL）
  SELECT COUNT(*)
  INTO v_refund_rate_mismatch_rows
  FROM ads.all_trade_overview t
  WHERE
    (
      t.gmv > 0
      AND ABS(
        COALESCE(t.refund_rate, 0) - ROUND((t.refund_amount_pay_time / t.gmv), 6)
      ) > 0.000001
    )
    OR (
      t.gmv <= 0
      AND t.refund_rate IS NOT NULL
    );

  IF v_refund_rate_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview refund_rate formula check failed, mismatch rows: %', v_refund_rate_mismatch_rows;
  END IF;

  -- D. 客单价公式校验：arpu = gmv / buyer_count（buyer_count=0 时应为 NULL）
  SELECT COUNT(*)
  INTO v_arpu_mismatch_rows
  FROM ads.all_trade_overview t
  WHERE
    (
      t.buyer_count > 0
      AND ABS(
        COALESCE(t.arpu, 0) - ROUND((t.gmv / t.buyer_count::NUMERIC), 4)
      ) > 0.0001
    )
    OR (
      t.buyer_count <= 0
      AND t.arpu IS NOT NULL
    );

  IF v_arpu_mismatch_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview arpu formula check failed, mismatch rows: %', v_arpu_mismatch_rows;
  END IF;

  -- E. 用户支付金额必须可单独承载且非负
  SELECT COUNT(*)
  INTO v_user_pay_amount_invalid_rows
  FROM ads.all_trade_overview t
  WHERE t.user_pay_amount IS NULL
     OR t.user_pay_amount < 0;

  IF v_user_pay_amount_invalid_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview user_pay_amount non-negative check failed, invalid rows: %', v_user_pay_amount_invalid_rows;
  END IF;

  -- F. 抖音总览必须对齐 ODS 的平台总计行，避免载体/投放时段拆分行重复汇总
  IF to_regclass('ods.douyin_trade_sale_raw') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_douyin_total_scope_missing_columns
    FROM (
      VALUES
        ('carrier_type'),
        ('promotion_period')
    ) required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'ods'
        AND c.table_name = 'douyin_trade_sale_raw'
        AND c.column_name = required.column_name
    );

    IF v_douyin_total_scope_missing_columns > 0 THEN
      RAISE EXCEPTION 'all_trade_overview douyin total-scope source columns missing: %', v_douyin_total_scope_missing_columns;
    END IF;

    SELECT COUNT(*)
    INTO v_douyin_total_scope_mismatch_rows
    FROM (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.trade_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
        SUM(COALESCE(src.order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.trade_refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.douyin_trade_sale_raw src
      WHERE src.carrier_type = '全部'
        AND src.promotion_period = '不限'
      GROUP BY src.stat_date::DATE
    ) src
    FULL OUTER JOIN (
      SELECT *
      FROM ads.all_trade_overview
      WHERE platform = 'douyin'
    ) t
      ON t."date" = src.trade_date
    WHERE src.trade_date IS NULL
       OR t."date" IS NULL
       OR ABS(COALESCE(t.gmv, 0) - src.gmv) > 0.01
       OR ABS(COALESCE(t.user_pay_amount, 0) - src.user_pay_amount) > 0.01
       OR COALESCE(t.order_count, 0) <> src.order_count
       OR COALESCE(t.buyer_count, 0) <> src.buyer_count
       OR ABS(COALESCE(t.refund_amount_pay_time, 0) - src.refund_amount_pay_time) > 0.01
       OR ABS(COALESCE(t.refund_amount_refund_time, 0) - src.refund_amount_refund_time) > 0.01;

    IF v_douyin_total_scope_mismatch_rows > 0 THEN
      RAISE EXCEPTION 'all_trade_overview douyin total-scope ODS consistency check failed, mismatch rows: %', v_douyin_total_scope_mismatch_rows;
    END IF;
  END IF;

  -- G. 微信小程序 GMV 应来自总成交金额，用户支付金额应来自支付金额
  IF to_regclass('ods.wx_trade_sale_raw') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_wx_total_deal_amount_missing_columns
    FROM (
      VALUES
        ('stat_date'),
        ('total_deal_amount'),
        ('pay_amount'),
        ('pay_order_count'),
        ('pay_buyer_count'),
        ('refund_amount_pay_time'),
        ('refund_amount_refund_time')
    ) required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'ods'
        AND c.table_name = 'wx_trade_sale_raw'
        AND c.column_name = required.column_name
    );

    IF v_wx_total_deal_amount_missing_columns > 0 THEN
      RAISE EXCEPTION 'all_trade_overview wx total-deal source columns missing: %', v_wx_total_deal_amount_missing_columns;
    END IF;

    SELECT COUNT(*)
    INTO v_wx_total_deal_amount_mismatch_rows
    FROM (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.total_deal_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,
        SUM(COALESCE(src.pay_buyer_count, 0))::BIGINT AS buyer_count,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time,
        SUM(COALESCE(src.refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time
      FROM ods.wx_trade_sale_raw src
      GROUP BY src.stat_date::DATE
    ) src
    FULL OUTER JOIN (
      SELECT *
      FROM ads.all_trade_overview
      WHERE platform = 'wx'
    ) t
      ON t."date" = src.trade_date
    WHERE src.trade_date IS NULL
       OR t."date" IS NULL
       OR ABS(COALESCE(t.gmv, 0) - src.gmv) > 0.01
       OR ABS(COALESCE(t.user_pay_amount, 0) - src.user_pay_amount) > 0.01
       OR COALESCE(t.order_count, 0) <> src.order_count
       OR COALESCE(t.buyer_count, 0) <> src.buyer_count
       OR ABS(COALESCE(t.refund_amount_pay_time, 0) - src.refund_amount_pay_time) > 0.01
       OR ABS(COALESCE(t.refund_amount_refund_time, 0) - src.refund_amount_refund_time) > 0.01;

    IF v_wx_total_deal_amount_mismatch_rows > 0 THEN
      RAISE EXCEPTION 'all_trade_overview wx ODS consistency check failed, mismatch rows: %', v_wx_total_deal_amount_mismatch_rows;
    END IF;
  END IF;

  -- H. 小红书用户支付金额应来自 ODS 独立字段，而不是按 GMV 占位
  IF to_regclass('ods.xhs_trade_sale_raw') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_xhs_user_pay_amount_mismatch_rows
    FROM (
      SELECT
        src.stat_date::DATE AS trade_date,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.user_pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
        SUM(COALESCE(src.refund_amount_pay_time, 0))::NUMERIC(18, 2) AS refund_amount_pay_time
      FROM ods.xhs_trade_sale_raw src
      GROUP BY src.stat_date::DATE
    ) src
    FULL OUTER JOIN (
      SELECT *
      FROM ads.all_trade_overview
      WHERE platform = 'xhs'
    ) t
      ON t."date" = src.trade_date
    WHERE src.trade_date IS NULL
       OR t."date" IS NULL
       OR ABS(COALESCE(t.gmv, 0) - src.gmv) > 0.01
       OR ABS(COALESCE(t.user_pay_amount, 0) - src.user_pay_amount) > 0.01
       OR ABS(COALESCE(t.refund_amount_pay_time, 0) - src.refund_amount_pay_time) > 0.01;

    IF v_xhs_user_pay_amount_mismatch_rows > 0 THEN
      RAISE EXCEPTION 'all_trade_overview xhs ODS consistency check failed, mismatch rows: %', v_xhs_user_pay_amount_mismatch_rows;
    END IF;
  END IF;

  -- I. 当前阶段约束：成本相关字段按需求留空
  SELECT COUNT(*)
  INTO v_cost_not_null_rows
  FROM ads.all_trade_overview t
  WHERE t.cost IS NOT NULL
     OR t.gmv_from_cost IS NOT NULL
     OR t.roi IS NOT NULL
     OR t.roi_from_cost IS NOT NULL;

  IF v_cost_not_null_rows > 0 THEN
    RAISE EXCEPTION 'all_trade_overview cost-related null policy failed, non-null rows: %', v_cost_not_null_rows;
  END IF;

  RAISE NOTICE 'all_trade_overview checks passed';
END;
$$;
