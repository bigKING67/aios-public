BEGIN;

DROP SCHEMA IF EXISTS dws CASCADE;
CREATE SCHEMA dws;

COMMENT ON SCHEMA dws IS 'DWS主题汇总层：沉淀跨平台可复用的聚合数据资产。';

CREATE TABLE dws.all_trade_sale_daily (
  id BIGSERIAL PRIMARY KEY,
  "date" DATE NOT NULL,
  gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  buyer_count INTEGER NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_all_trade_sale_daily_date UNIQUE ("date")
);

COMMENT ON TABLE dws.all_trade_sale_daily IS '全渠道按天交易汇总表：不区分平台与店铺，每天一行。';
COMMENT ON COLUMN dws.all_trade_sale_daily.id IS '主键ID。';
COMMENT ON COLUMN dws.all_trade_sale_daily."date" IS '统计日期（自然日）。';
COMMENT ON COLUMN dws.all_trade_sale_daily.gmv IS '全渠道当日成交金额汇总。';
COMMENT ON COLUMN dws.all_trade_sale_daily.order_count IS '全渠道当日订单数汇总。';
COMMENT ON COLUMN dws.all_trade_sale_daily.buyer_count IS '全渠道当日买家数汇总。';
COMMENT ON COLUMN dws.all_trade_sale_daily.refund_amount IS '全渠道当日退款金额汇总。';
COMMENT ON COLUMN dws.all_trade_sale_daily.created_at IS '记录创建时间。';
COMMENT ON COLUMN dws.all_trade_sale_daily.updated_at IS '记录最后更新时间。';

CREATE INDEX idx_all_trade_sale_daily_date
ON dws.all_trade_sale_daily ("date");

CREATE FUNCTION dws.fn_touch_all_trade_sale_daily_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dws.fn_touch_all_trade_sale_daily_updated_at() IS '更新前自动刷新updated_at字段。';

CREATE TRIGGER trg_touch_all_trade_sale_daily_updated_at
BEFORE UPDATE ON dws.all_trade_sale_daily
FOR EACH ROW
EXECUTE FUNCTION dws.fn_touch_all_trade_sale_daily_updated_at();

CREATE PROCEDURE dws.refresh_all_trade_sale_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  SELECT
    COALESCE(p_start_date, MIN("date")),
    COALESCE(p_end_date, MAX("date"))
  INTO v_start_date, v_end_date
  FROM dwd.all_trade_sale;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dwd.all_trade_sale has no data, skipped';
    RETURN;
  END IF;

  DELETE FROM dws.all_trade_sale_daily
  WHERE "date" BETWEEN v_start_date AND v_end_date;

  INSERT INTO dws.all_trade_sale_daily (
    "date",
    gmv,
    order_count,
    buyer_count,
    refund_amount
  )
  SELECT
    d."date",
    SUM(d.gmv)::NUMERIC(18, 2) AS gmv,
    SUM(d.order_count)::INTEGER AS order_count,
    SUM(d.buyer_count)::INTEGER AS buyer_count,
    SUM(d.refund_amount)::NUMERIC(18, 2) AS refund_amount
  FROM dwd.all_trade_sale d
  WHERE d."date" BETWEEN v_start_date AND v_end_date
  GROUP BY d."date";

  RAISE NOTICE 'refresh_all_trade_sale_daily completed, window: [% - %]', v_start_date, v_end_date;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_all_trade_sale_daily(DATE, DATE) IS '按日期窗口刷新全渠道日汇总数据。';

CALL dws.refresh_all_trade_sale_daily(NULL, NULL);

COMMIT;
