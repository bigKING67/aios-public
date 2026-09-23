pub(super) const ALL_TRADE_WEEK_BASE: &str = r#"
        SELECT
            week_period,
            as_of_date,
            CASE
                WHEN curr_gmv_sync IS NOT NULL AND prev_gmv_sync IS NOT NULL
                    THEN curr_gmv_sync
                ELSE curr_gmv
            END::DOUBLE PRECISION AS curr_gmv,
            CASE
                WHEN curr_order_sync IS NOT NULL AND prev_order_sync IS NOT NULL
                    THEN curr_order_sync
                ELSE curr_order_count
            END AS curr_order_count,
            CASE
                WHEN curr_buyer_sync IS NOT NULL AND prev_buyer_sync IS NOT NULL
                    THEN curr_buyer_sync
                ELSE curr_buyer_count
            END AS curr_buyer_count,
            CASE
                WHEN curr_refund_amount_refund_time_sync IS NOT NULL
                 AND prev_refund_amount_refund_time_sync IS NOT NULL
                    THEN curr_refund_amount_refund_time_sync
                ELSE curr_refund_amount_refund_time
            END::DOUBLE PRECISION AS curr_refund_amount_refund_time,
            CASE
                WHEN curr_refund_amount_pay_time_sync IS NOT NULL
                 AND prev_refund_amount_pay_time_sync IS NOT NULL
                    THEN curr_refund_amount_pay_time_sync
                ELSE curr_refund_amount_pay_time
            END::DOUBLE PRECISION AS curr_refund_amount_pay_time,
            CASE
                WHEN curr_gmv_sync IS NOT NULL AND prev_gmv_sync IS NOT NULL
                    THEN prev_gmv_sync
                ELSE prev_gmv
            END::DOUBLE PRECISION AS prev_gmv,
            CASE
                WHEN curr_order_sync IS NOT NULL AND prev_order_sync IS NOT NULL
                    THEN prev_order_sync
                ELSE prev_order_count
            END AS prev_order_count,
            CASE
                WHEN curr_buyer_sync IS NOT NULL AND prev_buyer_sync IS NOT NULL
                    THEN prev_buyer_sync
                ELSE prev_buyer_count
            END AS prev_buyer_count,
            CASE
                WHEN curr_refund_amount_refund_time_sync IS NOT NULL
                 AND prev_refund_amount_refund_time_sync IS NOT NULL
                    THEN prev_refund_amount_refund_time_sync
                ELSE prev_refund_amount_refund_time
            END::DOUBLE PRECISION AS prev_refund_amount_refund_time,
            CASE
                WHEN curr_refund_amount_pay_time_sync IS NOT NULL
                 AND prev_refund_amount_pay_time_sync IS NOT NULL
                    THEN prev_refund_amount_pay_time_sync
                ELSE prev_refund_amount_pay_time
            END::DOUBLE PRECISION AS prev_refund_amount_pay_time
        FROM ads.report_all_trade_week
        WHERE week_period = $1
        LIMIT 1
        "#;

pub(super) const ALL_TRADE_WEEK_PLATFORM_AGGREGATE: &str = r#"
        SELECT
            week_period,
            MAX(as_of_date)::DATE AS as_of_date,
            COALESCE(SUM(
                CASE
                    WHEN curr_gmv_sync IS NOT NULL AND prev_gmv_sync IS NOT NULL
                        THEN curr_gmv_sync
                    ELSE curr_gmv
                END
            ), 0)::DOUBLE PRECISION AS curr_gmv,
            COALESCE(SUM(
                CASE
                    WHEN curr_order_sync IS NOT NULL AND prev_order_sync IS NOT NULL
                        THEN curr_order_sync
                    ELSE curr_order_count
                END
            ), 0)::BIGINT AS curr_order_count,
            COALESCE(SUM(
                CASE
                    WHEN curr_buyer_sync IS NOT NULL AND prev_buyer_sync IS NOT NULL
                        THEN curr_buyer_sync
                    ELSE curr_buyer_count
                END
            ), 0)::BIGINT AS curr_buyer_count,
            COALESCE(SUM(
                CASE
                    WHEN curr_refund_amount_refund_time_sync IS NOT NULL
                     AND prev_refund_amount_refund_time_sync IS NOT NULL
                        THEN curr_refund_amount_refund_time_sync
                    ELSE curr_refund_amount_refund_time
                END
            ), 0)::DOUBLE PRECISION AS curr_refund_amount_refund_time,
            COALESCE(SUM(
                CASE
                    WHEN curr_refund_amount_pay_time_sync IS NOT NULL
                     AND prev_refund_amount_pay_time_sync IS NOT NULL
                        THEN curr_refund_amount_pay_time_sync
                    ELSE curr_refund_amount_pay_time
                END
            ), 0)::DOUBLE PRECISION AS curr_refund_amount_pay_time,
            COALESCE(SUM(
                CASE
                    WHEN curr_gmv_sync IS NOT NULL AND prev_gmv_sync IS NOT NULL
                        THEN prev_gmv_sync
                    ELSE prev_gmv
                END
            ), 0)::DOUBLE PRECISION AS prev_gmv,
            COALESCE(SUM(
                CASE
                    WHEN curr_order_sync IS NOT NULL AND prev_order_sync IS NOT NULL
                        THEN prev_order_sync
                    ELSE prev_order_count
                END
            ), 0)::BIGINT AS prev_order_count,
            COALESCE(SUM(
                CASE
                    WHEN curr_buyer_sync IS NOT NULL AND prev_buyer_sync IS NOT NULL
                        THEN prev_buyer_sync
                    ELSE prev_buyer_count
                END
            ), 0)::BIGINT AS prev_buyer_count,
            COALESCE(SUM(
                CASE
                    WHEN curr_refund_amount_refund_time_sync IS NOT NULL
                     AND prev_refund_amount_refund_time_sync IS NOT NULL
                        THEN prev_refund_amount_refund_time_sync
                    ELSE prev_refund_amount_refund_time
                END
            ), 0)::DOUBLE PRECISION AS prev_refund_amount_refund_time,
            COALESCE(SUM(
                CASE
                    WHEN curr_refund_amount_pay_time_sync IS NOT NULL
                     AND prev_refund_amount_pay_time_sync IS NOT NULL
                        THEN prev_refund_amount_pay_time_sync
                    ELSE prev_refund_amount_pay_time
                END
            ), 0)::DOUBLE PRECISION AS prev_refund_amount_pay_time
        FROM ads.report_all_trade_week_platform
        WHERE week_period = $1
        GROUP BY week_period
        LIMIT 1
        "#;

pub(super) const LATEST_WEEK_PERIOD_PRIMARY: &str = r#"
        SELECT week_period
        FROM ads.report_all_trade_week
        WHERE week_period IS NOT NULL
        ORDER BY as_of_date DESC NULLS LAST, week_period DESC
        LIMIT 1
        "#;

pub(super) const LATEST_WEEK_PERIOD_FALLBACK: &str = r#"
                SELECT week_period
                FROM ads.report_all_trade_week
                WHERE week_period IS NOT NULL
                ORDER BY week_period DESC
                LIMIT 1
                "#;

pub(super) const ALL_WEEK_PERIODS_PRIMARY: &str = r#"
        SELECT week_period
        FROM ads.report_all_trade_week
        WHERE week_period IS NOT NULL
        ORDER BY as_of_date DESC NULLS LAST, week_period DESC
        LIMIT $1
        "#;

pub(super) const ALL_WEEK_PERIODS_FALLBACK: &str = r#"
                SELECT week_period
                FROM ads.report_all_trade_week
                WHERE week_period IS NOT NULL
                ORDER BY week_period DESC
                LIMIT $1
                "#;
