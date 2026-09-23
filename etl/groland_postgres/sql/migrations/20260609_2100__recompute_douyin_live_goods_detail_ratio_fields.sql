BEGIN;

CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_live_goods_detail_ratio_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.product_exposure_to_click_rate_user := CASE
    WHEN COALESCE(NEW.product_exposure_user_count, 0) > 0 THEN
      ROUND(
        COALESCE(NEW.product_click_user_count, 0)::NUMERIC
        / COALESCE(NEW.product_exposure_user_count, 0)::NUMERIC,
        6
      )::NUMERIC(18, 6)
    ELSE 0::NUMERIC(18, 6)
  END;

  NEW.product_click_to_pay_rate_user := CASE
    WHEN COALESCE(NEW.product_click_user_count, 0) > 0 THEN
      ROUND(
        COALESCE(NEW.product_buyer_count, 0)::NUMERIC
        / COALESCE(NEW.product_click_user_count, 0)::NUMERIC,
        6
      )::NUMERIC(18, 6)
    ELSE 0::NUMERIC(18, 6)
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_douyin_live_goods_detail_ratio_fields
  ON ads.douyin_live_goods_detail;

CREATE TRIGGER trg_recompute_douyin_live_goods_detail_ratio_fields
BEFORE INSERT OR UPDATE ON ads.douyin_live_goods_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_recompute_douyin_live_goods_detail_ratio_fields();

WITH expected AS (
  SELECT
    shop_id,
    anchor_douyin_id,
    live_start_time,
    product_id,
    sku_name,
    CASE
      WHEN COALESCE(product_exposure_user_count, 0) > 0 THEN
        ROUND(
          COALESCE(product_click_user_count, 0)::NUMERIC
          / COALESCE(product_exposure_user_count, 0)::NUMERIC,
          6
        )::NUMERIC(18, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_exposure_to_click_rate_user,
    CASE
      WHEN COALESCE(product_click_user_count, 0) > 0 THEN
        ROUND(
          COALESCE(product_buyer_count, 0)::NUMERIC
          / COALESCE(product_click_user_count, 0)::NUMERIC,
          6
        )::NUMERIC(18, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_click_to_pay_rate_user
  FROM ads.douyin_live_goods_detail
)
UPDATE ads.douyin_live_goods_detail AS dst
SET
  product_exposure_to_click_rate_user = expected.product_exposure_to_click_rate_user,
  product_click_to_pay_rate_user = expected.product_click_to_pay_rate_user
FROM expected
WHERE dst.shop_id = expected.shop_id
  AND dst.anchor_douyin_id = expected.anchor_douyin_id
  AND dst.live_start_time = expected.live_start_time
  AND dst.product_id = expected.product_id
  AND dst.sku_name = expected.sku_name
  AND (
    dst.product_exposure_to_click_rate_user IS DISTINCT FROM expected.product_exposure_to_click_rate_user
    OR dst.product_click_to_pay_rate_user IS DISTINCT FROM expected.product_click_to_pay_rate_user
  );

COMMIT;
