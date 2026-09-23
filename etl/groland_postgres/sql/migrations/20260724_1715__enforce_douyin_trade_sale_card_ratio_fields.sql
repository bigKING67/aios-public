SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('ads.douyin_trade_sale_card') IS NULL THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card does not exist';
  END IF;
  IF to_regclass('ads.douyin_trade_sale_card_detail') IS NULL THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card_detail does not exist';
  END IF;
END;
$$;

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

COMMENT ON FUNCTION ads.fn_recompute_douyin_trade_sale_card_ratio_fields()
  IS '在商品卡 ADS 行写入前，根据分子分母重算用户、次数、客单价和 GPM 比率字段。';

COMMENT ON FUNCTION ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()
  IS '在商品卡明细 ADS 行写入前，根据分子分母重算用户比率字段。';

COMMENT ON TRIGGER trg_recompute_douyin_trade_sale_card_ratio_fields
  ON ads.douyin_trade_sale_card
  IS '阻止 ODS 镜像刷新重新写入漂移的商品卡比率字段。';

COMMENT ON TRIGGER trg_recompute_douyin_trade_sale_card_detail_ratio_fields
  ON ads.douyin_trade_sale_card_detail
  IS '阻止 ODS 镜像刷新重新写入漂移的商品卡明细比率字段。';
