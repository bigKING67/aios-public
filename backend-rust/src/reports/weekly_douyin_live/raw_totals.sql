
        SELECT
            COALESCE(SUM(COALESCE(live_gmv, 0)) FILTER (
                WHERE DATE(live_start_time) BETWEEN $1 AND $2
            ), 0)::DOUBLE PRECISION AS curr_live_gmv,
            COALESCE(SUM(COALESCE(live_gmv, 0)) FILTER (
                WHERE DATE(live_start_time) BETWEEN $3 AND $4
            ), 0)::DOUBLE PRECISION AS prev_live_gmv
        FROM ods.douyin_trade_sale_live_raw
        WHERE DATE(live_start_time) BETWEEN $3 AND $2
