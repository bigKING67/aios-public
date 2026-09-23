DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.douyin_trade_sale_card') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_trade_sale_card not found';
  END IF;

  IF to_regclass('ads.douyin_trade_sale_card_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_trade_sale_card_detail not found';
  END IF;

  IF to_regclass('etl.douyin_trade_sale_card_dashboard_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.douyin_trade_sale_card_dashboard_refresh_state not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    (
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'douyin_trade_sale_card_raw'
      EXCEPT
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'douyin_trade_sale_card'
    )
    UNION ALL
    (
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'douyin_trade_sale_card'
      EXCEPT
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'douyin_trade_sale_card_raw'
    )
  ) diff;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card column parity check failed, diff rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    (
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'douyin_trade_sale_card_detail_raw'
      EXCEPT
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'douyin_trade_sale_card_detail'
    )
    UNION ALL
    (
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ads'
        AND table_name = 'douyin_trade_sale_card_detail'
      EXCEPT
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ods'
        AND table_name = 'douyin_trade_sale_card_detail_raw'
    )
  ) diff;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card_detail column parity check failed, diff rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_trade_sale_card
  WHERE "date" IS NULL
     OR NULLIF(BTRIM(shop_name), '') IS NULL
     OR NULLIF(BTRIM(shop_id), '') IS NULL
     OR NULLIF(BTRIM(product_id), '') IS NULL
     OR COALESCE(card_exposure_user_count, 0) < 0
     OR COALESCE(card_click_user_count, 0) < 0
     OR COALESCE(card_click_count, 0) < 0
     OR COALESCE(card_user_pay_amount, 0) < 0
     OR COALESCE(card_buyer_count, 0) < 0
     OR COALESCE(card_cart_user_count, 0) < 0
     OR COALESCE(card_favorite_user_count, 0) < 0
     OR COALESCE(card_order_count, 0) < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card basic metric check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_trade_sale_card
  WHERE card_click_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_user_count, 0) > 0
            THEN ROUND(COALESCE(card_click_user_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_avg_click_per_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_user_count, 0) > 0
            THEN ROUND(COALESCE(card_click_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR new_customer_click_rate IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_count, 0) > 0
            THEN ROUND(COALESCE(new_customer_click_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR old_customer_click_rate IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_count, 0) > 0
            THEN ROUND(COALESCE(old_customer_click_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_avg_order_value IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_buyer_count, 0) > 0
            THEN ROUND(COALESCE(card_user_pay_amount, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 2)
          ELSE NULL::NUMERIC
        END
     OR card_click_to_pay_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_user_count, 0) > 0
            THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR first_buy_new_rate IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_buyer_count, 0) > 0
            THEN ROUND(COALESCE(first_buy_user_count, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR rebuy_old_rate IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_buyer_count, 0) > 0
            THEN ROUND(COALESCE(rebuy_user_count, 0)::NUMERIC / COALESCE(card_buyer_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_exposure_to_pay_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_user_count, 0) > 0
            THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_exposure_to_pay_rate_count IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_count, 0) > 0
            THEN ROUND(COALESCE(card_order_count, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_gpm IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_count, 0) > 0
            THEN ROUND(COALESCE(card_user_pay_amount, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC * 1000, 6)
          ELSE NULL::NUMERIC
        END
     OR card_click_rate_count IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_count, 0) > 0
            THEN ROUND(COALESCE(card_click_count, 0)::NUMERIC / COALESCE(card_exposure_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_click_to_pay_rate_count IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_count, 0) > 0
            THEN ROUND(COALESCE(card_order_count, 0)::NUMERIC / COALESCE(card_click_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card derived ratio/value check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_trade_sale_card_detail
  WHERE stat_date IS NULL
     OR NULLIF(BTRIM(shop_name), '') IS NULL
     OR NULLIF(BTRIM(shop_id), '') IS NULL
     OR NULLIF(BTRIM(product_id), '') IS NULL
     OR NULLIF(BTRIM(source_level1), '') IS NULL
     OR COALESCE(card_exposure_user_count, 0) < 0
     OR COALESCE(card_click_user_count, 0) < 0
     OR COALESCE(card_buyer_count, 0) < 0
     OR COALESCE(card_cart_user_count, 0) < 0
     OR COALESCE(card_favorite_user_count, 0) < 0
     OR COALESCE(card_bounce_user_count, 0) < 0
     OR COALESCE(card_user_pay_amount, 0) < 0
     OR COALESCE(card_order_count, 0) < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card_detail basic metric check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_trade_sale_card_detail
  WHERE card_exposure_to_pay_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_user_count, 0) > 0
            THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_click_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_exposure_user_count, 0) > 0
            THEN ROUND(COALESCE(card_click_user_count, 0)::NUMERIC / COALESCE(card_exposure_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END
     OR card_click_to_pay_rate_user IS DISTINCT FROM
        CASE
          WHEN COALESCE(card_click_user_count, 0) > 0
            THEN ROUND(COALESCE(card_buyer_count, 0)::NUMERIC / COALESCE(card_click_user_count, 0)::NUMERIC, 6)
          ELSE NULL::NUMERIC
        END;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'ads.douyin_trade_sale_card_detail derived ratio check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.douyin_trade_sale_card_dashboard_refresh_state
  WHERE id = 1;

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'douyin_trade_sale_card_dashboard_refresh_state default row check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin_trade_sale_card_dashboard checks passed';
END;
$$;
