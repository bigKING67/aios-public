BEGIN;

CREATE SCHEMA IF NOT EXISTS dwd;

DROP TABLE IF EXISTS dwd.dwd_alimama_goods_marketing_di;

CREATE TABLE dwd.dwd_alimama_goods_marketing_di (
  stat_date DATE NOT NULL,
  shop_id VARCHAR(50) NOT NULL,
  shop_name VARCHAR(100),
  product_id VARCHAR(100) NOT NULL,
  scene VARCHAR(50) NOT NULL,
  scene_group VARCHAR(50),
  impression_count BIGINT NOT NULL DEFAULT 0,
  click_count BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_gmv NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_order_count INTEGER NOT NULL DEFAULT 0,
  buyer_count INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(10, 6),
  cvr NUMERIC(10, 6),
  cpc NUMERIC(18, 2),
  arpu NUMERIC(18, 2),
  cart_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  etl_time TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_dwd_alimama_goods_marketing_di PRIMARY KEY (stat_date, shop_id, product_id, scene)
);

COMMENT ON TABLE dwd.dwd_alimama_goods_marketing_di IS 'DWD-阿里妈妈商品营销明细清洗表';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.stat_date IS '统计日期';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.shop_id IS '店铺ID';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.shop_name IS '店铺名称';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.product_id IS '商品ID';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.scene IS '原始场景(关键词推广/人群推广)';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.scene_group IS '场景归组(搜索/推荐)';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.impression_count IS '展现量';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.click_count IS '点击量';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.cost IS '花费';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.total_gmv IS '总成交金额';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.total_order_count IS '总成交笔数';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.buyer_count IS '成交人数';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.ctr IS '点击率';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.cvr IS '点击转化率';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.cpc IS '平均点击成本(Cost Per Click)';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.arpu IS '客单价(Average Revenue Per User)';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.cart_count IS '加购量';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.favorite_count IS '收藏量';
COMMENT ON COLUMN dwd.dwd_alimama_goods_marketing_di.etl_time IS 'ETL入仓时间';

COMMIT;
