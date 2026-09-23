use sqlx::PgPool;

use crate::error::{AppError, AppResult};

use super::super::access::fetch_follow_log_record_access;

pub(super) async fn resolve_stale_follow_log_error(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_log_id: i64,
    actor_user_id: &str,
    can_manage: bool,
    conflict_message: &str,
) -> AppResult<AppError> {
    match fetch_follow_log_record_access(pool, influencer_library_id, follow_log_id).await? {
        None => Ok(AppError::NotFound),
        Some(access) if !access.can_edit(actor_user_id, can_manage) => Ok(AppError::Forbidden),
        Some(_) => Ok(AppError::Conflict(conflict_message.to_string())),
    }
}
