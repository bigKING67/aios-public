use sqlx::Row;

pub(in crate::dashboard) fn string_field_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
    fallback: &str,
) -> Result<String, String> {
    let value = row
        .try_get::<Option<String>, _>(column)
        .map_err(|error| error.to_string())?
        .unwrap_or_default()
        .trim()
        .to_string();
    if value.is_empty() {
        Ok(fallback.to_string())
    } else {
        Ok(value)
    }
}

pub(in crate::dashboard) fn required_string_field_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
    missing_message: &str,
) -> Result<String, String> {
    let value = string_field_from_pg_row(row, column, "")?;
    if value.is_empty() {
        Err(missing_message.to_string())
    } else {
        Ok(value)
    }
}

pub(in crate::dashboard) fn optional_string_field_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
) -> Result<Option<String>, String> {
    let value = string_field_from_pg_row(row, column, "")?;
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

pub(in crate::dashboard) fn i32_field_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
    default_value: i32,
) -> Result<i32, String> {
    Ok(row
        .try_get::<Option<i32>, _>(column)
        .map_err(|error| error.to_string())?
        .unwrap_or(default_value))
}

pub(in crate::dashboard) fn finite_number_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
) -> Result<f64, String> {
    Ok(row
        .try_get::<Option<f64>, _>(column)
        .map_err(|error| error.to_string())?
        .filter(|item| item.is_finite())
        .unwrap_or(0.0))
}

pub(in crate::dashboard) fn optional_finite_number_from_pg_row(
    row: &sqlx::postgres::PgRow,
    column: &str,
) -> Result<Option<f64>, String> {
    Ok(row
        .try_get::<Option<f64>, _>(column)
        .map_err(|error| error.to_string())?
        .filter(|item| item.is_finite()))
}
