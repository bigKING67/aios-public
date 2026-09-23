use sqlx::Row;

pub(super) fn collect_optional_strings(
    rows: Vec<sqlx::postgres::PgRow>,
    column: &str,
) -> Vec<String> {
    rows.into_iter()
        .filter_map(|row| row.try_get::<Option<String>, _>(column).ok().flatten())
        .collect()
}
