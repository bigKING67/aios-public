use sqlx::{postgres::PgRow, Row};

use super::super::types::RolePermissionItem;

pub(super) fn row_to_role_permission_item(row: PgRow) -> RolePermissionItem {
    RolePermissionItem {
        id: row.try_get::<i64, _>("id").unwrap_or(0),
        code: row.try_get::<String, _>("code").unwrap_or_default(),
        display_name: row
            .try_get::<Option<String>, _>("display_name")
            .ok()
            .flatten(),
        module: row.try_get::<Option<String>, _>("module").ok().flatten(),
        action: row.try_get::<Option<String>, _>("action").ok().flatten(),
        resource_type: row
            .try_get::<Option<String>, _>("resource_type")
            .ok()
            .flatten(),
    }
}
