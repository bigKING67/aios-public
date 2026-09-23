use serde_json::{json, Value};
use sqlx::{PgPool, Row};

pub(in crate::dashboard) async fn fetch_douyin_live_trend_bundle(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<(Vec<Value>, Vec<Value>, Vec<Value>), String> {
    let rows = sqlx::query(
        r#"
        WITH date_spine AS (
          SELECT generate_series($1::DATE, $2::DATE, INTERVAL '1 day')::DATE AS stat_date
        ),
        day_agg AS (
          SELECT
            d.stat_date::DATE AS stat_date,
            COALESCE(SUM(d.live_gmv), 0)::DOUBLE PRECISION AS overview_live_gmv,
            COALESCE(SUM(d.live_refund_amount), 0)::DOUBLE PRECISION AS overview_live_refund_amount,
            COALESCE(SUM(d.live_watch_count), 0)::DOUBLE PRECISION AS overview_live_watch_count,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'self' THEN d.live_gmv ELSE 0 END), 0)::DOUBLE PRECISION AS self_live_gmv,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'self' THEN d.live_refund_amount ELSE 0 END), 0)::DOUBLE PRECISION AS self_live_refund_amount,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'self' THEN d.live_watch_count ELSE 0 END), 0)::DOUBLE PRECISION AS self_live_watch_count,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'influencer' THEN d.live_gmv ELSE 0 END), 0)::DOUBLE PRECISION AS influencer_live_gmv,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'influencer' THEN d.live_refund_amount ELSE 0 END), 0)::DOUBLE PRECISION AS influencer_live_refund_amount,
            COALESCE(SUM(CASE WHEN d.live_identity_type = 'influencer' THEN d.live_watch_count ELSE 0 END), 0)::DOUBLE PRECISION AS influencer_live_watch_count
          FROM ads.douyin_live_detail d
          WHERE d.stat_date BETWEEN $1::DATE AND $2::DATE
          GROUP BY d.stat_date
        )
        SELECT
          spine.stat_date::TEXT AS stat_date,
          COALESCE(agg.overview_live_gmv, 0)::DOUBLE PRECISION AS overview_live_gmv,
          COALESCE(agg.overview_live_refund_amount, 0)::DOUBLE PRECISION AS overview_live_refund_amount,
          COALESCE(agg.overview_live_watch_count, 0)::DOUBLE PRECISION AS overview_live_watch_count,
          COALESCE(agg.self_live_gmv, 0)::DOUBLE PRECISION AS self_live_gmv,
          COALESCE(agg.self_live_refund_amount, 0)::DOUBLE PRECISION AS self_live_refund_amount,
          COALESCE(agg.self_live_watch_count, 0)::DOUBLE PRECISION AS self_live_watch_count,
          COALESCE(agg.influencer_live_gmv, 0)::DOUBLE PRECISION AS influencer_live_gmv,
          COALESCE(agg.influencer_live_refund_amount, 0)::DOUBLE PRECISION AS influencer_live_refund_amount,
          COALESCE(agg.influencer_live_watch_count, 0)::DOUBLE PRECISION AS influencer_live_watch_count
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
    let mut influencer_rows = Vec::<Value>::with_capacity(rows.len());

    for row in rows {
        let date = row
            .try_get::<String, _>("stat_date")
            .map_err(|error| error.to_string())?;
        let overview_live_gmv = row
            .try_get::<f64, _>("overview_live_gmv")
            .map_err(|error| error.to_string())?;
        let overview_live_refund_amount = row
            .try_get::<f64, _>("overview_live_refund_amount")
            .map_err(|error| error.to_string())?;
        let overview_live_watch_count = row
            .try_get::<f64, _>("overview_live_watch_count")
            .map_err(|error| error.to_string())?;
        let self_live_gmv = row
            .try_get::<f64, _>("self_live_gmv")
            .map_err(|error| error.to_string())?;
        let self_live_refund_amount = row
            .try_get::<f64, _>("self_live_refund_amount")
            .map_err(|error| error.to_string())?;
        let self_live_watch_count = row
            .try_get::<f64, _>("self_live_watch_count")
            .map_err(|error| error.to_string())?;
        let influencer_live_gmv = row
            .try_get::<f64, _>("influencer_live_gmv")
            .map_err(|error| error.to_string())?;
        let influencer_live_refund_amount = row
            .try_get::<f64, _>("influencer_live_refund_amount")
            .map_err(|error| error.to_string())?;
        let influencer_live_watch_count = row
            .try_get::<f64, _>("influencer_live_watch_count")
            .map_err(|error| error.to_string())?;

        overview_rows.push(build_douyin_live_trend_row(
            date.clone(),
            overview_live_gmv,
            overview_live_refund_amount,
            overview_live_watch_count,
        ));
        self_rows.push(build_douyin_live_trend_row(
            date.clone(),
            self_live_gmv,
            self_live_refund_amount,
            self_live_watch_count,
        ));
        influencer_rows.push(build_douyin_live_trend_row(
            date,
            influencer_live_gmv,
            influencer_live_refund_amount,
            influencer_live_watch_count,
        ));
    }

    Ok((overview_rows, self_rows, influencer_rows))
}

fn build_douyin_live_trend_row(
    date: String,
    live_gmv: f64,
    live_refund_amount: f64,
    live_watch_count: f64,
) -> Value {
    let live_gsv = live_gmv - live_refund_amount;
    let gpm = if live_watch_count > 0.0 {
        Some(((live_gmv * 1000.0 / live_watch_count) * 10_000.0).round() / 10_000.0)
    } else {
        None
    };

    json!({
      "date": date,
      "live_gmv": live_gmv,
      "live_gsv": live_gsv,
      "gpm": gpm
    })
}
