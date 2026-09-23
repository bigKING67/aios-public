BEGIN;

CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE IF NOT EXISTS ads.douyin_trade_sale_carrier_daily (
  "date" DATE NOT NULL,
  carrier_type VARCHAR(20) NOT NULL,
  trade_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gsv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  order_count BIGINT NOT NULL DEFAULT 0,
  buyer_count BIGINT NOT NULL DEFAULT 0,
  refund_amount_pay_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount_refund_time NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  source_max_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_trade_sale_carrier_daily
    PRIMARY KEY ("date", carrier_type),
  CONSTRAINT chk_douyin_trade_sale_carrier_daily_carrier_type
    CHECK (carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他')),
  CONSTRAINT chk_douyin_trade_sale_carrier_daily_non_negative
    CHECK (
      trade_amount >= 0
      AND user_pay_amount >= 0
      AND gsv >= 0
      AND order_count >= 0
      AND buyer_count >= 0
      AND refund_amount_pay_time >= 0
      AND refund_amount_refund_time >= 0
      AND source_row_count >= 0
    )
);

COMMENT ON TABLE ads.douyin_trade_sale_carrier_daily IS
  'ADS-抖音成交载体日粒度指标表，来源 ods.douyin_trade_sale_raw 中 promotion_period=不限 且 carrier_type 为直播/短视频/商品卡/图文/其他的拆分行。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily."date" IS '统计日期。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.carrier_type IS '载体类型：直播、短视频、商品卡、图文、其他。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.trade_amount IS '成交金额，来源 ods.douyin_trade_sale_raw.trade_amount。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.user_pay_amount IS '用户支付金额，来源 ods.douyin_trade_sale_raw.user_pay_amount。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.gsv IS '成交净额口径：trade_amount - trade_refund_amount_pay_time。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.order_count IS '成交订单数。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.buyer_count IS '成交买家数。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.refund_amount_pay_time IS '成交退款金额（支付时间），来源 ods.douyin_trade_sale_raw.trade_refund_amount_pay_time。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.refund_amount_refund_time IS '成交退款金额（退款时间），来源 ods.douyin_trade_sale_raw.trade_refund_amount_refund_time。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.source_row_count IS '参与当前聚合行的 ODS 来源行数。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.source_max_updated_at IS '当前聚合行覆盖的最大 ODS 更新时间。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_trade_sale_carrier_daily.updated_at IS '记录更新时间。';

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_carrier_daily_date
  ON ads.douyin_trade_sale_carrier_daily ("date");
COMMENT ON INDEX ads.idx_douyin_trade_sale_carrier_daily_date IS '按日期窗口查询的索引。';

CREATE INDEX IF NOT EXISTS idx_douyin_trade_sale_carrier_daily_carrier_date
  ON ads.douyin_trade_sale_carrier_daily (carrier_type, "date" DESC);
COMMENT ON INDEX ads.idx_douyin_trade_sale_carrier_daily_carrier_date IS '按载体类型+日期窗口查询的索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_trade_sale_carrier_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ads.fn_touch_douyin_trade_sale_carrier_daily_updated_at() IS
  '更新前自动刷新 douyin_trade_sale_carrier_daily.updated_at 字段。';

DROP TRIGGER IF EXISTS trg_touch_douyin_trade_sale_carrier_daily_updated_at
ON ads.douyin_trade_sale_carrier_daily;

CREATE TRIGGER trg_touch_douyin_trade_sale_carrier_daily_updated_at
BEFORE UPDATE ON ads.douyin_trade_sale_carrier_daily
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_trade_sale_carrier_daily_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_trade_sale_carrier_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_missing_columns INTEGER;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_trade_sale_carrier_daily') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_trade_sale_carrier_daily does not exist';
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
      ('buyer_count'),
      ('updated_at'),
      ('created_at')
  ) required(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'ods'
      AND c.table_name = 'douyin_trade_sale_raw'
      AND c.column_name = required.column_name
  );

  IF v_missing_columns > 0 THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_raw is missing required columns: %', v_missing_columns;
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src.stat_date)),
    COALESCE(p_end_date, MAX(src.stat_date))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_raw src
  WHERE src.promotion_period = '不限'
    AND src.carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他');

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_raw has no carrier rows for promotion_period=不限, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_trade_sale_carrier_daily
  WHERE "date" BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.douyin_trade_sale_carrier_daily (
    "date",
    carrier_type,
    trade_amount,
    user_pay_amount,
    gsv,
    order_count,
    buyer_count,
    refund_amount_pay_time,
    refund_amount_refund_time,
    source_row_count,
    source_max_updated_at,
    created_at,
    updated_at
  )
  WITH carrier_dimension AS (
    SELECT carrier_type
    FROM (
      VALUES
        ('直播'),
        ('短视频'),
        ('商品卡'),
        ('图文'),
        ('其他')
    ) AS t(carrier_type)
  ),
  date_dimension AS (
    SELECT DISTINCT src.stat_date::DATE AS "date"
    FROM ods.douyin_trade_sale_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
      AND src.promotion_period = '不限'
      AND (
        src.carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他')
        OR src.carrier_type = '全部'
      )
  ),
  source_agg AS (
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
      SUM(COALESCE(src.trade_refund_amount_refund_time, 0))::NUMERIC(18, 2) AS refund_amount_refund_time,
      COUNT(*)::INTEGER AS source_row_count,
      MAX(COALESCE(src.updated_at, src.created_at, TIMESTAMP '1970-01-01 00:00:00')) AS source_max_updated_at
    FROM ods.douyin_trade_sale_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
      AND src.promotion_period = '不限'
      AND src.carrier_type IN ('直播', '短视频', '商品卡', '图文', '其他')
    GROUP BY src.stat_date::DATE, src.carrier_type
  )
  SELECT
    d."date",
    c.carrier_type,
    COALESCE(a.trade_amount, 0)::NUMERIC(18, 2) AS trade_amount,
    COALESCE(a.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
    COALESCE(a.gsv, 0)::NUMERIC(18, 2) AS gsv,
    COALESCE(a.order_count, 0)::BIGINT AS order_count,
    COALESCE(a.buyer_count, 0)::BIGINT AS buyer_count,
    COALESCE(a.refund_amount_pay_time, 0)::NUMERIC(18, 2) AS refund_amount_pay_time,
    COALESCE(a.refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount_refund_time,
    COALESCE(a.source_row_count, 0)::INTEGER AS source_row_count,
    a.source_max_updated_at,
    NOW() AS created_at,
    NOW() AS updated_at
  FROM date_dimension d
  CROSS JOIN carrier_dimension c
  LEFT JOIN source_agg a
    ON a."date" = d."date"
   AND a.carrier_type = c.carrier_type;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_trade_sale_carrier_daily completed, deleted: %, inserted: %, window: [% - %]',
    v_deleted_rows,
    v_inserted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_trade_sale_carrier_daily(DATE, DATE)
IS '按日期窗口刷新 ADS 抖音成交载体日粒度表；来源 ods.douyin_trade_sale_raw 中 promotion_period=不限 且 carrier_type 为直播/短视频/商品卡/图文/其他的拆分行。';

DO $$
DECLARE
  ddl TEXT;
BEGIN
  IF to_regprocedure('ads.refresh_all_trade_overview_incremental(integer, boolean)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_all_trade_overview_incremental(integer, boolean) is missing; apply 20260303_2300 first';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('ads.refresh_all_trade_overview_incremental(integer, boolean)')) INTO ddl;

  IF ddl NOT LIKE '%refresh_douyin_trade_sale_carrier_daily%' THEN
    ddl := regexp_replace(
      ddl,
      'CALL ads\.refresh_all_trade_overview_platform\(v_platform, v_min_date, v_max_date\);',
      'CALL ads.refresh_all_trade_overview_platform(v_platform, v_min_date, v_max_date);

      IF v_platform = ''douyin'' THEN
        CALL ads.refresh_douyin_trade_sale_carrier_daily(v_min_date, v_max_date);
      END IF;'
    );
  END IF;

  IF ddl NOT LIKE '%refresh_douyin_trade_sale_carrier_daily%' THEN
    RAISE EXCEPTION 'failed to patch ads.refresh_all_trade_overview_incremental with douyin carrier refresh';
  END IF;

  EXECUTE ddl;
END $$;

COMMENT ON PROCEDURE ads.refresh_all_trade_overview_incremental(INTEGER, BOOLEAN)
IS '增量刷新经营总览 ADS；抖音窗口刷新时同步刷新 ads.douyin_trade_sale_carrier_daily 载体拆分日表，并刷新退款 nowcast。';

CALL ads.refresh_douyin_trade_sale_carrier_daily(NULL, NULL);

COMMIT;
