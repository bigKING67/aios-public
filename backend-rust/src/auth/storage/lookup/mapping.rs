use chrono::{DateTime, Utc};
use sqlx::Row;

use super::super::super::UserAccount;

pub(super) fn row_to_user_account(row: sqlx::postgres::PgRow) -> UserAccount {
    UserAccount {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        username: row.try_get::<String, _>("username").unwrap_or_default(),
        email: row.try_get::<String, _>("email").unwrap_or_default(),
        full_name: row.try_get::<Option<String>, _>("full_name").ok().flatten(),
        password_hash: row
            .try_get::<String, _>("password_hash")
            .unwrap_or_default(),
        is_active: row.try_get::<bool, _>("is_active").unwrap_or(false),
        last_login_at: row
            .try_get::<Option<DateTime<Utc>>, _>("last_login_at")
            .ok()
            .flatten(),
    }
}
