BEGIN;

CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_live_detail_ratio_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.product_click_rate_count :=
    CASE
      WHEN COALESCE(NEW.live_product_exposure_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_product_click_count, 0)::NUMERIC
          / COALESCE(NEW.live_product_exposure_count, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.product_click_rate_user :=
    CASE
      WHEN COALESCE(NEW.live_product_exposure_user, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_product_click_user, 0)::NUMERIC
          / COALESCE(NEW.live_product_exposure_user, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.click_to_pay_rate_count :=
    CASE
      WHEN COALESCE(NEW.live_product_click_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_order_count, 0)::NUMERIC
          / COALESCE(NEW.live_product_click_count, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.click_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.live_product_click_user, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.live_product_click_user, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.watch_to_pay_rate_count :=
    CASE
      WHEN COALESCE(NEW.live_watch_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_order_count, 0)::NUMERIC
          / COALESCE(NEW.live_watch_count, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.watch_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.live_watch_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.live_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.live_watch_user_count, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.refund_rate_1h :=
    CASE
      WHEN COALESCE(NEW.live_order_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.refund_order_count_1h, 0)::NUMERIC
          / COALESCE(NEW.live_order_count, 0)::NUMERIC,
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  NEW.coupon_guided_payment_rate :=
    CASE
      WHEN COALESCE(NEW.live_user_pay_amount, 0) > 0
        THEN ROUND(
          COALESCE(NEW.coupon_guided_payment_amount, 0)
          / COALESCE(NEW.live_user_pay_amount, 0),
          6
        )
      ELSE 0::NUMERIC(18, 6)
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_douyin_live_detail_ratio_fields ON ads.douyin_live_detail;

CREATE TRIGGER trg_recompute_douyin_live_detail_ratio_fields
BEFORE INSERT OR UPDATE ON ads.douyin_live_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_recompute_douyin_live_detail_ratio_fields();

WITH expected AS (
  SELECT
    shop_id,
    anchor_douyin_id,
    live_start_time,
    CASE
      WHEN COALESCE(live_product_exposure_count, 0) > 0
        THEN ROUND(COALESCE(live_product_click_count, 0)::NUMERIC / COALESCE(live_product_exposure_count, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_click_rate_count,
    CASE
      WHEN COALESCE(live_product_exposure_user, 0) > 0
        THEN ROUND(COALESCE(live_product_click_user, 0)::NUMERIC / COALESCE(live_product_exposure_user, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS product_click_rate_user,
    CASE
      WHEN COALESCE(live_product_click_count, 0) > 0
        THEN ROUND(COALESCE(live_order_count, 0)::NUMERIC / COALESCE(live_product_click_count, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS click_to_pay_rate_count,
    CASE
      WHEN COALESCE(live_product_click_user, 0) > 0
        THEN ROUND(COALESCE(live_buyer_count, 0)::NUMERIC / COALESCE(live_product_click_user, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS click_to_pay_rate_user,
    CASE
      WHEN COALESCE(live_watch_count, 0) > 0
        THEN ROUND(COALESCE(live_order_count, 0)::NUMERIC / COALESCE(live_watch_count, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS watch_to_pay_rate_count,
    CASE
      WHEN COALESCE(live_watch_user_count, 0) > 0
        THEN ROUND(COALESCE(live_buyer_count, 0)::NUMERIC / COALESCE(live_watch_user_count, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS watch_to_pay_rate_user,
    CASE
      WHEN COALESCE(live_order_count, 0) > 0
        THEN ROUND(COALESCE(refund_order_count_1h, 0)::NUMERIC / COALESCE(live_order_count, 0)::NUMERIC, 6)
      ELSE 0::NUMERIC(18, 6)
    END AS refund_rate_1h,
    CASE
      WHEN COALESCE(live_user_pay_amount, 0) > 0
        THEN ROUND(COALESCE(coupon_guided_payment_amount, 0) / COALESCE(live_user_pay_amount, 0), 6)
      ELSE 0::NUMERIC(18, 6)
    END AS coupon_guided_payment_rate
  FROM ads.douyin_live_detail
)
UPDATE ads.douyin_live_detail dst
SET
  product_click_rate_count = expected.product_click_rate_count,
  product_click_rate_user = expected.product_click_rate_user,
  click_to_pay_rate_count = expected.click_to_pay_rate_count,
  click_to_pay_rate_user = expected.click_to_pay_rate_user,
  watch_to_pay_rate_count = expected.watch_to_pay_rate_count,
  watch_to_pay_rate_user = expected.watch_to_pay_rate_user,
  refund_rate_1h = expected.refund_rate_1h,
  coupon_guided_payment_rate = expected.coupon_guided_payment_rate
FROM expected
WHERE dst.shop_id = expected.shop_id
  AND dst.anchor_douyin_id = expected.anchor_douyin_id
  AND dst.live_start_time = expected.live_start_time
  AND (
    dst.product_click_rate_count IS DISTINCT FROM expected.product_click_rate_count
    OR dst.product_click_rate_user IS DISTINCT FROM expected.product_click_rate_user
    OR dst.click_to_pay_rate_count IS DISTINCT FROM expected.click_to_pay_rate_count
    OR dst.click_to_pay_rate_user IS DISTINCT FROM expected.click_to_pay_rate_user
    OR dst.watch_to_pay_rate_count IS DISTINCT FROM expected.watch_to_pay_rate_count
    OR dst.watch_to_pay_rate_user IS DISTINCT FROM expected.watch_to_pay_rate_user
    OR dst.refund_rate_1h IS DISTINCT FROM expected.refund_rate_1h
    OR dst.coupon_guided_payment_rate IS DISTINCT FROM expected.coupon_guided_payment_rate
  );

COMMENT ON FUNCTION ads.fn_recompute_douyin_live_detail_ratio_fields()
  IS 'Recomputes live detail ratio fields from row-level numerators and denominators before ADS writes.';

COMMIT;
