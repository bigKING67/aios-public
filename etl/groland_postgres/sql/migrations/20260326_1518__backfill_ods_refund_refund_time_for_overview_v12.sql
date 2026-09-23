BEGIN;

-- v12 nowcast/overview 增量过程要求 ODS 侧提供 refund_amount_pay_time/refund_amount_refund_time。
-- 部分历史环境仅有 refund_amount 或 refund_amount_by_pay_time，这里做兼容列补齐与一次性回填。

ALTER TABLE ods.jd_trade_sale_raw
  ADD COLUMN IF NOT EXISTS refund_amount_refund_time NUMERIC(18, 2);

UPDATE ods.jd_trade_sale_raw
SET refund_amount_refund_time = COALESCE(refund_amount_refund_time, refund_amount, refund_amount_pay_time, 0)
WHERE refund_amount_refund_time IS NULL;

ALTER TABLE ods.taobao_trade_sale_raw
  ADD COLUMN IF NOT EXISTS refund_amount_pay_time NUMERIC(18, 2);

ALTER TABLE ods.taobao_trade_sale_raw
  ADD COLUMN IF NOT EXISTS refund_amount_refund_time NUMERIC(18, 2);

UPDATE ods.taobao_trade_sale_raw
SET
  refund_amount_pay_time = COALESCE(refund_amount_pay_time, refund_amount_by_pay_time, refund_amount, 0),
  refund_amount_refund_time = COALESCE(refund_amount_refund_time, refund_amount, refund_amount_by_pay_time, 0)
WHERE refund_amount_pay_time IS NULL
   OR refund_amount_refund_time IS NULL;

ALTER TABLE ods.wx_trade_sale_raw
  ADD COLUMN IF NOT EXISTS refund_amount_refund_time NUMERIC(18, 2);

UPDATE ods.wx_trade_sale_raw
SET refund_amount_refund_time = COALESCE(refund_amount_refund_time, refund_amount, refund_amount_pay_time, 0)
WHERE refund_amount_refund_time IS NULL;

ALTER TABLE ods.xhs_trade_sale_raw
  ADD COLUMN IF NOT EXISTS refund_amount_refund_time NUMERIC(18, 2);

UPDATE ods.xhs_trade_sale_raw
SET refund_amount_refund_time = COALESCE(refund_amount_refund_time, refund_amount, refund_amount_pay_time, 0)
WHERE refund_amount_refund_time IS NULL;

COMMIT;
