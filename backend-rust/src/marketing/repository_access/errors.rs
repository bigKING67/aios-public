pub(in crate::marketing) fn is_unique_violation(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => db_error.code().as_deref() == Some("23505"),
        _ => false,
    }
}
