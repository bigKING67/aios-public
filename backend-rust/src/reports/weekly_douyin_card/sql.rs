pub(super) const MAX_SOURCE_DATE: &str = r#"
        SELECT GREATEST(
            COALESCE((SELECT MAX("date") FROM ods.douyin_trade_sale_card_raw), DATE '1970-01-01'),
            COALESCE((SELECT MAX(stat_date) FROM ods.douyin_trade_sale_card_detail_raw), DATE '1970-01-01')
        ) AS max_stat_date
        "#;

pub(super) const TOTALS: &str = r#"
        SELECT
            COALESCE(SUM(COALESCE(card_user_pay_amount, 0)) FILTER (
                WHERE "date" BETWEEN $1 AND $2
            ), 0)::DOUBLE PRECISION AS curr_gmv,
            COALESCE(SUM(COALESCE(card_user_pay_amount, 0)) FILTER (
                WHERE "date" BETWEEN $3 AND $4
            ), 0)::DOUBLE PRECISION AS prev_gmv
        FROM ods.douyin_trade_sale_card_raw
        WHERE "date" BETWEEN $3 AND $2
        "#;

pub(super) const PREVIOUS_PRODUCTS: &str = r#"
        SELECT
            COALESCE(product_id, '') AS product_id,
            COALESCE(SUM(COALESCE(card_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_card_user_pay_amount,
            COALESCE(SUM(COALESCE(card_order_count, 0)), 0)::BIGINT AS prev_card_order_count,
            COALESCE(SUM(COALESCE(card_buyer_count, 0)), 0)::BIGINT AS prev_card_buyer_count,
            COALESCE(SUM(COALESCE(card_exposure_user_count, 0)), 0)::BIGINT AS prev_card_exposure_user_count,
            COALESCE(SUM(COALESCE(card_click_user_count, 0)), 0)::BIGINT AS prev_card_click_user_count,
            COALESCE(SUM(COALESCE(card_cart_user_count, 0)), 0)::BIGINT AS prev_card_cart_user_count,
            COALESCE(SUM(COALESCE(card_favorite_user_count, 0)), 0)::BIGINT AS prev_card_favorite_user_count
        FROM ods.douyin_trade_sale_card_raw
        WHERE "date" BETWEEN $1 AND $2
        GROUP BY COALESCE(product_id, '')
        "#;

pub(super) const CURRENT_PRODUCTS: &str = r#"
        SELECT
            COALESCE(product_id, '') AS product_id,
            COALESCE(MAX(NULLIF(BTRIM(product_title), '')), '(未命名商品)') AS product_title,
            MAX(product_url) AS product_url,
            COALESCE(SUM(COALESCE(card_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_card_user_pay_amount,
            COALESCE(SUM(COALESCE(card_order_count, 0)), 0)::BIGINT AS curr_card_order_count,
            COALESCE(SUM(COALESCE(card_buyer_count, 0)), 0)::BIGINT AS curr_card_buyer_count,
            COALESCE(SUM(COALESCE(card_exposure_user_count, 0)), 0)::BIGINT AS curr_card_exposure_user_count,
            COALESCE(SUM(COALESCE(card_click_user_count, 0)), 0)::BIGINT AS curr_card_click_user_count,
            COALESCE(SUM(COALESCE(card_cart_user_count, 0)), 0)::BIGINT AS curr_card_cart_user_count,
            COALESCE(SUM(COALESCE(card_favorite_user_count, 0)), 0)::BIGINT AS curr_card_favorite_user_count
        FROM ods.douyin_trade_sale_card_raw
        WHERE "date" BETWEEN $1 AND $2
        GROUP BY COALESCE(product_id, '')
        ORDER BY curr_card_user_pay_amount DESC
        LIMIT 120
        "#;

pub(super) const CURRENT_SOURCES: &str = r#"
            SELECT
                COALESCE(source_level1, '未知来源') AS source_level1,
                COALESCE(SUM(COALESCE(card_exposure_user_count, 0)), 0)::BIGINT AS curr_card_exposure_user_count,
                COALESCE(SUM(COALESCE(card_click_user_count, 0)), 0)::BIGINT AS curr_card_click_user_count,
                COALESCE(SUM(COALESCE(card_buyer_count, 0)), 0)::BIGINT AS curr_card_buyer_count,
                COALESCE(SUM(COALESCE(card_cart_user_count, 0)), 0)::BIGINT AS curr_card_cart_user_count,
                COALESCE(SUM(COALESCE(card_favorite_user_count, 0)), 0)::BIGINT AS curr_card_favorite_user_count,
                COALESCE(SUM(COALESCE(card_bounce_user_count, 0)), 0)::BIGINT AS curr_card_bounce_user_count,
                COALESCE(SUM(COALESCE(card_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_card_user_pay_amount,
                COALESCE(SUM(COALESCE(card_order_count, 0)), 0)::BIGINT AS curr_card_order_count
            FROM ods.douyin_trade_sale_card_detail_raw
            WHERE stat_date BETWEEN $1 AND $2
              AND product_id = $3
            GROUP BY COALESCE(source_level1, '未知来源')
            "#;

pub(super) const PREVIOUS_SOURCES: &str = r#"
            SELECT
                COALESCE(source_level1, '未知来源') AS source_level1,
                COALESCE(SUM(COALESCE(card_exposure_user_count, 0)), 0)::BIGINT AS prev_card_exposure_user_count,
                COALESCE(SUM(COALESCE(card_click_user_count, 0)), 0)::BIGINT AS prev_card_click_user_count,
                COALESCE(SUM(COALESCE(card_buyer_count, 0)), 0)::BIGINT AS prev_card_buyer_count,
                COALESCE(SUM(COALESCE(card_cart_user_count, 0)), 0)::BIGINT AS prev_card_cart_user_count,
                COALESCE(SUM(COALESCE(card_favorite_user_count, 0)), 0)::BIGINT AS prev_card_favorite_user_count,
                COALESCE(SUM(COALESCE(card_bounce_user_count, 0)), 0)::BIGINT AS prev_card_bounce_user_count,
                COALESCE(SUM(COALESCE(card_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_card_user_pay_amount,
                COALESCE(SUM(COALESCE(card_order_count, 0)), 0)::BIGINT AS prev_card_order_count
            FROM ods.douyin_trade_sale_card_detail_raw
            WHERE stat_date BETWEEN $1 AND $2
              AND product_id = $3
            GROUP BY COALESCE(source_level1, '未知来源')
            "#;
