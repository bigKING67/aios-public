use tracing::error;

use crate::error::AppError;

pub(super) fn map_sql_error(message: &'static str) -> impl FnOnce(sqlx::Error) -> AppError {
    move |error| {
        error!(
            ?error,
            operation = message,
            "creator library BD provisioning SQL failed"
        );
        AppError::Internal
    }
}
