pub(super) const ADS_SUMMARY: &str = r#"
        SELECT
            COUNT(*)::BIGINT AS row_count,
            MAX(as_of_date) AS as_of_date,
            MAX(observed_days)::INTEGER AS observed_days,
            COALESCE(SUM(COALESCE(curr_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS total_curr_gmv,
            COALESCE(SUM(COALESCE(prev_user_pay_amount, 0)), 0)::DOUBLE PRECISION AS total_prev_gmv
        FROM ads.report_douyin_trade_sale_shortvideo_metrics_week
        WHERE week_period = $1
        "#;

pub(super) const ADS_ROWS: &str = r#"
        SELECT
            COALESCE(video_id, '') AS video_id,
            COALESCE(author_douyin_id, '') AS author_douyin_id,
            COALESCE(video_title, '(未命名短视频)') AS video_title,
            COALESCE(author_nickname, '(未知达人)') AS author_nickname,
            COALESCE(product_id, '--') AS product_id,
            publish_time,
            COALESCE(is_promoted, '') AS is_promoted,
            play_url,
            curr_video_view_count,
            prev_video_view_count,
            curr_user_pay_amount,
            prev_user_pay_amount,
            user_pay_amount_delta,
            curr_refund_amount,
            prev_refund_amount,
            curr_live_room_pay_amount,
            prev_live_room_pay_amount,
            curr_search_after_view_pay_amount,
            prev_search_after_view_pay_amount,
            curr_shop_page_pay_amount,
            prev_shop_page_pay_amount
        FROM ads.report_douyin_trade_sale_shortvideo_metrics_week
        WHERE week_period = $1
        ORDER BY ABS(COALESCE(user_pay_amount_delta, 0)) DESC, COALESCE(curr_user_pay_amount, 0) DESC
        LIMIT 120
        "#;

pub(super) const MAX_SOURCE_DATE: &str = r#"
        SELECT MAX(stat_date) AS max_stat_date
        FROM ods.douyin_trade_sale_shortvideo_raw
        "#;

pub(super) const TOTALS: &str = r#"
        SELECT
            COALESCE(SUM(COALESCE(user_pay_amount, 0)) FILTER (
                WHERE stat_date BETWEEN $1 AND $2
            ), 0)::DOUBLE PRECISION AS curr_gmv,
            COALESCE(SUM(COALESCE(user_pay_amount, 0)) FILTER (
                WHERE stat_date BETWEEN $3 AND $4
            ), 0)::DOUBLE PRECISION AS prev_gmv
        FROM ods.douyin_trade_sale_shortvideo_raw
        WHERE stat_date BETWEEN $3 AND $2
        "#;

pub(super) const PREVIOUS_ROWS: &str = r#"
        SELECT
            COALESCE(video_id, '') AS video_id,
            COALESCE(author_douyin_id, '') AS author_douyin_id,
            COALESCE(SUM(COALESCE(video_view_count, 0)), 0)::BIGINT AS prev_video_view_count,
            COALESCE(SUM(COALESCE(user_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_user_pay_amount,
            COALESCE(SUM(COALESCE(refund_amount, 0)), 0)::DOUBLE PRECISION AS prev_refund_amount,
            COALESCE(SUM(COALESCE(live_room_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_live_room_pay_amount,
            COALESCE(SUM(COALESCE(search_after_view_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_search_after_view_pay_amount,
            COALESCE(SUM(COALESCE(shop_page_pay_amount, 0)), 0)::DOUBLE PRECISION AS prev_shop_page_pay_amount
        FROM ods.douyin_trade_sale_shortvideo_raw
        WHERE stat_date BETWEEN $1 AND $2
        GROUP BY COALESCE(video_id, ''), COALESCE(author_douyin_id, '')
        "#;

pub(super) const CURRENT_ROWS: &str = r#"
        SELECT
            COALESCE(video_id, '') AS video_id,
            COALESCE(author_douyin_id, '') AS author_douyin_id,
            COALESCE(MAX(NULLIF(BTRIM(video_title), '')), '(未命名短视频)') AS video_title,
            COALESCE(MAX(NULLIF(BTRIM(author_nickname), '')), '(未知达人)') AS author_nickname,
            COALESCE(MAX(product_id), '--') AS product_id,
            MAX(publish_time) AS publish_time,
            COALESCE(MAX(is_promoted), '') AS is_promoted,
            MAX(play_url) AS play_url,
            COALESCE(SUM(COALESCE(video_view_count, 0)), 0)::BIGINT AS curr_video_view_count,
            COALESCE(SUM(COALESCE(user_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_user_pay_amount,
            COALESCE(SUM(COALESCE(refund_amount, 0)), 0)::DOUBLE PRECISION AS curr_refund_amount,
            COALESCE(SUM(COALESCE(live_room_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_live_room_pay_amount,
            COALESCE(SUM(COALESCE(search_after_view_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_search_after_view_pay_amount,
            COALESCE(SUM(COALESCE(shop_page_pay_amount, 0)), 0)::DOUBLE PRECISION AS curr_shop_page_pay_amount
        FROM ods.douyin_trade_sale_shortvideo_raw
        WHERE stat_date BETWEEN $1 AND $2
        GROUP BY COALESCE(video_id, ''), COALESCE(author_douyin_id, '')
        ORDER BY curr_user_pay_amount DESC, curr_video_view_count DESC
        LIMIT 120
        "#;
