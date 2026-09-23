pub(super) const QUERY_WITHOUT_METRICS: &str = r#"
    SELECT
        p.platform,
        CASE
            WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                THEN p.curr_gmv_sync
            ELSE p.curr_gmv
        END::DOUBLE PRECISION AS curr_gmv,
        CASE
            WHEN p.curr_order_sync IS NOT NULL AND p.prev_order_sync IS NOT NULL
                THEN p.curr_order_sync
            ELSE p.curr_order_count
        END AS curr_order_count,
        CASE
            WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
                THEN p.curr_buyer_sync
            ELSE p.curr_buyer_count
        END AS curr_buyer_count,
        CASE
            WHEN p.curr_refund_amount_refund_time_sync IS NOT NULL
             AND p.prev_refund_amount_refund_time_sync IS NOT NULL
                THEN p.curr_refund_amount_refund_time_sync
            ELSE p.curr_refund_amount_refund_time
        END::DOUBLE PRECISION AS curr_refund_amount_refund_time,
        CASE
            WHEN p.curr_refund_amount_pay_time_sync IS NOT NULL
             AND p.prev_refund_amount_pay_time_sync IS NOT NULL
                THEN p.curr_refund_amount_pay_time_sync
            ELSE p.curr_refund_amount_pay_time
        END::DOUBLE PRECISION AS curr_refund_amount_pay_time,
        CASE
            WHEN p.curr_gmv_sync IS NOT NULL AND p.prev_gmv_sync IS NOT NULL
                THEN p.prev_gmv_sync
            ELSE p.prev_gmv
        END::DOUBLE PRECISION AS prev_gmv,
        CASE
            WHEN p.curr_order_sync IS NOT NULL AND p.prev_order_sync IS NOT NULL
                THEN p.prev_order_sync
            ELSE p.prev_order_count
        END AS prev_order_count,
        CASE
            WHEN p.curr_buyer_sync IS NOT NULL AND p.prev_buyer_sync IS NOT NULL
                THEN p.prev_buyer_sync
            ELSE p.prev_buyer_count
        END AS prev_buyer_count,
        CASE
            WHEN p.curr_refund_amount_refund_time_sync IS NOT NULL
             AND p.prev_refund_amount_refund_time_sync IS NOT NULL
                THEN p.prev_refund_amount_refund_time_sync
            ELSE p.prev_refund_amount_refund_time
        END::DOUBLE PRECISION AS prev_refund_amount_refund_time,
        CASE
            WHEN p.curr_refund_amount_pay_time_sync IS NOT NULL
             AND p.prev_refund_amount_pay_time_sync IS NOT NULL
                THEN p.prev_refund_amount_pay_time_sync
            ELSE p.prev_refund_amount_pay_time
        END::DOUBLE PRECISION AS prev_refund_amount_pay_time,
        NULL::BIGINT AS curr_visitor_count,
        NULL::BIGINT AS prev_visitor_count,
        NULL::DOUBLE PRECISION AS curr_pay_conversion_rate,
        NULL::DOUBLE PRECISION AS prev_pay_conversion_rate,
        NULL::DOUBLE PRECISION AS curr_uv_value,
        NULL::DOUBLE PRECISION AS prev_uv_value,
        NULL::DOUBLE PRECISION AS curr_cost,
        NULL::DOUBLE PRECISION AS prev_cost,
        NULL::DOUBLE PRECISION AS curr_roi,
        NULL::DOUBLE PRECISION AS prev_roi,
        NULL::DOUBLE PRECISION AS curr_live_gmv,
        NULL::DOUBLE PRECISION AS prev_live_gmv,
        NULL::DOUBLE PRECISION AS curr_shortvideo_gmv,
        NULL::DOUBLE PRECISION AS prev_shortvideo_gmv,
        NULL::DOUBLE PRECISION AS curr_card_gmv,
        NULL::DOUBLE PRECISION AS prev_card_gmv
    FROM ads.report_all_trade_week_platform p
    WHERE p.week_period = $1
    ORDER BY CASE p.platform
        WHEN 'taobao' THEN 1
        WHEN 'douyin' THEN 2
        WHEN 'xhs' THEN 3
        WHEN 'wx' THEN 4
        WHEN 'jd' THEN 5
        ELSE 99
    END
"#;
