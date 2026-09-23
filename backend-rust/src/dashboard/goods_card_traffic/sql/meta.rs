pub(crate) fn get_goods_card_traffic_meta_sql() -> &'static str {
    r#"
    WITH scope AS (
      SELECT
        $1::DATE AS current_start_date,
        $2::DATE AS current_end_date,
        $3::TEXT AS target_product_id,
        NULLIF(BTRIM($4::TEXT), '') AS target_shop_id
    ),
    detail_match AS (
      SELECT src.*
      FROM ads.douyin_trade_sale_card_detail src
      CROSS JOIN scope s
      WHERE src.stat_date BETWEEN s.current_start_date AND s.current_end_date
        AND COALESCE(NULLIF(BTRIM(src.product_id), ''), '') = s.target_product_id
        AND (s.target_shop_id IS NULL OR COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') = s.target_shop_id)
    ),
    card_match AS (
      SELECT src.*
      FROM ads.douyin_trade_sale_card src
      CROSS JOIN scope s
      WHERE src."date" BETWEEN s.current_start_date AND s.current_end_date
        AND COALESCE(NULLIF(BTRIM(src.product_id), ''), '') = s.target_product_id
        AND (s.target_shop_id IS NULL OR COALESCE(NULLIF(BTRIM(src.shop_id), ''), '') = s.target_shop_id)
    )
    SELECT
      COALESCE(
        (
          SELECT LEAST(
            (SELECT current_end_date FROM scope),
            COALESCE(MAX(dm.stat_date), (SELECT current_end_date FROM scope))
          )::TEXT
          FROM detail_match dm
        ),
        (SELECT current_end_date::TEXT FROM scope)
      ) AS as_of_date,
      COALESCE(
        (
          SELECT NULLIF(BTRIM(dm.product_title), '')
          FROM detail_match dm
          WHERE NULLIF(BTRIM(dm.product_title), '') IS NOT NULL
          ORDER BY dm.stat_date DESC, dm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        (
          SELECT NULLIF(BTRIM(cm.product_title), '')
          FROM card_match cm
          WHERE NULLIF(BTRIM(cm.product_title), '') IS NOT NULL
          ORDER BY cm."date" DESC, cm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        ''
      ) AS product_title,
      COALESCE(
        (
          SELECT NULLIF(BTRIM(dm.shop_id), '')
          FROM detail_match dm
          WHERE NULLIF(BTRIM(dm.shop_id), '') IS NOT NULL
          ORDER BY dm.stat_date DESC, dm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        (
          SELECT NULLIF(BTRIM(cm.shop_id), '')
          FROM card_match cm
          WHERE NULLIF(BTRIM(cm.shop_id), '') IS NOT NULL
          ORDER BY cm."date" DESC, cm.updated_at DESC NULLS LAST
          LIMIT 1
        ),
        (SELECT COALESCE(target_shop_id, '') FROM scope)
      ) AS shop_id
    "#
}
