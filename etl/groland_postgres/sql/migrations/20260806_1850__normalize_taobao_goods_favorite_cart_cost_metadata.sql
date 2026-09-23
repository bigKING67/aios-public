DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ads.taobao_trade_sale_goods_daily
    WHERE crowd_ad_favorite_cart_cost IS NOT NULL
      AND (
        crowd_ad_favorite_cart_cost <> round(crowd_ad_favorite_cart_cost, 2)
        OR abs(crowd_ad_favorite_cart_cost) >= 10000000000000000
      )
  ) THEN
    RAISE EXCEPTION
      'crowd_ad_favorite_cart_cost contains values incompatible with NUMERIC(18,2)';
  END IF;
END;
$$;

ALTER TABLE ads.taobao_trade_sale_goods_daily
  ALTER COLUMN crowd_ad_favorite_cart_cost TYPE NUMERIC(18, 2)
  USING crowd_ad_favorite_cart_cost::NUMERIC(18, 2);

COMMENT ON COLUMN ads.taobao_trade_sale_goods_daily.crowd_ad_favorite_cart_cost
IS '人群推广收藏加购成本，精度与 ODS NUMERIC(18,2) 合同一致。';
