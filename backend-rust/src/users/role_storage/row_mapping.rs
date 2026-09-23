use sqlx::{postgres::PgRow, Row};

use super::super::types::UserRoleItem;

pub(super) fn row_to_user_role_item(row: PgRow) -> UserRoleItem {
    UserRoleItem {
        id: row.try_get::<String, _>("id").unwrap_or_default(),
        code: row.try_get::<String, _>("code").unwrap_or_default(),
        name: row.try_get::<String, _>("name").unwrap_or_default(),
        is_active: row.try_get::<bool, _>("is_active").unwrap_or(true),
    }
}
