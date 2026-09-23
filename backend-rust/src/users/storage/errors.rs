pub(crate) fn is_unique_violation(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "23505").unwrap_or(false)
        }
        _ => false,
    }
}

pub(crate) fn is_undefined_table(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "42P01").unwrap_or(false)
        }
        _ => false,
    }
}

pub(crate) fn is_undefined_column(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            db_error.code().map(|code| code == "42703").unwrap_or(false)
        }
        _ => false,
    }
}
