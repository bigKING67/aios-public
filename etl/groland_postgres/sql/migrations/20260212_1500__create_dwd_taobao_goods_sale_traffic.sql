BEGIN;

CREATE SCHEMA IF NOT EXISTS dwd;

CREATE TABLE IF NOT EXISTS dwd.taobao_goods_sale_traffic (
  id BIGSERIAL PRIMARY KEY,
  shop_id VARCHAR(50) NOT NULL,
  shop_name VARCHAR(100) NOT NULL,
  stat_date DATE NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  product_name VARCHAR(500),
  pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  search_visitor_count INTEGER NOT NULL DEFAULT 0,
  search_cart_buyer_count INTEGER NOT NULL DEFAULT 0,
  search_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  search_pay_quantity INTEGER NOT NULL DEFAULT 0,
  search_pay_buyer_count INTEGER NOT NULL DEFAULT 0,
  recommend_visitor_count INTEGER NOT NULL DEFAULT 0,
  recommend_cart_buyer_count INTEGER NOT NULL DEFAULT 0,
  recommend_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  recommend_pay_quantity INTEGER NOT NULL DEFAULT 0,
  recommend_pay_buyer_count INTEGER NOT NULL DEFAULT 0,
  keyword_ad_visitor_count INTEGER NOT NULL DEFAULT 0,
  keyword_ad_cart_buyer_count INTEGER NOT NULL DEFAULT 0,
  keyword_ad_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  keyword_ad_pay_quantity INTEGER NOT NULL DEFAULT 0,
  keyword_ad_pay_buyer_count INTEGER NOT NULL DEFAULT 0,
  crowd_ad_visitor_count INTEGER NOT NULL DEFAULT 0,
  crowd_ad_cart_buyer_count INTEGER NOT NULL DEFAULT 0,
  crowd_ad_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  crowd_ad_pay_quantity INTEGER NOT NULL DEFAULT 0,
  crowd_ad_pay_buyer_count INTEGER NOT NULL DEFAULT 0,
  scene_ad_visitor_count INTEGER NOT NULL DEFAULT 0,
  scene_ad_cart_buyer_count INTEGER NOT NULL DEFAULT 0,
  scene_ad_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  scene_ad_pay_quantity INTEGER NOT NULL DEFAULT 0,
  scene_ad_pay_buyer_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_taobao_goods_sale_traffic_shop_date_product UNIQUE (shop_id, stat_date, product_id)
);

COMMENT ON TABLE dwd.taobao_goods_sale_traffic IS 'DWD层淘宝商品成交与流量明细（来源：ods.taobao_trade_sale_goods_raw）';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.id IS '主键ID';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.shop_id IS '店铺ID';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.shop_name IS '店铺名称';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.stat_date IS '统计日期';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.product_id IS '商品ID';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.product_name IS '商品名称';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.pay_amount IS '支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.refund_amount IS '成功退款金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.search_visitor_count IS '搜索访客数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.search_cart_buyer_count IS '搜索加购人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.search_pay_amount IS '搜索支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.search_pay_quantity IS '搜索支付件数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.search_pay_buyer_count IS '搜索支付人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.recommend_visitor_count IS '推荐访客数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.recommend_cart_buyer_count IS '推荐加购人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.recommend_pay_amount IS '推荐支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.recommend_pay_quantity IS '推荐支付件数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.recommend_pay_buyer_count IS '推荐支付人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.keyword_ad_visitor_count IS '关键词推广访客数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.keyword_ad_cart_buyer_count IS '关键词推广加购人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.keyword_ad_pay_amount IS '关键词推广支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.keyword_ad_pay_quantity IS '关键词推广支付件数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.keyword_ad_pay_buyer_count IS '关键词推广支付人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.crowd_ad_visitor_count IS '人群推广访客数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.crowd_ad_cart_buyer_count IS '人群推广加购人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.crowd_ad_pay_amount IS '人群推广支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.crowd_ad_pay_quantity IS '人群推广支付件数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.crowd_ad_pay_buyer_count IS '人群推广支付人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.scene_ad_visitor_count IS '场景推广访客数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.scene_ad_cart_buyer_count IS '场景推广加购人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.scene_ad_pay_amount IS '场景推广支付金额';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.scene_ad_pay_quantity IS '场景推广支付件数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.scene_ad_pay_buyer_count IS '场景推广支付人数';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.created_at IS '创建时间';
COMMENT ON COLUMN dwd.taobao_goods_sale_traffic.updated_at IS '更新时间';

CREATE INDEX IF NOT EXISTS idx_taobao_goods_sale_traffic_stat_date
ON dwd.taobao_goods_sale_traffic (stat_date);

CREATE INDEX IF NOT EXISTS idx_taobao_goods_sale_traffic_shop_id
ON dwd.taobao_goods_sale_traffic (shop_id);

CREATE INDEX IF NOT EXISTS idx_taobao_goods_sale_traffic_product_id
ON dwd.taobao_goods_sale_traffic (product_id);

CREATE OR REPLACE FUNCTION dwd.fn_touch_taobao_goods_sale_traffic_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_taobao_goods_sale_traffic_updated_at ON dwd.taobao_goods_sale_traffic;

CREATE TRIGGER trg_touch_taobao_goods_sale_traffic_updated_at
BEFORE UPDATE ON dwd.taobao_goods_sale_traffic
FOR EACH ROW
EXECUTE FUNCTION dwd.fn_touch_taobao_goods_sale_traffic_updated_at();

COMMIT;
