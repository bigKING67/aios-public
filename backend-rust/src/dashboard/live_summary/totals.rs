use serde_json::{json, Value};
use sqlx::{PgPool, Row};

pub(in crate::dashboard) async fn fetch_douyin_live_totals_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
    prev_start_date: &str,
    prev_end_date: &str,
) -> Result<(Value, Value, Value, Value, Value, Value), String> {
    let row = sqlx::query(
        r#"
        WITH scope AS (
          SELECT 'overviewCurrent'::TEXT AS bucket, $1::DATE AS start_date, $2::DATE AS end_date, NULL::TEXT AS identity
          UNION ALL
          SELECT 'overviewPrevious'::TEXT, $3::DATE, $4::DATE, NULL::TEXT
          UNION ALL
          SELECT 'selfCurrent'::TEXT, $1::DATE, $2::DATE, 'self'::TEXT
          UNION ALL
          SELECT 'selfPrevious'::TEXT, $3::DATE, $4::DATE, 'self'::TEXT
          UNION ALL
          SELECT 'influencerCurrent'::TEXT, $1::DATE, $2::DATE, 'influencer'::TEXT
          UNION ALL
          SELECT 'influencerPrevious'::TEXT, $3::DATE, $4::DATE, 'influencer'::TEXT
        ),
        bucket_agg AS (
          SELECT
            sc.bucket,
            COALESCE(SUM(d.live_session_count), 0)::BIGINT AS live_session_count,
            COALESCE(SUM(d.live_gmv), 0)::DOUBLE PRECISION AS live_gmv,
            COALESCE(SUM(d.live_buyer_count), 0)::BIGINT AS live_buyer_count,
            COALESCE(SUM(d.live_watch_user_count), 0)::BIGINT AS live_watch_user_count,
            COALESCE(SUM(d.live_order_count), 0)::BIGINT AS live_order_count,
            COALESCE(SUM(d.live_refund_order_count), 0)::BIGINT AS live_refund_order_count,
            COALESCE(SUM(d.live_refund_amount), 0)::DOUBLE PRECISION AS live_refund_amount,
            COUNT(DISTINCT NULLIF(BTRIM(d.anchor_douyin_id), ''))::BIGINT AS anchor_count
          FROM scope sc
          LEFT JOIN ads.douyin_live_detail d
            ON d.stat_date BETWEEN sc.start_date AND sc.end_date
           AND (sc.identity IS NULL OR d.live_identity_type = sc.identity)
          GROUP BY sc.bucket
        )
        SELECT COALESCE(
          jsonb_object_agg(
            b.bucket,
            jsonb_build_object(
              'live_session_count', b.live_session_count,
              'live_gmv', b.live_gmv,
              'live_buyer_count', b.live_buyer_count,
              'live_watch_user_count', b.live_watch_user_count,
              'live_order_count', b.live_order_count,
              'live_refund_order_count', b.live_refund_order_count,
              'live_refund_amount', b.live_refund_amount,
              'refund_rate', CASE
                WHEN b.live_gmv > 0
                  THEN ROUND((b.live_refund_amount::NUMERIC / b.live_gmv::NUMERIC), 6)::DOUBLE PRECISION
                ELSE NULL::DOUBLE PRECISION
              END,
              'anchor_count', b.anchor_count
            )
          ),
          '{}'::JSONB
        ) AS totals_payload
        FROM bucket_agg b
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .bind(prev_start_date)
    .bind(prev_end_date)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())?;

    let payload = row
        .try_get::<Value, _>("totals_payload")
        .map_err(|error| error.to_string())?;

    let overview_current_totals = payload
        .get("overviewCurrent")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);
    let overview_previous_totals = payload
        .get("overviewPrevious")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);
    let self_current_totals = payload
        .get("selfCurrent")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);
    let self_previous_totals = payload
        .get("selfPrevious")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);
    let influencer_current_totals = payload
        .get("influencerCurrent")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);
    let influencer_previous_totals = payload
        .get("influencerPrevious")
        .cloned()
        .unwrap_or_else(empty_douyin_live_totals_value);

    Ok((
        overview_current_totals,
        overview_previous_totals,
        self_current_totals,
        self_previous_totals,
        influencer_current_totals,
        influencer_previous_totals,
    ))
}

fn empty_douyin_live_totals_value() -> Value {
    json!({
      "live_session_count": 0,
      "live_gmv": 0.0,
      "live_buyer_count": 0,
      "live_watch_user_count": 0,
      "live_order_count": 0,
      "live_refund_order_count": 0,
      "live_refund_amount": 0.0,
      "refund_rate": Value::Null,
      "anchor_count": 0
    })
}
