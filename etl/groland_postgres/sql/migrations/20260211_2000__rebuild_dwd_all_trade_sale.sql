BEGIN;

CREATE SCHEMA IF NOT EXISTS dwd;

DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'dwd'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS dwd.%I CASCADE', table_record.tablename);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS dwd.fn_touch_all_trade_sale_updated_at();

CREATE TABLE dwd.all_trade_sale (
  id BIGSERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  shop_name VARCHAR(255) NOT NULL,
  shop_id VARCHAR(128) NOT NULL,
  "date" DATE NOT NULL,
  gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  buyer_count INTEGER NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_all_trade_sale_platform_shop_date UNIQUE (platform, shop_id, "date"),
  CONSTRAINT chk_all_trade_sale_platform CHECK (platform IN ('douyin', 'jd', 'taobao', 'wx', 'xhs'))
);

CREATE INDEX idx_all_trade_sale_date ON dwd.all_trade_sale ("date");
CREATE INDEX idx_all_trade_sale_platform ON dwd.all_trade_sale (platform);
CREATE INDEX idx_all_trade_sale_shop_id ON dwd.all_trade_sale (shop_id);

CREATE FUNCTION dwd.fn_touch_all_trade_sale_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_all_trade_sale_updated_at
BEFORE UPDATE ON dwd.all_trade_sale
FOR EACH ROW
EXECUTE FUNCTION dwd.fn_touch_all_trade_sale_updated_at();

WITH source_union AS (
  SELECT
    'douyin'::VARCHAR(20) AS platform,
    shop_name,
    shop_id,
    stat_date AS trade_date,
    COALESCE(user_pay_amount, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(order_count, 0)::INTEGER AS order_count,
    COALESCE(buyer_count, 0)::INTEGER AS buyer_count,
    COALESCE(refund_amount_refund_time, 0)::NUMERIC(18, 2) AS refund_amount
  FROM ods.douyin_trade_sale_raw

  UNION ALL

  SELECT
    'jd'::VARCHAR(20) AS platform,
    shop_name,
    shop_id,
    stat_date AS trade_date,
    COALESCE(gmv, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(order_count, 0)::INTEGER AS order_count,
    COALESCE(buyer_count, 0)::INTEGER AS buyer_count,
    COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
  FROM ods.jd_trade_sale_raw

  UNION ALL

  SELECT
    'taobao'::VARCHAR(20) AS platform,
    shop_name,
    shop_id,
    stat_date AS trade_date,
    COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(pay_parent_order_count, 0)::INTEGER AS order_count,
    COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
    COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
  FROM ods.taobao_trade_sale_raw

  UNION ALL

  SELECT
    'wx'::VARCHAR(20) AS platform,
    shop_name,
    shop_id,
    stat_date AS trade_date,
    COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(pay_order_count, 0)::INTEGER AS order_count,
    COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
    COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
  FROM ods.wx_trade_sale_raw

  UNION ALL

  SELECT
    'xhs'::VARCHAR(20) AS platform,
    shop_name,
    shop_id,
    stat_date AS trade_date,
    COALESCE(pay_amount, 0)::NUMERIC(18, 2) AS gmv,
    COALESCE(pay_order_count, 0)::INTEGER AS order_count,
    COALESCE(pay_buyer_count, 0)::INTEGER AS buyer_count,
    COALESCE(refund_amount, 0)::NUMERIC(18, 2) AS refund_amount
  FROM ods.xhs_trade_sale_raw
),
aggregated AS (
  SELECT
    platform,
    MIN(shop_name) AS shop_name,
    shop_id,
    trade_date,
    SUM(gmv)::NUMERIC(18, 2) AS gmv,
    SUM(order_count)::INTEGER AS order_count,
    SUM(buyer_count)::INTEGER AS buyer_count,
    SUM(refund_amount)::NUMERIC(18, 2) AS refund_amount
  FROM source_union
  GROUP BY platform, shop_id, trade_date
)
INSERT INTO dwd.all_trade_sale (
  platform,
  shop_name,
  shop_id,
  "date",
  gmv,
  order_count,
  buyer_count,
  refund_amount
)
SELECT
  platform,
  shop_name,
  shop_id,
  trade_date,
  gmv,
  order_count,
  buyer_count,
  refund_amount
FROM aggregated
ON CONFLICT (platform, shop_id, "date") DO UPDATE
SET
  shop_name = EXCLUDED.shop_name,
  gmv = EXCLUDED.gmv,
  order_count = EXCLUDED.order_count,
  buyer_count = EXCLUDED.buyer_count,
  refund_amount = EXCLUDED.refund_amount,
  updated_at = NOW();

COMMIT;
