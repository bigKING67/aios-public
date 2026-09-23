pub(super) const QUERY_WITH_PLATFORM_METRICS_ONLY: &str = r#"
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
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.curr_exposure_user_count END,
            m.curr_visitor_count
        )::BIGINT AS curr_visitor_count,
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.prev_exposure_user_count END,
            m.prev_visitor_count
        )::BIGINT AS prev_visitor_count,
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.curr_pay_conversion_rate END,
            m.curr_pay_conversion_rate
        )::DOUBLE PRECISION AS curr_pay_conversion_rate,
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.prev_pay_conversion_rate END,
            m.prev_pay_conversion_rate
        )::DOUBLE PRECISION AS prev_pay_conversion_rate,
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.curr_uv_value END,
            m.curr_uv_value
        )::DOUBLE PRECISION AS curr_uv_value,
        COALESCE(
            CASE WHEN p.platform = 'douyin' THEN dm.prev_uv_value END,
            m.prev_uv_value
        )::DOUBLE PRECISION AS prev_uv_value,
        m.curr_cost::DOUBLE PRECISION AS curr_cost,
        m.prev_cost::DOUBLE PRECISION AS prev_cost,
        m.curr_roi::DOUBLE PRECISION AS curr_roi,
        m.prev_roi::DOUBLE PRECISION AS prev_roi,
        NULL::DOUBLE PRECISION AS curr_live_gmv,
        NULL::DOUBLE PRECISION AS prev_live_gmv,
        NULL::DOUBLE PRECISION AS curr_shortvideo_gmv,
        NULL::DOUBLE PRECISION AS prev_shortvideo_gmv,
        NULL::DOUBLE PRECISION AS curr_card_gmv,
        NULL::DOUBLE PRECISION AS prev_card_gmv
    FROM ads.report_all_trade_week_platform p
    LEFT JOIN ads.report_all_trade_week_platform_metrics m
      ON m.week_period = p.week_period
     AND m.platform = p.platform
    LEFT JOIN ads.report_douyin_trade_sale_metrics_week dm
      ON dm.week_period = p.week_period
     AND p.platform = 'douyin'
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
