
        SELECT
            COALESCE(shop_name, '(未知店铺)') AS shop_name,
            COALESCE(shop_id, '') AS shop_id,
            COALESCE(anchor_nickname, '(未知主播)') AS anchor_nickname,
            COALESCE(anchor_douyin_id, '') AS anchor_douyin_id,
            live_start_time,
            live_end_time,
            curr_live_duration_minutes,
            prev_live_duration_minutes,
            curr_live_exposure_user_count,
            prev_live_exposure_user_count,
            curr_live_watch_user_count,
            prev_live_watch_user_count,
            curr_live_product_exposure_user,
            prev_live_product_exposure_user,
            curr_live_product_click_user,
            prev_live_product_click_user,
            curr_live_buyer_count,
            prev_live_buyer_count,
            curr_live_order_count,
            prev_live_order_count,
            curr_live_gmv,
            prev_live_gmv,
            live_gmv_delta,
            curr_live_user_pay_amount,
            prev_live_user_pay_amount,
            curr_live_ad_cost,
            prev_live_ad_cost,
            curr_comment_count,
            prev_comment_count,
            curr_new_follower_count,
            prev_new_follower_count,
            curr_product_count,
            prev_product_count
        FROM ads.report_douyin_trade_sale_live_metrics_week
        WHERE week_period = $1
        ORDER BY ABS(COALESCE(live_gmv_delta, 0)) DESC, COALESCE(curr_live_gmv, 0) DESC, live_start_time DESC
        LIMIT 120
