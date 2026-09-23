use sqlx::PgPool;

pub(super) async fn fetch_douyin_shortvideo_detail_rows(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<sqlx::postgres::PgRow>, String> {
    sqlx::query(
        r#"
        WITH scoped_detail AS (
          SELECT
            CASE
              WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%' THEN 'self'
              WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%' THEN 'cooperation'
              ELSE 'unclassified'
            END AS shortvideo_identity_type,
            d.stat_date,
            d.publish_time,
            COALESCE(NULLIF(BTRIM(d.account_type), ''), '未归类') AS account_type,
            COALESCE(NULLIF(BTRIM(d.video_title), ''), '(未命名短视频)') AS video_title,
            COALESCE(NULLIF(BTRIM(d.video_id), ''), '') AS video_id,
            COALESCE(NULLIF(BTRIM(d.is_promoted), ''), '') AS is_promoted,
            NULLIF(BTRIM(d.play_url), '') AS play_url,
            COALESCE(NULLIF(BTRIM(d.author_nickname), ''), '(未命名达人)') AS author_nickname,
            COALESCE(NULLIF(BTRIM(d.author_douyin_id), ''), '') AS author_douyin_id,
            COALESCE(NULLIF(BTRIM(d.product_id), ''), '') AS product_id,
            COALESCE(d.video_view_count, 0)::BIGINT AS video_view_count,
            COALESCE(d.user_pay_amount, 0)::DOUBLE PRECISION AS user_pay_amount,
            COALESCE(d.refund_amount, 0)::DOUBLE PRECISION AS refund_amount,
            COALESCE(d.live_room_pay_amount, 0)::DOUBLE PRECISION AS live_room_pay_amount,
            COALESCE(d.search_after_view_pay_amount, 0)::DOUBLE PRECISION AS search_after_view_pay_amount,
            COALESCE(d.shop_page_pay_amount, 0)::DOUBLE PRECISION AS shop_page_pay_amount
          FROM ads.douyin_shortvideo_detail d
          WHERE d.detail_grain = 'trade_video_day'
            AND d.stat_date BETWEEN $1::DATE AND $2::DATE
        ),
        ranked AS (
          SELECT
            sd.shortvideo_identity_type,
            sd.stat_date::TEXT AS stat_date,
            sd.publish_time::TEXT AS publish_time,
            sd.account_type,
            sd.video_title,
            sd.video_id,
            sd.is_promoted,
            sd.play_url,
            sd.author_nickname,
            sd.author_douyin_id,
            sd.product_id,
            sd.video_view_count,
            sd.user_pay_amount,
            sd.refund_amount,
            sd.live_room_pay_amount,
            sd.search_after_view_pay_amount,
            sd.shop_page_pay_amount,
            ROW_NUMBER() OVER (
              PARTITION BY sd.shortvideo_identity_type
              ORDER BY
                sd.stat_date DESC,
                sd.publish_time DESC NULLS LAST,
                sd.user_pay_amount DESC,
                sd.author_nickname ASC,
                sd.video_id ASC,
                sd.product_id ASC
            ) AS rn
          FROM scoped_detail sd
          WHERE sd.shortvideo_identity_type IN ('self', 'cooperation')
        )
        SELECT
          shortvideo_identity_type,
          stat_date,
          publish_time,
          account_type,
          video_title,
          video_id,
          is_promoted,
          play_url,
          author_nickname,
          author_douyin_id,
          product_id,
          video_view_count,
          user_pay_amount,
          refund_amount,
          live_room_pay_amount,
          search_after_view_pay_amount,
          shop_page_pay_amount
        FROM ranked
        WHERE rn <= 500
        ORDER BY shortvideo_identity_type ASC, rn ASC
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())
}
