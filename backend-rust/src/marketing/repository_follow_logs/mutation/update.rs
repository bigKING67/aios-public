use sqlx::PgPool;
use tracing::error;

use crate::error::{AppError, AppResult};
use crate::marketing::types::{
    CreatorLibraryActor, CreatorLibraryFollowLogInput, CreatorLibraryFollowLogItem,
};

use super::{
    super::{
        access::{ensure_can_edit_follow_log, lock_creator_for_follow_mutation},
        row_mapping::follow_log_from_row,
        snapshot::refresh_creator_follow_snapshot_in_tx,
    },
    conflict::resolve_stale_follow_log_error,
};

pub(in crate::marketing) async fn update_follow_log_by_id(
    pool: &PgPool,
    influencer_library_id: i64,
    follow_log_id: i64,
    input: &CreatorLibraryFollowLogInput,
    actor: &CreatorLibraryActor,
    can_manage: bool,
) -> AppResult<CreatorLibraryFollowLogItem> {
    ensure_can_edit_follow_log(
        pool,
        influencer_library_id,
        follow_log_id,
        actor.user_id.as_str(),
        can_manage,
    )
    .await?;
    if input.expected_updated_at.is_none() {
        return Err(AppError::bad_request("缺少版本字段，请刷新后再编辑。"));
    }

    let mut tx = pool.begin().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, follow_log_id, "begin update follow log transaction failed"
        );
        AppError::Internal
    })?;
    lock_creator_for_follow_mutation(&mut tx, influencer_library_id).await?;

    let row = sqlx::query(
        r#"
        UPDATE ads.influencer_library_follow_log
        SET
          follow_note = $3,
          updated_by = $4,
          updated_by_user_id = $5
        WHERE id = $2
          AND influencer_library_id = $1
          AND is_deleted = FALSE
          AND updated_at::TEXT = $6::TEXT
        RETURNING
          id,
          influencer_library_id,
          TO_CHAR(followed_at, 'YYYY-MM-DD HH24:MI') AS followed_at,
          follow_note,
          created_by,
          updated_by,
          TRUE AS can_edit,
          TRUE AS can_delete,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        "#,
    )
    .bind(influencer_library_id)
    .bind(follow_log_id)
    .bind(input.follow_note.as_str())
    .bind(actor.display_name.as_str())
    .bind(actor.user_id.as_str())
    .bind(input.expected_updated_at.as_deref())
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| {
        error!(
            ?error,
            influencer_library_id, follow_log_id, "update influencer library follow log failed"
        );
        AppError::Internal
    })?;

    let Some(row) = row else {
        tx.rollback().await.map_err(|error| {
            error!(
                ?error,
                influencer_library_id,
                follow_log_id,
                "rollback update follow log transaction failed"
            );
            AppError::Internal
        })?;
        return Err(resolve_stale_follow_log_error(
            pool,
            influencer_library_id,
            follow_log_id,
            actor.user_id.as_str(),
            can_manage,
            "该跟进记录已被其他人更新，请刷新后再编辑。",
        )
        .await?);
    };

    refresh_creator_follow_snapshot_in_tx(&mut tx, influencer_library_id, actor).await?;
    tx.commit().await.map_err(|error| {
        error!(
            ?error,
            influencer_library_id, follow_log_id, "commit update follow log transaction failed"
        );
        AppError::Internal
    })?;

    Ok(follow_log_from_row(&row))
}
