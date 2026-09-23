use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::{postgres::PgRow, Row};

use super::super::types::RoleListItem;

pub(crate) fn row_to_role_list_item(row: PgRow) -> RoleListItem {
    let created_at = read_created_at(&row);

    RoleListItem {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        name: row.try_get::<String, _>("name").unwrap_or_default(),
        code: row.try_get::<String, _>("code").unwrap_or_default(),
        description: row
            .try_get::<Option<String>, _>("description")
            .ok()
            .flatten(),
        is_active: row.try_get::<bool, _>("is_active").unwrap_or(true),
        created_at,
        permissions_count: row.try_get::<i64, _>("permissions_count").unwrap_or(0),
        user_count: row.try_get::<i64, _>("user_count").unwrap_or(0),
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
