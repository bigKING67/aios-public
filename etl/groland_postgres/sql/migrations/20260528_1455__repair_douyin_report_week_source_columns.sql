BEGIN;

DO $$
DECLARE
  ddl TEXT;
BEGIN
  IF to_regprocedure('ads.refresh_report_douyin_trade_sale_metrics_week(date, date)') IS NULL THEN
    RAISE EXCEPTION 'procedure ads.refresh_report_douyin_trade_sale_metrics_week(date, date) is missing; apply 20260430_1200 first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'refund_amount_pay_time'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.refund_amount_pay_time is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ods'
      AND table_name = 'douyin_trade_sale_raw'
      AND column_name = 'refund_amount_refund_time'
  ) THEN
    RAISE EXCEPTION 'source column ods.douyin_trade_sale_raw.refund_amount_refund_time is missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('ads.refresh_report_douyin_trade_sale_metrics_week(date, date)')) INTO ddl;

  ddl := replace(ddl, 'src.trade_refund_amount_pay_time', 'src.refund_amount_pay_time');
  ddl := replace(ddl, 'src.trade_refund_amount_refund_time', 'src.refund_amount_refund_time');

  EXECUTE ddl;
END $$;

COMMENT ON PROCEDURE ads.refresh_report_douyin_trade_sale_metrics_week(DATE, DATE)
IS '按周窗口刷新 report 抖音交易周指标表；trade_refund_amount_* 来源兼容生产 ODS 的 refund_amount_* 字段。';

COMMIT;
