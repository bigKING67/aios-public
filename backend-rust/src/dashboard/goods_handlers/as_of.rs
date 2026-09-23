use sqlx::{PgPool, Row};

pub(super) async fn fetch_goods_as_of_date(
    pool: &PgPool,
    start_date: &str,
    end_date: &str,
) -> Result<String, String> {
    let as_of_rows = sqlx::query(get_as_of_date_sql())
        .bind(start_date)
        .bind(end_date)
        .fetch_all(pool)
        .await
        .map_err(|error| error.to_string())?;

    Ok(as_of_rows
        .first()
        .and_then(|row| {
            row.try_get::<Option<String>, _>("as_of_date")
                .ok()
                .flatten()
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| end_date.to_string()))
}

fn get_as_of_date_sql() -> &'static str {
    r#"
    SELECT
      LEAST($2::DATE, COALESCE(MAX(stat_date), $2::DATE))::TEXT AS as_of_date
    FROM ads.taobao_trade_sale_goods_daily
    WHERE stat_date BETWEEN $1::DATE AND $2::DATE
    "#
}
