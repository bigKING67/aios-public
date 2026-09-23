use sqlx::{PgPool, Row};

pub(in crate::dashboard) async fn fetch_douyin_shortvideo_data_date_bounds(
    pool: &PgPool,
) -> Result<(Option<String>, Option<String>), String> {
    let row = sqlx::query(
        r#"
        SELECT
          MIN(stat_date)::TEXT AS min_date,
          MAX(stat_date)::TEXT AS max_date
        FROM ads.douyin_shortvideo_detail
        WHERE detail_grain = 'trade_video_day'
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())?;

    let min_date = row
        .try_get::<Option<String>, _>("min_date")
        .map_err(|error| error.to_string())?;
    let max_date = row
        .try_get::<Option<String>, _>("max_date")
        .map_err(|error| error.to_string())?;

    Ok((min_date, max_date))
}

pub(in crate::dashboard) async fn fetch_douyin_shortvideo_as_of_date(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query(
        r#"
        SELECT
          LEAST($2::DATE, COALESCE(MAX(stat_date), $2::DATE))::TEXT AS as_of_date
        FROM ads.douyin_shortvideo_detail
        WHERE detail_grain = 'trade_video_day'
          AND stat_date BETWEEN $1::DATE AND $2::DATE
        "#,
    )
    .bind(start_date)
    .bind(end_date)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())?;

    row.try_get::<Option<String>, _>("as_of_date")
        .map_err(|error| error.to_string())
}
