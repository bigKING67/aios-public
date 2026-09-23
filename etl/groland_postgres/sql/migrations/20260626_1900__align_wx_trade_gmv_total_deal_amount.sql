BEGIN;

DO $$
DECLARE
  ddl TEXT;
BEGIN
  IF to_regprocedure('ads.refresh_all_trade_overview_platform(character varying, date, date)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_all_trade_overview_platform(character varying, date, date) is missing; apply 20260303_2300 first';
  END IF;

  IF to_regclass('ods.wx_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.wx_trade_sale_raw is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'wx_trade_sale_raw'
      AND column_name = 'total_deal_amount'
  ) THEN
    RAISE EXCEPTION 'source column ods.wx_trade_sale_raw.total_deal_amount is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'wx_trade_sale_raw'
      AND column_name = 'pay_amount'
  ) THEN
    RAISE EXCEPTION 'source column ods.wx_trade_sale_raw.pay_amount is missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('ads.refresh_all_trade_overview_platform(character varying, date, date)')) INTO ddl;

  IF position($needle$'wx_trade_sale_raw',
      ARRAY[
        'total_deal_amount',$needle$ IN ddl) = 0 THEN
    ddl := replace(
      ddl,
      $old$PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'wx_trade_sale_raw',
      ARRAY[
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );$old$,
      $new$PERFORM ads.fn_assert_ods_columns_exist(
      'ods',
      'wx_trade_sale_raw',
      ARRAY[
        'total_deal_amount',
        'pay_amount',
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]
    );$new$
    );
  END IF;

  IF position($needle$SUM(COALESCE(src.total_deal_amount, 0))::NUMERIC(18, 2) AS gmv,$needle$ IN ddl) = 0 THEN
    ddl := replace(
      ddl,
      $old$SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,$old$,
      $new$SUM(COALESCE(src.total_deal_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count,$new$
    );
  END IF;

  IF position($old$      a.gmv,
      a.gmv AS user_pay_amount,
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
  ELSE$old$ IN ddl) > 0 THEN
    ddl := replace(
      ddl,
      $old$      a.gmv,
      a.gmv AS user_pay_amount,
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
  ELSE$old$,
      $new$      a.gmv,
      a.user_pay_amount AS user_pay_amount,
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
  ELSE$new$
    );
  END IF;

  IF position($needle$'wx_trade_sale_raw',
      ARRAY[
        'total_deal_amount',
        'pay_amount',
        'refund_amount_pay_time',
        'refund_amount_refund_time'
      ]$needle$ IN ddl) = 0 THEN
    RAISE EXCEPTION 'failed to patch wx source column assertion in ads.refresh_all_trade_overview_platform';
  END IF;

  IF position($needle$SUM(COALESCE(src.total_deal_amount, 0))::NUMERIC(18, 2) AS gmv,
        SUM(COALESCE(src.pay_amount, 0))::NUMERIC(18, 2) AS user_pay_amount,
        SUM(COALESCE(src.pay_order_count, 0))::BIGINT AS order_count$needle$ IN ddl) = 0 THEN
    RAISE EXCEPTION 'failed to patch wx aggregation in ads.refresh_all_trade_overview_platform';
  END IF;

  IF position($needle$      a.gmv,
      a.user_pay_amount AS user_pay_amount,
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
  ELSE$needle$ IN ddl) = 0 THEN
    RAISE EXCEPTION 'failed to patch wx user_pay_amount projection in ads.refresh_all_trade_overview_platform';
  END IF;

  EXECUTE ddl;
END $$;

COMMENT ON COLUMN ads.all_trade_overview.gmv
IS '交易总额。抖音来源 ods.douyin_trade_sale_raw.trade_amount；微信小程序来源 ods.wx_trade_sale_raw.total_deal_amount；小红书来源 ods.xhs_trade_sale_raw.pay_amount；未剔除退款。';

COMMENT ON COLUMN ads.all_trade_overview.user_pay_amount
IS '用户支付金额。抖音来源 ods.douyin_trade_sale_raw.user_pay_amount；微信小程序来源 ods.wx_trade_sale_raw.pay_amount；小红书来源 ods.xhs_trade_sale_raw.user_pay_amount；其他平台当前按 GMV 兼容占位。';

COMMENT ON PROCEDURE ads.refresh_all_trade_overview_platform(VARCHAR, DATE, DATE)
IS '按平台刷新经营总览 ADS；微信小程序 GMV 来源 ods.wx_trade_sale_raw.total_deal_amount，用户支付金额来源 pay_amount；抖音来源 carrier_type=全部 且 promotion_period=不限 总计行。';

COMMIT;
