
        SELECT
            COUNT(*)::BIGINT AS row_count,
            MAX(as_of_date) AS as_of_date,
            MAX(observed_days)::INTEGER AS observed_days,
            COALESCE(SUM(COALESCE(curr_live_gmv, 0)), 0)::DOUBLE PRECISION AS total_curr_gmv,
            COALESCE(SUM(COALESCE(prev_live_gmv, 0)), 0)::DOUBLE PRECISION AS total_prev_gmv
        FROM ads.report_douyin_trade_sale_live_metrics_week
        WHERE week_period = $1
