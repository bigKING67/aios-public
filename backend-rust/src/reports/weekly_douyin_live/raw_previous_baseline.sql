
        SELECT
            COALESCE(shop_id, '') AS shop_id,
            COALESCE(anchor_douyin_id, '') AS anchor_douyin_id,
            AVG(COALESCE(live_gmv, 0))::DOUBLE PRECISION AS prev_live_gmv,
            AVG(COALESCE(live_order_count, 0))::DOUBLE PRECISION AS prev_live_order_count,
            AVG(COALESCE(live_exposure_user_count, 0))::DOUBLE PRECISION AS prev_live_exposure_user_count,
            AVG(COALESCE(live_watch_user_count, 0))::DOUBLE PRECISION AS prev_live_watch_user_count,
            AVG(COALESCE(live_product_exposure_user, 0))::DOUBLE PRECISION AS prev_live_product_exposure_user,
            AVG(COALESCE(live_product_click_user, 0))::DOUBLE PRECISION AS prev_live_product_click_user,
            AVG(COALESCE(live_buyer_count, 0))::DOUBLE PRECISION AS prev_live_buyer_count,
            AVG(COALESCE(live_duration_minutes, 0))::DOUBLE PRECISION AS prev_live_duration_minutes,
            AVG(COALESCE(live_user_pay_amount, 0))::DOUBLE PRECISION AS prev_live_user_pay_amount,
            AVG(COALESCE(live_ad_cost, 0))::DOUBLE PRECISION AS prev_live_ad_cost,
            AVG(COALESCE(comment_count, 0))::DOUBLE PRECISION AS prev_comment_count,
            AVG(COALESCE(new_follower_count, 0))::DOUBLE PRECISION AS prev_new_follower_count,
            AVG(COALESCE(product_count, 0))::DOUBLE PRECISION AS prev_product_count
        FROM ods.douyin_trade_sale_live_raw
        WHERE DATE(live_start_time) BETWEEN $1 AND $2
        GROUP BY COALESCE(shop_id, ''), COALESCE(anchor_douyin_id, '')
