DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.douyin_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_self_anchor_map not found';
  END IF;

  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_detail not found';
  END IF;

  IF to_regclass('etl.douyin_live_detail_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.douyin_live_detail_refresh_state not found';
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_self_anchor_map
  WHERE NULLIF(BTRIM(anchor_douyin_id), '') IS NULL
     OR NULLIF(BTRIM(anchor_nickname), '') IS NULL;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_self_anchor_map basic field check failed, rows: %', v_invalid;
  END IF;

  WITH required_self_anchors(anchor_douyin_id, anchor_nickname) AS (
    VALUES
      ('1075458451', 'Groland高岚个人护理直播间'),
      ('64304983942', 'Groland高岚品牌直播间'),
      ('79269712574', 'Groland个人护理直播间')
  )
  SELECT COUNT(*)
  INTO v_invalid
  FROM required_self_anchors required
  LEFT JOIN ads.douyin_self_anchor_map mapped
    ON mapped.anchor_douyin_id = required.anchor_douyin_id
  WHERE mapped.anchor_douyin_id IS NULL
     OR mapped.anchor_nickname <> required.anchor_nickname
     OR mapped.is_active IS NOT TRUE;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_self_anchor_map required Groland anchors check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_detail
  WHERE stat_date IS NULL
     OR live_start_time IS NULL
     OR stat_date <> DATE(live_start_time)
     OR anchor_douyin_id IS NULL
     OR live_identity_type NOT IN ('self', 'influencer', 'unclassified')
     OR anchor_type NOT IN ('自播', '达播', '未归类')
     OR live_session_count < 0
     OR live_duration_minutes < 0
     OR live_exposure_user_count < 0
     OR live_exposure_count < 0
     OR live_watch_user_count < 0
     OR hourly_watch_user_count < 0
     OR live_watch_count < 0
     OR max_online_count < 0
     OR avg_online_count < 0
     OR avg_watch_duration_minutes < 0
     OR comment_count < 0
     OR new_live_group_count < 0
     OR new_follower_count < 0
     OR unfollow_count < 0
     OR old_follower_watch_rate < 0
     OR product_count < 0
     OR live_product_exposure_user < 0
     OR live_product_click_user < 0
     OR live_product_exposure_count < 0
     OR live_product_click_count < 0
     OR live_order_count < 0
     OR live_refund_order_count < 0
     OR live_buyer_count < 0
     OR live_gmv < 0
     OR live_user_pay_amount < 0
     OR hourly_user_pay_amount < 0
     OR live_sale_quantity < 0
     OR live_refund_amount < 0
     OR live_refund_user_count < 0
     OR estimated_commission < 0
     OR product_click_rate_count < 0
     OR product_click_rate_user < 0
     OR click_to_pay_rate_count < 0
     OR click_to_pay_rate_user < 0
     OR watch_to_pay_rate_count < 0
     OR watch_to_pay_rate_user < 0
     OR presale_order_count < 0
     OR presale_full_amount < 0
     OR new_cart_group_count < 0
     OR live_ad_cost < 0
     -- Source net GMV can be negative for sessions whose net settlement is below zero.
     OR net_order_count < 0
     OR refund_amount_1h < 0
     OR refund_order_count_1h < 0
     OR refund_rate_1h < 0
     OR coupon_guided_payment_amount < 0
     OR coupon_guided_payment_rate < 0
     OR coupon_subsidy_amount < 0
     OR coupon_usage_count < 0
     OR ad_cost_shop_bound < 0
     OR ad_cost_shop_targeted < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_detail metric check failed, rows: %', v_invalid;
  END IF;

  WITH active_self_anchors AS (
    SELECT BTRIM(anchor_douyin_id) AS anchor_douyin_id
    FROM ads.douyin_self_anchor_map
    WHERE is_active IS TRUE
      AND NULLIF(BTRIM(anchor_douyin_id), '') IS NOT NULL
  )
  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_detail detail
  JOIN active_self_anchors mapped
    ON detail.anchor_douyin_id = mapped.anchor_douyin_id
  WHERE detail.live_identity_type <> 'self'
     OR detail.anchor_type <> '自播'
     OR detail.is_self_live IS NOT TRUE
     OR detail.is_influencer_live IS TRUE;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_detail self anchor classification check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_detail
  WHERE ABS(
          product_click_rate_count
          - CASE
              WHEN live_product_exposure_count > 0
                THEN ROUND(live_product_click_count::NUMERIC / live_product_exposure_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          product_click_rate_user
          - CASE
              WHEN live_product_exposure_user > 0
                THEN ROUND(live_product_click_user::NUMERIC / live_product_exposure_user::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          click_to_pay_rate_count
          - CASE
              WHEN live_product_click_count > 0
                THEN ROUND(live_order_count::NUMERIC / live_product_click_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          click_to_pay_rate_user
          - CASE
              WHEN live_product_click_user > 0
                THEN ROUND(live_buyer_count::NUMERIC / live_product_click_user::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          watch_to_pay_rate_count
          - CASE
              WHEN live_watch_count > 0
                THEN ROUND(live_order_count::NUMERIC / live_watch_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          watch_to_pay_rate_user
          - CASE
              WHEN live_watch_user_count > 0
                THEN ROUND(live_buyer_count::NUMERIC / live_watch_user_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          refund_rate_1h
          - CASE
              WHEN live_order_count > 0
                THEN ROUND(refund_order_count_1h::NUMERIC / live_order_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          coupon_guided_payment_rate
          - CASE
              WHEN live_user_pay_amount > 0
                THEN ROUND(coupon_guided_payment_amount / live_user_pay_amount, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_detail ratio formula check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM (
    SELECT
      shop_id,
      anchor_douyin_id,
      stat_date,
      DATE_TRUNC('minute', live_start_time) AS live_start_minute,
      COALESCE(live_end_time, TIMESTAMP '1970-01-01 00:00:00') AS live_end_time_norm,
      COUNT(*) AS row_count
    FROM ads.douyin_live_detail
    GROUP BY 1, 2, 3, 4, 5
    HAVING COUNT(*) > 1
  ) dup;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_detail business session duplicate check failed, duplicate groups: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.douyin_live_detail_refresh_state
  WHERE id = 1;

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'douyin_live_detail_refresh_state default row check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin_live_detail checks passed';
END;
$$;
