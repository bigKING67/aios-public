BEGIN;

CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.card_click_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_exposure_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_click_user_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_avg_click_per_user :=
    CASE
      WHEN COALESCE(NEW.card_click_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_click_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.new_customer_click_rate :=
    CASE
      WHEN COALESCE(NEW.card_click_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.new_customer_click_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.old_customer_click_rate :=
    CASE
      WHEN COALESCE(NEW.card_click_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.old_customer_click_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_avg_order_value :=
    CASE
      WHEN COALESCE(NEW.card_buyer_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_user_pay_amount, 0)::NUMERIC
          / COALESCE(NEW.card_buyer_count, 0)::NUMERIC,
          2
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_click_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_click_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.first_buy_new_rate :=
    CASE
      WHEN COALESCE(NEW.card_buyer_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.first_buy_user_count, 0)::NUMERIC
          / COALESCE(NEW.card_buyer_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.rebuy_old_rate :=
    CASE
      WHEN COALESCE(NEW.card_buyer_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.rebuy_user_count, 0)::NUMERIC
          / COALESCE(NEW.card_buyer_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_exposure_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_exposure_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_exposure_to_pay_rate_count :=
    CASE
      WHEN COALESCE(NEW.card_exposure_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_order_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_gpm :=
    CASE
      WHEN COALESCE(NEW.card_exposure_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_user_pay_amount, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_count, 0)::NUMERIC
          * 1000,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_click_rate_count :=
    CASE
      WHEN COALESCE(NEW.card_exposure_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_click_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_click_to_pay_rate_count :=
    CASE
      WHEN COALESCE(NEW.card_click_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_order_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.card_exposure_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_exposure_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_click_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_exposure_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_click_user_count, 0)::NUMERIC
          / COALESCE(NEW.card_exposure_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  NEW.card_click_to_pay_rate_user :=
    CASE
      WHEN COALESCE(NEW.card_click_user_count, 0) > 0
        THEN ROUND(
          COALESCE(NEW.card_buyer_count, 0)::NUMERIC
          / COALESCE(NEW.card_click_user_count, 0)::NUMERIC,
          6
        )
      ELSE NULL::NUMERIC
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_douyin_trade_sale_card_ratio_fields
  ON ads.douyin_trade_sale_card;

CREATE TRIGGER trg_recompute_douyin_trade_sale_card_ratio_fields
BEFORE INSERT OR UPDATE ON ads.douyin_trade_sale_card
FOR EACH ROW
EXECUTE FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields();

DROP TRIGGER IF EXISTS trg_recompute_douyin_trade_sale_card_detail_ratio_fields
  ON ads.douyin_trade_sale_card_detail;

CREATE TRIGGER trg_recompute_douyin_trade_sale_card_detail_ratio_fields
BEFORE INSERT OR UPDATE ON ads.douyin_trade_sale_card_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields();

WITH expected AS (
  SELECT
    shop_name,
    shop_id,
    "date",
    product_id,
    CASE
      WHEN COALESCE(card_exposure_user_count, 0) > 0
        THEN ROUND(COALESCE(card_click_user_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_rate_user,
    CASE
      WHEN COALESCE(card_click_user_count, 0) > 0
        THEN ROUND(COALESCE(card_click_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_avg_click_per_user,
    CASE
      WHEN COALESCE(card_click_count, 0) > 0
        THEN ROUND(COALESCE(new_customer_click_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS new_customer_click_rate,
    CASE
      WHEN COALESCE(card_click_count, 0) > 0
        THEN ROUND(COALESCE(old_customer_click_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS old_customer_click_rate,
    CASE
      WHEN COALESCE(card_buyer_count, 0) > 0
        THEN ROUND(COALESCE(card_user_pay_amount, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 2)
      ELSE NULL::NUMERIC
    END AS card_avg_order_value,
    CASE
      WHEN COALESCE(card_click_user_count, 0) > 0
        THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_to_pay_rate_user,
    CASE
      WHEN COALESCE(card_buyer_count, 0) > 0
        THEN ROUND(COALESCE(first_buy_user_count, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS first_buy_new_rate,
    CASE
      WHEN COALESCE(card_buyer_count, 0) > 0
        THEN ROUND(COALESCE(rebuy_user_count, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS rebuy_old_rate,
    CASE
      WHEN COALESCE(card_exposure_user_count, 0) > 0
        THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_exposure_to_pay_rate_user,
    CASE
      WHEN COALESCE(card_exposure_count, 0) > 0
        THEN ROUND(COALESCE(card_order_count, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_exposure_to_pay_rate_count,
    CASE
      WHEN COALESCE(card_exposure_count, 0) > 0
        THEN ROUND(COALESCE(card_user_pay_amount, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC * 1000, 6)
      ELSE NULL::NUMERIC
    END AS card_gpm,
    CASE
      WHEN COALESCE(card_exposure_count, 0) > 0
        THEN ROUND(COALESCE(card_click_count, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_rate_count,
    CASE
      WHEN COALESCE(card_click_count, 0) > 0
        THEN ROUND(COALESCE(card_order_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_to_pay_rate_count
  FROM ads.douyin_trade_sale_card
)
UPDATE ads.douyin_trade_sale_card dst
SET
  card_click_rate_user = expected.card_click_rate_user,
  card_avg_click_per_user = expected.card_avg_click_per_user,
  new_customer_click_rate = expected.new_customer_click_rate,
  old_customer_click_rate = expected.old_customer_click_rate,
  card_avg_order_value = expected.card_avg_order_value,
  card_click_to_pay_rate_user = expected.card_click_to_pay_rate_user,
  first_buy_new_rate = expected.first_buy_new_rate,
  rebuy_old_rate = expected.rebuy_old_rate,
  card_exposure_to_pay_rate_user = expected.card_exposure_to_pay_rate_user,
  card_exposure_to_pay_rate_count = expected.card_exposure_to_pay_rate_count,
  card_gpm = expected.card_gpm,
  card_click_rate_count = expected.card_click_rate_count,
  card_click_to_pay_rate_count = expected.card_click_to_pay_rate_count
FROM expected
WHERE dst.shop_name = expected.shop_name
  AND dst.shop_id = expected.shop_id
  AND dst."date" = expected."date"
  AND dst.product_id = expected.product_id
  AND (
    dst.card_click_rate_user IS DISTINCT FROM expected.card_click_rate_user
    OR dst.card_avg_click_per_user IS DISTINCT FROM expected.card_avg_click_per_user
    OR dst.new_customer_click_rate IS DISTINCT FROM expected.new_customer_click_rate
    OR dst.old_customer_click_rate IS DISTINCT FROM expected.old_customer_click_rate
    OR dst.card_avg_order_value IS DISTINCT FROM expected.card_avg_order_value
    OR dst.card_click_to_pay_rate_user IS DISTINCT FROM expected.card_click_to_pay_rate_user
    OR dst.first_buy_new_rate IS DISTINCT FROM expected.first_buy_new_rate
    OR dst.rebuy_old_rate IS DISTINCT FROM expected.rebuy_old_rate
    OR dst.card_exposure_to_pay_rate_user IS DISTINCT FROM expected.card_exposure_to_pay_rate_user
    OR dst.card_exposure_to_pay_rate_count IS DISTINCT FROM expected.card_exposure_to_pay_rate_count
    OR dst.card_gpm IS DISTINCT FROM expected.card_gpm
    OR dst.card_click_rate_count IS DISTINCT FROM expected.card_click_rate_count
    OR dst.card_click_to_pay_rate_count IS DISTINCT FROM expected.card_click_to_pay_rate_count
  );

WITH expected AS (
  SELECT
    shop_id,
    stat_date,
    product_id,
    source_level1,
    CASE
      WHEN COALESCE(card_exposure_user_count, 0) > 0
        THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_exposure_to_pay_rate_user,
    CASE
      WHEN COALESCE(card_exposure_user_count, 0) > 0
        THEN ROUND(COALESCE(card_click_user_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_rate_user,
    CASE
      WHEN COALESCE(card_click_user_count, 0) > 0
        THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
      ELSE NULL::NUMERIC
    END AS card_click_to_pay_rate_user
  FROM ads.douyin_trade_sale_card_detail
)
UPDATE ads.douyin_trade_sale_card_detail dst
SET
  card_exposure_to_pay_rate_user = expected.card_exposure_to_pay_rate_user,
  card_click_rate_user = expected.card_click_rate_user,
  card_click_to_pay_rate_user = expected.card_click_to_pay_rate_user
FROM expected
WHERE dst.shop_id = expected.shop_id
  AND dst.stat_date = expected.stat_date
  AND dst.product_id = expected.product_id
  AND dst.source_level1 = expected.source_level1
  AND (
    dst.card_exposure_to_pay_rate_user IS DISTINCT FROM expected.card_exposure_to_pay_rate_user
    OR dst.card_click_rate_user IS DISTINCT FROM expected.card_click_rate_user
    OR dst.card_click_to_pay_rate_user IS DISTINCT FROM expected.card_click_to_pay_rate_user
  );

COMMENT ON FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields()
  IS 'Recomputes goods-card ADS row ratio/value fields from row-level numerators and denominators before writes.';

COMMENT ON FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()
  IS 'Recomputes goods-card ADS detail source ratio fields from row-level numerators and denominators before writes.';

COMMIT;
