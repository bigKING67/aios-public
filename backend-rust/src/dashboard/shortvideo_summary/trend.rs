use serde_json::{json, Value};
use sqlx::{PgPool, Row};

pub(in crate::dashboard) async fn fetch_douyin_shortvideo_trend_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<(Vec<Value>, Vec<Value>, Vec<Value>), String> {
    let rows = sqlx::query(
        r#"
        WITH date_spine AS (
          SELECT generate_series($1::DATE, $2::DATE, INTERVAL '1 day')::DATE AS stat_date
        ),
        scoped_detail AS (
          SELECT
            d.*,
            CASE
              WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%自营%' THEN 'self'
              WHEN COALESCE(NULLIF(BTRIM(d.account_type), ''), '') LIKE '%合作%' THEN 'cooperation'
              ELSE 'unclassified'
            END AS shortvideo_identity_type
          FROM ads.douyin_shortvideo_detail d
          WHERE d.detail_grain = 'trade_video_day'
        ),
        day_agg AS (
          SELECT
            sd.stat_date::DATE AS stat_date,
            COALESCE(SUM(sd.user_pay_amount), 0)::DOUBLE PRECISION AS overview_shortvideo_gmv,
            COALESCE(SUM(sd.refund_amount), 0)::DOUBLE PRECISION AS overview_shortvideo_refund_amount,
            COALESCE(SUM(sd.video_view_count), 0)::DOUBLE PRECISION AS overview_video_view_count,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'self' THEN sd.user_pay_amount ELSE 0 END), 0)::DOUBLE PRECISION AS self_shortvideo_gmv,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'self' THEN sd.refund_amount ELSE 0 END), 0)::DOUBLE PRECISION AS self_shortvideo_refund_amount,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'self' THEN sd.video_view_count ELSE 0 END), 0)::DOUBLE PRECISION AS self_video_view_count,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'cooperation' THEN sd.user_pay_amount ELSE 0 END), 0)::DOUBLE PRECISION AS cooperation_shortvideo_gmv,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'cooperation' THEN sd.refund_amount ELSE 0 END), 0)::DOUBLE PRECISION AS cooperation_shortvideo_refund_amount,
            COALESCE(SUM(CASE WHEN sd.shortvideo_identity_type = 'cooperation' THEN sd.video_view_count ELSE 0 END), 0)::DOUBLE PRECISION AS cooperation_video_view_count
          FROM scoped_detail sd
          WHERE sd.stat_date BETWEEN $1::DATE AND $2::DATE
          GROUP BY sd.stat_date
        )
        SELECT
          spine.stat_date::TEXT AS stat_date,
          COALESCE(agg.overview_shortvideo_gmv, 0)::DOUBLE PRECISION AS overview_shortvideo_gmv,
          COALESCE(agg.overview_shortvideo_refund_amount, 0)::DOUBLE PRECISION AS overview_shortvideo_refund_amount,
          COALESCE(agg.overview_video_view_count, 0)::DOUBLE PRECISION AS overview_video_view_count,
          COALESCE(agg.self_shortvideo_gmv, 0)::DOUBLE PRECISION AS self_shortvideo_gmv,
          COALESCE(agg.self_shortvideo_refund_amount, 0)::DOUBLE PRECISION AS self_shortvideo_refund_amount,
          COALESCE(agg.self_video_view_count, 0)::DOUBLE PRECISION AS self_video_view_count,
          COALESCE(agg.cooperation_shortvideo_gmv, 0)::DOUBLE PRECISION AS cooperation_shortvideo_gmv,
          COALESCE(agg.cooperation_shortvideo_refund_amount, 0)::DOUBLE PRECISION AS cooperation_shortvideo_refund_amount,
          COALESCE(agg.cooperation_video_view_count, 0)::DOUBLE PRECISION AS cooperation_video_view_count
        FROM date_spine spine
        LEFT JOIN day_agg agg
          ON agg.stat_date = spine.stat_date
        ORDER BY spine.stat_date ASC
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())?;

    let mut overview_rows = Vec::<Value>::with_capacity(rows.len());
    let mut self_rows = Vec::<Value>::with_capacity(rows.len());
    let mut cooperation_rows = Vec::<Value>::with_capacity(rows.len());

    for row in rows {
        let date = row
            .try_get::<String, _>("stat_date")
            .map_err(|error| error.to_string())?;
        let overview_shortvideo_gmv = row
            .try_get::<f64, _>("overview_shortvideo_gmv")
            .map_err(|error| error.to_string())?;
        let overview_shortvideo_refund_amount = row
            .try_get::<f64, _>("overview_shortvideo_refund_amount")
            .map_err(|error| error.to_string())?;
        let overview_video_view_count = row
            .try_get::<f64, _>("overview_video_view_count")
            .map_err(|error| error.to_string())?;
        let self_shortvideo_gmv = row
            .try_get::<f64, _>("self_shortvideo_gmv")
            .map_err(|error| error.to_string())?;
        let self_shortvideo_refund_amount = row
            .try_get::<f64, _>("self_shortvideo_refund_amount")
            .map_err(|error| error.to_string())?;
        let self_video_view_count = row
            .try_get::<f64, _>("self_video_view_count")
            .map_err(|error| error.to_string())?;
        let cooperation_shortvideo_gmv = row
            .try_get::<f64, _>("cooperation_shortvideo_gmv")
            .map_err(|error| error.to_string())?;
        let cooperation_shortvideo_refund_amount = row
            .try_get::<f64, _>("cooperation_shortvideo_refund_amount")
            .map_err(|error| error.to_string())?;
        let cooperation_video_view_count = row
            .try_get::<f64, _>("cooperation_video_view_count")
            .map_err(|error| error.to_string())?;

        overview_rows.push(build_douyin_shortvideo_trend_row(
            date.clone(),
            overview_shortvideo_gmv,
            overview_shortvideo_refund_amount,
            overview_video_view_count,
        ));
        self_rows.push(build_douyin_shortvideo_trend_row(
            date.clone(),
            self_shortvideo_gmv,
            self_shortvideo_refund_amount,
            self_video_view_count,
        ));
        cooperation_rows.push(build_douyin_shortvideo_trend_row(
            date,
            cooperation_shortvideo_gmv,
            cooperation_shortvideo_refund_amount,
            cooperation_video_view_count,
        ));
    }

    Ok((overview_rows, self_rows, cooperation_rows))
}

fn build_douyin_shortvideo_trend_row(
    date: String,
    shortvideo_gmv: f64,
    shortvideo_refund_amount: f64,
    video_view_count: f64,
) -> Value {
    let shortvideo_gsv = shortvideo_gmv - shortvideo_refund_amount;
    let gpv = if video_view_count > 0.0 {
        Some(((shortvideo_gmv * 1000.0 / video_view_count) * 10_000.0).round() / 10_000.0)
    } else {
        None
    };

    json!({
      "date": date,
      "shortvideo_gmv": shortvideo_gmv,
      "shortvideo_gsv": shortvideo_gsv,
      "gpv": gpv
    })
}
