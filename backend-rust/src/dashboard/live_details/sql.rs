pub(super) fn live_detail_rows_sql() -> &'static str {
    r#"
        WITH ranked AS (
          SELECT
            d.live_identity_type,
            COALESCE(NULLIF(BTRIM(d.anchor_douyin_id), ''), '') AS anchor_douyin_id,
            CASE
              WHEN NULLIF(BTRIM(d.anchor_douyin_id), '') IS NULL THEN '(缺失主播ID)'
              ELSE COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '(未命名主播)')
            END AS anchor_nickname,
            COALESCE(NULLIF(BTRIM(d.anchor_type), ''), '未归类') AS anchor_type,
            COALESCE(NULLIF(BTRIM(d.shop_name), ''), '(未命名店铺)') AS shop_name,
            COALESCE(NULLIF(BTRIM(d.shop_id), ''), '') AS shop_id,
            d.live_start_time::TEXT AS live_start_time,
            d.live_end_time::TEXT AS live_end_time,
            d.stat_date::TEXT AS stat_date,
            GREATEST(COALESCE(d.live_session_count, 1), 1)::BIGINT AS live_session_count,
            COALESCE(d.live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
            COALESCE(d.live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
            COALESCE(d.live_exposure_count, 0)::BIGINT AS live_exposure_count,
            COALESCE(d.live_gmv, 0)::DOUBLE PRECISION AS live_gmv,
            COALESCE(d.live_user_pay_amount, 0)::DOUBLE PRECISION AS live_user_pay_amount,
            COALESCE(d.hourly_user_pay_amount, 0)::DOUBLE PRECISION AS hourly_user_pay_amount,
            COALESCE(d.live_buyer_count, 0)::BIGINT AS live_buyer_count,
            COALESCE(d.live_sale_quantity, 0)::BIGINT AS live_sale_quantity,
            COALESCE(d.live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
            COALESCE(d.hourly_watch_user_count, 0)::BIGINT AS hourly_watch_user_count,
            COALESCE(d.live_watch_count, 0)::BIGINT AS live_watch_count,
            COALESCE(d.max_online_count, 0)::BIGINT AS max_online_count,
            COALESCE(d.avg_online_count, 0)::DOUBLE PRECISION AS avg_online_count,
            COALESCE(d.avg_watch_duration_minutes, 0)::DOUBLE PRECISION AS avg_watch_duration_minutes,
            COALESCE(d.comment_count, 0)::BIGINT AS comment_count,
            COALESCE(d.new_live_group_count, 0)::BIGINT AS new_live_group_count,
            COALESCE(d.new_follower_count, 0)::BIGINT AS new_follower_count,
            COALESCE(d.unfollow_count, 0)::BIGINT AS unfollow_count,
            COALESCE(d.old_follower_watch_rate, 0)::DOUBLE PRECISION AS old_follower_watch_rate,
            COALESCE(d.product_count, 0)::BIGINT AS product_count,
            COALESCE(d.live_product_exposure_user, 0)::BIGINT AS live_product_exposure_user,
            COALESCE(d.live_product_click_user, 0)::BIGINT AS live_product_click_user,
            COALESCE(d.live_product_exposure_count, 0)::BIGINT AS live_product_exposure_count,
            COALESCE(d.live_product_click_count, 0)::BIGINT AS live_product_click_count,
            COALESCE(d.live_order_count, 0)::BIGINT AS live_order_count,
            COALESCE(d.live_refund_order_count, 0)::BIGINT AS live_refund_order_count,
            COALESCE(d.live_refund_amount, 0)::DOUBLE PRECISION AS live_refund_amount,
            COALESCE(d.live_refund_user_count, 0)::BIGINT AS live_refund_user_count,
            COALESCE(d.estimated_commission, 0)::DOUBLE PRECISION AS estimated_commission,
            CASE
              WHEN COALESCE(d.live_product_exposure_count, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_product_click_count, 0)::NUMERIC
                  / COALESCE(d.live_product_exposure_count, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS product_click_rate_count,
            CASE
              WHEN COALESCE(d.live_product_exposure_user, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_product_click_user, 0)::NUMERIC
                  / COALESCE(d.live_product_exposure_user, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS product_click_rate_user,
            CASE
              WHEN COALESCE(d.live_product_click_count, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_order_count, 0)::NUMERIC
                  / COALESCE(d.live_product_click_count, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS click_to_pay_rate_count,
            CASE
              WHEN COALESCE(d.live_product_click_user, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_buyer_count, 0)::NUMERIC
                  / COALESCE(d.live_product_click_user, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS click_to_pay_rate_user,
            CASE
              WHEN COALESCE(d.live_watch_count, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_order_count, 0)::NUMERIC
                  / COALESCE(d.live_watch_count, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS watch_to_pay_rate_count,
            CASE
              WHEN COALESCE(d.live_watch_user_count, 0) > 0
                THEN ROUND(
                  COALESCE(d.live_buyer_count, 0)::NUMERIC
                  / COALESCE(d.live_watch_user_count, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS watch_to_pay_rate_user,
            COALESCE(d.presale_order_count, 0)::BIGINT AS presale_order_count,
            COALESCE(d.presale_full_amount, 0)::DOUBLE PRECISION AS presale_full_amount,
            COALESCE(d.new_cart_group_count, 0)::BIGINT AS new_cart_group_count,
            COALESCE(d.live_ad_cost, 0)::DOUBLE PRECISION AS live_ad_cost,
            COALESCE(d.net_gmv, 0)::DOUBLE PRECISION AS net_gmv,
            COALESCE(d.net_order_count, 0)::BIGINT AS net_order_count,
            COALESCE(d.refund_amount_1h, 0)::DOUBLE PRECISION AS refund_amount_1h,
            COALESCE(d.refund_order_count_1h, 0)::BIGINT AS refund_order_count_1h,
            CASE
              WHEN COALESCE(d.live_order_count, 0) > 0
                THEN ROUND(
                  COALESCE(d.refund_order_count_1h, 0)::NUMERIC
                  / COALESCE(d.live_order_count, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS refund_rate_1h,
            COALESCE(d.coupon_guided_payment_amount, 0)::DOUBLE PRECISION AS coupon_guided_payment_amount,
            CASE
              WHEN COALESCE(d.live_user_pay_amount, 0) > 0
                THEN ROUND(
                  COALESCE(d.coupon_guided_payment_amount, 0)::NUMERIC
                  / COALESCE(d.live_user_pay_amount, 0)::NUMERIC,
                  6
                )::DOUBLE PRECISION
              ELSE 0::DOUBLE PRECISION
            END AS coupon_guided_payment_rate,
            COALESCE(d.coupon_subsidy_amount, 0)::DOUBLE PRECISION AS coupon_subsidy_amount,
            COALESCE(d.coupon_usage_count, 0)::DOUBLE PRECISION AS coupon_usage_count,
            COALESCE(d.ad_cost_shop_bound, 0)::DOUBLE PRECISION AS ad_cost_shop_bound,
            COALESCE(d.ad_cost_shop_targeted, 0)::DOUBLE PRECISION AS ad_cost_shop_targeted,
            CASE
              WHEN COALESCE(d.live_gmv, 0) > 0
                THEN ROUND(
                  (
                    COALESCE(d.live_refund_amount, 0)::NUMERIC
                    / COALESCE(d.live_gmv, 0)::NUMERIC
                  ),
                  6
                )::DOUBLE PRECISION
              ELSE NULL::DOUBLE PRECISION
            END AS refund_rate,
            ROW_NUMBER() OVER (
              PARTITION BY d.live_identity_type
              ORDER BY
                d.live_start_time DESC,
                COALESCE(d.live_gmv, 0) DESC,
                COALESCE(NULLIF(BTRIM(d.anchor_nickname), ''), '(未命名主播)') ASC
            ) AS rn
          FROM ads.douyin_live_detail d
          WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
            AND d.live_identity_type IN ('self', 'influencer')
            AND NULLIF(BTRIM(d.anchor_douyin_id), '') IS NOT NULL
        )
        SELECT
          live_identity_type,
          anchor_douyin_id,
          anchor_nickname,
          anchor_type,
          shop_name,
          shop_id,
          stat_date,
          live_start_time,
          live_end_time,
          live_session_count,
          live_duration_minutes,
          live_exposure_user_count,
          live_exposure_count,
          live_gmv,
          live_user_pay_amount,
          hourly_user_pay_amount,
          live_buyer_count,
          live_sale_quantity,
          live_watch_user_count,
          hourly_watch_user_count,
          live_watch_count,
          max_online_count,
          avg_online_count,
          avg_watch_duration_minutes,
          comment_count,
          new_live_group_count,
          new_follower_count,
          unfollow_count,
          old_follower_watch_rate,
          product_count,
          live_product_exposure_user,
          live_product_click_user,
          live_product_exposure_count,
          live_product_click_count,
          live_order_count,
          live_refund_order_count,
          live_refund_amount,
          live_refund_user_count,
          estimated_commission,
          product_click_rate_count,
          product_click_rate_user,
          click_to_pay_rate_count,
          click_to_pay_rate_user,
          watch_to_pay_rate_count,
          watch_to_pay_rate_user,
          presale_order_count,
          presale_full_amount,
          new_cart_group_count,
          live_ad_cost,
          net_gmv,
          net_order_count,
          refund_amount_1h,
          refund_order_count_1h,
          refund_rate_1h,
          coupon_guided_payment_amount,
          coupon_guided_payment_rate,
          coupon_subsidy_amount,
          coupon_usage_count,
          ad_cost_shop_bound,
          ad_cost_shop_targeted,
          refund_rate
        FROM ranked
        WHERE rn <= 500
        ORDER BY live_identity_type ASC, rn ASC
        "#
}
