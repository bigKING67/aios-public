
        SELECT
            COALESCE(shop_name, '(未知店铺)') AS shop_name,
            COALESCE(shop_id, '') AS shop_id,
            COALESCE(anchor_nickname, '(未知主播)') AS anchor_nickname,
            COALESCE(anchor_douyin_id, '') AS anchor_douyin_id,
            live_start_time,
            live_end_time,
            COALESCE(live_duration_minutes, 0)::BIGINT AS live_duration_minutes,
            COALESCE(live_exposure_user_count, 0)::BIGINT AS live_exposure_user_count,
            COALESCE(live_watch_user_count, 0)::BIGINT AS live_watch_user_count,
            COALESCE(live_product_exposure_user, 0)::BIGINT AS live_product_exposure_user,
            COALESCE(live_product_click_user, 0)::BIGINT AS live_product_click_user,
            COALESCE(live_buyer_count, 0)::BIGINT AS live_buyer_count,
            COALESCE(live_order_count, 0)::BIGINT AS live_order_count,
            COALESCE(live_gmv, 0)::DOUBLE PRECISION AS live_gmv,
            COALESCE(live_user_pay_amount, 0)::DOUBLE PRECISION AS live_user_pay_amount,
            COALESCE(live_ad_cost, 0)::DOUBLE PRECISION AS live_ad_cost,
            COALESCE(comment_count, 0)::BIGINT AS comment_count,
            COALESCE(new_follower_count, 0)::BIGINT AS new_follower_count,
            COALESCE(product_count, 0)::BIGINT AS product_count
        FROM ods.douyin_trade_sale_live_raw
        WHERE DATE(live_start_time) BETWEEN $1 AND $2
        ORDER BY COALESCE(live_gmv, 0) DESC, live_start_time DESC
        LIMIT 120
