use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};

use super::{access::ensure_creator_exists, row_mapping::follow_log_from_row};
use crate::marketing::types::CreatorLibraryFollowLogItem;

pub(crate) async fn list_follow_logs(
    pool: &PgPool,
    influencer_library_id: i64,
    actor_user_id: &str,
    can_manage: bool,
) -> AppResult<Vec<CreatorLibraryFollowLogItem>> {
    ensure_creator_exists(pool, influencer_library_id).await?;

    let rows = sqlx::query(
        r#"
        SELECT
          follow_log.id,
          follow_log.influencer_library_id,
          TO_CHAR(follow_log.followed_at, 'YYYY-MM-DD HH24:MI') AS followed_at,
          follow_log.follow_note,
          follow_log.created_by,
          follow_log.updated_by,
          CASE
            WHEN $2 THEN TRUE
            WHEN follow_log.created_by_user_id = $3 THEN TRUE
            WHEN library.owner_user_id = $3 THEN TRUE
            WHEN library.created_by_user_id = $3 THEN TRUE
            ELSE FALSE
          END AS can_edit,
          CASE
            WHEN $2 THEN TRUE
            WHEN follow_log.created_by_user_id = $3 THEN TRUE
            WHEN library.owner_user_id = $3 THEN TRUE
            WHEN library.created_by_user_id = $3 THEN TRUE
            ELSE FALSE
          END AS can_delete,
          follow_log.created_at::TEXT AS created_at,
          follow_log.updated_at::TEXT AS updated_at
        FROM ads.influencer_library_follow_log AS follow_log
        JOIN ads.influencer_library AS library
          ON library.id = follow_log.influencer_library_id
         AND library.is_deleted = FALSE
        WHERE follow_log.influencer_library_id = $1
          AND follow_log.is_deleted = FALSE
        ORDER BY follow_log.followed_at DESC, follow_log.created_at DESC, follow_log.id DESC
        "#,
    )
    .bind(influencer_library_id)
    .bind(can_manage)
    .bind(actor_user_id)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, "list influencer library follow logs failed"
        );
        AppError::Internal
    })?;

    Ok(rows.iter().map(follow_log_from_row).collect())
}
