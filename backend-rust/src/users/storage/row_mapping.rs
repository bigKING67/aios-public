use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::{postgres::PgRow, Row};

use super::super::types::UserAdminResponse;

pub(crate) fn row_to_user_admin_response(row: PgRow) -> UserAdminResponse {
    let created_at = read_created_at(&row);

    UserAdminResponse {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        username: row.try_get::<String, _>("username").unwrap_or_default(),
        email: row.try_get::<String, _>("email").unwrap_or_default(),
        full_name: row.try_get::<Option<String>, _>("full_name").ok().flatten(),
        is_active: row.try_get::<bool, _>("is_active").unwrap_or(false),
        created_at,
    }
}

fn read_created_at(row: &PgRow) -> String {
    if let Ok(Some(value)) = row.try_get::<Option<DateTime<Utc>>, _>("created_at") {
        return value.to_rfc3339();
    }
    if let Ok(Some(value)) = row.try_get::<Option<NaiveDateTime>, _>("created_at") {
        return value.and_utc().to_rfc3339();
    }
    Utc::now().to_rfc3339()
}
