use chrono::NaiveDate;
use sqlx::{postgres::PgRow, Row};

pub(in crate::reports::weekly_goods_channel_funnel) fn extract_as_of_date(
    row: Option<&PgRow>,
) -> Option<String> {
    row.and_then(|row| {
        row.try_get::<Option<NaiveDate>, _>("as_of_date")
            .ok()
            .flatten()
    })
    .map(|date| date.to_string())
}
