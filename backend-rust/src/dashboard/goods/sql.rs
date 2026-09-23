pub(in crate::dashboard) fn get_goods_metrics_sql() -> &'static str {
    r#"
    WITH scope AS (
      SELECT
        $1::DATE AS current_start_date,
        $2::DATE AS current_end_date,
        $3::DATE AS previous_start_date,
        $4::DATE AS previous_end_date
    ),
    base AS (
      SELECT
        src.product_id,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN COALESCE(src.pay_amount, 0)
            ELSE 0
        END)::NUMERIC(18, 2) AS curr_gmv,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN COALESCE(src.pay_amount, 0)
            ELSE 0
        END)::NUMERIC(18, 2) AS prev_gmv,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN COALESCE(src.refund_amount, 0)
            ELSE 0
        END)::NUMERIC(18, 2) AS curr_refund_amount,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN COALESCE(src.refund_amount, 0)
            ELSE 0
        END)::NUMERIC(18, 2) AS prev_refund_amount,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN COALESCE(src.pay_buyer_count, 0)
            ELSE 0
        END)::BIGINT AS curr_pay_buyer_count,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN COALESCE(src.pay_buyer_count, 0)
            ELSE 0
        END)::BIGINT AS prev_pay_buyer_count,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.current_start_date AND s.current_end_date
            THEN COALESCE(src.product_visitor_count, 0)
            ELSE 0
        END)::BIGINT AS curr_visitor_count,
        SUM(CASE
          WHEN src.stat_date BETWEEN s.previous_start_date AND s.previous_end_date
            THEN COALESCE(src.product_visitor_count, 0)
            ELSE 0
        END)::BIGINT AS prev_visitor_count
      FROM ads.taobao_trade_sale_goods_daily src
      CROSS JOIN scope s
      WHERE src.stat_date BETWEEN LEAST(s.current_start_date, s.previous_start_date)
        AND GREATEST(s.current_end_date, s.previous_end_date)
      GROUP BY src.product_id
    ),
    filtered AS (
      SELECT
        b.product_id,
        b.curr_gmv,
        b.prev_gmv,
        (b.curr_gmv - b.prev_gmv)::NUMERIC(18, 2) AS gmv_delta,
        b.curr_refund_amount,
        b.prev_refund_amount,
        (b.curr_gmv - b.curr_refund_amount)::NUMERIC(18, 2) AS curr_gsv,
        (b.prev_gmv - b.prev_refund_amount)::NUMERIC(18, 2) AS prev_gsv,
        b.curr_pay_buyer_count,
        b.prev_pay_buyer_count,
        b.curr_visitor_count,
        b.prev_visitor_count,
        CASE
          WHEN b.curr_visitor_count > 0
            THEN ROUND((b.curr_pay_buyer_count::NUMERIC / b.curr_visitor_count::NUMERIC), 4)
          ELSE NULL
        END AS curr_pay_conversion_rate,
        CASE
          WHEN b.prev_visitor_count > 0
            THEN ROUND((b.prev_pay_buyer_count::NUMERIC / b.prev_visitor_count::NUMERIC), 4)
          ELSE NULL
        END AS prev_pay_conversion_rate,
        CASE
          WHEN b.curr_pay_buyer_count > 0
            THEN ROUND((b.curr_gmv / b.curr_pay_buyer_count::NUMERIC), 2)
          ELSE NULL
        END AS curr_avg_order_value,
        CASE
          WHEN b.prev_pay_buyer_count > 0
            THEN ROUND((b.prev_gmv / b.prev_pay_buyer_count::NUMERIC), 2)
          ELSE NULL
        END AS prev_avg_order_value
      FROM base b
      WHERE b.curr_gmv <> 0
         OR b.prev_gmv <> 0
         OR b.curr_refund_amount <> 0
         OR b.prev_refund_amount <> 0
         OR b.curr_pay_buyer_count <> 0
         OR b.prev_pay_buyer_count <> 0
         OR b.curr_visitor_count <> 0
         OR b.prev_visitor_count <> 0
    ),
    enriched AS (
      SELECT
        f.product_id,
        f.curr_gmv,
        f.prev_gmv,
        f.gmv_delta,
        f.curr_gsv,
        f.prev_gsv,
        f.curr_refund_amount,
        f.prev_refund_amount,
        f.curr_pay_buyer_count,
        f.prev_pay_buyer_count,
        f.curr_visitor_count,
        f.prev_visitor_count,
        f.curr_pay_conversion_rate,
        f.prev_pay_conversion_rate,
        f.curr_avg_order_value,
        f.prev_avg_order_value,
        CASE
          WHEN SUM(f.curr_gmv) OVER () > 0
            THEN ROUND((f.curr_gmv / SUM(f.curr_gmv) OVER ()), 6)
          ELSE NULL
        END AS sales_share,
        CASE
          WHEN f.prev_gmv <> 0
            THEN ROUND(((f.curr_gmv - f.prev_gmv) / f.prev_gmv), 6)
          ELSE NULL
        END AS gmv_wow,
        CASE
          WHEN f.prev_gsv <> 0
            THEN ROUND(((f.curr_gsv - f.prev_gsv) / f.prev_gsv), 6)
          ELSE NULL
        END AS gsv_wow,
        CASE
          WHEN f.prev_refund_amount <> 0
            THEN ROUND(((f.curr_refund_amount - f.prev_refund_amount) / f.prev_refund_amount), 6)
          ELSE NULL
        END AS refund_wow,
        CASE
          WHEN f.prev_pay_buyer_count <> 0
            THEN ROUND(
              ((f.curr_pay_buyer_count::NUMERIC - f.prev_pay_buyer_count::NUMERIC) / f.prev_pay_buyer_count::NUMERIC),
              6
            )
          ELSE NULL
        END AS pay_buyer_wow,
        CASE
          WHEN f.prev_visitor_count <> 0
            THEN ROUND(
              ((f.curr_visitor_count::NUMERIC - f.prev_visitor_count::NUMERIC) / f.prev_visitor_count::NUMERIC),
              6
            )
          ELSE NULL
        END AS visitor_wow,
        CASE
          WHEN f.prev_pay_conversion_rate IS NOT NULL AND f.prev_pay_conversion_rate <> 0
            THEN ROUND(((f.curr_pay_conversion_rate - f.prev_pay_conversion_rate) / f.prev_pay_conversion_rate), 6)
          ELSE NULL
        END AS pay_conversion_rate_wow,
        CASE
          WHEN f.prev_avg_order_value IS NOT NULL AND f.prev_avg_order_value <> 0
            THEN ROUND(((f.curr_avg_order_value - f.prev_avg_order_value) / f.prev_avg_order_value), 6)
          ELSE NULL
        END AS avg_order_value_wow,
        SUM(f.curr_gmv) OVER () AS total_curr_gmv,
        SUM(f.prev_gmv) OVER () AS total_prev_gmv
      FROM filtered f
    ),
    ranked AS (
      SELECT
        e.*
      FROM enriched e
      ORDER BY e.curr_gmv DESC, e.gmv_delta DESC, e.product_id
      LIMIT $5
    ),
    ranked_with_names AS (
      SELECT
        r.*,
        COALESCE(latest_non_empty.product_name, '(未命名商品)')::VARCHAR(500) AS product_name
      FROM ranked r
      LEFT JOIN LATERAL (
        SELECT
          src_latest.product_name
        FROM ads.taobao_trade_sale_goods_daily src_latest
        WHERE src_latest.product_id = r.product_id
          AND NULLIF(BTRIM(src_latest.product_name), '') IS NOT NULL
        ORDER BY
          src_latest.stat_date DESC,
          COALESCE(
            src_latest.updated_at,
            src_latest.etl_loaded_at,
            TIMESTAMP '1970-01-01 00:00:00'
          ) DESC,
          src_latest.etl_loaded_at DESC
        LIMIT 1
      ) AS latest_non_empty ON TRUE
    ),
    as_of AS (
      SELECT
        LEAST($2::DATE, COALESCE(MAX(src.stat_date), $2::DATE))::DATE AS as_of_date
      FROM ads.taobao_trade_sale_goods_daily src
      WHERE src.stat_date BETWEEN $1::DATE AND $2::DATE
    )
    SELECT
      a.as_of_date::TEXT AS as_of_date,
      r.product_id,
      r.product_name,
      r.curr_gmv::DOUBLE PRECISION AS curr_gmv,
      r.prev_gmv::DOUBLE PRECISION AS prev_gmv,
      r.gmv_delta::DOUBLE PRECISION AS gmv_delta,
      r.curr_gsv::DOUBLE PRECISION AS curr_gsv,
      r.gsv_wow::DOUBLE PRECISION AS gsv_wow,
      r.curr_refund_amount::DOUBLE PRECISION AS curr_refund_amount,
      r.refund_wow::DOUBLE PRECISION AS refund_wow,
      r.sales_share::DOUBLE PRECISION AS sales_share,
      r.gmv_wow::DOUBLE PRECISION AS gmv_wow,
      r.curr_pay_buyer_count::DOUBLE PRECISION AS curr_pay_buyer_count,
      r.pay_buyer_wow::DOUBLE PRECISION AS pay_buyer_wow,
      r.curr_visitor_count::DOUBLE PRECISION AS curr_visitor_count,
      r.visitor_wow::DOUBLE PRECISION AS visitor_wow,
      r.curr_pay_conversion_rate::DOUBLE PRECISION AS pay_conversion_rate,
      r.pay_conversion_rate_wow::DOUBLE PRECISION AS pay_conversion_rate_wow,
      r.curr_avg_order_value::DOUBLE PRECISION AS avg_order_value,
      r.avg_order_value_wow::DOUBLE PRECISION AS avg_order_value_wow,
      r.total_curr_gmv::DOUBLE PRECISION AS total_curr_gmv,
      r.total_prev_gmv::DOUBLE PRECISION AS total_prev_gmv
    FROM ranked_with_names r
    CROSS JOIN as_of a
    ORDER BY r.curr_gmv DESC, r.gmv_delta DESC, r.product_id
    "#
}
