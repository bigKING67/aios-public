use sqlx::{postgres::PgRow, Row};

pub(super) fn read_string(row: &PgRow, column: &str, default: &str) -> String {
    row.try_get::<String, _>(column)
        .unwrap_or_else(|_| default.to_string())
}

pub(super) fn read_bool(row: &PgRow, column: &str, default: bool) -> bool {
    row.try_get::<bool, _>(column).unwrap_or(default)
}

pub(super) fn read_i64(row: &PgRow, column: &str) -> i64 {
    row.try_get::<i64, _>(column).unwrap_or(0).max(0)
}

pub(super) fn read_opt_i64(row: &PgRow, column: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(column).unwrap_or(None)
}

pub(super) fn read_f64(row: &PgRow, column: &str) -> f64 {
    row.try_get::<f64, _>(column).unwrap_or(0.0)
}
