use sqlx::Row;

use crate::marketing::types::CreatorLibraryFollowLogItem;

pub(super) fn follow_log_from_row(row: &sqlx::postgres::PgRow) -> CreatorLibraryFollowLogItem {
    CreatorLibraryFollowLogItem {
        id: row.try_get("id").unwrap_or(0),
        influencer_library_id: row.try_get("influencer_library_id").unwrap_or(0),
        followed_at: row.try_get("followed_at").unwrap_or_default(),
        follow_note: row.try_get("follow_note").unwrap_or_default(),
        created_by: row.try_get("created_by").ok().flatten(),
        updated_by: row.try_get("updated_by").ok().flatten(),
        can_edit: row.try_get("can_edit").unwrap_or(false),
        can_delete: row.try_get("can_delete").unwrap_or(false),
        created_at: row.try_get("created_at").unwrap_or_default(),
        updated_at: row.try_get("updated_at").unwrap_or_default(),
    }
}
