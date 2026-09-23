use sqlx::{PgPool, Row};

pub(crate) async fn fetch_douyin_live_goods_as_of_date(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query(
        r#"
        SELECT
          LEAST($2::DATE, COALESCE(MAX(stat_date), $2::DATE))::TEXT AS as_of_date
        FROM ads.douyin_live_goods_detail
        WHERE stat_date BETWEEN $1::DATE AND $2::DATE
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
